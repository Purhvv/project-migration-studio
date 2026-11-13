import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarPlus, Clock, MapPin } from "lucide-react";
import { authHead } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NoWorkplaces, sessionName } from "@/components/personal/PersonalEmpty";
import { PersonalEarnings } from "@/components/personal/PersonalEarnings";
import { PersonalRevenue } from "@/components/personal/PersonalRevenue";
import { PersonalShiftRow } from "@/components/personal/PersonalCalendar";
import { WorkplaceChips } from "@/components/shared/WorkplaceChips";
import { completedAccountShifts } from "@/lib/account-statistics";
import { accountForecast } from "@/lib/account-presentation";
import { formatInTimeZone } from "@/lib/account-statistics-time";
import { EmptyState, ErrorState, MonthSwitcher, Panel, Section } from "@/components/shared/primitives";
import { shiftDayLabel, StatusBadge, WorkplaceDot } from "@/components/shifts/shift-ui";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { workplaceToday } from "@/lib/account-rates";
import { formatHours, shiftMinutes } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => authHead("Личное пространство", "Ваши смены, рабочие места и заработок в Shiftly."),
  component: PersonalHome,
});

function PersonalHome() {
  const { accountUser } = Route.useRouteContext();
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  const [workplace, setWorkplace] = useState("all");
  const [chosenMonth, setChosenMonth] = useState<Date | null>(null);
  const workplaces = settings.data?.workplaces ?? [];
  const wpMap = new Map(workplaces.map((w) => [w.id, w]));
  const timezone = settings.data?.profile.timezone ?? "Europe/Moscow";
  const today = workplaceToday(timezone);
  const monthDate = chosenMonth ?? new Date(`${today.slice(0, 7)}-01T12:00:00`);
  const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
  const visible = (shifts.data ?? []).filter((s) => workplace === "all" || s.workplace_id === workplace);
  const monthly = completedAccountShifts(visible, month, timezone);
  const forecast = accountForecast(visible.filter((s) => formatInTimeZone(s.starts_at, timezone).startsWith(month)), workplaces);
  const recent = completedAccountShifts(visible, null, timezone).slice(0, 4);
  const next = visible.filter((s) => s.status === "in_progress" || s.status === "pending" || (s.status === "planned" && Date.parse(s.ends_at) > Date.now()))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const nextWorkplace = next ? wpMap.get(next.workplace_id) : undefined;
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(new Date());
  const greeting = Number(hour) < 6 ? "Доброй ночи" : Number(hour) < 12 ? "Доброе утро" : Number(hour) < 18 ? "Добрый день" : "Добрый вечер";
  return <div className="space-y-8">
    <header className="flex items-center justify-between px-5 pt-6"><div className="min-w-0"><p className="text-sm text-muted-foreground">{greeting},</p><h1 className="break-words font-display text-2xl font-semibold">{settings.data?.profile.name || sessionName(accountUser)}</h1></div></header>
    <Section><WorkplaceChips workplaces={workplaces} value={workplace} onChange={setWorkplace} /></Section>
    {shifts.isPending || settings.isPending ? <Section><Skeleton className="h-56 rounded-3xl" /></Section>
      : shifts.isError || settings.isError ? <Section><ErrorState onRetry={() => { shifts.refetch(); settings.refetch(); }} /></Section>
      : <>
        <Section><PersonalEarnings shifts={monthly} title="Заработок" home forecast={forecast} action={<MonthSwitcher month={monthDate} onChange={setChosenMonth} className="-mr-2" />} /></Section>
        <Section title="Личная выручка"><p className="mb-2 text-xs text-muted-foreground">Текущий месяц</p>{workplaces.length ? <PersonalRevenue shifts={visible.filter((s) => s.local_start_date.startsWith(today.slice(0, 7)))} workplaces={workplaces} selected={workplace} /> : <NoWorkplaces />}</Section>
        <Section title="Следующая смена">{next ? <Panel className="p-4"><Link to="/app/shifts/$id" params={{ id: next.id }} className="block">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{shiftDayLabel(next.local_start_date)}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground tabular"><Clock className="size-3.5 shrink-0" />{next.start_time}–{next.end_time} · {formatHours(shiftMinutes(next.start_time, next.end_time))}</p></div><StatusBadge status={next.status} /></div>
          <p className="mt-3 flex items-center gap-2 text-sm"><MapPin className="size-3.5 shrink-0 text-muted-foreground" />{nextWorkplace && <WorkplaceDot color={nextWorkplace.color} />}<span className="min-w-0 break-words">{nextWorkplace?.name ?? "Место работы"}</span></p>
        </Link></Panel> : <EmptyState icon={CalendarPlus} title="Нет запланированных смен" text="Добавьте смену, чтобы видеть её здесь" action={<Button asChild><Link to="/app/shifts/new">Добавить смену</Link></Button>} />}</Section>
        <Section title="Последние смены" action={<Link to="/app/calendar" className="text-sm font-medium text-primary">Все смены</Link>}>
          {recent.length ? <div className="divide-y">{recent.map((s) => <PersonalShiftRow key={s.id} shift={s} name={wpMap.get(s.workplace_id)?.name} color={wpMap.get(s.workplace_id)?.color} showDate />)}</div> : <EmptyState icon={Clock} title="Пока нет завершённых смен" text="Здесь появятся ваши отработанные смены" />}
        </Section>
      </>}
  </div>;
}
