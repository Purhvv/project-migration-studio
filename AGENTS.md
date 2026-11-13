<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Screens read data only via `src/data/queries.ts` query options; mock data lives in `src/data/mock.ts` so Supabase can replace queryFns without touching screens.
- Financial values are nullable (`null` = unknown) and must render as "—", never 0; actual earnings only sum confirmed values. Forecasts use only hourly-rate estimates in `src/lib/rates.ts`, never commission/tips/bonuses; editing confirmed components may reconcile their explicit deltas but never infer payroll from rates or revenue.
- Calendar colour encodes the workplace only (`--wp-<key>` tokens); shift status is shown by neutral icons from `STATUS_META` — one visual channel per meaning.
- Until Supabase, writes go to the in-memory `db` in `src/data/mock.ts` via mutation hooks in `src/data/queries.ts`.
- Interactive shift writes use the shared save guard, including completion; conflicts require explicit override so create and edit follow the same rules.
- Shift creation and editing share ShiftForm; restoration uses the same conflict guard and applies edits only to an existing, unexpired trash record to prevent duplicate restores.
- Soft deletion keeps original shift data with deletedAt; the queries layer separates active rows and trash, and all shift mutations invalidate both caches so totals never include deleted records.
- Actual financial edits reconcile changed confirmed components against the stored payroll remainder; historical hourly rates and revenue-derived commission must not be fabricated because this demo has no such rules.
- `computeEarnings` in `src/lib/shift-management.ts` is the single earnings formula (basePay + commissionPay + tips + bonuses − penalties); any null component makes the total null, and completion, the shift form and mock data all use it instead of ad-hoc sums.
- Numeric inputs keep canonical ungrouped decimal strings and use the shared NumberInput for presentation; parsers return nullable finite numbers to keep formatting out of calculations.
- Statistics uses the existing rate-only forecast for the current month and workplace; chart axes must be direct Recharts children so SSR/source instrumentation does not hide them.
- Revenue goals live on Workplace, not UserProfile; revenue.ts calculates only explicitly identified workplaces and separate chart series, so screens cannot accidentally expose cross-workplace revenue totals. New goals remain unset rather than redistributing the legacy global target.
- Offline database SQL belongs in `supabase/migrations`, reverse scripts in `supabase/rollback`, and no-fixture contracts in `supabase/tests`; do not connect it to the demo until separately approved, because Stage 2 is schema preparation only.
- Database financial writes use owner-derived RPCs and private NUMERIC helpers, with read-only owner RLS and transaction locks; unresolved historical confirmation/timezone policies fail closed rather than silently rewriting history.
- Auth uses SDK browser sessions, a single root lifecycle subscriber and an SSR-disabled authenticated account subtree; preserve public demo routes and never share account query keys with demo data to prevent identity leakage.
- Private account reads use account query options and server functions with generated bearer middleware plus Auth getUser validation; derive profile identity on the server and preserve Start CSRF/error middleware.
- Local concurrency tests require independent confirmation and pinned disposable Unix-socket preflight before writes, never replace Auth, and drop the entire test database on normal/signal exits; the external owner must destroy the disposable cluster because SIGKILL cannot run cleanup.
- Hosted privilege hardening derives actual Shiftly table owners from PostgreSQL catalogs and verifies effective grants atomically; security rollback refuses execution because restoring unsafe grants requires separately approved recovery.
- Personal space lives under `/app/*` plus `/account` inside the `_authenticated` gate and never uses demo queries; `/account` reads owner data via `getAccountSettings` and writes only through the allow-listed `accountWrite` → `shiftly_write` RPC, so the client never sends user ids or touches financial tables directly. Signed-in users are redirected from `/` unless they opt into the demo for the tab.
- Personal rate publications use the shared account-rates validator on both form and server boundary and retain decimal-string money; sealed versions are read separately as active/scheduled in workplace local time, so scheduled rates never masquerade as active and historical payroll remains protected by the existing RPC.
- Workplace revenue-goal writes retain decimal strings (or explicit null) from the editor through the shared server validator to the existing RPC; this matches PostgreSQL money_value without floating-point conversion or weaker database checks.
- Commission publication retains decimal-string amounts and percentages from the editor, with shared form/server validation matching the existing NUMERIC helper and publication trigger; accountWrite forwards validated payloads without global coercion so revisions and nulls remain intact.
- Personal shifts read via `getAccountShifts` (active rows only) and write only through `accountWrite` shift operations with the complete local+UTC time set derived from the workplace timezone; conflicts are pre-checked on UTC instants and never auto-saved, and revenue/tips/adjustments stay NULL until their stage.
- Fully past personal shifts are created via `shift_create_completed` (migration 12) in one shiftly_write call with decimal-string finances; the RPC rejects it unless ends_at <= now(), so planned/in_progress flows and the no-raw-status rule stay intact.
- Personal home and statistics share account-statistics selectors over account query data: confirmed stored earnings use profile-timezone periods, revenue uses each workplace's local start month, and completed history is separate from upcoming shifts so past saves stay visible without demo data or payroll recalculation.
