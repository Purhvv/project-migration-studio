-- Shiftly v3 + approved v3.1 audit delta. OFFLINE ONLY; no seed rows.
BEGIN;
CREATE SCHEMA IF NOT EXISTS shiftly_private;
REVOKE ALL ON SCHEMA shiftly_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA shiftly_private TO service_role;

CREATE TABLE public.profiles (
id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
name text NOT NULL CHECK (length(btrim(name)) > 0),
currency text NOT NULL DEFAULT 'RUB' CHECK (currency ~ '^[A-Z]{3}$'),
timezone text NOT NULL DEFAULT 'Europe/Moscow',
monthly_goal numeric(14,2) CHECK (monthly_goal > 0),
hours_goal numeric(8,2) CHECK (hours_goal > 0), shifts_goal integer CHECK (shifts_goal > 0),
revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_monthly_goal_finite CHECK (monthly_goal IS NULL OR monthly_goal <> 'NaN'::numeric);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_hours_goal_finite CHECK (hours_goal IS NULL OR hours_goal <> 'NaN'::numeric);

CREATE TABLE public.workplaces (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
name text NOT NULL CHECK (length(btrim(name)) > 0),
color text NOT NULL CHECK (color IN ('sky','green','amber','rose','violet','orange')),
timezone text NOT NULL DEFAULT 'Europe/Moscow', revenue_goal numeric(14,2) CHECK (revenue_goal > 0),
archived_at timestamptz, revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(user_id,id)
);
GRANT SELECT ON public.workplaces TO authenticated;
GRANT ALL ON public.workplaces TO service_role;
REVOKE ALL ON public.workplaces FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.workplaces FROM authenticated;
ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.workplaces FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.workplaces ADD CONSTRAINT workplaces_revenue_goal_finite CHECK (revenue_goal IS NULL OR revenue_goal <> 'NaN'::numeric);

CREATE TABLE public.operation_requests (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
idempotency_key uuid NOT NULL,
operation_type text NOT NULL CHECK (operation_type IN ('shift_create','shift_edit','shift_complete','shift_delete','shift_restore','shift_purge','trash_clear','month_recalc','auto_zero_revenue','revenue_correct','publish_rates','publish_commission','confirm_history','workplace_edit','workplace_archive','profile_edit')),
request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload)='object'), response_payload jsonb,
created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
UNIQUE(user_id,id), UNIQUE(user_id,idempotency_key),
CHECK ((completed_at IS NULL) = (response_payload IS NULL))
);
GRANT SELECT ON public.operation_requests TO authenticated;
GRANT ALL ON public.operation_requests TO service_role;
REVOKE ALL ON public.operation_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.operation_requests FROM authenticated;
ALTER TABLE public.operation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.operation_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.rate_versions (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL,
effective_from date NOT NULL, revision integer NOT NULL CHECK (revision > 0), note text,
sealed boolean NOT NULL DEFAULT false, created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
overlap_acknowledged_at timestamptz, publication_operation_id uuid NOT NULL,
created_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(user_id,id), UNIQUE(user_id,workplace_id,id),
UNIQUE(workplace_id,effective_from), UNIQUE(workplace_id,effective_from,revision),
FOREIGN KEY(user_id,workplace_id) REFERENCES public.workplaces(user_id,id) ON DELETE CASCADE,
FOREIGN KEY(user_id,publication_operation_id) REFERENCES public.operation_requests(user_id,id)
);
GRANT SELECT ON public.rate_versions TO authenticated;
GRANT ALL ON public.rate_versions TO service_role;
REVOKE ALL ON public.rate_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_versions FROM authenticated;
ALTER TABLE public.rate_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.rate_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.rate_intervals (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL, rate_version_id uuid NOT NULL,
kind text NOT NULL CHECK (kind IN ('hourly','fixed')), start_time time(0), end_time time(0),
hourly numeric(10,2) CHECK (hourly > 0), fixed_amount numeric(14,2) CHECK (fixed_amount >= 0),
label text NOT NULL CHECK (length(btrim(label)) > 0), weekdays smallint[] NOT NULL DEFAULT '{}',
sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
UNIQUE(user_id,workplace_id,id), UNIQUE(user_id,workplace_id,id,kind),
FOREIGN KEY(user_id,workplace_id,rate_version_id) REFERENCES public.rate_versions(user_id,workplace_id,id) ON DELETE CASCADE,
CHECK (weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND array_position(weekdays,NULL) IS NULL),
CHECK ((kind='hourly' AND start_time IS NOT NULL AND end_time IS NOT NULL AND hourly IS NOT NULL AND fixed_amount IS NULL)
OR (kind='fixed' AND start_time IS NULL AND end_time IS NULL AND hourly IS NULL AND fixed_amount IS NOT NULL))
);
GRANT SELECT ON public.rate_intervals TO authenticated;
GRANT ALL ON public.rate_intervals TO service_role;
REVOKE ALL ON public.rate_intervals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_intervals FROM authenticated;
ALTER TABLE public.rate_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.rate_intervals FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.rate_intervals ADD CONSTRAINT rate_intervals_hourly_finite CHECK (hourly IS NULL OR hourly <> 'NaN'::numeric);
ALTER TABLE public.rate_intervals ADD CONSTRAINT rate_intervals_fixed_amount_finite CHECK (fixed_amount IS NULL OR fixed_amount <> 'NaN'::numeric);

