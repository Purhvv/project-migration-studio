import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authHead } from "@/lib/auth";
import { ErrorState, Money, MonthSwitcher, PageHeader, Panel, Section } from "@/components/shared/primitives";
import { NoShifts } from "@/components/personal/PersonalEmpty";
import { PersonalEarnings } from "@/components/personal/PersonalEarnings";
import { PersonalShiftRow } from "@/components/personal/PersonalCalendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { accountWorkplaceRevenue, completedAccountShifts } from "@/lib/account-statistics";
import { workplaceToday } from "@/lib/account-rates";

export const Route = createFileRoute("/_authenticated/app/stats")({
  head: () => authHead("Моя статистика", "Личная статистика заработка в Shiftly."),
  component: PersonalStats,
});

function PersonalStats() {
  const { accountUser } = Route.useRouteContext();
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [chosenMonth, setChosenMonth] = useState<Date | null>(null);
  const [workplace, setWorkplace] = useState("all");
  const timezone = settings.data?.profile.timezone ?? "Europe/Moscow";
  const monthDate = chosenMonth ?? new Date(`${workplaceToday(timezone).slice(0, 7)}-01T12:00:00`);
  const month = period === "all" ? null : `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
  const workplaces = settings.data?.workplaces ?? [];
  const wpMap = new Map(workplaces.map((w) => [w.id, w]));
  const rows = completedAccountShifts(shifts.data ?? [], month, timezone, workplace);
  // Include historical shifts of archived workplaces even though settings list only active workplaces.
  const workplaceIds = [...new Set([...workplaces.map((w) => w.id), ...(shifts.data ?? []).map((s) => s.workplace_id)])];
  return <div className="space-y-6">
    <PageHeader title="Статистика" subtitle="Личное пространство" />
    <Section className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Период статистики">
        <Button variant={period === "month" ? "secondary" : "ghost"} aria-pressed={period === "month"} onClick={() => setPeriod("month")}>Месяц</Button>
        <Button variant={period === "all" ? "secondary" : "ghost"} aria-pressed={period === "all"} onClick={() => setPeriod("all")}>Всё время</Button>
      </div>
      {period === "month" && <MonthSwitcher month={monthDate} onChange={setChosenMonth} />}
      <Select value={workplace} onValueChange={setWorkplace}><SelectTrigger aria-label="Место работы"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">Все места работы</SelectItem>
        {workplaceIds.map((id) => <SelectItem key={id} value={id}>{wpMap.get(id)?.name ?? "Архивное место работы"}</SelectItem>)}
      </SelectContent></Select>
    </Section>
    {settings.isPending || shifts.isPending ? <Section><Skeleton className="h-40 rounded-2xl" /></Section>
      : settings.isError || shifts.isError ? <Section><ErrorState onRetry={() => { settings.refetch(); shifts.refetch(); }} /></Section>
      : <>
        <Section><PersonalEarnings shifts={rows} title="Фактический заработок" showTips /></Section>
        <Section title="Личная выручка за период"><Panel className="divide-y px-4">
          {workplaceIds.filter((id) => workplace === "all" || id === workplace).map((id) => {
            const revenue = accountWorkplaceRevenue(shifts.data ?? [], id, month);
            return <div key={id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words text-muted-foreground">{wpMap.get(id)?.name ?? "Архивное место работы"}</span><Money value={revenue.value} partial={revenue.partial} className="shrink-0" /></div>;
          })}
          {!workplaceIds.length && <p className="py-4 text-sm text-muted-foreground">Нет рабочих мест</p>}
        </Panel></Section>
        <Section title="Завершённые смены">{rows.length ? <Panel className="divide-y px-4">
          {rows.map((s) => <div key={s.id} className="pt-3"><p className="text-xs text-muted-foreground">{s.local_start_date.split("-").reverse().join(".")}</p><PersonalShiftRow shift={s} name={wpMap.get(s.workplace_id)?.name} color={wpMap.get(s.workplace_id)?.color} /></div>)}
        </Panel> : shifts.data?.length ? <p className="text-sm text-muted-foreground">Нет завершённых смен за выбранный период</p> : <NoShifts />}</Section>
      </>}
  </div>;
}
