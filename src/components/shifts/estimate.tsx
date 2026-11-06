import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Money } from "@/components/shared/primitives";
import { formatHours } from "@/lib/format";
import { estimatePay } from "@/lib/rates";
import type { Workplace } from "@/lib/types";

/** "Предварительная оплата по ставке" — computed only from the workplace's configured rates. */
export function RateEstimate({ workplace, date, start, end }: { workplace: Workplace | undefined; date: string; start: string; end: string }) {
  if (!workplace) return <p className="text-sm text-muted-foreground">Выберите место работы для расчёта оплаты.</p>;
  if (!date || !start || !end) return null;
  const est = estimatePay(workplace.rates, date, start, end);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 text-muted-foreground">Предварительная оплата по ставке</span>
        <Money value={est.amount} className="shrink-0 font-semibold" />
      </div>
      {est.kind === "no_rates" && (
        <p className="flex gap-2 rounded-xl bg-secondary p-2.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            Для «{workplace.name}» не настроены ставки.{" "}
            <Link to="/profile" className="font-medium text-primary">Настроить в профиле</Link>
          </span>
        </p>
      )}
      {est.kind === "partial" && (
        <p className="flex gap-2 rounded-xl bg-secondary p-2.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>{formatHours(est.uncoveredMinutes)} смены не покрыты ставками и не учтены в сумме.</span>
        </p>
      )}
    </div>
  );
}
