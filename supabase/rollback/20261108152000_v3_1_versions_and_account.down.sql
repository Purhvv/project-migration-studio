-- Restores the 20261108151000 publish_version (revision=1, no future recalculation)
-- and drops the account-deletion RPC. Only for an empty isolated test schema.
BEGIN;
DROP FUNCTION public.shiftly_delete_account(uuid);
CREATE OR REPLACE FUNCTION shiftly_private.publish_version(p_user uuid,p_op uuid,p_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE w public.workplaces; v uuid; item jsonb; response jsonb; eff date;
BEGIN
 SELECT * INTO STRICT w FROM public.workplaces WHERE id=shiftly_private.uuid_value(p_payload,'workplace_id') AND user_id=p_user FOR UPDATE;
 eff:=shiftly_private.date_value(p_payload,'effective_from');
 IF eff IS NULL THEN RAISE EXCEPTION 'effective_from required' USING ERRCODE='22023'; END IF;
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
COMMIT;
