BEGIN;
-- Authenticated owner is derived from JWT, never from a client-supplied user_id.
CREATE FUNCTION public.shiftly_write(p_key uuid,p_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE u uuid:=auth.uid(); op public.operation_requests; s public.shifts; original public.shifts;
 w public.workplaces; v uuid; item jsonb; response jsonb; event text; month_before date; month_after date; source public.rate_intervals;
 expected bigint; new_id uuid; old_profile public.profiles; new_profile public.profiles;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR p_payload IS NULL THEN RAISE EXCEPTION 'Object payload required'; END IF;
 IF p_payload ?| ARRAY['user_id','earnings','base_pay','fixed_pay','commission_pay','commission_source','revenue_auto_zeroed','deleted_at','revision','rate_version_id'] THEN
  RAISE EXCEPTION 'Client cannot supply owner, calculated totals or server state'; END IF;
 op:=shiftly_private.begin_operation(u,p_key,p_type,p_payload);
 IF op.completed_at IS NOT NULL THEN RETURN op.response_payload; END IF;
 IF p_type='profile_edit' THEN
  SELECT * INTO old_profile FROM public.profiles WHERE id=u FOR UPDATE;
  IF old_profile.id IS NULL OR old_profile.revision IS DISTINCT FROM (p_payload->>'expected_revision')::bigint THEN RAISE EXCEPTION 'Profile revision conflict' USING ERRCODE='40001'; END IF;
  UPDATE public.profiles SET name=CASE WHEN p_payload?'name' THEN p_payload->>'name' ELSE name END,
   timezone=CASE WHEN p_payload?'timezone' THEN p_payload->>'timezone' ELSE timezone END,
   monthly_goal=CASE WHEN p_payload?'monthly_goal' THEN (p_payload->>'monthly_goal')::numeric ELSE monthly_goal END,
   hours_goal=CASE WHEN p_payload?'hours_goal' THEN (p_payload->>'hours_goal')::numeric ELSE hours_goal END,
   shifts_goal=CASE WHEN p_payload?'shifts_goal' THEN (p_payload->>'shifts_goal')::integer ELSE shifts_goal END,
   revision=revision+1,updated_at=now() WHERE id=u RETURNING * INTO new_profile;
  PERFORM shiftly_private.audit(u,op.id,NULL,'profile_edit',to_jsonb(old_profile),to_jsonb(new_profile));
  IF (old_profile.monthly_goal,old_profile.hours_goal,old_profile.shifts_goal) IS DISTINCT FROM (new_profile.monthly_goal,new_profile.hours_goal,new_profile.shifts_goal) THEN
   PERFORM shiftly_private.audit(u,op.id,NULL,'goal_update',jsonb_build_object('monthly_goal',old_profile.monthly_goal,'hours_goal',old_profile.hours_goal,'shifts_goal',old_profile.shifts_goal),jsonb_build_object('monthly_goal',new_profile.monthly_goal,'hours_goal',new_profile.hours_goal,'shifts_goal',new_profile.shifts_goal)); END IF;
  RETURN shiftly_private.finish_operation(op.id,to_jsonb(new_profile));
 ELSIF p_type IN ('workplace_edit','workplace_archive') THEN
  new_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
  SELECT * INTO w FROM public.workplaces WHERE id=new_id AND user_id=u FOR UPDATE;
  IF w.id IS NOT NULL AND w.revision IS DISTINCT FROM (p_payload->>'expected_revision')::bigint THEN RAISE EXCEPTION 'Workplace revision conflict' USING ERRCODE='40001'; END IF;
  IF p_type='workplace_archive' THEN
   IF w.id IS NULL THEN RAISE EXCEPTION 'Workplace not found'; END IF;
   UPDATE public.workplaces SET archived_at=coalesce(archived_at,now()),revision=revision+1,updated_at=now() WHERE id=w.id;
  ELSIF w.id IS NULL THEN
   INSERT INTO public.workplaces(id,user_id,name,color,timezone,revenue_goal) VALUES(new_id,u,p_payload->>'name',p_payload->>'color',coalesce(p_payload->>'timezone','Europe/Moscow'),(p_payload->>'revenue_goal')::numeric);
  ELSE
   -- Historical month closure timezone is under-specified. Fail closed, do not alter history silently.
   IF p_payload?'timezone' AND p_payload->>'timezone'<>w.timezone AND EXISTS(SELECT 1 FROM public.shifts WHERE workplace_id=w.id) THEN
    RAISE EXCEPTION 'Timezone change with existing shifts requires approved historical closure policy'; END IF;
   UPDATE public.workplaces SET name=CASE WHEN p_payload?'name' THEN p_payload->>'name' ELSE name END,
    color=CASE WHEN p_payload?'color' THEN p_payload->>'color' ELSE color END,
    timezone=CASE WHEN p_payload?'timezone' THEN p_payload->>'timezone' ELSE timezone END,
    revenue_goal=CASE WHEN p_payload?'revenue_goal' THEN (p_payload->>'revenue_goal')::numeric ELSE revenue_goal END,
    revision=revision+1,updated_at=now() WHERE id=w.id;
  END IF;
  SELECT to_jsonb(wp) INTO response FROM public.workplaces wp WHERE id=new_id AND user_id=u;
  PERFORM shiftly_private.audit(u,op.id,NULL,CASE WHEN p_type='workplace_archive' THEN 'archive' ELSE 'edit' END,coalesce(to_jsonb(w),'{}'),response);
  IF w.revenue_goal IS DISTINCT FROM (response->>'revenue_goal')::numeric THEN PERFORM shiftly_private.audit(u,op.id,NULL,'goal_update',jsonb_build_object('workplace_id',new_id,'revenue_goal',w.revenue_goal),jsonb_build_object('workplace_id',new_id,'revenue_goal',response->'revenue_goal')); END IF;
  RETURN shiftly_private.finish_operation(op.id,response);
 ELSIF p_type IN ('publish_rates','publish_commission') THEN
  SELECT * INTO STRICT w FROM public.workplaces WHERE id=(p_payload->>'workplace_id')::uuid AND user_id=u FOR UPDATE;
  -- Publishing must never silently affect an existing completed historical period.
  IF EXISTS(SELECT 1 FROM public.shifts WHERE workplace_id=w.id AND deleted_at IS NULL AND status='completed' AND local_start_date>=(p_payload->>'effective_from')::date) THEN
   RAISE EXCEPTION 'Historical publication needs preview and explicit confirmation; not available until contradiction resolution'; END IF;
  v:=gen_random_uuid();
  IF p_type='publish_rates' THEN
   INSERT INTO public.rate_versions(id,user_id,workplace_id,effective_from,revision,note,publication_operation_id,overlap_acknowledged_at)
    VALUES(v,u,w.id,(p_payload->>'effective_from')::date,1,p_payload->>'note',op.id,CASE WHEN coalesce((p_payload->>'acknowledge_overlap')::boolean,false) THEN now() END);
   FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'intervals') LOOP
    INSERT INTO public.rate_intervals(user_id,workplace_id,rate_version_id,kind,start_time,end_time,hourly,fixed_amount,label,weekdays,sort_order)
    VALUES(u,w.id,v,item->>'kind',(item->>'start_time')::time,(item->>'end_time')::time,(item->>'hourly')::numeric,(item->>'fixed_amount')::numeric,item->>'label',
     ARRAY(SELECT value::smallint FROM jsonb_array_elements_text(coalesce(item->'weekdays','[]'))),coalesce((item->>'sort_order')::integer,0));
   END LOOP;
   UPDATE public.rate_versions SET sealed=true WHERE id=v;
  ELSE
   INSERT INTO public.commission_rule_versions(id,user_id,workplace_id,effective_from,revision,mode,fixed_percent,publication_operation_id)
   VALUES(v,u,w.id,(p_payload->>'effective_from')::date,1,p_payload->>'mode',(p_payload->>'fixed_percent')::numeric,op.id);
   FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'thresholds','[]')) LOOP
    INSERT INTO public.commission_thresholds(user_id,workplace_id,rule_version_id,from_amount,percent)
    VALUES(u,w.id,v,(item->>'from_amount')::numeric,(item->>'percent')::numeric);
   END LOOP;
   UPDATE public.commission_rule_versions SET sealed=true WHERE id=v;
  END IF;
  response:=jsonb_build_object('version_id',v,'workplace_id',w.id,'sealed',true);
  PERFORM shiftly_private.audit(u,op.id,NULL,'version_publish','{}',response);
  RETURN shiftly_private.finish_operation(op.id,response);
 ELSIF p_type='month_recalc' THEN
  response:=shiftly_private.recalculate_month(u,(p_payload->>'workplace_id')::uuid,(p_payload->>'month')::date,op.id);
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
 IF p_type NOT IN ('shift_create','shift_edit','shift_complete','shift_delete','shift_restore','shift_purge','revenue_correct') THEN RAISE EXCEPTION 'Unsupported operation: %',p_type; END IF;
 new_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
 IF p_type<>'shift_create' THEN
  SELECT * INTO STRICT original FROM public.shifts WHERE id=new_id AND user_id=u FOR UPDATE;
  IF original.revision IS DISTINCT FROM (p_payload->>'expected_revision')::bigint THEN RAISE EXCEPTION 'Shift revision conflict' USING ERRCODE='40001'; END IF;
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
 ELSE
  s.workplace_id:=CASE WHEN p_payload?'workplace_id' THEN (p_payload->>'workplace_id')::uuid ELSE s.workplace_id END;
  SELECT * INTO STRICT w FROM public.workplaces WHERE id=s.workplace_id AND user_id=u;
  IF w.archived_at IS NOT NULL AND (p_type='shift_create' OR s.workplace_id IS DISTINCT FROM original.workplace_id) THEN RAISE EXCEPTION 'Cannot assign new shifts to archived workplace'; END IF;
  s.workplace_timezone:=CASE WHEN p_type='shift_create' OR s.workplace_id IS DISTINCT FROM original.workplace_id THEN w.timezone ELSE original.workplace_timezone END;
  s.local_start_date:=CASE WHEN p_payload?'local_start_date' THEN (p_payload->>'local_start_date')::date ELSE s.local_start_date END;
  s.local_end_date:=CASE WHEN p_payload?'local_end_date' THEN (p_payload->>'local_end_date')::date ELSE s.local_end_date END;
  s.start_time:=CASE WHEN p_payload?'start_time' THEN (p_payload->>'start_time')::time ELSE s.start_time END;
  s.end_time:=CASE WHEN p_payload?'end_time' THEN (p_payload->>'end_time')::time ELSE s.end_time END;
  -- Explicit UTC offset required; timezone trigger validates nonexistent local times and DST resolution.
  IF p_payload?'starts_at' THEN
   IF (p_payload->>'starts_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'Explicit UTC offset required'; END IF;
   s.starts_at:=(p_payload->>'starts_at')::timestamptz; END IF;
  IF p_payload?'ends_at' THEN
   IF (p_payload->>'ends_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'Explicit UTC offset required'; END IF;
   s.ends_at:=(p_payload->>'ends_at')::timestamptz; END IF;
  s.status:=CASE WHEN p_type='shift_complete' THEN 'completed' WHEN p_payload?'status' THEN p_payload->>'status' ELSE s.status END;
  IF p_payload?'revenue' THEN
   IF original.id IS NOT NULL AND original.revenue_revision IS DISTINCT FROM (p_payload->>'expected_revenue_revision')::bigint THEN RAISE EXCEPTION 'Revenue revision conflict' USING ERRCODE='40001'; END IF;
   s.revenue:=(p_payload->>'revenue')::numeric;
   IF s.revenue IS DISTINCT FROM original.revenue THEN s.revenue_revision:=s.revenue_revision+CASE WHEN original.id IS NULL THEN 0 ELSE 1 END; END IF;
   s.revenue_auto_zeroed:=false;
  END IF;
  s.tips:=CASE WHEN p_payload?'tips' THEN (p_payload->>'tips')::numeric ELSE s.tips END;
  s.comment:=CASE WHEN p_payload?'comment' THEN p_payload->>'comment' ELSE s.comment END;
  event:=CASE WHEN p_type='shift_create' THEN 'create' WHEN p_type='shift_complete' THEN 'complete' WHEN p_type='revenue_correct' OR (original.revenue_auto_zeroed AND p_payload?'revenue') THEN 'revenue_correction' ELSE 'edit' END;
 END IF;
 IF s.deleted_at IS NULL AND s.status<>'cancelled' AND EXISTS(SELECT 1 FROM public.shifts x WHERE x.user_id=u AND x.id<>s.id AND x.deleted_at IS NULL AND x.status<>'cancelled' AND x.starts_at<s.ends_at AND x.ends_at>s.starts_at)
 AND NOT coalesce((p_payload->>'override_conflicts')::boolean,false) THEN RAISE EXCEPTION 'Shift conflicts require explicit override'; END IF;
 IF p_type NOT IN ('shift_delete','shift_restore') THEN
  SELECT id INTO s.rate_version_id FROM public.rate_versions WHERE user_id=u AND workplace_id=s.workplace_id AND sealed AND effective_from<=s.local_start_date ORDER BY effective_from DESC LIMIT 1;
  s.base_pay:=shiftly_private.hourly_pay(s,s.rate_version_id);
  s.commission_pay:=NULL; s.commission_source:='unconfigured';
 END IF;
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
  DELETE FROM public.shift_adjustments WHERE shift_id=s.id AND user_id=u;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'adjustments') LOOP
   INSERT INTO public.shift_adjustments(user_id,shift_id,kind,label,amount,comment,sort_order)
   VALUES(u,s.id,item->>'kind',item->>'label',(item->>'amount')::numeric,item->>'comment',coalesce((item->>'sort_order')::integer,0));
  END LOOP;
 END IF;
 IF p_payload?'fixed_payments' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'fixed_payments') LOOP
   SELECT ri.* INTO STRICT source FROM public.rate_intervals ri JOIN public.rate_versions rv ON rv.id=ri.rate_version_id
    WHERE ri.id=(item->>'rate_interval_id')::uuid AND ri.user_id=u AND ri.workplace_id=s.workplace_id AND ri.kind='fixed' AND rv.sealed;
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
 PERFORM shiftly_private.audit(u,op.id,s.id,event,coalesce(to_jsonb(original),'{}'),response,jsonb_build_object('override_conflicts',coalesce((p_payload->>'override_conflicts')::boolean,false)));
 RETURN shiftly_private.finish_operation(op.id,response);
END $$;
REVOKE ALL ON FUNCTION public.shiftly_write(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiftly_write(uuid,text,jsonb) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiftly_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiftly_private TO service_role;
COMMIT;