CREATE TABLE public.commission_rule_versions (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL,
effective_from date NOT NULL CHECK (extract(day FROM effective_from)=1), revision integer NOT NULL CHECK (revision > 0),
mode text NOT NULL CHECK (mode IN ('none','fixed','thresholds')),
fixed_percent numeric(5,2) CHECK (fixed_percent BETWEEN 0 AND 100),
sealed boolean NOT NULL DEFAULT false, created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
publication_operation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(user_id,id), UNIQUE(user_id,workplace_id,id),
UNIQUE(workplace_id,effective_from), UNIQUE(workplace_id,effective_from,revision),
FOREIGN KEY(user_id,workplace_id) REFERENCES public.workplaces(user_id,id) ON DELETE CASCADE,
FOREIGN KEY(user_id,publication_operation_id) REFERENCES public.operation_requests(user_id,id),
CHECK ((mode='fixed' AND fixed_percent IS NOT NULL) OR (mode IN ('none','thresholds') AND fixed_percent IS NULL))
);
GRANT SELECT ON public.commission_rule_versions TO authenticated;
GRANT ALL ON public.commission_rule_versions TO service_role;
REVOKE ALL ON public.commission_rule_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.commission_rule_versions FROM authenticated;
ALTER TABLE public.commission_rule_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.commission_rule_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.commission_rule_versions ADD CONSTRAINT commission_rule_versions_fixed_percent_finite CHECK (fixed_percent IS NULL OR fixed_percent <> 'NaN'::numeric);

CREATE TABLE public.commission_thresholds (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL, rule_version_id uuid NOT NULL,
from_amount numeric(14,2) NOT NULL CHECK (from_amount >= 0), percent numeric(5,2) NOT NULL CHECK (percent BETWEEN 0 AND 100),
FOREIGN KEY(user_id,workplace_id,rule_version_id) REFERENCES public.commission_rule_versions(user_id,workplace_id,id) ON DELETE CASCADE,
UNIQUE(rule_version_id,from_amount)
);
GRANT SELECT ON public.commission_thresholds TO authenticated;
GRANT ALL ON public.commission_thresholds TO service_role;
REVOKE ALL ON public.commission_thresholds FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.commission_thresholds FROM authenticated;
ALTER TABLE public.commission_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.commission_thresholds FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.commission_thresholds ADD CONSTRAINT commission_thresholds_from_amount_finite CHECK (from_amount IS NULL OR from_amount <> 'NaN'::numeric);
ALTER TABLE public.commission_thresholds ADD CONSTRAINT commission_thresholds_percent_finite CHECK (percent IS NULL OR percent <> 'NaN'::numeric);

CREATE TABLE public.shifts (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL,
local_start_date date NOT NULL, local_end_date date NOT NULL, start_time time(0) NOT NULL, end_time time(0) NOT NULL,
workplace_timezone text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','pending','completed','cancelled')),
revenue numeric(14,2) CHECK (revenue >= 0), revenue_revision bigint NOT NULL DEFAULT 1 CHECK (revenue_revision > 0),
revenue_auto_zeroed boolean NOT NULL DEFAULT false,
base_pay numeric(14,2) CHECK (base_pay >= 0), fixed_pay numeric(14,2) DEFAULT 0 CHECK (fixed_pay >= 0),
commission_pay numeric(14,2) CHECK (commission_pay >= 0),
commission_source text NOT NULL DEFAULT 'unconfigured' CHECK (commission_source IN ('unconfigured','manual','monthly','none')),
rate_version_id uuid, tips numeric(14,2) CHECK (tips >= 0), earnings numeric(14,2), comment text,
revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0), deleted_at timestamptz,
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(user_id,id), UNIQUE(user_id,workplace_id,id),
FOREIGN KEY(user_id,workplace_id) REFERENCES public.workplaces(user_id,id) ON DELETE CASCADE,
FOREIGN KEY(user_id,workplace_id,rate_version_id) REFERENCES public.rate_versions(user_id,workplace_id,id),
CHECK (ends_at > starts_at), CHECK (local_end_date >= local_start_date),
CHECK (NOT revenue_auto_zeroed OR revenue=0),
CHECK (revenue IS NULL OR revenue <> 'NaN'::numeric),
CHECK (base_pay IS NULL OR base_pay <> 'NaN'::numeric),
CHECK (fixed_pay IS NULL OR fixed_pay <> 'NaN'::numeric),
CHECK (commission_pay IS NULL OR commission_pay <> 'NaN'::numeric),
CHECK (tips IS NULL OR tips <> 'NaN'::numeric),
CHECK (earnings IS NULL OR earnings <> 'NaN'::numeric)
);
GRANT SELECT ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
REVOKE ALL ON public.shifts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.shifts FROM authenticated;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shifts FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_revenue_finite CHECK (revenue IS NULL OR revenue <> 'NaN'::numeric);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_base_pay_finite CHECK (base_pay IS NULL OR base_pay <> 'NaN'::numeric);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_fixed_pay_finite CHECK (fixed_pay IS NULL OR fixed_pay <> 'NaN'::numeric);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_commission_pay_finite CHECK (commission_pay IS NULL OR commission_pay <> 'NaN'::numeric);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_tips_finite CHECK (tips IS NULL OR tips <> 'NaN'::numeric);
ALTER TABLE public.shifts ADD CONSTRAINT shifts_earnings_finite CHECK (earnings IS NULL OR earnings <> 'NaN'::numeric);

