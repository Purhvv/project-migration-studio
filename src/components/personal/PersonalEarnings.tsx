import { Money, Panel } from "@/components/shared/primitives";
import { accountShiftSummary } from "@/lib/account-statistics";
import type { AccountShift } from "@/lib/account-shifts";
import { formatHours, formatNumber } from "@/lib/format";

export function PersonalEarnings({ shifts, title, showTips = false }: { shifts: AccountShift[]; title: string; showTips?: boolean }) {
  const summary = accountShiftSummary(shifts);
  return <Panel className="p-5">
    <p className="text-sm text-muted-foreground">{title}</p>
    <p className="mt-2 break-words font-display text-3xl font-semibold"><Money value={summary.earnings.value} partial={summary.earnings.partial} tone={summary.earnings.value !== null && summary.earnings.value < 0 ? "negative" : "default"} /></p>
    {summary.earnings.partial && <p className="mt-2 text-xs text-muted-foreground">Часть начислений не подтверждена</p>}
    {!summary.count && <p className="mt-2 text-xs text-muted-foreground">Нет завершённых смен за период</p>}
    <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
      <div><dt className="text-muted-foreground">Смены</dt><dd className="mt-1 font-semibold tabular">{formatNumber(summary.count)}</dd></div>
      <div><dt className="text-muted-foreground">Часы</dt><dd className="mt-1 font-semibold tabular">{summary.count ? formatHours(summary.minutes) : "—"}</dd></div>
      {showTips && <div className="col-span-2"><dt className="text-muted-foreground">Личные чаевые</dt><dd className="mt-1 font-semibold"><Money value={summary.tips.value} partial={summary.tips.partial} /></dd></div>}
    </dl>
  </Panel>;
}