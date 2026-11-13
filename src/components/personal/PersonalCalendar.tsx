import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, MonthSwitcher, Money, NavChevron, PageHeader, Section } from "@/components/shared/primitives";
import { WorkplaceChips } from "@/components/shared/WorkplaceChips";
import { STATUS_META, StatusIcon, WorkplaceDot, shiftDayLabel, wpColor } from "@/components/shifts/shift-ui";
import { NoShifts } from "@/components/personal/PersonalEmpty";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { findAccountConflicts, type AccountShift } from "@/lib/account-shifts";
import { accountEarnings } from "@/lib/account-statistics";
import { fmtDate, formatHours, formatHoursShort, formatNumber, shiftMinutes } from "@/lib/format";
import type { ShiftStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const LEGEND_STATUSES: ShiftStatus[] = ["planned", "in_progress", "pending", "completed", "cancelled"];

/** Personal calendar: real Supabase shifts only, colour = workplace, icon = status. */
export function PersonalCalendar({ userId }: { userId: string }) {
  const shifts = useQuery(accountShiftsOptions(userId));
  const settings = useQuery(accountSettingsOptions(userId));
  const [month, setMonth] = useState(() => new Date());
  const [wp, setWp] = useState("all");
  const [day, setDay] = useState<string | null>(null);

  const workplaces = settings.data?.workplaces ?? [];
  const wpMap = useMemo(() => new Map(workplaces.map((w) => [w.id, w])), [workplaces]);

  const conflictDays = useMemo(() => {
    const all = shifts.data ?? [];
    const days = new Set<string>();
    for (const s of all) {
      if (s.status === "cancelled") continue;
      for (const c of findAccountConflicts({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at }, all)) {
        days.add(s.local_start_date);
        days.add(c.other.local_start_date);
      }
    }
    return days;
  }, [shifts.data]);

  const byDay = useMemo(() => {
    const m = new Map<string, AccountShift[]>();
    for (const s of shifts.data ?? []) {
      if (wp !== "all" && s.workplace_id !== wp) continue;
      m.set(s.local_start_date, [...(m.get(s.local_start_date) ?? []), s].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    }
    return m;
  }, [shifts.data, wp]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const dayShifts = day ? byDay.get(day) ?? [] : [];
  const hasAny = (shifts.data ?? []).length > 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Календарь" action={<MonthSwitcher month={month} onChange={setMonth} className="-mr-2" />} />
      <Section><WorkplaceChips workplaces={workplaces} value={wp} onChange={setWp} /></Section>
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
                return (
                  <Button variant="ghost"
                    key={key}
                    aria-label={`${key}${conflictDays.has(key) ? ", пересечение смен" : ""}`}
                    onClick={() => setDay(key)}
                    className={cn(
                      "flex h-auto min-h-[4.25rem] min-w-0 flex-col items-center justify-start gap-1 rounded-xl px-0.5 pt-1.5 pb-1 transition-colors active:bg-secondary",
                      !isSameMonth(d, month) && "opacity-30",
                      list.length > 0 && "bg-card",
                    )}
                  >
                    <span className={cn("grid size-6 place-items-center rounded-full text-sm tabular", isToday(d) && "bg-primary font-semibold text-primary-foreground")}>
                      {format(d, "d")}
                    </span>
                    {list.slice(0, 2).map((s) => <DayMarker key={s.id} shift={s} color={wpMap.get(s.workplace_id)?.color} />)}
                    {list.length > 2 && <span className="text-[10px] text-muted-foreground">+{formatNumber(list.length - 2)}</span>}
                    {conflictDays.has(key) && <AlertTriangle aria-label="Пересечение смен" className="size-3 text-negative" />}
                  </Button>
                );
              })}
            </div>
            <div className="mt-4 space-y-3 rounded-2xl border p-3 text-xs text-muted-foreground">
              <div>
                <p className="mb-1.5 font-medium text-foreground">Цвет — место работы</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {workplaces.map((w) => (
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
              </div>
            </div>
          </>
        )}
      </Section>

      <Drawer open={day !== null} onOpenChange={(o) => !o && setDay(null)}>
        <DrawerContent>
          {day && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{shiftDayLabel(day)}</DrawerTitle>
                <DrawerDescription>{dayShifts.length ? `Смен: ${formatNumber(dayShifts.length)}` : "Смен нет"}</DrawerDescription>
              </DrawerHeader>
              <div className="max-h-[70dvh] space-y-3 overflow-y-auto px-4 pb-8">
                {dayShifts.length ? (
                  <div className="divide-y">{dayShifts.map((s) => <PersonalShiftRow key={s.id} shift={s} name={wpMap.get(s.workplace_id)?.name} color={wpMap.get(s.workplace_id)?.color} />)}</div>
                ) : (
                  <EmptyState icon={CalendarPlus} title="Свободный день" text="Можно запланировать смену на эту дату" />
                )}
                <Button asChild className="mt-4 w-full" variant={dayShifts.length ? "secondary" : "default"}>
                  <Link to="/app/shifts/new" search={{ date: day }}>Добавить смену</Link>
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DayMarker({ shift, color }: { shift: AccountShift; color: string | undefined }) {
  const css = color ? wpColor(color as never) : "var(--muted-foreground)";
  const cancelled = shift.status === "cancelled";
  return (
    <span
      className={cn("flex w-full items-center justify-center gap-0.5 truncate rounded-md border-l-2 px-0.5 text-[10px] leading-4 font-medium tabular text-foreground", cancelled && "line-through opacity-50")}
      style={{ borderLeftColor: css, backgroundColor: `color-mix(in oklab, ${css} 22%, transparent)` }}
    >
      <StatusIcon status={shift.status} className="size-2.5" />
      {shift.status === "completed" ? formatHoursShort(shiftMinutes(shift.start_time, shift.end_time)) : `${shift.start_time.slice(0, 2)}–${shift.end_time.slice(0, 2)}`}
    </span>
  );
}

export function PersonalShiftRow({ shift, name, color, showDate = false }: { shift: AccountShift; name?: string | undefined; color?: string | undefined; showDate?: boolean }) {
  const cancelled = shift.status === "cancelled";
  return (
    <Link
      to="/app/shifts/$id"
      params={{ id: shift.id }}
      className={cn("flex min-w-0 items-center gap-3 py-3.5 transition-colors active:opacity-70", cancelled && "opacity-60")}
    >
      {showDate && <div className="grid w-11 shrink-0 place-items-center rounded-xl bg-secondary py-1.5 text-center leading-tight"><span className="text-base font-semibold tabular">{fmtDate(shift.local_start_date, "d")}</span><span className="text-[11px] text-muted-foreground">{fmtDate(shift.local_start_date, "EEEEEE")}</span></div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {color && <WorkplaceDot color={color as never} />}
          <span className={cn("truncate", cancelled && "line-through")}>{name ?? "Место работы"}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular">
          {shift.start_time}–{shift.end_time} · {formatHours(shiftMinutes(shift.start_time, shift.end_time))}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {shift.status === "completed" ? (
          <Money value={accountEarnings(shift).value} partial={accountEarnings(shift).partial} className="text-sm font-semibold" />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            <StatusIcon status={shift.status} />{STATUS_META[shift.status].label}
          </span>
        )}
      </div>
      <NavChevron />
    </Link>
  );
}