CREATE TABLE public.shift_adjustments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, shift_id uuid NOT NULL,
kind text NOT NULL CHECK (kind IN ('bonus','penalty')), label text NOT NULL CHECK (length(btrim(label)) > 0),
amount numeric(14,2) CHECK (amount >= 0 AND amount <> 'NaN'::numeric), comment text,
sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0), created_at timestamptz NOT NULL DEFAULT now(),
FOREIGN KEY(user_id,shift_id) REFERENCES public.shifts(user_id,id) ON DELETE CASCADE
);
GRANT SELECT ON public.shift_adjustments TO authenticated;
GRANT ALL ON public.shift_adjustments TO service_role;
REVOKE ALL ON public.shift_adjustments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.shift_adjustments FROM authenticated;
ALTER TABLE public.shift_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shift_adjustments FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.shift_adjustments ADD CONSTRAINT shift_adjustments_amount_finite CHECK (amount IS NULL OR amount <> 'NaN'::numeric);

CREATE TABLE public.shift_fixed_payments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL, shift_id uuid NOT NULL,
rate_interval_id uuid NOT NULL, source_kind text NOT NULL DEFAULT 'fixed' CHECK (source_kind='fixed'),
amount_snapshot numeric(14,2) CHECK (amount_snapshot >= 0 AND amount_snapshot <> 'NaN'::numeric),
label_snapshot text NOT NULL CHECK (length(btrim(label_snapshot)) > 0), selected_at timestamptz NOT NULL DEFAULT now(), selection_operation_id uuid NOT NULL,
UNIQUE(shift_id,rate_interval_id),
FOREIGN KEY(user_id,workplace_id,shift_id) REFERENCES public.shifts(user_id,workplace_id,id) ON DELETE CASCADE,
FOREIGN KEY(user_id,workplace_id,rate_interval_id,source_kind) REFERENCES public.rate_intervals(user_id,workplace_id,id,kind),
FOREIGN KEY(user_id,selection_operation_id) REFERENCES public.operation_requests(user_id,id)
);
GRANT SELECT ON public.shift_fixed_payments TO authenticated;
GRANT ALL ON public.shift_fixed_payments TO service_role;
REVOKE ALL ON public.shift_fixed_payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.shift_fixed_payments FROM authenticated;
ALTER TABLE public.shift_fixed_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shift_fixed_payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.shift_fixed_payments ADD CONSTRAINT shift_fixed_payments_amount_snapshot_finite CHECK (amount_snapshot IS NULL OR amount_snapshot <> 'NaN'::numeric);

