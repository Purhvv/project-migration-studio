import { createFileRoute, Link } from "@tanstack/react-router";
import { endOfMonth, endOfWeek, endOfYear, format, isWithinInterval, parseISO, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { BarChart3, Pencil, TrendingUp, Trophy, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { GoalDrawer, type GoalField } from "@/components/shared/GoalDrawer";
import { Chips, EmptyState, ErrorState, Money, PageHeader, Panel, Section } from "@/components/shared/primitives";
import { WorkplaceFilter } from "@/components/shared/WorkplaceFilter";
import { shiftDayLabel, useWorkplaceMap } from "@/components/shifts/shift-ui";
import { useProfile, useShifts, useWorkplaces } from "@/data/queries";
import { fmtDate, formatHours, formatMoney, formatNumber } from "@/lib/format";
import { adjustmentHistory, chartSeries, goalProgress, incomeStructure, weekdaySeries } from "@/lib/analytics";
import { forecast } from "@/lib/rates";
import { summarize } from "@/lib/summary";
import type { Shift } from "@/lib/types";

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [
    { title: "Статистика заработка — Shiftly" },
    { name: "description", content: "Заработок, личная выручка, цели и история премий и штрафов по рабочим сменам." },
    { property: "og:title", content: "Статистика заработка — Shiftly" },
    { property: "og:description", content: "Финансовая аналитика рабочих смен и прогресс целей." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: StatsPage,
});
type Period = "week" | "month" | "year" | "all" | "custom";
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: "Неделя" }, { value: "month", label: "Месяц" }, { value: "year", label: "Год" }, { value: "all", label: "Всё время" }, { value: "custom", label: "Период" },
];
function rangeFor(p: Period, from: string, to: string) {
  const now = new Date();
  if (p === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (p === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (p === "year") return { start: startOfYear(now), end: endOfYear(now) };
  if (p === "custom" && from && to && from <= to) return { start: parseISO(from), end: parseISO(to) };
  return null;
}
function StatsPage() {
  const shifts = useShifts();
  const [period, setPeriod] = useState<Period>("month");
  const [wp, setWp] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalid = period === "custom" && (!from || !to || from > to);
  const filtered = useMemo(() => {
    const r = rangeFor(period, from, to);
    return (shifts.data ?? []).filter((s) => s.status === "completed" && (wp === "all" || s.workplaceId === wp) && (!r || isWithinInterval(parseISO(s.date), r)));
  }, [shifts.data, period, wp, from, to]);
  return <div className="space-y-6">
    <PageHeader title="Статистика" />
    <Section className="space-y-3">
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {period === "custom" && <div className="grid grid-cols-2 gap-2"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С" /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По" /></div>}
      <WorkplaceFilter value={wp} onChange={setWp} />
    </Section>
    {shifts.isPending ? <Section><Skeleton className="h-40 rounded-3xl" /></Section> : shifts.isError ? <Section><ErrorState onRetry={() => shifts.refetch()} /></Section> : invalid ? <Section><p className="text-sm text-muted-foreground">{from && to ? "Начало периода должно быть не позже окончания." : "Выберите начало и окончание периода."}</p></Section> : <StatsBody shifts={filtered} workplace={wp} allShifts={shifts.data ?? []} monthly={period === "year" || period === "all" || (period === "custom" && to.slice(0, 7) !== from.slice(0, 7))} />}
  </div>;
}
function StatsBody({ shifts, monthly, allShifts, workplace }: { shifts: Shift[]; monthly: boolean; allShifts: Shift[]; workplace: string }) {
  const s = summarize(shifts);
  const wpMap = useWorkplaceMap();
  const [history, setHistory] = useState<"bonuses" | "penalties" | null>(null);
  const series = useMemo(() => chartSeries(shifts, monthly), [shifts, monthly]);
  const weekday = useMemo(() => weekdaySeries(shifts), [shifts]);
  const structure = incomeStructure(shifts);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const dayDetail = weekday.find((x) => x.label === selectedDay);
  const slices = structure.rows.filter((x) => x.value !== null && x.value > 0);
  const ranked = shifts.filter((x): x is Shift & { earnings: number } => x.earnings !== null).sort((a, b) => b.earnings - a.earnings);
  return <div className="space-y-8">
    <Section><div className="bg-hero rounded-3xl border p-5 shadow-card">
      <p className="text-sm text-muted-foreground">Общий заработок</p>
      <p className="mt-2 break-words font-display text-3xl font-semibold"><Money value={s.earnings.value} partial={s.earnings.partial} /></p>
      {s.earnings.partial && <p className="mt-1 text-xs text-muted-foreground">* Часть начислений не подтверждена</p>}
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4">
        <Metric label="Часы" node={shifts.length ? formatHours(s.minutes) : "—"} />
        <Metric label="Смены" node={formatNumber(s.shifts)} />
        <Metric label="Личная выручка" node={<Money value={s.revenue.value} partial={s.revenue.partial} />} />
        <Metric label="Личные чаевые" node={<Money value={s.tips.value} partial={s.tips.partial} />} />
      </dl>
    </div></Section>
    <FinancialGoals shifts={shifts} />
    {shifts.length === 0 && <Section><EmptyState icon={BarChart3} title="Нет данных за период" text="Нет завершённых смен за выбранный период" action={<Button asChild><Link to="/shifts/new">Добавить смену</Link></Button>} /></Section>}
    <Section title="Динамика заработка"><TrendChart data={series} field="earnings" title="Заработок" /></Section>
    <Section title="Динамика личной выручки"><TrendChart data={series} field="revenue" title="Личная выручка" /></Section>
    <Section title="Структура дохода"><Panel className="p-4">
      <p className="text-xs text-muted-foreground">Подтверждённые начисления за выбранный период. Доли — от положительных начислений до вычетов.</p>
      {slices.length > 0 && <div className="mx-auto my-3 h-36 w-36"><ResponsiveContainer><PieChart><Pie data={slices} dataKey="value" innerRadius={40} outerRadius={65} stroke="none" paddingAngle={2}>{slices.map((x) => <Cell key={x.name} fill={x.color} />)}</Pie><Tooltip trigger="click" formatter={(value: number, name: string) => [formatMoney(value), name]} contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)" }} /></PieChart></ResponsiveContainer></div>}
      <dl className="mt-3 space-y-3 text-sm">
        {structure.rows.map((x) => <div key={x.name} className="flex items-start justify-between gap-3"><dt className="min-w-0 text-muted-foreground">{x.name}</dt><dd className="shrink-0 text-right"><Money value={x.value} /><p className="text-xs text-muted-foreground">{x.value !== null && structure.gross > 0 && !structure.incomplete && !structure.remainder ? `${formatNumber(x.value / structure.gross * 100, 1)}%` : ""}</p></dd></div>)}
        <div className="flex justify-between gap-3"><dt>Штрафы — вычет</dt><dd><Money value={structure.penalties.value} tone="negative" sign="−" partial={structure.penalties.partial} /></dd></div>
        {structure.remainder !== null && structure.remainder !== 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Нераспределённые начисления</dt><dd><Money value={structure.remainder} /></dd></div>}
        <div className="flex justify-between gap-3 border-t pt-3 font-semibold"><dt>Итого</dt><dd><Money value={structure.total} /></dd></div>
      </dl>
      {(structure.excluded > 0 || structure.incomplete || structure.remainder) ? <p className="mt-3 text-xs text-muted-foreground">Детализация неполная: {structure.excluded > 0 ? `${formatNumber(structure.excluded)} смен без итоговой суммы не включены. ` : ""}Неизвестные составляющие показаны знаком «—»; остаток сверяет известные начисления с итогом. Процент не рассчитывается из выручки.</p> : null}
    </Panel></Section>
    <Section title="Эффективность по дням недели"><Panel className="p-4">
      <p className="mb-3 text-sm text-muted-foreground">Средний заработок за час · ₽/ч</p>
      <div className="overflow-x-auto"><div className="min-w-[420px]"><ResponsiveContainer width="100%" height={210}><BarChart data={weekday} margin={{ top: 28, right: 15, bottom: 5, left: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} /><YAxis width={55} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip trigger="click" content={<DetailTooltip weekday />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="value" onClick={(entry) => setSelectedDay(entry.label)} fill="var(--chart-2)" radius={[5, 5, 0, 0]}><LabelList dataKey="value" position="top" formatter={(v: unknown) => typeof v === "number" ? formatNumber(v) : "—"} fill="var(--foreground)" fontSize={11} /></Bar>
      </BarChart></ResponsiveContainer></div></div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{weekday.filter((x) => x.value === null).map((x) => <span key={x.label}>{x.label}: {x.shifts ? "сумма неизвестна" : "нет смен"}</span>)}</div>
      <div className="mt-3 grid grid-cols-7 gap-1" aria-label="Выбрать день недели">{weekday.map((x) => <Button key={x.label} size="sm" variant={selectedDay === x.label ? "secondary" : "ghost"} className="min-w-0 px-0" aria-pressed={selectedDay === x.label} onClick={() => setSelectedDay(x.label)}>{x.label}</Button>)}</div>
      {dayDetail && <div role="status" className="mt-3 border-t pt-3 text-sm"><p className="font-medium">{dayDetail.label} · Средний заработок за час: {formatMoney(dayDetail.value)}</p><p className="mt-1 text-xs text-muted-foreground">{formatNumber(dayDetail.shifts)} смен · {formatHours(dayDetail.minutes)} · Всего: {formatMoney(dayDetail.earnings)}{dayDetail.partial ? " · часть сумм неизвестна" : ""}</p></div>}

    </Panel></Section>
    <Section title="Самая прибыльная смена"><RankedShift shift={ranked[0]} best /></Section>
    <Section title="Наименее прибыльная смена"><RankedShift shift={ranked[ranked.length - 1]} /></Section>
    <MonthForecast shifts={allShifts} workplace={workplace} />
    <Section title="Другие показатели"><div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border">
      <Tile label="За смену" node={<Money value={s.earnings.value === null ? null : Math.round(s.earnings.value / Math.max(1, shifts.filter((x) => x.earnings !== null).length))} />} />
      <Tile label="За час" node={<Money value={s.earnings.value === null ? null : Math.round(s.earnings.value / Math.max(1, summarize(shifts.filter((x) => x.earnings !== null)).minutes / 60))} />} />
      <Tile label="Чаевые" node={<Money value={s.tips.value} partial={s.tips.partial} />} />
      <Tile label="Средняя смена" node={s.shifts ? formatHours(Math.round(s.minutes / s.shifts)) : "—"} />
      <Tile label="Премии" node={<Money value={s.bonuses.value} tone="positive" sign="+" partial={s.bonuses.partial} />} onClick={() => setHistory("bonuses")} />
      <Tile label="Штрафы" node={<Money value={s.penalties.value} tone="negative" sign="−" partial={s.penalties.partial} />} onClick={() => setHistory("penalties")} />
    </div></Section>
    <Drawer open={history !== null} onOpenChange={(o) => !o && setHistory(null)}><DrawerContent className="max-h-[85dvh]">
      <DrawerHeader className="text-left"><DrawerTitle>{history === "bonuses" ? "Премии" : "Штрафы"}</DrawerTitle><DrawerDescription>Отдельные операции за выбранный период и место работы</DrawerDescription></DrawerHeader>
      <div className="overflow-y-auto px-4 pb-8">{history && (adjustmentHistory(shifts, history).length ? <div className="divide-y">{adjustmentHistory(shifts, history).map(({ shift, operation }) => <Link key={shift.id + operation.id} to="/shifts/$id" params={{ id: shift.id }} onClick={() => setHistory(null)} className="block space-y-1 py-3"><div className="flex justify-between gap-3"><p className="font-medium">{fmtDate(shift.date, "dd.MM.yyyy")}</p><Money value={operation.amount} tone={history === "bonuses" ? "positive" : "negative"} sign={history === "bonuses" ? "+" : "−"} /></div><p className="text-sm">{wpMap.get(shift.workplaceId)?.name ?? "Место работы не найдено"}</p><p className="text-xs text-muted-foreground">{shift.start}–{shift.end} · {formatHours(summarize([shift]).minutes)}</p><p className="text-sm">{operation.label || "Без причины"}</p>{shift.comment && <p className="text-xs text-muted-foreground">{shift.comment}</p>}</Link>)}</div> : <p className="py-6 text-center text-muted-foreground">Нет записей за выбранный период</p>)}</div>
    </DrawerContent></Drawer>
  </div>;
}
function MonthForecast({ shifts, workplace }: { shifts: Shift[]; workplace: string }) {
  const { data: workplaces } = useWorkplaces();
  const month = format(new Date(), "yyyy-MM");
  const current = shifts.filter((x) => x.date.startsWith(month) && (workplace === "all" || x.workplaceId === workplace));
  const actual = summarize(current).earnings;
  const estimate = forecast(current, workplaces ?? [], actual);
  return <Section title="Прогноз до конца месяца"><Panel className="p-4">
    <p className="text-xs text-muted-foreground">Текущий месяц · выбранное место работы</p>
    <p className="mt-2 flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary" /><Money value={estimate.total} partial={actual.partial || estimate.missing > 0 || estimate.uncovered > 0} /></p>
    <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Подтверждённый заработок</dt><dd><Money value={actual.value} partial={actual.partial} /></dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Предстоящие смены по ставкам</dt><dd><Money value={estimate.upcoming - estimate.missing > 0 ? estimate.estimated : null} /></dd></div></dl>
    <p className="mt-3 text-xs text-muted-foreground">{estimate.upcoming ? `${formatNumber(estimate.upcoming - estimate.missing)} из ${formatNumber(estimate.upcoming)} незавершённых смен учтены по ставкам. ` : "Нет незавершённых смен в текущем месяце. "}{estimate.missing > 0 ? "Смены без ставок не учтены. " : ""}{estimate.uncovered > 0 ? "Часть часов не покрыта ставками. " : ""}Предварительная сумма, без будущих чаевых, процента, премий и штрафов.</p>
  </Panel></Section>;
}
function FinancialGoals({ shifts }: { shifts: Shift[] }) {
  const { data: p } = useProfile();
  const [edit, setEdit] = useState<GoalField | null>(null);
  const month = format(new Date(), "yyyy-MM");
  const s = summarize(shifts.filter((x) => x.date.startsWith(month)));
  const rows = [
    { field: "monthlyGoal" as const, label: "Месячный заработок", current: s.earnings.value, target: p?.monthlyGoal ?? null, money: true },
    { field: "hoursGoal" as const, label: "Отработанные часы", current: s.minutes / 60, target: p?.hoursGoal ?? null, money: false },
    { field: "shiftsGoal" as const, label: "Количество смен", current: s.shifts, target: p?.shiftsGoal ?? null, money: false },
    { field: "revenueGoal" as const, label: "Личная выручка", current: s.revenue.value, target: p?.revenueGoal ?? null, money: true },
  ];
  const current = rows.find((r) => r.field === edit);
  return <Section title="Финансовые цели"><Panel className="divide-y px-4">
    <p className="py-3 text-xs text-muted-foreground">Текущий месяц · завершённые смены в выбранном периоде и месте работы. Часы — ориентир, не поощрение переработок.</p>
    {rows.map((r) => { const progress = goalProgress(r.current, r.target); const fmt = (value: number | null) => r.money ? formatMoney(value) : formatNumber(value); return <div key={r.field} className="py-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{r.label}</p><Button size="icon" variant="ghost" className="size-8 shrink-0 text-primary" aria-label={`Изменить: ${r.label}`} onClick={() => setEdit(r.field)}><Pencil className="size-4" /></Button></div><p className="text-sm tabular">{fmt(r.current)} <span className="text-muted-foreground">/ {fmt(r.target)}</span></p><Progress className="mt-2 h-2" value={progress ? Math.min(100, progress.percent) : 0} /><p className="mt-2 text-xs text-muted-foreground">{!r.target ? "Цель не задана" : !progress ? "Текущий результат неизвестен" : `${formatNumber(progress.percent)}% · ${progress.remaining === 0 ? (r.field === "hoursGoal" ? "Ориентир достигнут" : "Цель выполнена") : `Осталось ${fmt(progress.remaining)}`}`}</p></div>; })}
  </Panel><GoalDrawer open={current !== undefined} field={current?.field ?? "monthlyGoal"} title={current?.label ?? ""} value={current?.target ?? null} onClose={() => setEdit(null)} /></Section>;
}
function TrendChart({ data, field, title }: { data: ReturnType<typeof chartSeries>; field: "earnings" | "revenue"; title: string }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  if (!data.length || data.every((x) => x[field] === null)) return <Panel className="p-5 text-sm text-muted-foreground">{data.length ? "Суммы за выбранный период пока неизвестны" : "Нет данных за выбранный период"}</Panel>;
  const selected = data.find((x) => x.key === selectedKey);
  const width = Math.max(300, data.length * 115);

  return <Panel className="p-3"><p className="mb-3 text-xs text-muted-foreground">{title} за дату / период · ₽</p><div className="overflow-x-auto"><div style={{ width, minWidth: "100%" }}><ResponsiveContainer width="100%" height={230}>{field === "earnings" ? <BarChart data={data} margin={{ top: 30, right: 25, bottom: 5, left: 0 }}><XAxis key="x" dataKey="label" interval={0} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><YAxis key="y" width={65} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip key="tooltip" trigger="click" content={<DetailTooltip field={field} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} /><Bar dataKey={field} onClick={(entry) => setSelectedKey(entry.key)} fill="var(--chart-1)" radius={[5, 5, 0, 0]}><LabelList dataKey={field} position="top" formatter={(v: unknown) => typeof v === "number" ? formatNumber(v) : "—"} fill="var(--foreground)" fontSize={11} /></Bar></BarChart> : <AreaChart data={data} onClick={(event) => { const key = event?.activePayload?.[0]?.payload.key; if (typeof key === "string") setSelectedKey(key); }} margin={{ top: 30, right: 25, bottom: 5, left: 0 }}><XAxis key="x" dataKey="label" interval={0} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><YAxis key="y" width={65} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip key="tooltip" trigger="click" content={<DetailTooltip field={field} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} /><Area dataKey={field} type="linear" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.15} dot={{ r: 4, fill: "var(--chart-2)" }} connectNulls={false}><LabelList dataKey={field} position="top" formatter={(v: unknown) => typeof v === "number" ? formatNumber(v) : "—"} fill="var(--foreground)" fontSize={11} /></Area></AreaChart>}</ResponsiveContainer></div></div>
    {selected && <div role="status" className="mt-3 border-t pt-3 text-sm"><p className="font-medium">{selected.label} · {title}: <Money value={selected[field]} partial={field === "earnings" ? selected.earningsPartial : selected.revenuePartial} /></p><p className="mt-1 text-xs text-muted-foreground">{formatNumber(selected.shifts)} смен · {formatHours(selected.minutes)}</p></div>}
    <details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Значения за период</summary><div className="mt-2 divide-y">{data.map((x) => <Button key={x.key} variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal py-2 text-left" onClick={() => setSelectedKey(x.key)}><span className="text-muted-foreground">{x.label}</span><Money value={x[field]} partial={field === "earnings" ? x.earningsPartial : x.revenuePartial} /></Button>)}</div></details>
  </Panel>;
}
function DetailTooltip({ active, payload, field = "earnings", weekday = false }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }>; field?: string; weekday?: boolean }) {
  const x = payload?.[0]?.payload;
  if (!active || !x) return null;
  const value = weekday ? x['value'] : x[field];
  return <div className="max-w-60 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-card"><p className="font-semibold">{String(x['label'])}</p><p className="mt-1">{weekday ? "Средний заработок за час" : field === "revenue" ? "Личная выручка" : "Заработок"}: {formatMoney(typeof value === "number" ? value : null)}</p><p>{formatNumber(Number(x['shifts']))} смен · {formatHours(Number(x['minutes']))}</p>{weekday && <p>Всего: {formatMoney(typeof x['earnings'] === "number" ? x['earnings'] : null)}</p>}{(weekday ? x['partial'] : field === 'earnings' ? x['earningsPartial'] : x['revenuePartial']) ? <p className="mt-1 text-muted-foreground">Часть сумм неизвестна</p> : null}</div>;
}
function RankedShift({ shift, best = false }: { shift: Shift | undefined; best?: boolean }) {
  const map = useWorkplaceMap(); const Icon = best ? Trophy : TrendingDown;
  return shift ? <Link to="/shifts/$id" params={{ id: shift.id }} className="block"><Panel className="flex items-center gap-3 p-4"><Icon className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{shiftDayLabel(shift.date)}</p><p className="truncate text-xs text-muted-foreground">{map.get(shift.workplaceId)?.name}</p><p className="text-xs text-muted-foreground">{shift.start}–{shift.end}</p></div><Money value={shift.earnings} className="text-sm font-semibold" /></Panel></Link> : <Panel className="p-4 text-sm text-muted-foreground">Нет смен с подтверждённым заработком</Panel>;
}
function Metric({ label, node }: { label: string; node: React.ReactNode }) { return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold tabular">{node}</dd></div>; }
function Tile({ label, node, onClick }: { label: string; node: React.ReactNode; onClick?: () => void }) { const content = <><span className="text-xs text-muted-foreground">{label}{onClick ? " ›" : ""}</span><span className="mt-1 block font-semibold tabular">{node}</span></>; return onClick ? <Button variant="ghost" className="h-auto min-h-20 flex-col items-start justify-center rounded-none bg-card p-4 text-left" onClick={onClick} aria-label={`История: ${label}`}>{content}</Button> : <div className="bg-card p-4">{content}</div>; }
