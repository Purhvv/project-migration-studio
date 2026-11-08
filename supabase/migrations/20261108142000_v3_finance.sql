BEGIN;
-- Evaluate actual elapsed seconds; every second must have exactly one rate.
-- No sort_order/rate winner; ambiguous or uncovered seconds -> NULL.
CREATE FUNCTION shiftly_private.hourly_pay(p_shift public.shifts,p_version uuid) RETURNS numeric
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE result numeric; bad boolean;
BEGIN
 IF p_version IS NULL THEN RETURN NULL; END IF;
 WITH ticks AS (
  SELECT instant, least(1::numeric,extract(epoch FROM p_shift.ends_at-instant)) seconds,
   instant AT TIME ZONE p_shift.workplace_timezone wall
  FROM generate_series(p_shift.starts_at,p_shift.ends_at-interval '1 microsecond',interval '1 second') instant
 ), coverage AS (
  SELECT t.instant,t.seconds,count(r.id) n,max(r.hourly) hourly
  FROM ticks t LEFT JOIN public.rate_intervals r ON r.rate_version_id=p_version AND r.kind='hourly'
   AND ((r.start_time<r.end_time AND t.wall::time>=r.start_time AND t.wall::time<r.end_time
      AND (cardinality(r.weekdays)=0 OR (extract(isodow FROM t.wall)::integer-1)=ANY(r.weekdays)))
    OR (r.end_time<=r.start_time AND
      ((t.wall::time>=r.start_time AND (cardinality(r.weekdays)=0 OR (extract(isodow FROM t.wall)::integer-1)=ANY(r.weekdays)))
       OR (t.wall::time<r.end_time AND (cardinality(r.weekdays)=0 OR ((extract(isodow FROM t.wall)::integer+5)%7)=ANY(r.weekdays))))))
  GROUP BY t.instant,t.seconds
 ) SELECT bool_or(n<>1),round(sum(seconds*hourly/3600),2) INTO bad,result FROM coverage;
 RETURN CASE WHEN bad THEN NULL ELSE result END;
END $$;

CREATE FUNCTION shiftly_private.recalculate_month(p_user uuid,p_workplace uuid,p_month date,p_operation uuid,p_closed timestamptz DEFAULT NULL)
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
 IF rule.mode='none' THEN percent:=0;
 ELSIF rule.mode='fixed' THEN percent:=rule.fixed_percent;
 ELSIF rule.mode='thresholds' THEN
  SELECT from_amount,ct.percent INTO threshold,percent FROM public.commission_thresholds ct
   WHERE rule_version_id=rule.id AND from_amount<=total ORDER BY from_amount DESC LIMIT 1;
 END IF;
 amount:=round(total*percent/100,2);
 previous_closed:=coalesce(previous.closed_at,p_closed);
 SELECT md5(jsonb_build_object('rule',rule.id,'percent',percent,'closed',previous_closed,'inputs',
  coalesce(jsonb_agg(jsonb_build_array(id,revenue,revenue_auto_zeroed) ORDER BY id),'[]'))::text)
 INTO digest FROM public.shifts WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
 AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date;
 IF previous.input_digest=digest THEN RETURN to_jsonb(previous); END IF;
 IF percent IS NOT NULL THEN
  SELECT (amount*100-coalesce(sum(trunc(revenue*percent)),0))::bigint INTO remainder FROM public.shifts
   WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
   AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date;
 END IF;
 FOR allocation IN
  SELECT id,revenue,row_number() OVER(ORDER BY id) n FROM public.shifts
  WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed'
   AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date
 LOOP
  SELECT * INTO old_shift FROM public.shifts WHERE id=allocation.id FOR UPDATE;
  UPDATE public.shifts SET commission_pay=CASE
    WHEN percent IS NULL OR allocation.revenue IS NULL THEN NULL
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

-- Trusted scheduler entry: service_role only; never publicly callable.
CREATE FUNCTION public.shiftly_close_month(p_user uuid,p_workplace uuid,p_month date,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE op public.operation_requests; s public.shifts; updated public.shifts; z text; result jsonb;
BEGIN
 IF extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Month must start on day 1'; END IF;
 SELECT timezone INTO STRICT z FROM public.workplaces WHERE id=p_workplace AND user_id=p_user;
 IF now()<((p_month+interval '1 month') AT TIME ZONE z) THEN RAISE EXCEPTION 'Workplace local month has not ended'; END IF;
 op:=shiftly_private.begin_operation(p_user,p_key,'auto_zero_revenue',jsonb_build_object('workplace_id',p_workplace,'month',p_month));
 IF op.completed_at IS NOT NULL THEN RETURN op.response_payload; END IF;
 FOR s IN SELECT * FROM public.shifts WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL
  AND status='completed' AND revenue IS NULL AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date FOR UPDATE
 LOOP
  UPDATE public.shifts SET revenue=0,revenue_auto_zeroed=true,revenue_revision=revenue_revision+1,revision=revision+1,updated_at=now()
  WHERE id=s.id RETURNING * INTO updated;
  PERFORM shiftly_private.audit(p_user,op.id,s.id,'auto_zero_revenue',to_jsonb(s),to_jsonb(updated));
 END LOOP;
 result:=shiftly_private.recalculate_month(p_user,p_workplace,p_month,op.id,now());
 PERFORM shiftly_private.audit(p_user,op.id,NULL,'month_close','{}',result,jsonb_build_object('timezone',z));
 RETURN shiftly_private.finish_operation(op.id,result);
END $$;
REVOKE ALL ON FUNCTION public.shiftly_close_month(uuid,uuid,date,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shiftly_close_month(uuid,uuid,date,uuid) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiftly_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiftly_private TO service_role;
COMMIT;
