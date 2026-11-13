import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authHead } from "@/lib/auth";
import { ErrorState, PageHeader, Section } from "@/components/shared/primitives";
import { NoShifts } from "@/components/personal/PersonalEmpty";
import { PersonalEarnings } from "@/components/personal/PersonalEarnings";
import { PersonalRevenue } from "@/components/personal/PersonalRevenue";
import { PersonalAnalytics, PersonalGoals } from "@/components/personal/PersonalAnalytics";
import { PersonalShiftRow } from "@/components/personal/PersonalCalendar";
import { WorkplaceChips } from "@/components/shared/WorkplaceChips";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { accountPeriodRange, accountPeriodShifts, type AccountPeriod } from "@/lib/account-presentation";
import { formatInTimeZone } from "@/lib/account-statistics-time";
import { workplaceToday } from "@/lib/account-rates";

export const Route = createFileRoute("/_authenticated/app/stats")({
  head: () => authHead("Моя статистика", "Личная статистика заработка в Shiftly."),
  component: PersonalStats,
});
const PERIODS: Array<{ value: AccountPeriod; label: string }> = [{ value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }, { value: "year", label: "Год" }, { value: "all", label: "Всё время" }, { value: "custom", label: "Период" }];
function PersonalStats() {
  const { accountUser } = Route.useRouteContext();
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  const [period, setPeriod] = useState<AccountPeriod>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [workplace, setWorkplace] = useState("all");
  const timezone = settings.data?.profile.timezone ?? "Europe/Moscow";
  const today = workplaceToday(timezone);
  const range = accountPeriodRange(period, today, from, to);
  const invalid = period === "custom" && (!from || !to || from > to);
  const all = shifts.data ?? [];
  const rows = accountPeriodShifts(all, range, timezone, workplace).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const revenueRows = accountPeriodShifts(all, range, timezone, workplace, true);
  const workplaces = settings.data?.workplaces ?? [];
  const map = new Map(workplaces.map((w) => [w.id, w]));
  const filters = [...workplaces, ...[...new Set(all.map((s) => s.workplace_id))].filter((id) => !map.has(id)).map((id) => ({ id, name: "Архивное место работы" }))];
  const currentShifts = all.filter((s) => (workplace === "all" || s.workplace_id === workplace) && formatInTimeZone(s.starts_at, timezone).startsWith(today.slice(0, 7)));
  return <div className="space-y-6">
    <PageHeader title="Статистика" />
    <Section className="space-y-3">
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Период статистики">{PERIODS.map((p) => <Button key={p.value} size="sm" variant="ghost" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${period === p.value ? "border-transparent bg-foreground text-background hover:bg-foreground hover:text-background" : "text-muted-foreground"}`}>{p.label}</Button>)}</div>
      {period === "custom" && <div className="grid grid-cols-2 gap-2"><Input type="date" aria-label="С" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0" /><Input type="date" aria-label="По" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0" /></div>}
      <WorkplaceChips workplaces={filters} value={workplace} onChange={setWorkplace} />
    </Section>
    {settings.isPending || shifts.isPending ? <Section><Skeleton className="h-40 rounded-3xl" /></Section>
      : settings.isError || shifts.isError ? <Section><ErrorState onRetry={() => { settings.refetch(); shifts.refetch(); }} /></Section>
      : invalid ? <Section><p className="text-sm text-muted-foreground">{from && to ? "Начало периода должно быть не позже окончания." : "Выберите начало и окончание периода."}</p></Section>
      : settings.data && <div className="space-y-8">
        <Section><PersonalEarnings shifts={rows} title="Общий заработок" /></Section>
        <PersonalGoals settings={settings.data} shifts={all} month={today.slice(0, 7)} workplace={workplace} />
        <Section title="Личная выручка за период"><PersonalRevenue shifts={revenueRows} workplaces={workplaces} selected={workplace} averages /></Section>
        {!rows.length && <Section>{all.length ? <p className="text-sm text-muted-foreground">Нет завершённых смен за выбранный период</p> : <NoShifts />}</Section>}
        <PersonalAnalytics rows={rows} revenueRows={revenueRows} settings={settings.data} monthly={period === "year" || period === "all" || (period === "custom" && from.slice(0, 7) !== to.slice(0, 7))} currentShifts={currentShifts} />
        {!!rows.length && <Section title="Завершённые смены"><div className="divide-y">{rows.map((s) => <PersonalShiftRow key={s.id} shift={s} name={map.get(s.workplace_id)?.name} color={map.get(s.workplace_id)?.color} showDate />)}</div></Section>}
      </div>}
  </div>;
}
