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
- Financial values are nullable (`null` = unknown) and must render as "—", never 0; actual earnings only sum confirmed values; the only client-side calculation is the hourly-rate estimate for not-yet-completed shifts in `src/lib/rates.ts` (no commission/tips/bonus forecasting) — keeps actual vs. preliminary from double counting.
- Calendar colour encodes the workplace only (`--wp-<key>` tokens); shift status is shown by neutral icons from `STATUS_META` — one visual channel per meaning.
- Until Supabase, writes go to the in-memory `db` in `src/data/mock.ts` via mutation hooks in `src/data/queries.ts`.
- Interactive shift writes use the shared save guard, including completion; conflicts require explicit override so create and edit follow the same rules.
- Numeric inputs keep canonical ungrouped decimal strings and use the shared NumberInput for presentation; parsers return nullable finite numbers to keep formatting out of calculations.
