import { createFileRoute, Link } from "@tanstack/react-router";
import {
  eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek,
} from "date-fns";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, MonthSwitcher, PageHeader, Section } from "@/components/shared/primitives";
import { WorkplaceFilter } from "@/components/shared/WorkplaceFilter";
import { ShiftRow, shiftDayLabel, STATUS_META, StatusIcon, useWorkplaceMap, WorkplaceDot, wpColor } from "@/components/shifts/shift-ui";
import { useShifts, useWorkplaces } from "@/data/queries";
import { ConflictList } from "@/components/shifts/ConflictWarning";
import { allShiftConflicts, conflictTouchesDate } from "@/lib/overlaps";
import { formatHoursShort, formatNumber, shiftMinutes } from "@/lib/format";
import type { Shift, ShiftStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Календарь смен — Shiftly" },
      { name: "description", content: "Месячный календарь запланированных и завершённых смен." },
      { property: "og:title", content: "Календарь смен — Shiftly" },
      { property: "og:description", content: "Все смены по дням и местам работы." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function CalendarPage() {
  const shifts = useShifts();
  const [month, setMonth] = useState(() => new Date());
  const [wp, setWp] = useState("all");
  const [day, setDay] = useState<string | null>(null);
  const conflicts = useMemo(() => allShiftConflicts(shifts.data ?? []), [shifts.data]);
  const visibleConflicts = conflicts.filter((c) => wp === "all" || c.first.workplaceId === wp || c.second.workplaceId === wp);
  const dayConflicts = day ? visibleConflicts.filter((c) => conflictTouchesDate(c, day) || c.first.date === day || c.second.date === day) : [];

  const byDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts.data ?? []) {
      if (wp !== "all" && s.workplaceId !== wp) continue;
      m.set(s.date, [...(m.get(s.date) ?? []), s].sort((a, b) => a.start.localeCompare(b.start)));
    }
    return m;
  }, [shifts.data, wp]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const dayShifts = day ? byDay.get(day) ?? [] : [];

  return (
    <div className="space-y-4">
      <PageHeader title="Календарь" action={<MonthSwitcher month={month} onChange={setMonth} className="-mr-2" />} />
      <Section><WorkplaceFilter value={wp} onChange={setWp} /></Section>
      <Section>
        {shifts.isPending ? (
          <Skeleton className="h-96 rounded-2xl" />
        ) : shifts.isError ? (
          <ErrorState onRetry={() => shifts.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-7 pb-2 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const list = byDay.get(key) ?? [];
                const inMonth = isSameMonth(d, month);
                return (
                  <Button variant="ghost"
                    key={key}
                    aria-label={`${key}${visibleConflicts.some((c) => conflictTouchesDate(c, key) || c.first.date === key || c.second.date === key) ? ", пересечение смен" : ""}`}
                    onClick={() => setDay(key)}
                    className={cn(
                      "flex h-auto min-h-[4.25rem] min-w-0 flex-col items-center justify-start gap-1 rounded-xl px-0.5 pt-1.5 pb-1 transition-colors active:bg-secondary",
                      !inMonth && "opacity-30",
                      list.length > 0 && "bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-sm tabular",
                        isToday(d) && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {format(d, "d")}
                    </span>
                    {list.slice(0, 2).map((s) => <DayMarker key={s.id} shift={s} />)}
                    {list.length > 2 && <span className="text-[10px] text-muted-foreground">+{formatNumber(list.length - 2)}</span>}
                    {visibleConflicts.some((c) => conflictTouchesDate(c, key) || c.first.date === key || c.second.date === key) && <AlertTriangle aria-label="Пересечение смен" className="size-3 text-negative" />}
                  </Button>
                );
              })}
            </div>
            <Legend />
          </>
        )}
      </Section>

      <Drawer open={day !== null} onOpenChange={(o) => !o && setDay(null)}>
        <DrawerContent>
          {day && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{shiftDayLabel(day)}</DrawerTitle>
                <DrawerDescription>
                  {dayShifts.length ? `Смен: ${formatNumber(dayShifts.length)}` : "Смен нет"}
                </DrawerDescription>
              </DrawerHeader>
              <div className="max-h-[70dvh] space-y-3 overflow-y-auto px-4 pb-8">
                {dayConflicts.length > 0 && <ConflictList conflicts={dayConflicts} />}
                {dayShifts.length ? (
                  <div className="divide-y">{dayShifts.map((s) => <ShiftRow key={s.id} shift={s} showDate={false} />)}</div>
                ) : (
                  <EmptyState icon={CalendarPlus} title="Свободный день" text="Можно запланировать смену на эту дату" />
                )}
                <Button asChild className="mt-4 w-full" variant={dayShifts.length ? "secondary" : "default"}>
                  <Link to="/shifts/new" search={{ date: day }}>Добавить смену</Link>
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DayMarker({ shift }: { shift: Shift }) {
  const wp = useWorkplaceMap().get(shift.workplaceId);
  const color = wp ? wpColor(wp.color) : "var(--muted-foreground)";
  const cancelled = shift.status === "cancelled";
  return (
    <span
      className={cn(
        "flex w-full items-center justify-center gap-0.5 truncate rounded-md border-l-2 px-0.5 text-[10px] leading-4 font-medium tabular text-foreground",
        cancelled && "line-through opacity-50",
      )}
      style={{ borderLeftColor: color, backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
    >
      <StatusIcon status={shift.status} className="size-2.5" />
      {shift.status === "completed" ? formatHoursShort(shiftMinutes(shift.start, shift.end)) : `${shift.start.slice(0, 2)}–${shift.end.slice(0, 2)}`}
    </span>
  );
}

const LEGEND_STATUSES: ShiftStatus[] = ["planned", "in_progress", "pending", "completed", "cancelled"];

function Legend() {
  const { data } = useWorkplaces();
  return (
    <div className="mt-4 space-y-3 rounded-2xl border p-3 text-xs text-muted-foreground">
      <div>
        <p className="mb-1.5 font-medium text-foreground">Цвет — место работы</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {data?.map((w) => (
            <span key={w.id} className="flex min-w-0 items-center gap-1.5"><WorkplaceDot color={w.color} /><span className="truncate">{w.name}</span></span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 font-medium text-foreground">Значок — статус смены</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {LEGEND_STATUSES.map((st) => (
            <span key={st} className="flex items-center gap-1.5"><StatusIcon status={st} />{STATUS_META[st].label}</span>
          ))}
        </div>
        <p className="mt-1.5">В завершённых сменах — отработанные часы, в остальных — время.</p>
        <p className="mt-1.5 flex items-center gap-1.5"><AlertTriangle className="size-3 text-negative" />Пересечение смен</p>
      </div>
    </div>
  );
}
