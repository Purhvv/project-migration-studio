import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Money, Panel } from "@/components/shared/primitives";
import { WorkplaceDot } from "@/components/shifts/shift-ui";
import { goalProgress } from "@/lib/analytics";
import type { AccountShift } from "@/lib/account-shifts";
import type { AccountWorkplace } from "@/lib/account-settings";
import { formatMoney } from "@/lib/format";
import { sumKnown } from "@/lib/summary";

export function PersonalRevenue({ shifts, workplaces, selected = "all", averages = false }: { shifts: AccountShift[]; workplaces: AccountWorkplace[]; selected?: string; averages?: boolean }) {
  const ids = [...new Set([...workplaces.map((w) => w.id), ...shifts.map((s) => s.workplace_id)])].filter((id) => selected === "all" || id === selected);
  return <Panel className="divide-y px-4">{ids.map((id) => {
    const w = workplaces.find((w) => w.id === id);
    const own = shifts.filter((s) => s.status === "completed" && s.workplace_id === id);
    const known = own.filter((s) => s.revenue !== null);
    const revenue = sumKnown(own.map((s) => s.revenue));
    const minutes = known.reduce((sum, s) => sum + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000, 0);
    const target = w?.revenue_goal ?? null;
    const progress = goalProgress(revenue.value, target);
    return <div key={id} className="py-3" aria-label={`Личная выручка: ${w?.name ?? "Архивное место работы"}`}>
      <div className="flex items-center gap-2">{w && <WorkplaceDot color={w.color} />}<p className="min-w-0 flex-1 break-words text-sm font-medium">{w?.name ?? "Архивное место работы"}</p>{w && <Button asChild variant="ghost" size="icon" className="size-8 shrink-0 text-primary"><Link to="/account" aria-label={`Изменить цель: ${w.name}`}><Pencil className="size-4" /></Link></Button>}</div>
      <p className="mt-1 text-base font-semibold"><Money value={revenue.value} partial={revenue.partial} /></p>
      {revenue.partial && <p className="mt-1 text-xs text-muted-foreground">Неполный расчёт: часть выручки неизвестна</p>}
      {!averages && (target !== null ? <><p className="mt-1 text-xs text-muted-foreground">Цель: {formatMoney(target)}{progress ? ` · ${progress.percent}%` : ""}</p><Progress className="mt-2 h-1.5" value={progress ? Math.min(100, progress.percent) : 0} /><p className="mt-2 text-xs text-muted-foreground">{!progress ? "Выручка пока неизвестна" : progress.remaining ? `Осталось ${formatMoney(progress.remaining)}` : "Цель выполнена"}</p></> : <p className="mt-1 text-xs text-muted-foreground">Цель не задана</p>)}
      {averages && <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Выручка за смену</dt><dd className="mt-1"><Money value={revenue.value !== null && known.length ? Math.round(revenue.value / known.length) : null} partial={revenue.partial} /></dd></div><div><dt className="text-muted-foreground">Выручка за час</dt><dd className="mt-1"><Money value={revenue.value !== null && minutes ? Math.round(revenue.value / (minutes / 60)) : null} partial={revenue.partial} /></dd></div></dl>}
    </div>;
  })}{!ids.length && <p className="py-4 text-sm text-muted-foreground">Нет рабочих мест</p>}</Panel>;
}