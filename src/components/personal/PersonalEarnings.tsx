import type { ReactNode } from "react";
import { Money } from "@/components/shared/primitives";
import type { Forecast } from "@/lib/rates";
import { accountShiftSummary } from "@/lib/account-statistics";
import type { AccountShift } from "@/lib/account-shifts";
import { formatHours, formatNumber } from "@/lib/format";

export function PersonalEarnings({ shifts, title, showTips = true, action, forecast, home = false }: { shifts: AccountShift[]; title: string; showTips?: boolean; action?: ReactNode; forecast?: Forecast; home?: boolean }) {
  const summary = accountShiftSummary(shifts);
  return <div className="bg-hero rounded-3xl border p-5 shadow-card">
    <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{title}</p>{action}</div>
    <p className={`mt-3 break-words font-display font-semibold ${home ? "text-4xl" : "text-3xl"}`}><Money value={summary.earnings.value} partial={summary.earnings.partial} tone={summary.earnings.value !== null && summary.earnings.value < 0 ? "negative" : "default"} /></p>
    {summary.earnings.partial && <p className="mt-2 text-xs text-muted-foreground">Часть начислений не подтверждена</p>}
    {!summary.count && <p className="mt-2 text-xs text-muted-foreground">Нет завершённых смен за период</p>}
    {!!forecast?.upcoming && <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 rounded-xl bg-background/40 px-3 py-2 text-sm"><div className="min-w-0"><p className="text-muted-foreground">Предварительный заработок</p><p className="text-xs text-muted-foreground">По ставкам за {forecast.upcoming - forecast.missing} из {forecast.upcoming} предстоящих{forecast.missing > 0 && " · без ставок не учтены"}{forecast.uncovered > 0 && " · часть часов без ставки"}</p></div><Money value={forecast.total} partial={forecast.missing > 0 || forecast.uncovered > 0 || forecast.actual.partial} className="font-semibold" /></div>}
    <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4 text-sm">
      <div><dt className="text-xs text-muted-foreground">Часы</dt><dd className="mt-0.5 font-semibold tabular">{summary.count ? formatHours(summary.minutes) : "—"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Смены</dt><dd className="mt-0.5 font-semibold tabular">{formatNumber(summary.count)}</dd></div>
      {showTips && <div><dt className="text-xs text-muted-foreground">Личные чаевые</dt><dd className="mt-0.5 font-semibold"><Money value={summary.tips.value} partial={summary.tips.partial} /></dd></div>}
    </dl>
  </div>;
}