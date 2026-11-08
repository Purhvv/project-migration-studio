-- Stage 2.1 fixes 4.1/4.2 and approved decision 5: correct version revisions,
-- provisional recalculation of future planned shifts after rate publication,
-- and controlled server-side account deletion. Forward-only.
--
-- Revision sequencing: each new version of a workplace gets max(revision)+1 for
-- that workplace, computed under the workplace row lock (SELECT ... FOR UPDATE),
-- so concurrent publications serialize and can never duplicate a revision.
-- UNIQUE(workplace_id,effective_from) still forbids two versions on one date.
--
-- Future recalculation policy (approved): after sealing a rate version, every
-- active PLANNED shift of the workplace with local_start_date >= effective_from
-- is re-evaluated against the latest applicable sealed version. Started
-- (in_progress/pending) and completed shifts keep their snapshots; completed
-- periods are already protected by the historical-publication guard. Ambiguous
-- or missing rates yield NULL base_pay, never a guessed winner.
--
-- Account deletion: a dedicated service_role-only RPC. The auth identity must
-- already be deleted through the controlled auth flow; the profile cascade then
-- removes every owned row. No client path can trigger it.
BEGIN;

CREATE OR REPLACE FUNCTION shiftly_private.publish_version(p_user uuid,p_op uuid,p_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE w public.workplaces; v uuid; item jsonb; response jsonb; eff date; next_rev integer;
 fut public.shifts; fut_new public.shifts; ver uuid; pay numeric;
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
  SELECT coalesce(max(revision),0)+1 INTO next_rev FROM public.rate_versions WHERE workplace_id=w.id;
  INSERT INTO public.rate_versions(id,user_id,workplace_id,effective_from,revision,note,publication_operation_id,overlap_acknowledged_at)
   VALUES(v,p_user,w.id,eff,next_rev,shiftly_private.text_value(p_payload,'note'),p_op,CASE WHEN coalesce(shiftly_private.bool_value(p_payload,'acknowledge_overlap'),false) THEN now() END);
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'intervals') LOOP
   PERFORM shiftly_private.require_keys(item,ARRAY['kind','start_time','end_time','hourly','fixed_amount','label','weekdays','sort_order']);
   IF shiftly_private.text_value(item,'kind') IS NULL OR shiftly_private.text_value(item,'label') IS NULL THEN RAISE EXCEPTION 'Interval kind and label required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.rate_intervals(user_id,workplace_id,rate_version_id,kind,start_time,end_time,hourly,fixed_amount,label,weekdays,sort_order)
   VALUES(p_user,w.id,v,shiftly_private.text_value(item,'kind'),shiftly_private.time_value(item,'start_time'),shiftly_private.time_value(item,'end_time'),
    shiftly_private.money_value(item,'hourly',0.01,99999999.99),shiftly_private.money_value(item,'fixed_amount',0,999999999999.99),
    shiftly_private.text_value(item,'label'),coalesce(shiftly_private.weekdays_value(item,'weekdays'),'{}'),coalesce(shiftly_private.int_value(item,'sort_order',0,2147483647),0)::integer);
  END LOOP;
  UPDATE public.rate_versions SET sealed=true WHERE id=v;
  -- Recalculate provisional pay of applicable future planned shifts only.
  FOR fut IN SELECT * FROM public.shifts WHERE user_id=p_user AND workplace_id=w.id AND deleted_at IS NULL
   AND status='planned' AND local_start_date>=eff ORDER BY id FOR UPDATE
  LOOP
   SELECT id INTO ver FROM public.rate_versions WHERE user_id=p_user AND workplace_id=w.id AND sealed AND effective_from<=fut.local_start_date ORDER BY effective_from DESC LIMIT 1;
   pay:=shiftly_private.hourly_pay(fut,ver);
   IF ver IS DISTINCT FROM fut.rate_version_id OR pay IS DISTINCT FROM fut.base_pay THEN
    UPDATE public.shifts SET rate_version_id=ver,base_pay=pay,revision=revision+1,updated_at=now() WHERE id=fut.id RETURNING * INTO fut_new;
    PERFORM shiftly_private.refresh_earnings(p_user,fut.id);
    SELECT * INTO fut_new FROM public.shifts WHERE id=fut.id;
    PERFORM shiftly_private.audit(p_user,p_op,fut.id,'rate_recalc_confirm',to_jsonb(fut),to_jsonb(fut_new),jsonb_build_object('rate_version_id',v,'effective_from',eff));
   END IF;
  END LOOP;
 ELSE
  IF p_payload->'thresholds' IS NOT NULL AND jsonb_typeof(p_payload->'thresholds')<>'array' THEN RAISE EXCEPTION 'thresholds must be an array' USING ERRCODE='22023'; END IF;
  IF shiftly_private.text_value(p_payload,'mode') IS NULL THEN RAISE EXCEPTION 'mode required' USING ERRCODE='22023'; END IF;
  SELECT coalesce(max(revision),0)+1 INTO next_rev FROM public.commission_rule_versions WHERE workplace_id=w.id;
  INSERT INTO public.commission_rule_versions(id,user_id,workplace_id,effective_from,revision,mode,fixed_percent,publication_operation_id)
  VALUES(v,p_user,w.id,eff,next_rev,shiftly_private.text_value(p_payload,'mode'),shiftly_private.money_value(p_payload,'fixed_percent',0,100),p_op);
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'thresholds','[]')) LOOP
   PERFORM shiftly_private.require_keys(item,ARRAY['from_amount','percent']);
   IF shiftly_private.money_value(item,'from_amount',0,999999999999.99) IS NULL OR shiftly_private.money_value(item,'percent',0,100) IS NULL THEN
    RAISE EXCEPTION 'Threshold from_amount and percent required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.commission_thresholds(user_id,workplace_id,rule_version_id,from_amount,percent)
   VALUES(p_user,w.id,v,shiftly_private.money_value(item,'from_amount',0,999999999999.99),shiftly_private.money_value(item,'percent',0,100));
  END LOOP;
  UPDATE public.commission_rule_versions SET sealed=true WHERE id=v;
 END IF;
 response:=jsonb_build_object('version_id',v,'workplace_id',w.id,'revision',next_rev,'sealed',true);
 PERFORM shiftly_private.audit(p_user,p_op,NULL,'version_publish','{}',response);
 RETURN response;
END $$;

-- Controlled account deletion: trusted server only, never callable by clients.
CREATE FUNCTION public.shiftly_delete_account(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF p_user IS NULL THEN RAISE EXCEPTION 'User required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
  RAISE EXCEPTION 'Auth identity must be deleted through the controlled auth flow first' USING ERRCODE='22023'; END IF;
 -- The auth cascade may already have removed the profile; deletion is idempotent.
 DELETE FROM public.profiles WHERE id=p_user;
 RETURN jsonb_build_object('deleted',p_user);
END $$;
REVOKE ALL ON FUNCTION public.shiftly_delete_account(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shiftly_delete_account(uuid) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiftly_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiftly_private TO service_role;
COMMIT;
