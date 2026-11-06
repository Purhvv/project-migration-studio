import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CalendarPlus, Clock, MapPin } from "lucide-react";
import { format, isSameMonth, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkplaceRevenue } from "@/components/shared/WorkplaceRevenue";
import { WorkplaceFilter } from "@/components/shared/WorkplaceFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Money, MonthSwitcher, Panel, Section } from "@/components/shared/primitives";
import { ShiftRow, shiftDayLabel, StatusBadge, useWorkplaceMap, WorkplaceDot } from "@/components/shifts/shift-ui";
import { useProfile, useShifts, useWorkplaces } from "@/data/queries";
import { forecast } from "@/lib/rates";
import { formatHours, formatMoney, formatNumber, shiftMinutes } from "@/lib/format";
import { summarize } from "@/lib/summary";
import { ShiftActions } from "@/components/shifts/ShiftActions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Главная — Shiftly" },
      { name: "description", content: "Заработок за месяц, ближайшая смена и последние смены в Shiftly." },
      { property: "og:title", content: "Shiftly — смены и заработок" },
      { property: "og:description", content: "Планирование смен, учёт времени и финансовая аналитика." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

function Home() {
  const { data: profile } = useProfile();
  const shifts = useShifts();
  const [workplace, setWorkplace] = useState("all");
  const visible = (shifts.data ?? []).filter((s) => workplace === "all" || s.workplaceId === workplace);
  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between px-5 pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="font-display text-2xl font-semibold">{profile?.name ?? " "}</h1>
        </div>
        <Button size="icon" variant="secondary" className="rounded-full" aria-label="Уведомления">
          <Bell className="size-5" />
        </Button>
      </header>
      <Section><WorkplaceFilter value={workplace} onChange={setWorkplace} /></Section>
      {shifts.isPending ? (
        <div className="space-y-4 px-5">
          <Skeleton className="h-56 rounded-3xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : shifts.isError ? (
        <div className="px-5"><ErrorState onRetry={() => shifts.refetch()} /></div>
      ) : (
        <>
          <EarningsCard shifts={visible} />
          <RevenueGoal shifts={visible} workplace={workplace} />
          <NextShift shifts={visible} />
          <RecentShifts shifts={visible} />
        </>
      )}
    </div>
  );
}

function EarningsCard({ shifts }: { shifts: import("@/lib/types").Shift[] }) {
  const [month, setMonth] = useState(() => new Date());
  const { data: workplaces } = useWorkplaces();
  const monthShifts = useMemo(() => shifts.filter((x) => isSameMonth(parseISO(x.date), month)), [shifts, month]);
  const s = useMemo(() => summarize(monthShifts), [monthShifts]);
  const f = useMemo(() => forecast(monthShifts, workplaces ?? [], s.earnings), [monthShifts, workplaces, s.earnings]);
  const stats = [
    { label: "Часы", value: s.shifts ? formatHours(s.minutes) : "—" },
    { label: "Смены", value: formatNumber(s.shifts) },
    { label: "Чаевые", node: <Money value={s.tips.value} partial={s.tips.partial} /> },
  ];
  return (
    <section className="px-5">
      <div className="bg-hero rounded-3xl border p-5 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Заработок</span>
          <MonthSwitcher month={month} onChange={setMonth} className="-mr-2" />
        </div>
        <div className="mt-3 font-display text-4xl font-semibold tracking-tight">
          <Money value={s.earnings.value} partial={s.earnings.partial} />
        </div>
        {s.earnings.partial && s.earnings.value !== null && (
          <p className="mt-1 text-xs text-muted-foreground">* часть смен без итоговой суммы</p>
        )}
        {f.upcoming > 0 && (
          <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-background/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-muted-foreground">Предварительный заработок</p>
              <p className="text-xs text-muted-foreground">
                + {formatMoney(f.estimated)} по ставке за {f.upcoming - f.missing} из {f.upcoming} предстоящих
                {f.missing > 0 && " · без ставок не учтены"}
                {f.uncovered > 0 && " · часть часов без ставки"}
              </p>
            </div>
            <Money value={f.total} className="shrink-0 font-semibold" />
          </div>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4">
          {stats.map((st) => (
            <div key={st.label}>
              <dt className="text-xs text-muted-foreground">{st.label}</dt>
              <dd className="mt-0.5 font-semibold tabular">{st.node ?? st.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function NextShift({ shifts }: { shifts: import("@/lib/types").Shift[] }) {
  const wpMap = useWorkplaceMap();
  const today = format(new Date(), "yyyy-MM-dd");
  const next = shifts
    .filter((s) => s.status === "planned" && s.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  if (!next)
    return (
      <Section title="Следующая смена">
        <EmptyState
          icon={CalendarPlus}
          title="Нет запланированных смен"
          text="Добавьте смену, чтобы видеть её здесь"
          action={<Button asChild><Link to="/shifts/new">Добавить смену</Link></Button>}
        />
      </Section>
    );
  const wp = wpMap.get(next.workplaceId);
  return (
    <Section title="Следующая смена">
      <Panel className="p-4">
      <div className="flex items-start gap-2"><Link to="/shifts/$id" params={{ id: next.id }} className="block min-w-0 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">{shiftDayLabel(next.date)}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground tabular">
                <Clock className="size-3.5" /> {next.start}–{next.end} · {formatHours(shiftMinutes(next.start, next.end))}
              </p>
            </div>
            <StatusBadge status={next.status} />
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <MapPin className="size-3.5 text-muted-foreground" />
            {wp && <WorkplaceDot color={wp.color} />}
            {wp?.name}
          </p>
      </Link><ShiftActions shift={next} /></div>
      </Panel>
    </Section>
  );
}

function RecentShifts({ shifts }: { shifts: import("@/lib/types").Shift[] }) {
  const recent = shifts
    .filter((s) => s.status === "completed")
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
    .slice(0, 4);
  return (
    <Section
      title="Последние смены"
      action={<Link to="/calendar" className="text-sm font-medium text-primary">Все смены</Link>}
    >
      {recent.length ? (
        <div className="divide-y">{recent.map((s) => <ShiftRow key={s.id} shift={s} />)}</div>
      ) : (
        <EmptyState icon={Clock} title="Пока нет завершённых смен" text="Здесь появятся ваши отработанные смены" />
      )}
    </Section>
  );
}

function RevenueGoal({ shifts, workplace }: { shifts: import("@/lib/types").Shift[]; workplace: string }) {
  const month = format(new Date(), "yyyy-MM");
  return <Section title="Личная выручка"><p className="mb-2 text-xs text-muted-foreground">Текущий месяц</p><WorkplaceRevenue shifts={shifts.filter((s) => s.date.startsWith(month))} selected={workplace} /></Section>;
}
