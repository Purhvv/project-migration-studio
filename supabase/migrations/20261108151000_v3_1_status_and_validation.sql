-- Stage 2.1 fixes 3.2/3.3/4.3: status transition machine, strict nested money
-- validation and atomic local/UTC time updates. Forward-only.
--
-- Status machine (approved): shift_create always yields 'planned'; shift_edit and
-- revenue_correct never touch status; explicit transitions only:
--   shift_start:    planned -> in_progress
--   shift_complete: planned|in_progress|pending -> completed
--   shift_cancel:   planned|in_progress|pending -> cancelled
-- Completed and cancelled shifts keep their status forever; shift_edit changes
-- data only. A raw "status" key is rejected for every operation.
--
-- Money contract: every monetary value from the client is a canonical decimal
-- string (^[0-9]+(\.[0-9]{1,2})?$) or JSON null; JSON numbers, NaN, Infinity,
-- signs, exponents and extra decimals are rejected, top-level and nested alike.
-- Unknown fields and wrong types are rejected for the whole RPC payload.
BEGIN;

-- New operation and event types for explicit status transitions.
ALTER TABLE public.operation_requests DROP CONSTRAINT operation_requests_operation_type_check;
ALTER TABLE public.operation_requests ADD CONSTRAINT operation_requests_operation_type_check
 CHECK (operation_type IN ('shift_create','shift_edit','shift_start','shift_complete','shift_cancel','shift_delete','shift_restore','shift_purge','trash_clear','month_recalc','auto_zero_revenue','revenue_correct','publish_rates','publish_commission','confirm_history','workplace_edit','workplace_archive','profile_edit'));
ALTER TABLE public.shift_financial_events DROP CONSTRAINT shift_financial_events_event_type_check;
ALTER TABLE public.shift_financial_events ADD CONSTRAINT shift_financial_events_event_type_check
 CHECK (event_type IN ('create','edit','start','complete','cancel','delete','restore','purge','commission_recalc','rate_recalc_confirm','rule_recalc_confirm','auto_zero_revenue','revenue_correction','version_publish','archive','profile_edit','goal_update','month_close'));

