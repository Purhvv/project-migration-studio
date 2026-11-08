-- DESTRUCTIVE: only an empty isolated database; production requires backup restoration.
BEGIN;
DROP TABLE public.shift_financial_events;
DROP TABLE public.monthly_commission_results;
DROP TABLE public.shift_fixed_payments;
DROP TABLE public.shift_adjustments;
DROP TABLE public.shifts;
DROP TABLE public.commission_thresholds;
DROP TABLE public.commission_rule_versions;
DROP TABLE public.rate_intervals;
DROP TABLE public.rate_versions;
DROP TABLE public.operation_requests;
DROP TABLE public.workplaces;
DROP TABLE public.profiles;
DROP SCHEMA IF EXISTS shiftly_private;
COMMIT;
