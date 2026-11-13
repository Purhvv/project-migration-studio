-- Disposable empty local PostgreSQL ONLY. Synthetic rows roll back; never run on hosted Supabase.
BEGIN;
DO $$ BEGIN
 IF current_setting('app.shiftly_test_env',true) IS DISTINCT FROM 'stage4_5_disposable'
  OR EXISTS(SELECT 1 FROM public.profiles) THEN RAISE EXCEPTION 'Disposable empty database required'; END IF;
END $$;
DO $$
DECLARE u uuid:=gen_random_uuid(); w uuid:=gen_random_uuid(); other uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); planned uuid:=gen_random_uuid();
 oldmonth date:=(date_trunc('month',now())-interval '2 months')::date;
 ds date; r jsonb; n bigint; subtotal numeric; incomplete boolean; key uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM public.shiftly_write(gen_random_uuid(),'workplace_edit',jsonb_build_object('id',w,'name','Test','color','green','timezone','Europe/Moscow'));
 PERFORM public.shiftly_write(gen_random_uuid(),'workplace_edit',jsonb_build_object('id',other,'name','Other','color','sky','timezone','UTC'));
 PERFORM public.shiftly_write(gen_random_uuid(),'publish_rates',jsonb_build_object('workplace_id',w,'effective_from',oldmonth,'intervals',jsonb_build_array(jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','300','label','Base'))));
 PERFORM public.shiftly_write(gen_random_uuid(),'publish_commission',jsonb_build_object('workplace_id',w,'effective_from',oldmonth,'mode','thresholds','thresholds',jsonb_build_array(jsonb_build_object('from_amount','0','percent','1'),jsonb_build_object('from_amount','1500000','percent','1.5'),jsonb_build_object('from_amount','2000000','percent','2'))));
 ds:=oldmonth+10;
 PERFORM public.shiftly_write(gen_random_uuid(),'shift_create_completed',jsonb_build_object('id',a,'workplace_id',w,'local_start_date',ds,'local_end_date',ds,'start_time','10:00','end_time','17:00','starts_at',(ds+time '10:00') AT TIME ZONE 'Europe/Moscow','ends_at',(ds+time '17:00') AT TIME ZONE 'Europe/Moscow','revenue','1500000','tips','500','adjustments',jsonb_build_array(jsonb_build_object('kind','bonus','label','Bonus','amount','250'),jsonb_build_object('kind','penalty','label','Penalty','amount','100'))));
 ds:=oldmonth+11;
 PERFORM public.shiftly_write(gen_random_uuid(),'shift_create_completed',jsonb_build_object('id',b,'workplace_id',w,'local_start_date',ds,'local_end_date',ds,'start_time','10:00','end_time','17:00','starts_at',(ds+time '10:00') AT TIME ZONE 'Europe/Moscow','ends_at',(ds+time '17:00') AT TIME ZONE 'Europe/Moscow','revenue',NULL,'tips','0'));
 IF (SELECT earnings FROM public.shifts WHERE id=a) IS DISTINCT FROM 25250::numeric THEN RAISE EXCEPTION 'Formula excludes revenue; expected 25250'; END IF;
 IF (SELECT earnings FROM public.shifts WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'Unknown commission must keep NULL total'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.monthly_commission_results WHERE workplace_id=w AND month=oldmonth AND state='preliminary' AND missing_revenue_count=1 AND commission_amount=22500 AND applied_percent=1.5) THEN RAISE EXCEPTION 'Threshold must apply to whole known revenue'; END IF;
 SELECT confirmed_amount,partial INTO subtotal,incomplete FROM public.shiftly_confirmed_earnings(a);
 IF subtotal<>25250 OR NOT incomplete THEN RAISE EXCEPTION 'Known-revenue shift in preliminary month must be flagged'; END IF;
 ds:=oldmonth+12;
 PERFORM public.shiftly_write(gen_random_uuid(),'shift_create',jsonb_build_object('id',planned,'workplace_id',w,'local_start_date',ds,'local_end_date',ds,'start_time','10:00','end_time','17:00','starts_at',(ds+time '10:00') AT TIME ZONE 'Europe/Moscow','ends_at',(ds+time '17:00') AT TIME ZONE 'Europe/Moscow'));
 PERFORM public.shiftly_close_month(u,w,oldmonth,key);
 IF NOT EXISTS(SELECT 1 FROM public.shifts WHERE id=b AND revenue=0 AND revenue_auto_zeroed) OR NOT EXISTS(SELECT 1 FROM public.shifts WHERE id=planned AND revenue IS NULL AND NOT revenue_auto_zeroed) THEN RAISE EXCEPTION 'Close must zero completed only'; END IF;
 SELECT count(*) INTO n FROM public.shift_financial_events WHERE user_id=u;
 PERFORM public.shiftly_close_month(u,w,oldmonth,key);
 PERFORM public.shiftly_close_month(u,w,oldmonth,gen_random_uuid());
 IF (SELECT count(*) FROM public.shift_financial_events WHERE user_id=u)<>n THEN RAISE EXCEPTION 'Repeat closure duplicated events'; END IF;
 PERFORM public.shiftly_write(gen_random_uuid(),'revenue_correct',(SELECT jsonb_build_object('id',b,'expected_revision',revision,'expected_revenue_revision',revenue_revision,'revenue','500000') FROM public.shifts WHERE id=b));
 IF NOT EXISTS(SELECT 1 FROM public.shifts WHERE id=b AND revenue=500000 AND NOT revenue_auto_zeroed) OR NOT EXISTS(SELECT 1 FROM public.shift_financial_events WHERE subject_shift_id=b AND event_type='revenue_correction' AND (before_snapshot->>'revenue_auto_zeroed')::boolean) THEN RAISE EXCEPTION 'Correction must preserve provenance in audit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.monthly_commission_results WHERE workplace_id=w AND month=oldmonth AND state='final' AND commission_amount=40000) THEN RAISE EXCEPTION 'Correction must recalculate 2 percent of all 2 million'; END IF;
 PERFORM public.shiftly_write(gen_random_uuid(),'shift_delete',(SELECT jsonb_build_object('id',b,'expected_revision',revision) FROM public.shifts WHERE id=b));
 IF (SELECT commission_amount FROM public.monthly_commission_results WHERE workplace_id=w AND month=oldmonth)<>22500 THEN RAISE EXCEPTION 'Delete must recalculate'; END IF;
 ds:=oldmonth+interval '1 month'+10;
 PERFORM public.shiftly_write(gen_random_uuid(),'shift_edit',(SELECT jsonb_build_object('id',a,'expected_revision',revision,'workplace_id',other,'local_start_date',ds,'local_end_date',ds,'start_time','10:00','end_time','17:00','starts_at',(ds+time '10:00') AT TIME ZONE 'UTC','ends_at',(ds+time '17:00') AT TIME ZONE 'UTC') FROM public.shifts WHERE id=a));
 IF (SELECT revenue_total FROM public.monthly_commission_results WHERE workplace_id=w AND month=oldmonth)<>0 OR (SELECT revenue_total FROM public.monthly_commission_results WHERE workplace_id=other AND month=date_trunc('month',ds)::date)<>1500000 THEN RAISE EXCEPTION 'Move must recalculate both independent workplace months'; END IF;
 IF shiftly_private.earnings(100,20,30,40,50,300)<>-60 OR shiftly_private.earnings(100,0,NULL,0,0,0) IS NOT NULL THEN RAISE EXCEPTION 'Negative and NULL totals'; END IF;
 IF EXISTS(SELECT 1 FROM public.shifts WHERE id=planned AND revenue IS NOT NULL) THEN RAISE EXCEPTION 'Planned revenue touched'; END IF;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 IF EXISTS(SELECT 1 FROM public.shiftly_confirmed_earnings()) THEN RAISE EXCEPTION 'Owner isolation'; END IF;
 RAISE NOTICE 'Stage 4.5: formula, NULL, thresholds, preliminary flags, closure, retry, correction, delete, move and isolation OK';
END $$;
ROLLBACK;