-- Strict input validators. Pure functions; every violation raises 22023.
CREATE FUNCTION shiftly_private.require_keys(p jsonb,p_allowed text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE k text;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Object required' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p) LOOP
  IF NOT (k=ANY(p_allowed)) THEN RAISE EXCEPTION 'Unexpected field: %',k USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION shiftly_private.text_value(p jsonb,p_key text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Field % must be a string',p_key USING ERRCODE='22023'; END IF;
 RETURN v#>>'{}';
END $$;
CREATE FUNCTION shiftly_private.bool_value(p jsonb,p_key text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Field % must be a boolean',p_key USING ERRCODE='22023'; END IF;
 RETURN (v#>>'{}')::boolean;
END $$;
CREATE FUNCTION shiftly_private.uuid_value(p jsonb,p_key text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; t text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Field % must be a uuid string',p_key USING ERRCODE='22023'; END IF;
 t:=v#>>'{}';
 IF t !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'Field % is not a valid uuid',p_key USING ERRCODE='22023'; END IF;
 RETURN t::uuid;
END $$;
CREATE FUNCTION shiftly_private.money_value(p jsonb,p_key text,p_min numeric,p_max numeric) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; t text; n numeric;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Money field % must be a decimal string, never a JSON number',p_key USING ERRCODE='22023'; END IF;
 t:=v#>>'{}';
 IF t !~ '^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'Money field % must be a canonical decimal string (unsigned, max 2 decimals)',p_key USING ERRCODE='22023'; END IF;
 n:=t::numeric;
 IF n<p_min OR n>p_max THEN RAISE EXCEPTION 'Money field % out of allowed range',p_key USING ERRCODE='22023'; END IF;
 RETURN n;
END $$;
CREATE FUNCTION shiftly_private.int_value(p jsonb,p_key text,p_min bigint,p_max bigint) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; n numeric;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'Field % must be a JSON integer',p_key USING ERRCODE='22023'; END IF;
 n:=(v#>>'{}')::numeric;
 IF n<>trunc(n) OR n<p_min OR n>p_max THEN RAISE EXCEPTION 'Field % must be an integer in range',p_key USING ERRCODE='22023'; END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION shiftly_private.date_value(p jsonb,p_key text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; t text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Field % must be an ISO date string',p_key USING ERRCODE='22023'; END IF;
 t:=v#>>'{}';
 RETURN t::date;
END $$;
CREATE FUNCTION shiftly_private.time_value(p jsonb,p_key text) RETURNS time
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; t text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN RAISE EXCEPTION 'Field % must be a HH24:MI[:SS] string',p_key USING ERRCODE='22023'; END IF;
 t:=v#>>'{}';
 RETURN t::time;
END $$;
CREATE FUNCTION shiftly_private.ts_value(p jsonb,p_key text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; t text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'Field % must be a timestamptz string',p_key USING ERRCODE='22023'; END IF;
 t:=v#>>'{}';
 IF t !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'Explicit UTC offset required in %',p_key USING ERRCODE='22023'; END IF;
 RETURN t::timestamptz;
END $$;
CREATE FUNCTION shiftly_private.weekdays_value(p jsonb,p_key text) RETURNS smallint[]
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v jsonb:=p->p_key; e jsonb; n numeric; r smallint[]:='{}';
BEGIN
 IF v IS NULL OR jsonb_typeof(v)='null' THEN RETURN NULL; END IF;
 IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Field % must be an array of weekday integers 0..6',p_key USING ERRCODE='22023'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(v) LOOP
  IF jsonb_typeof(e)<>'number' THEN RAISE EXCEPTION 'Weekdays must be integers 0..6' USING ERRCODE='22023'; END IF;
  n:=(e#>>'{}')::numeric;
  IF n<>trunc(n) OR n<0 OR n>6 THEN RAISE EXCEPTION 'Weekdays must be integers 0..6' USING ERRCODE='22023'; END IF;
  r:=r||n::smallint;
 END LOOP;
 RETURN r;
END $$;

-- Version publication extracted into a helper so later fixes touch one function.
CREATE FUNCTION shiftly_private.publish_version(p_user uuid,p_op uuid,p_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE w public.workplaces; v uuid; item jsonb; response jsonb; eff date;
BEGIN
 SELECT * INTO STRICT w FROM public.workplaces WHERE id=shiftly_private.uuid_value(p_payload,'workplace_id') AND user_id=p_user FOR UPDATE;
 eff:=shiftly_private.date_value(p_payload,'effective_from');
 IF eff IS NULL THEN RAISE EXCEPTION 'effective_from required' USING ERRCODE='22023'; END IF;
 -- Publishing must never silently affect an existing completed historical period.
 IF EXISTS(SELECT 1 FROM public.shifts WHERE workplace_id=w.id AND deleted_at IS NULL AND status='completed' AND local_start_date>=eff) THEN
  RAISE EXCEPTION 'Historical publication needs preview and explicit confirmation; not available until contradiction resolution'; END IF;
 v:=gen_random_uuid();
 IF p_type='publish_rates' THEN
  IF p_payload->'intervals' IS NULL OR jsonb_typeof(p_payload->'intervals')<>'array' THEN RAISE EXCEPTION 'intervals array required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.rate_versions(id,user_id,workplace_id,effective_from,revision,note,publication_operation_id,overlap_acknowledged_at)
   VALUES(v,p_user,w.id,eff,1,shiftly_private.text_value(p_payload,'note'),p_op,CASE WHEN coalesce(shiftly_private.bool_value(p_payload,'acknowledge_overlap'),false) THEN now() END);
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'intervals') LOOP
   PERFORM shiftly_private.require_keys(item,ARRAY['kind','start_time','end_time','hourly','fixed_amount','label','weekdays','sort_order']);
   IF shiftly_private.text_value(item,'kind') IS NULL OR shiftly_private.text_value(item,'label') IS NULL THEN RAISE EXCEPTION 'Interval kind and label required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.rate_intervals(user_id,workplace_id,rate_version_id,kind,start_time,end_time,hourly,fixed_amount,label,weekdays,sort_order)
   VALUES(p_user,w.id,v,shiftly_private.text_value(item,'kind'),shiftly_private.time_value(item,'start_time'),shiftly_private.time_value(item,'end_time'),
    shiftly_private.money_value(item,'hourly',0.01,99999999.99),shiftly_private.money_value(item,'fixed_amount',0,999999999999.99),
    shiftly_private.text_value(item,'label'),coalesce(shiftly_private.weekdays_value(item,'weekdays'),'{}'),coalesce(shiftly_private.int_value(item,'sort_order',0,2147483647),0)::integer);
  END LOOP;
  UPDATE public.rate_versions SET sealed=true WHERE id=v;
 ELSE
  IF p_payload->'thresholds' IS NOT NULL AND jsonb_typeof(p_payload->'thresholds')<>'array' THEN RAISE EXCEPTION 'thresholds must be an array' USING ERRCODE='22023'; END IF;
  IF shiftly_private.text_value(p_payload,'mode') IS NULL THEN RAISE EXCEPTION 'mode required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.commission_rule_versions(id,user_id,workplace_id,effective_from,revision,mode,fixed_percent,publication_operation_id)
  VALUES(v,p_user,w.id,eff,1,shiftly_private.text_value(p_payload,'mode'),shiftly_private.money_value(p_payload,'fixed_percent',0,100),p_op);
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'thresholds','[]')) LOOP
   PERFORM shiftly_private.require_keys(item,ARRAY['from_amount','percent']);
   IF shiftly_private.money_value(item,'from_amount',0,999999999999.99) IS NULL OR shiftly_private.money_value(item,'percent',0,100) IS NULL THEN
    RAISE EXCEPTION 'Threshold from_amount and percent required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.commission_thresholds(user_id,workplace_id,rule_version_id,from_amount,percent)
   VALUES(p_user,w.id,v,shiftly_private.money_value(item,'from_amount',0,999999999999.99),shiftly_private.money_value(item,'percent',0,100));
  END LOOP;
  UPDATE public.commission_rule_versions SET sealed=true WHERE id=v;
 END IF;
 response:=jsonb_build_object('version_id',v,'workplace_id',w.id,'sealed',true);
 PERFORM shiftly_private.audit(p_user,p_op,NULL,'version_publish','{}',response);
 RETURN response;
END $$;

CREATE OR REPLACE FUNCTION public.shiftly_write(p_key uuid,p_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE u uuid:=auth.uid(); op public.operation_requests; s public.shifts; original public.shifts;
 w public.workplaces; item jsonb; response jsonb; event text; month_before date; month_after date; source public.rate_intervals;
 new_id uuid; old_profile public.profiles; new_profile public.profiles;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR p_payload IS NULL THEN RAISE EXCEPTION 'Object payload required'; END IF;
 -- Strict per-operation allow-list: unknown, misplaced or server-state fields are rejected.
 PERFORM shiftly_private.require_keys(p_payload, CASE p_type
  WHEN 'profile_edit' THEN ARRAY['expected_revision','name','timezone','monthly_goal','hours_goal','shifts_goal']
  WHEN 'workplace_edit' THEN ARRAY['id','expected_revision','name','color','timezone','revenue_goal']
  WHEN 'workplace_archive' THEN ARRAY['id','expected_revision']
  WHEN 'publish_rates' THEN ARRAY['workplace_id','effective_from','note','acknowledge_overlap','intervals']
  WHEN 'publish_commission' THEN ARRAY['workplace_id','effective_from','mode','fixed_percent','thresholds']
  WHEN 'month_recalc' THEN ARRAY['workplace_id','month']
  WHEN 'trash_clear' THEN ARRAY['confirm']
  WHEN 'shift_create' THEN ARRAY['id','workplace_id','local_start_date','local_end_date','start_time','end_time','starts_at','ends_at','revenue','tips','comment','adjustments','fixed_payments','override_conflicts']
  WHEN 'shift_edit' THEN ARRAY['id','expected_revision','workplace_id','local_start_date','local_end_date','start_time','end_time','starts_at','ends_at','revenue','expected_revenue_revision','tips','comment','adjustments','fixed_payments','override_conflicts']
  WHEN 'shift_complete' THEN ARRAY['id','expected_revision','workplace_id','local_start_date','local_end_date','start_time','end_time','starts_at','ends_at','revenue','expected_revenue_revision','tips','comment','adjustments','fixed_payments','override_conflicts']
  WHEN 'revenue_correct' THEN ARRAY['id','expected_revision','revenue','expected_revenue_revision','comment']
  WHEN 'shift_start' THEN ARRAY['id','expected_revision','override_conflicts']
  WHEN 'shift_cancel' THEN ARRAY['id','expected_revision','override_conflicts','comment']
  WHEN 'shift_delete' THEN ARRAY['id','expected_revision']
  WHEN 'shift_restore' THEN ARRAY['id','expected_revision','override_conflicts']
  WHEN 'shift_purge' THEN ARRAY['id','expected_revision','confirm']
  ELSE ARRAY['__unsupported__'] END);
 op:=shiftly_private.begin_operation(u,p_key,p_type,p_payload);
 IF op.completed_at IS NOT NULL THEN RETURN op.response_payload; END IF;
 IF p_type='profile_edit' THEN
  SELECT * INTO old_profile FROM public.profiles WHERE id=u FOR UPDATE;
  IF old_profile.id IS NULL OR old_profile.revision IS DISTINCT FROM shiftly_private.int_value(p_payload,'expected_revision',1,9223372036854775807) THEN RAISE EXCEPTION 'Profile revision conflict' USING ERRCODE='40001'; END IF;
  UPDATE public.profiles SET name=CASE WHEN p_payload?'name' THEN shiftly_private.text_value(p_payload,'name') ELSE name END,
   timezone=CASE WHEN p_payload?'timezone' THEN shiftly_private.text_value(p_payload,'timezone') ELSE timezone END,
   monthly_goal=CASE WHEN p_payload?'monthly_goal' THEN shiftly_private.money_value(p_payload,'monthly_goal',0.01,999999999999.99) ELSE monthly_goal END,
   hours_goal=CASE WHEN p_payload?'hours_goal' THEN shiftly_private.money_value(p_payload,'hours_goal',0.01,999999.99) ELSE hours_goal END,
   shifts_goal=CASE WHEN p_payload?'shifts_goal' THEN shiftly_private.int_value(p_payload,'shifts_goal',1,2147483647)::integer ELSE shifts_goal END,
   revision=revision+1,updated_at=now() WHERE id=u RETURNING * INTO new_profile;
  PERFORM shiftly_private.audit(u,op.id,NULL,'profile_edit',to_jsonb(old_profile),to_jsonb(new_profile));
  IF (old_profile.monthly_goal,old_profile.hours_goal,old_profile.shifts_goal) IS DISTINCT FROM (new_profile.monthly_goal,new_profile.hours_goal,new_profile.shifts_goal) THEN
   PERFORM shiftly_private.audit(u,op.id,NULL,'goal_update',jsonb_build_object('monthly_goal',old_profile.monthly_goal,'hours_goal',old_profile.hours_goal,'shifts_goal',old_profile.shifts_goal),jsonb_build_object('monthly_goal',new_profile.monthly_goal,'hours_goal',new_profile.hours_goal,'shifts_goal',new_profile.shifts_goal)); END IF;
  RETURN shiftly_private.finish_operation(op.id,to_jsonb(new_profile));
 ELSIF p_type IN ('workplace_edit','workplace_archive') THEN
  new_id:=coalesce(shiftly_private.uuid_value(p_payload,'id'),gen_random_uuid());
  SELECT * INTO w FROM public.workplaces WHERE id=new_id AND user_id=u FOR UPDATE;
  IF w.id IS NOT NULL AND w.revision IS DISTINCT FROM shiftly_private.int_value(p_payload,'expected_revision',1,9223372036854775807) THEN RAISE EXCEPTION 'Workplace revision conflict' USING ERRCODE='40001'; END IF;
  IF p_type='workplace_archive' THEN
   IF w.id IS NULL THEN RAISE EXCEPTION 'Workplace not found'; END IF;
   UPDATE public.workplaces SET archived_at=coalesce(archived_at,now()),revision=revision+1,updated_at=now() WHERE id=w.id;
  ELSIF w.id IS NULL THEN
   INSERT INTO public.workplaces(id,user_id,name,color,timezone,revenue_goal) VALUES(new_id,u,shiftly_private.text_value(p_payload,'name'),shiftly_private.text_value(p_payload,'color'),coalesce(shiftly_private.text_value(p_payload,'timezone'),'Europe/Moscow'),shiftly_private.money_value(p_payload,'revenue_goal',0.01,999999999999.99));
  ELSE
   -- Historical month closure timezone is under-specified. Fail closed, do not alter history silently.
   IF p_payload?'timezone' AND shiftly_private.text_value(p_payload,'timezone')<>w.timezone AND EXISTS(SELECT 1 FROM public.shifts WHERE workplace_id=w.id) THEN
    RAISE EXCEPTION 'Timezone change with existing shifts requires approved historical closure policy'; END IF;
   UPDATE public.workplaces SET name=CASE WHEN p_payload?'name' THEN shiftly_private.text_value(p_payload,'name') ELSE name END,
    color=CASE WHEN p_payload?'color' THEN shiftly_private.text_value(p_payload,'color') ELSE color END,
    timezone=CASE WHEN p_payload?'timezone' THEN shiftly_private.text_value(p_payload,'timezone') ELSE timezone END,
    revenue_goal=CASE WHEN p_payload?'revenue_goal' THEN shiftly_private.money_value(p_payload,'revenue_goal',0.01,999999999999.99) ELSE revenue_goal END,
    revision=revision+1,updated_at=now() WHERE id=w.id;
  END IF;
  SELECT to_jsonb(wp) INTO response FROM public.workplaces wp WHERE id=new_id AND user_id=u;
  PERFORM shiftly_private.audit(u,op.id,NULL,CASE WHEN p_type='workplace_archive' THEN 'archive' ELSE 'edit' END,coalesce(to_jsonb(w),'{}'),response);
  IF w.revenue_goal IS DISTINCT FROM (response->>'revenue_goal')::numeric THEN PERFORM shiftly_private.audit(u,op.id,NULL,'goal_update',jsonb_build_object('workplace_id',new_id,'revenue_goal',w.revenue_goal),jsonb_build_object('workplace_id',new_id,'revenue_goal',response->'revenue_goal')); END IF;
  RETURN shiftly_private.finish_operation(op.id,response);
 ELSIF p_type IN ('publish_rates','publish_commission') THEN
  response:=shiftly_private.publish_version(u,op.id,p_type,p_payload);
  RETURN shiftly_private.finish_operation(op.id,response);
 ELSIF p_type='month_recalc' THEN
  response:=shiftly_private.recalculate_month(u,shiftly_private.uuid_value(p_payload,'workplace_id'),shiftly_private.date_value(p_payload,'month'),op.id);
  RETURN shiftly_private.finish_operation(op.id,response);
 ELSIF p_type='trash_clear' THEN
  IF p_payload->>'confirm' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit purge confirmation required'; END IF;
  FOR s IN SELECT * FROM public.shifts WHERE user_id=u AND deleted_at IS NOT NULL ORDER BY id FOR UPDATE LOOP
   DELETE FROM public.shifts WHERE id=s.id;
   UPDATE public.shift_financial_events SET shift_id=NULL,before_snapshot=shiftly_private.minimal_snapshot(before_snapshot),after_snapshot=shiftly_private.minimal_snapshot(after_snapshot),context='{}' WHERE user_id=u AND subject_shift_id=s.id;
   INSERT INTO public.shift_financial_events(user_id,operation_id,subject_shift_id,event_type,before_snapshot,after_snapshot)
    VALUES(u,op.id,s.id,'purge',shiftly_private.minimal_snapshot(to_jsonb(s)),'{}');
  END LOOP;
  RETURN shiftly_private.finish_operation(op.id,jsonb_build_object('cleared',true));
 END IF;
 IF p_type NOT IN ('shift_create','shift_edit','shift_complete','shift_delete','shift_restore','shift_purge','revenue_correct','shift_start','shift_cancel') THEN RAISE EXCEPTION 'Unsupported operation: %',p_type; END IF;
 new_id:=coalesce(shiftly_private.uuid_value(p_payload,'id'),gen_random_uuid());
 IF p_type<>'shift_create' THEN
  SELECT * INTO STRICT original FROM public.shifts WHERE id=new_id AND user_id=u FOR UPDATE;
  IF original.revision IS DISTINCT FROM shiftly_private.int_value(p_payload,'expected_revision',1,9223372036854775807) THEN RAISE EXCEPTION 'Shift revision conflict' USING ERRCODE='40001'; END IF;
  month_before:=date_trunc('month',original.local_start_date)::date;
  s:=original;
 ELSE s.id:=new_id; s.user_id:=u; s.status:='planned'; s.revenue_revision:=1; s.revision:=1; s.revenue_auto_zeroed:=false; END IF;
 IF original.deleted_at IS NOT NULL AND p_type NOT IN ('shift_restore','shift_purge','shift_delete') THEN RAISE EXCEPTION 'Restore shift before editing'; END IF;
 IF p_type='shift_purge' THEN
  IF original.deleted_at IS NULL OR p_payload->>'confirm' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Trash and explicit confirmation required'; END IF;
  DELETE FROM public.shifts WHERE id=s.id;
  UPDATE public.shift_financial_events SET shift_id=NULL,before_snapshot=shiftly_private.minimal_snapshot(before_snapshot),after_snapshot=shiftly_private.minimal_snapshot(after_snapshot),context='{}' WHERE user_id=u AND subject_shift_id=s.id;
  INSERT INTO public.shift_financial_events(user_id,operation_id,subject_shift_id,event_type,before_snapshot,after_snapshot)
   VALUES(u,op.id,s.id,'purge',shiftly_private.minimal_snapshot(to_jsonb(s)),'{}');
  RETURN shiftly_private.finish_operation(op.id,jsonb_build_object('purged',s.id));
 ELSIF p_type='shift_delete' THEN s.deleted_at:=coalesce(original.deleted_at,now()); event:='delete';
 ELSIF p_type='shift_restore' THEN
  IF original.deleted_at IS NULL THEN RAISE EXCEPTION 'Shift is not in trash'; END IF;
  IF now()>=original.deleted_at+interval '720 hours' THEN RAISE EXCEPTION '30-day restoration period expired'; END IF;
  s.deleted_at:=NULL; event:='restore';
 ELSIF p_type='shift_start' THEN
  IF original.status<>'planned' THEN RAISE EXCEPTION 'Only a planned shift can be started (current: %)',original.status USING ERRCODE='22023'; END IF;
  s.status:='in_progress'; event:='start';
 ELSIF p_type='shift_cancel' THEN
  IF original.status NOT IN ('planned','in_progress','pending') THEN RAISE EXCEPTION 'Only an active shift can be cancelled (current: %)',original.status USING ERRCODE='22023'; END IF;
  s.status:='cancelled';
  s.comment:=CASE WHEN p_payload?'comment' THEN shiftly_private.text_value(p_payload,'comment') ELSE s.comment END;
  event:='cancel';
 ELSE
  -- shift_create / shift_edit / shift_complete / revenue_correct: data edits only, never a raw status change.
  IF p_type='shift_complete' AND original.status NOT IN ('planned','in_progress','pending') THEN
   RAISE EXCEPTION 'Only an active shift can be completed (current: %)',original.status USING ERRCODE='22023'; END IF;
  IF p_type='revenue_correct' AND NOT p_payload?'revenue' THEN RAISE EXCEPTION 'revenue_correct requires revenue'; END IF;
  IF p_type='shift_create' AND NOT (p_payload ?& ARRAY['workplace_id','local_start_date','local_end_date','start_time','end_time','starts_at','ends_at']) THEN
   RAISE EXCEPTION 'Shift create requires workplace_id and the complete time set'; END IF;
  -- Time consistency: local fields and UTC instants change only as one complete set.
  IF (p_payload ?| ARRAY['local_start_date','local_end_date','start_time','end_time','starts_at','ends_at'])
     AND NOT (p_payload ?& ARRAY['local_start_date','local_end_date','start_time','end_time','starts_at','ends_at']) THEN
   RAISE EXCEPTION 'Local time and UTC instants must be updated as one complete set'; END IF;
  s.workplace_id:=coalesce(shiftly_private.uuid_value(p_payload,'workplace_id'),s.workplace_id);
  SELECT * INTO STRICT w FROM public.workplaces WHERE id=s.workplace_id AND user_id=u;
  IF w.archived_at IS NOT NULL AND (p_type='shift_create' OR s.workplace_id IS DISTINCT FROM original.workplace_id) THEN RAISE EXCEPTION 'Cannot assign new shifts to archived workplace'; END IF;
  s.workplace_timezone:=CASE WHEN p_type='shift_create' OR s.workplace_id IS DISTINCT FROM original.workplace_id THEN w.timezone ELSE original.workplace_timezone END;
  s.local_start_date:=coalesce(shiftly_private.date_value(p_payload,'local_start_date'),s.local_start_date);
  s.local_end_date:=coalesce(shiftly_private.date_value(p_payload,'local_end_date'),s.local_end_date);
  s.start_time:=coalesce(shiftly_private.time_value(p_payload,'start_time'),s.start_time);
  s.end_time:=coalesce(shiftly_private.time_value(p_payload,'end_time'),s.end_time);
  s.starts_at:=coalesce(shiftly_private.ts_value(p_payload,'starts_at'),s.starts_at);
  s.ends_at:=coalesce(shiftly_private.ts_value(p_payload,'ends_at'),s.ends_at);
  s.status:=CASE WHEN p_type='shift_complete' THEN 'completed' ELSE s.status END;
  IF p_payload?'revenue' THEN
   IF original.id IS NOT NULL AND original.revenue_revision IS DISTINCT FROM shiftly_private.int_value(p_payload,'expected_revenue_revision',1,9223372036854775807) THEN RAISE EXCEPTION 'Revenue revision conflict' USING ERRCODE='40001'; END IF;
   s.revenue:=shiftly_private.money_value(p_payload,'revenue',0,999999999999.99);
   IF s.revenue IS DISTINCT FROM original.revenue THEN s.revenue_revision:=s.revenue_revision+CASE WHEN original.id IS NULL THEN 0 ELSE 1 END; END IF;
   s.revenue_auto_zeroed:=false;
  END IF;
  s.tips:=CASE WHEN p_payload?'tips' THEN shiftly_private.money_value(p_payload,'tips',0,999999999999.99) ELSE s.tips END;
  s.comment:=CASE WHEN p_payload?'comment' THEN shiftly_private.text_value(p_payload,'comment') ELSE s.comment END;
  event:=CASE WHEN p_type='shift_create' THEN 'create' WHEN p_type='shift_complete' THEN 'complete' WHEN p_type='revenue_correct' OR (original.revenue_auto_zeroed AND p_payload?'revenue') THEN 'revenue_correction' ELSE 'edit' END;
 END IF;
 IF s.deleted_at IS NULL AND s.status<>'cancelled' AND EXISTS(SELECT 1 FROM public.shifts x WHERE x.user_id=u AND x.id<>s.id AND x.deleted_at IS NULL AND x.status<>'cancelled' AND x.starts_at<s.ends_at AND x.ends_at>s.starts_at)
 AND NOT coalesce(shiftly_private.bool_value(p_payload,'override_conflicts'),false) THEN RAISE EXCEPTION 'Shift conflicts require explicit override'; END IF;
 IF p_type NOT IN ('shift_delete','shift_restore') AND (original.id IS NULL OR
   (s.workplace_id,s.local_start_date,s.local_end_date,s.starts_at,s.ends_at) IS DISTINCT FROM
  (original.workplace_id,original.local_start_date,original.local_end_date,original.starts_at,original.ends_at)) THEN
  SELECT id INTO s.rate_version_id FROM public.rate_versions WHERE user_id=u AND workplace_id=s.workplace_id AND sealed AND effective_from<=s.local_start_date ORDER BY effective_from DESC LIMIT 1;
  s.base_pay:=shiftly_private.hourly_pay(s,s.rate_version_id);
 END IF;
 IF s.status<>'completed' AND p_type NOT IN ('shift_delete','shift_restore') THEN
  s.commission_pay:=NULL; s.commission_source:='unconfigured'; END IF;
 IF original.id IS NULL THEN
  INSERT INTO public.shifts(id,user_id,workplace_id,local_start_date,local_end_date,start_time,end_time,workplace_timezone,starts_at,ends_at,status,revenue,tips,base_pay,rate_version_id,comment)
   VALUES(s.id,u,s.workplace_id,s.local_start_date,s.local_end_date,s.start_time,s.end_time,s.workplace_timezone,s.starts_at,s.ends_at,s.status,s.revenue,s.tips,s.base_pay,s.rate_version_id,s.comment);
 ELSE
  IF s.workplace_id<>original.workplace_id AND NOT p_payload?'fixed_payments' AND EXISTS(SELECT 1 FROM public.shift_fixed_payments WHERE shift_id=s.id) THEN RAISE EXCEPTION 'Workplace move must explicitly replace fixed payments'; END IF;
  IF p_payload?'fixed_payments' THEN DELETE FROM public.shift_fixed_payments WHERE shift_id=s.id AND user_id=u; END IF;
  UPDATE public.shifts SET workplace_id=s.workplace_id,local_start_date=s.local_start_date,local_end_date=s.local_end_date,start_time=s.start_time,end_time=s.end_time,
   workplace_timezone=s.workplace_timezone,starts_at=s.starts_at,ends_at=s.ends_at,status=s.status,revenue=s.revenue,revenue_revision=s.revenue_revision,revenue_auto_zeroed=s.revenue_auto_zeroed,
   tips=s.tips,base_pay=s.base_pay,rate_version_id=s.rate_version_id,commission_pay=s.commission_pay,commission_source=s.commission_source,comment=s.comment,deleted_at=s.deleted_at,revision=revision+1,updated_at=now() WHERE id=s.id;
 END IF;
 IF p_payload?'adjustments' THEN
  IF jsonb_typeof(p_payload->'adjustments')<>'array' THEN RAISE EXCEPTION 'adjustments must be an array' USING ERRCODE='22023'; END IF;
  DELETE FROM public.shift_adjustments WHERE shift_id=s.id AND user_id=u;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'adjustments') LOOP
   PERFORM shiftly_private.require_keys(item,ARRAY['kind','label','amount','comment','sort_order']);
   IF shiftly_private.text_value(item,'kind') IS NULL OR shiftly_private.text_value(item,'label') IS NULL THEN RAISE EXCEPTION 'Adjustment kind and label required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.shift_adjustments(user_id,shift_id,kind,label,amount,comment,sort_order)
    VALUES(u,s.id,shiftly_private.text_value(item,'kind'),shiftly_private.text_value(item,'label'),shiftly_private.money_value(item,'amount',0,999999999999.99),shiftly_private.text_value(item,'comment'),coalesce(shiftly_private.int_value(item,'sort_order',0,2147483647),0)::integer);
  END LOOP;
 END IF;
 IF p_payload?'fixed_payments' THEN
  IF jsonb_typeof(p_payload->'fixed_payments')<>'array' THEN RAISE EXCEPTION 'fixed_payments must be an array' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'fixed_payments') LOOP
   PERFORM shiftly_private.require_keys(item,ARRAY['rate_interval_id']);
   SELECT ri.* INTO STRICT source FROM public.rate_intervals ri JOIN public.rate_versions rv ON rv.id=ri.rate_version_id
    WHERE ri.id=shiftly_private.uuid_value(item,'rate_interval_id') AND ri.user_id=u AND ri.workplace_id=s.workplace_id AND ri.kind='fixed' AND rv.sealed;
   INSERT INTO public.shift_fixed_payments(user_id,workplace_id,shift_id,rate_interval_id,amount_snapshot,label_snapshot,selection_operation_id)
    VALUES(u,s.workplace_id,s.id,source.id,source.fixed_amount,source.label,op.id);
  END LOOP;
 END IF;
 PERFORM shiftly_private.refresh_earnings(u,s.id);
 month_after:=date_trunc('month',s.local_start_date)::date;
 IF original.id IS NOT NULL THEN PERFORM shiftly_private.recalculate_month(u,original.workplace_id,month_before,op.id); END IF;
 IF original.id IS NULL OR (original.workplace_id,month_before) IS DISTINCT FROM (s.workplace_id,month_after) THEN
  PERFORM shiftly_private.recalculate_month(u,s.workplace_id,month_after,op.id); END IF;
 SELECT to_jsonb(x) INTO response FROM public.shifts x WHERE id=s.id AND user_id=u;
 PERFORM shiftly_private.audit(u,op.id,s.id,event,coalesce(to_jsonb(original),'{}'),response,jsonb_build_object('override_conflicts',coalesce(shiftly_private.bool_value(p_payload,'override_conflicts'),false)));
 RETURN shiftly_private.finish_operation(op.id,response);
END $$;

REVOKE ALL ON FUNCTION public.shiftly_write(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiftly_write(uuid,text,jsonb) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiftly_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiftly_private TO service_role;
COMMIT;
