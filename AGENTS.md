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
- The proposed Auth integration uses browser SDK sessions, server-validated bearer functions and an isolated authenticated route subtree while preserving the public demo; keep demo/account query caches separate to prevent identity leakage (documentation only until separately authorized).
- Local concurrency tests require independent confirmation and pinned disposable Unix-socket preflight before writes, never replace Auth, and drop the entire test database on normal/signal exits; the external owner must destroy the disposable cluster because SIGKILL cannot run cleanup.
