import { useState } from "react";
import { Pencil } from "lucide-react";
import { useWorkplaces } from "@/data/queries";
import { revenueByWorkplace } from "@/lib/revenue";
import type { Shift } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { WorkplaceDot } from "@/components/shifts/shift-ui";
import { GoalDrawer } from "./GoalDrawer";
import { Money, Panel } from "./primitives";

export function WorkplaceRevenue({ shifts, selected = "all", averages = false }: { shifts: Shift[]; selected?: string; averages?: boolean }) {
  const { data: workplaces } = useWorkplaces();
  const [editing, setEditing] = useState<string | null>(null);
  const rows = revenueByWorkplace(shifts, workplaces ?? [], selected);
  const current = rows.find((r) => r.workplace.id === editing);
  return <><Panel className="divide-y px-4">{rows.map(({ workplace, revenue, target, progress }) => <div key={workplace.id} className="py-3" aria-label={`Личная выручка: ${workplace.name}`}>
    <div className="flex items-center gap-2"><WorkplaceDot color={workplace.color} /><p className="min-w-0 flex-1 break-words text-sm font-medium">{workplace.name}</p><Button variant="ghost" size="icon" className="size-8 shrink-0 text-primary" aria-label={`Изменить цель: ${workplace.name}`} onClick={() => setEditing(workplace.id)}><Pencil className="size-4" /></Button></div>
    <p className="mt-1 text-base font-semibold"><Money value={revenue.value} partial={revenue.partial} /></p>
    {revenue.partial && <p className="mt-1 text-xs text-muted-foreground">Неполный расчёт: часть выручки неизвестна</p>}
    {target !== null ? <><p className="mt-1 text-xs text-muted-foreground">Цель: {formatMoney(target)}{progress ? ` · ${progress.percent}%` : ""}</p><Progress className="mt-2 h-1.5" value={progress ? Math.min(100, progress.percent) : 0} /><p className="mt-2 text-xs text-muted-foreground">{!progress ? "Выручка пока неизвестна" : progress.remaining ? `Осталось ${formatMoney(progress.remaining)}` : "Цель выполнена"}</p></> : <p className="mt-1 text-xs text-muted-foreground">Цель не задана</p>}
    {averages && <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Выручка за смену · {workplace.name}</dt><dd className="mt-1"><Money value={revenue.perShift} partial={revenue.partial} /></dd></div><div><dt className="text-muted-foreground">Выручка за час · {workplace.name}</dt><dd className="mt-1"><Money value={revenue.perHour} partial={revenue.partial} /></dd></div></dl>}
  </div>)}</Panel><GoalDrawer open={!!current} field="revenueGoal" workplaceId={current?.workplace.id} title={`Цель по выручке · ${current?.workplace.name ?? ""}`} value={current?.target ?? null} onClose={() => setEditing(null)} /></>;
}