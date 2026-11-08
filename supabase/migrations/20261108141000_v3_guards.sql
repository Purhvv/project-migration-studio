-- Internal helpers are not exposed through the Data API.
BEGIN;
CREATE FUNCTION shiftly_private.guard_timezone() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE z text;
BEGIN
 z := CASE WHEN TG_TABLE_NAME='shifts' THEN NEW.workplace_timezone ELSE NEW.timezone END;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=z AND name !~ '^(posix|right)/') THEN
  RAISE EXCEPTION 'Unknown IANA timezone: %',z USING ERRCODE='22023';
 END IF;
 IF TG_TABLE_NAME='shifts' THEN
  IF (NEW.starts_at AT TIME ZONE z)::date <> NEW.local_start_date
    OR (NEW.ends_at AT TIME ZONE z)::date <> NEW.local_end_date
    OR (NEW.starts_at AT TIME ZONE z)::time <> NEW.start_time
    OR (NEW.ends_at AT TIME ZONE z)::time <> NEW.end_time THEN
   RAISE EXCEPTION 'UTC instants do not match explicitly resolved local times' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER profiles_timezone BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_timezone();
CREATE TRIGGER workplaces_timezone BEFORE INSERT OR UPDATE ON public.workplaces FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_timezone();
CREATE TRIGGER shifts_timezone BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_timezone();

CREATE FUNCTION shiftly_private.guard_sealed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE owner uuid; locked boolean; parent uuid;
BEGIN
 owner := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 -- Account cascade is the sole exception; auth.users is already gone.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner) THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME IN ('rate_versions','commission_rule_versions') THEN
  IF TG_OP<>'INSERT' AND OLD.sealed THEN RAISE EXCEPTION 'Published version is immutable'; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN
   IF TG_TABLE_NAME='rate_intervals' THEN
    SELECT sealed INTO locked FROM public.rate_versions WHERE id=OLD.rate_version_id FOR UPDATE;
   ELSE
    SELECT sealed INTO locked FROM public.commission_rule_versions WHERE id=OLD.rule_version_id FOR UPDATE;
   END IF;
   IF locked THEN RAISE EXCEPTION 'Published version children are immutable'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
   IF TG_TABLE_NAME='rate_intervals' THEN
    SELECT sealed INTO locked FROM public.rate_versions WHERE id=NEW.rate_version_id FOR UPDATE;
   ELSE
    SELECT sealed INTO locked FROM public.commission_rule_versions WHERE id=NEW.rule_version_id FOR UPDATE;
   END IF;
   IF locked THEN RAISE EXCEPTION 'Published version children are immutable'; END IF;
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER rates_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.rate_versions FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_sealed();
CREATE TRIGGER intervals_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.rate_intervals FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_sealed();
CREATE TRIGGER rules_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.commission_rule_versions FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_sealed();
CREATE TRIGGER thresholds_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.commission_thresholds FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_sealed();

CREATE FUNCTION shiftly_private.minimal_snapshot(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(p)
 WHERE key IN ('id','workplace_id','status','revenue','base_pay','fixed_pay','commission_pay','tips','earnings','revision','revenue_auto_zeroed');
$$;
CREATE FUNCTION shiftly_private.guard_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) AND TG_OP='DELETE' THEN RETURN OLD; END IF;
 -- Purge may ONLY detach and redact. It cannot rewrite financial amounts or event identity.
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM public.shifts WHERE id=OLD.subject_shift_id)
   AND NEW.shift_id IS NULL
   AND NEW.before_snapshot=shiftly_private.minimal_snapshot(OLD.before_snapshot)
   AND NEW.after_snapshot=shiftly_private.minimal_snapshot(OLD.after_snapshot)
   AND NEW.context='{}'::jsonb
   AND (to_jsonb(NEW)-ARRAY['shift_id','before_snapshot','after_snapshot','context'])=
       (to_jsonb(OLD)-ARRAY['shift_id','before_snapshot','after_snapshot','context']) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Financial audit is append-only (except constrained purge redaction/account deletion)';
END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON public.shift_financial_events FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_audit();
CREATE FUNCTION shiftly_private.guard_workplace_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id) THEN RAISE EXCEPTION 'Archive workplace instead of deleting it'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER workplaces_no_delete BEFORE DELETE ON public.workplaces FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_workplace_delete();

