BEGIN;
CREATE OR REPLACE FUNCTION public.shiftly_confirmed_earnings(p_shift uuid DEFAULT NULL)
RETURNS TABLE(shift_id uuid,confirmed_amount numeric,partial boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT s.id,CASE WHEN s.earnings IS NOT NULL THEN s.earnings ELSE
  (SELECT sum(c.amount) FROM (
   SELECT v.amount FROM (VALUES(s.base_pay),(s.fixed_pay),(s.commission_pay),(s.tips)) v(amount)
   UNION ALL SELECT CASE WHEN a.kind='penalty' THEN -a.amount ELSE a.amount END
    FROM public.shift_adjustments a WHERE a.user_id=auth.uid() AND a.shift_id=s.id
  ) c)
 END, s.earnings IS NULL OR (s.commission_source='monthly' AND m.state='preliminary')
 FROM public.shifts s LEFT JOIN public.monthly_commission_results m ON m.user_id=s.user_id AND m.workplace_id=s.workplace_id AND m.month=date_trunc('month',s.local_start_date)::date
 WHERE s.user_id=auth.uid() AND s.deleted_at IS NULL AND (p_shift IS NULL OR s.id=p_shift);
$$;
REVOKE ALL ON FUNCTION public.shiftly_confirmed_earnings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.shiftly_confirmed_earnings(uuid) TO authenticated,service_role;
COMMIT;