CREATE TABLE public.monthly_commission_results (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, workplace_id uuid NOT NULL,
month date NOT NULL CHECK (extract(day FROM month)=1), rule_version_id uuid,
revenue_total numeric(18,2) NOT NULL CHECK (revenue_total >= 0), completed_count integer NOT NULL CHECK (completed_count >= 0),
missing_revenue_count integer NOT NULL CHECK (missing_revenue_count >= 0), auto_zeroed_count integer NOT NULL CHECK (auto_zeroed_count >= 0),
applied_percent numeric(5,2) CHECK (applied_percent BETWEEN 0 AND 100), reached_threshold_from numeric(14,2) CHECK (reached_threshold_from >= 0),
commission_amount numeric(18,2) CHECK (commission_amount >= 0), state text NOT NULL CHECK (state IN ('preliminary','final')),
calculation_available boolean NOT NULL, closed_at timestamptz, revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
input_digest text NOT NULL, last_operation_id uuid NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(workplace_id,month),
FOREIGN KEY(user_id,workplace_id) REFERENCES public.workplaces(user_id,id) ON DELETE CASCADE,
FOREIGN KEY(user_id,workplace_id,rule_version_id) REFERENCES public.commission_rule_versions(user_id,workplace_id,id),
FOREIGN KEY(user_id,last_operation_id) REFERENCES public.operation_requests(user_id,id),
CHECK (missing_revenue_count <= completed_count AND auto_zeroed_count <= completed_count),
CHECK ((state='final') = (missing_revenue_count=0)),
CHECK (calculation_available = (applied_percent IS NOT NULL AND commission_amount IS NOT NULL))
);
GRANT SELECT ON public.monthly_commission_results TO authenticated;
GRANT ALL ON public.monthly_commission_results TO service_role;
REVOKE ALL ON public.monthly_commission_results FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.monthly_commission_results FROM authenticated;
ALTER TABLE public.monthly_commission_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.monthly_commission_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.monthly_commission_results ADD CONSTRAINT monthly_commission_results_revenue_total_finite CHECK (revenue_total IS NULL OR revenue_total <> 'NaN'::numeric);
ALTER TABLE public.monthly_commission_results ADD CONSTRAINT monthly_commission_results_applied_percent_finite CHECK (applied_percent IS NULL OR applied_percent <> 'NaN'::numeric);
ALTER TABLE public.monthly_commission_results ADD CONSTRAINT monthly_commission_results_reached_threshold_from_finite CHECK (reached_threshold_from IS NULL OR reached_threshold_from <> 'NaN'::numeric);
ALTER TABLE public.monthly_commission_results ADD CONSTRAINT monthly_commission_results_commission_amount_finite CHECK (commission_amount IS NULL OR commission_amount <> 'NaN'::numeric);

CREATE TABLE public.shift_financial_events (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, operation_id uuid NOT NULL,
shift_id uuid, subject_shift_id uuid,
event_type text NOT NULL CHECK (event_type IN ('create','edit','complete','delete','restore','purge','commission_recalc','rate_recalc_confirm','rule_recalc_confirm','auto_zero_revenue','revenue_correction','version_publish','archive','profile_edit','goal_update','month_close')),
before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL, context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
FOREIGN KEY(user_id,operation_id) REFERENCES public.operation_requests(user_id,id),
FOREIGN KEY(user_id,shift_id) REFERENCES public.shifts(user_id,id) DEFERRABLE INITIALLY DEFERRED,
CHECK (jsonb_typeof(before_snapshot)='object' AND jsonb_typeof(after_snapshot)='object' AND jsonb_typeof(context)='object')
);
GRANT SELECT ON public.shift_financial_events TO authenticated;
GRANT ALL ON public.shift_financial_events TO service_role;
REVOKE ALL ON public.shift_financial_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.shift_financial_events FROM authenticated;
ALTER TABLE public.shift_financial_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shift_financial_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX shifts_active_period_idx ON public.shifts(user_id,workplace_id,local_start_date) WHERE deleted_at IS NULL;
CREATE INDEX shifts_period_idx ON public.shifts(user_id,workplace_id,local_start_date);
CREATE INDEX shifts_trash_idx ON public.shifts(user_id,deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX shifts_auto_zero_idx ON public.shifts(workplace_id,local_start_date) WHERE status='completed' AND revenue IS NULL AND deleted_at IS NULL;
CREATE INDEX shifts_conflicts_idx ON public.shifts(user_id,starts_at,ends_at) WHERE deleted_at IS NULL AND status<>'cancelled';
CREATE INDEX events_owner_time_idx ON public.shift_financial_events(user_id,created_at DESC);
CREATE INDEX events_subject_idx ON public.shift_financial_events(user_id,subject_shift_id);
CREATE INDEX operations_type_time_idx ON public.operation_requests(user_id,operation_type,created_at);
CREATE INDEX rates_parent_idx ON public.rate_intervals(user_id,workplace_id,rate_version_id);
CREATE INDEX thresholds_parent_idx ON public.commission_thresholds(user_id,workplace_id,rule_version_id);
CREATE INDEX adjustments_shift_idx ON public.shift_adjustments(user_id,shift_id);
CREATE INDEX fixed_shift_idx ON public.shift_fixed_payments(user_id,shift_id);
CREATE INDEX rates_operation_idx ON public.rate_versions(user_id,publication_operation_id);
CREATE INDEX rules_operation_idx ON public.commission_rule_versions(user_id,publication_operation_id);
COMMIT;
