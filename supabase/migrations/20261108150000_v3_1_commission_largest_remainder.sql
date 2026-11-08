-- Stage 2.1 fix 3.1/4.4: Largest Remainder commission allocation and digest hardening.
-- Forward-only: existing migration history is immutable; this replaces the function body.
--
-- Allocation contract (approved):
--   1. exact per-shift commission in cents = revenue * percent (numeric, exact);
--   2. each share is floored to whole cents;
--   3. the rounded monthly total in cents is round(sum(revenue)*percent, 0);
--   4. leftover cents = rounded total - sum(floors);
--   5. leftover cents go to shifts with the LARGEST fractional remainders;
--   6. ties on the fractional part are broken by shift id (stable, deterministic).
-- Shifts with NULL revenue never participate and keep commission_pay NULL.
-- Mode 'none' yields commission 0. The reached threshold applies to ALL known revenue.
--
-- Digest hardening: the per-shift recomputation loop ALWAYS runs (idempotent writes,
-- audit only on real change), so a digest match can never leave a stale NULL
-- commission_pay in place. The digest is computed once, after the loop, and covers
-- every input the monthly row depends on; it only decides whether the monthly row
-- revision bumps.
BEGIN;

CREATE OR REPLACE FUNCTION shiftly_private.recalculate_month(p_user uuid,p_workplace uuid,p_month date,p_operation uuid,p_closed timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE rule public.commission_rule_versions; total numeric; missing integer; completed integer; zeros integer;
 percent numeric; threshold numeric; amount numeric; digest text; previous public.monthly_commission_results;
 old_shift public.shifts; new_shift public.shifts; allocation record; remainder bigint; previous_closed timestamptz;
BEGIN
 IF extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Month must start on day 1'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workplace::text||p_month::text,1));
 IF NOT EXISTS(SELECT 1 FROM public.workplaces WHERE id=p_workplace AND user_id=p_user) THEN RAISE EXCEPTION 'Workplace not owned'; END IF;
 SELECT * INTO previous FROM public.monthly_commission_results WHERE user_id=p_user AND workplace_id=p_workplace AND month=p_month FOR UPDATE;
 SELECT * INTO rule FROM public.commission_rule_versions WHERE user_id=p_user AND workplace_id=p_workplace
  AND sealed AND effective_from<=p_month ORDER BY effective_from DESC LIMIT 1;
 SELECT coalesce(sum(revenue),0),count(*),count(*) FILTER(WHERE revenue IS NULL),count(*) FILTER(WHERE revenue_auto_zeroed)
 INTO total,completed,missing,zeros FROM public.shifts
 WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
  AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date;
 IF rule.id IS NULL THEN percent:=NULL;
 ELSIF rule.mode='none' THEN percent:=0;
 ELSIF rule.mode='fixed' THEN percent:=rule.fixed_percent;
 ELSIF rule.mode='thresholds' THEN
  SELECT from_amount,ct.percent INTO threshold,percent FROM public.commission_thresholds ct
   WHERE rule_version_id=rule.id AND from_amount<=total ORDER BY from_amount DESC LIMIT 1;
 END IF;
 amount:=round(total*percent/100,2);
 previous_closed:=coalesce(previous.closed_at,p_closed);
 -- Leftover cents after flooring every known share; NULL revenue is excluded.
 IF percent IS NOT NULL THEN
  SELECT (amount*100-coalesce(sum(trunc(revenue*percent)),0))::bigint INTO remainder FROM public.shifts
   WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
    AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date AND revenue IS NOT NULL;
 END IF;
 -- Largest Remainder: rank known-revenue shifts by fractional cent DESC, id ASC.
 FOR allocation IN
  SELECT id,revenue,row_number() OVER(ORDER BY (revenue*percent-trunc(revenue*percent)) DESC, id) n
  FROM public.shifts
  WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
   AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date AND revenue IS NOT NULL
 LOOP
  SELECT * INTO old_shift FROM public.shifts WHERE id=allocation.id FOR UPDATE;
  UPDATE public.shifts SET commission_pay=CASE
    WHEN rule.id IS NOT NULL AND rule.mode='none' THEN 0
    WHEN percent IS NULL THEN NULL
    ELSE (trunc(allocation.revenue*percent)+CASE WHEN allocation.n<=remainder THEN 1 ELSE 0 END)/100 END,
    commission_source=CASE WHEN rule.id IS NULL THEN 'unconfigured' WHEN rule.mode='none' THEN 'none' ELSE 'monthly' END
   WHERE id=allocation.id;
  PERFORM shiftly_private.refresh_earnings(p_user,allocation.id);
  SELECT * INTO new_shift FROM public.shifts WHERE id=allocation.id;
  IF new_shift.commission_pay IS DISTINCT FROM old_shift.commission_pay OR new_shift.earnings IS DISTINCT FROM old_shift.earnings OR new_shift.commission_source<>old_shift.commission_source THEN
   UPDATE public.shifts SET revision=revision+1,updated_at=now() WHERE id=allocation.id RETURNING * INTO new_shift;
   PERFORM shiftly_private.audit(p_user,p_operation,allocation.id,'commission_recalc',to_jsonb(old_shift),to_jsonb(new_shift),jsonb_build_object('workplace_id',p_workplace,'month',p_month));
  END IF;
 END LOOP;
 -- NULL-revenue shifts: commission stays unknown, source still reflects the rule.
 FOR allocation IN
  SELECT id FROM public.shifts
  WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
   AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date AND revenue IS NULL
 LOOP
  SELECT * INTO old_shift FROM public.shifts WHERE id=allocation.id FOR UPDATE;
  UPDATE public.shifts SET commission_pay=CASE WHEN rule.id IS NOT NULL AND rule.mode='none' THEN 0 ELSE NULL END,
    commission_source=CASE WHEN rule.id IS NULL THEN 'unconfigured' WHEN rule.mode='none' THEN 'none' ELSE 'monthly' END
   WHERE id=allocation.id;
  PERFORM shiftly_private.refresh_earnings(p_user,allocation.id);
  SELECT * INTO new_shift FROM public.shifts WHERE id=allocation.id;
  IF new_shift.commission_pay IS DISTINCT FROM old_shift.commission_pay OR new_shift.earnings IS DISTINCT FROM old_shift.earnings OR new_shift.commission_source<>old_shift.commission_source THEN
   UPDATE public.shifts SET revision=revision+1,updated_at=now() WHERE id=allocation.id RETURNING * INTO new_shift;
   PERFORM shiftly_private.audit(p_user,p_operation,allocation.id,'commission_recalc',to_jsonb(old_shift),to_jsonb(new_shift),jsonb_build_object('workplace_id',p_workplace,'month',p_month));
  END IF;
 END LOOP;
 -- Single digest, computed after the loop, covering every input of the monthly row.
 SELECT md5(jsonb_build_object('rule',rule.id,'percent',percent,'closed',previous_closed,'inputs',
  coalesce(jsonb_agg(jsonb_build_array(id,revenue,revenue_auto_zeroed,base_pay,fixed_pay,tips) ORDER BY id),'[]'))::text)
 INTO digest FROM public.shifts WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
 AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date;
 IF previous.input_digest=digest THEN RETURN to_jsonb(previous); END IF;
 INSERT INTO public.monthly_commission_results(user_id,workplace_id,month,rule_version_id,revenue_total,completed_count,
  missing_revenue_count,auto_zeroed_count,applied_percent,reached_threshold_from,commission_amount,state,calculation_available,
  closed_at,input_digest,last_operation_id)
 VALUES(p_user,p_workplace,p_month,rule.id,total,completed,missing,zeros,percent,threshold,amount,
  CASE WHEN missing=0 THEN 'final' ELSE 'preliminary' END,percent IS NOT NULL,previous_closed,digest,p_operation)
 ON CONFLICT(workplace_id,month) DO UPDATE SET rule_version_id=excluded.rule_version_id,revenue_total=excluded.revenue_total,
 completed_count=excluded.completed_count,missing_revenue_count=excluded.missing_revenue_count,auto_zeroed_count=excluded.auto_zeroed_count,
 applied_percent=excluded.applied_percent,reached_threshold_from=excluded.reached_threshold_from,commission_amount=excluded.commission_amount,
 state=excluded.state,calculation_available=excluded.calculation_available,closed_at=excluded.closed_at,input_digest=excluded.input_digest,
 last_operation_id=excluded.last_operation_id,revision=monthly_commission_results.revision+1,computed_at=now()
 RETURNING * INTO previous;
 RETURN to_jsonb(previous);
END $$;

COMMIT;
