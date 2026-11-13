BEGIN;
CREATE OR REPLACE FUNCTION public.shiftly_close_month(p_user uuid,p_workplace uuid,p_month date,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.operation_requests; s public.shifts; updated public.shifts; z text; result jsonb; prior public.monthly_commission_results;
BEGIN
 IF p_user IS NULL OR p_workplace IS NULL OR p_month IS NULL OR p_key IS NULL OR extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'Owner, workplace, month start and key required' USING ERRCODE='22023'; END IF;
 SELECT timezone INTO STRICT z FROM public.workplaces WHERE id=p_workplace AND user_id=p_user;
 IF now()<((p_month+interval '1 month') AT TIME ZONE z) THEN RAISE EXCEPTION 'Workplace local month has not ended'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workplace::text||p_month::text,1));
 SELECT * INTO prior FROM public.monthly_commission_results WHERE user_id=p_user AND workplace_id=p_workplace AND month=p_month;
 IF prior.closed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shifts WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed' AND revenue IS NULL AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date) THEN RETURN to_jsonb(prior); END IF;
 op:=shiftly_private.begin_operation(p_user,p_key,'auto_zero_revenue',jsonb_build_object('workplace_id',p_workplace,'month',p_month));
 IF op.completed_at IS NOT NULL THEN RETURN op.response_payload; END IF;
 FOR s IN SELECT * FROM public.shifts WHERE user_id=p_user AND workplace_id=p_workplace AND deleted_at IS NULL AND status='completed' AND revenue IS NULL AND local_start_date>=p_month AND local_start_date<(p_month+interval '1 month')::date ORDER BY id FOR UPDATE LOOP
  UPDATE public.shifts SET revenue=0,revenue_auto_zeroed=true,revenue_revision=revenue_revision+1,revision=revision+1,updated_at=now() WHERE id=s.id RETURNING * INTO updated;
  PERFORM shiftly_private.audit(p_user,op.id,s.id,'auto_zero_revenue',to_jsonb(s),to_jsonb(updated));
 END LOOP;
 result:=shiftly_private.recalculate_month(p_user,p_workplace,p_month,op.id,coalesce(prior.closed_at,now()));
 IF prior.closed_at IS NULL THEN PERFORM shiftly_private.audit(p_user,op.id,NULL,'month_close','{}',result,jsonb_build_object('timezone',z)); END IF;
 RETURN shiftly_private.finish_operation(op.id,result);
END $$;
REVOKE ALL ON FUNCTION public.shiftly_close_month(uuid,uuid,date,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shiftly_close_month(uuid,uuid,date,uuid) TO service_role;

CREATE FUNCTION public.shiftly_confirmed_earnings(p_shift uuid DEFAULT NULL)
RETURNS TABLE(shift_id uuid,confirmed_amount numeric,partial boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT s.id, CASE WHEN s.earnings IS NOT NULL THEN s.earnings ELSE
  (SELECT sum(c.amount) FROM (VALUES(s.base_pay),(s.fixed_pay),(s.commission_pay),(s.tips)) c(amount))
  + coalesce((SELECT sum(CASE WHEN a.kind='penalty' THEN -a.amount ELSE a.amount END) FROM public.shift_adjustments a WHERE a.user_id=auth.uid() AND a.shift_id=s.id),0)
 END, s.earnings IS NULL
 FROM public.shifts s WHERE s.user_id=auth.uid() AND s.deleted_at IS NULL AND (p_shift IS NULL OR s.id=p_shift);
$$;
REVOKE ALL ON FUNCTION public.shiftly_confirmed_earnings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiftly_confirmed_earnings(uuid) TO authenticated,service_role;

CREATE FUNCTION shiftly_private.close_due_months() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target record; processed integer:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('shiftly-close-due-months',42)) THEN RETURN 0; END IF;
 FOR target IN
  SELECT s.user_id,s.workplace_id,date_trunc('month',s.local_start_date)::date AS month
  FROM public.shifts s JOIN public.workplaces w ON w.id=s.workplace_id AND w.user_id=s.user_id
  LEFT JOIN public.monthly_commission_results m ON m.workplace_id=s.workplace_id AND m.user_id=s.user_id AND m.month=date_trunc('month',s.local_start_date)::date
  WHERE s.deleted_at IS NULL AND s.status='completed'
   AND s.local_start_date<date_trunc('month',now() AT TIME ZONE w.timezone)::date
   AND (m.closed_at IS NULL OR s.revenue IS NULL)
  GROUP BY s.user_id,s.workplace_id,date_trunc('month',s.local_start_date)::date
  ORDER BY s.user_id,s.workplace_id,month LIMIT 200
 LOOP
  BEGIN
   PERFORM public.shiftly_close_month(target.user_id,target.workplace_id,target.month,gen_random_uuid());
   processed:=processed+1;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Shiftly month closure failed: workplace %, month %, SQLSTATE %',target.workplace_id,target.month,SQLSTATE;
  END;
 END LOOP;
 RETURN processed;
END $$;
REVOKE ALL ON FUNCTION shiftly_private.close_due_months() FROM PUBLIC,anon,authenticated;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('shiftly-close-due-months','0 * * * *','SELECT shiftly_private.close_due_months();');
COMMIT;