CREATE FUNCTION shiftly_private.earnings(p_base numeric,p_fixed numeric,p_commission numeric,p_tips numeric,p_bonus numeric,p_penalty numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT p_base+p_fixed+p_commission+p_tips+p_bonus-p_penalty;
$$;
CREATE FUNCTION shiftly_private.refresh_earnings(p_user uuid,p_shift uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE f numeric; b numeric; p numeric;
BEGIN
 SELECT CASE WHEN count(*) FILTER(WHERE amount_snapshot IS NULL)>0 THEN NULL ELSE coalesce(sum(amount_snapshot),0) END
 INTO f FROM public.shift_fixed_payments WHERE user_id=p_user AND shift_id=p_shift;
 SELECT CASE WHEN count(*) FILTER(WHERE kind='bonus' AND amount IS NULL)>0 THEN NULL ELSE coalesce(sum(amount) FILTER(WHERE kind='bonus'),0) END,
 CASE WHEN count(*) FILTER(WHERE kind='penalty' AND amount IS NULL)>0 THEN NULL ELSE coalesce(sum(amount) FILTER(WHERE kind='penalty'),0) END
 INTO b,p FROM public.shift_adjustments WHERE user_id=p_user AND shift_id=p_shift;
 UPDATE public.shifts SET fixed_pay=f,earnings=shiftly_private.earnings(base_pay,f,commission_pay,tips,b,p) WHERE user_id=p_user AND id=p_shift;
END $$;

CREATE FUNCTION shiftly_private.begin_operation(p_user uuid,p_key uuid,p_type text,p_payload jsonb)
RETURNS public.operation_requests LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE r public.operation_requests;
BEGIN
 IF p_user IS NULL OR p_key IS NULL THEN RAISE EXCEPTION 'Owner and idempotency key required'; END IF;
 -- Serializing per owner also gives deterministic lock ordering for cross-workplace moves.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 INSERT INTO public.operation_requests(user_id,idempotency_key,operation_type,request_payload)
 VALUES(p_user,p_key,p_type,p_payload) ON CONFLICT(user_id,idempotency_key) DO NOTHING;
 SELECT * INTO STRICT r FROM public.operation_requests WHERE user_id=p_user AND idempotency_key=p_key FOR UPDATE;
 IF r.operation_type<>p_type OR r.request_payload<>p_payload THEN RAISE EXCEPTION 'Idempotency key payload conflict' USING ERRCODE='23505'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION shiftly_private.finish_operation(p_id uuid,p_response jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 UPDATE public.operation_requests SET response_payload=p_response,completed_at=now() WHERE id=p_id AND completed_at IS NULL;
 RETURN p_response;
END $$;
CREATE FUNCTION shiftly_private.audit(p_user uuid,p_op uuid,p_shift uuid,p_type text,p_before jsonb,p_after jsonb,p_context jsonb DEFAULT '{}') RETURNS void
LANGUAGE sql SET search_path = pg_catalog, public AS $$
 INSERT INTO public.shift_financial_events(user_id,operation_id,shift_id,subject_shift_id,event_type,before_snapshot,after_snapshot,context)
 VALUES(p_user,p_op,p_shift,p_shift,p_type,p_before,p_after,p_context);
$$;

-- Immutable configuration validation runs on sealing even for trusted SQL callers.
CREATE FUNCTION shiftly_private.validate_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE has_overlap boolean;
BEGIN
 IF NOT NEW.sealed THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='commission_rule_versions' THEN
  IF NEW.mode='thresholds' THEN
   IF (SELECT min(from_amount) FROM public.commission_thresholds WHERE rule_version_id=NEW.id) IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Threshold rules must start at zero'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.commission_thresholds WHERE rule_version_id=NEW.id) THEN RAISE EXCEPTION 'Thresholds forbidden for none/fixed rules'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.rate_intervals WHERE rate_version_id=NEW.id) THEN RAISE EXCEPTION 'Rate version requires intervals'; END IF;
  -- Weekly wall-clock occupancy, including overnight carry into next weekday.
  WITH windows AS (
   SELECT r.id, d*86400+extract(epoch FROM r.start_time)::integer a,
    d*86400+extract(epoch FROM r.end_time)::integer+CASE WHEN r.end_time<=r.start_time THEN 86400 ELSE 0 END b
   FROM public.rate_intervals r CROSS JOIN generate_series(0,6) d
   WHERE r.rate_version_id=NEW.id AND r.kind='hourly' AND (cardinality(r.weekdays)=0 OR d=ANY(r.weekdays))
  ) SELECT EXISTS(SELECT 1 FROM windows a JOIN windows b ON a.id<>b.id
   CROSS JOIN (VALUES(-604800),(0),(604800)) offsets(n)
   WHERE a.a<b.b+n AND a.b>b.a+n) INTO has_overlap;
  IF has_overlap AND NEW.overlap_acknowledged_at IS NULL THEN RAISE EXCEPTION 'Overlapping rates require explicit acknowledgement'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rates_validate_seal BEFORE INSERT OR UPDATE ON public.rate_versions FOR EACH ROW EXECUTE FUNCTION shiftly_private.validate_publication();
CREATE TRIGGER rules_validate_seal BEFORE INSERT OR UPDATE ON public.commission_rule_versions FOR EACH ROW EXECUTE FUNCTION shiftly_private.validate_publication();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiftly_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiftly_private TO service_role;
COMMIT;
