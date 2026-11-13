import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { Bar, BarChart, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Money, Panel, Section } from "@/components/shared/primitives";
import { PersonalRevenue } from "@/components/personal/PersonalRevenue";
import { PersonalShiftRow } from "@/components/personal/PersonalCalendar";
import { goalProgress } from "@/lib/analytics";
import { accountShiftSummary } from "@/lib/account-statistics";
import { accountForecast } from "@/lib/account-presentation";
import { formatInTimeZone } from "@/lib/account-statistics-time";
import type { AccountShift } from "@/lib/account-shifts";
import type { AccountSettings } from "@/lib/account-settings";
import { fmtDate, formatHours, formatMoney, formatNumber } from "@/lib/format";
import { sumKnown } from "@/lib/summary";
import { wpColor } from "@/components/shifts/shift-ui";

export function PersonalGoals({ settings, shifts, month, workplace }: { settings: AccountSettings; shifts: AccountShift[]; month: string; workplace: string }) {
  const current = shifts.filter((s) => (workplace === "all" || s.workplace_id === workplace) && formatInTimeZone(s.starts_at, settings.profile.timezone).startsWith(month));
  const summary = accountShiftSummary(current);
  const rows = [
    { label: "Месячный заработок", current: summary.earnings.value, target: settings.profile.monthly_goal, money: true },
    { label: "Отработанные часы", current: summary.minutes / 60, target: settings.profile.hours_goal, money: false },
    { label: "Количество смен", current: summary.count, target: settings.profile.shifts_goal, money: false },
  ];
  return <Section title="Финансовые цели"><Panel className="divide-y px-4"><p className="py-3 text-xs text-muted-foreground">Текущий месяц · завершённые смены. Часы — ориентир, не поощрение переработок.</p>{rows.map((r) => {
    const progress = goalProgress(r.current, r.target);
    const fmt = r.money ? formatMoney : formatNumber;
    return <div key={r.label} className="py-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{r.label}</p><Button asChild size="sm" variant="ghost" className="text-primary"><Link to="/account">Изменить</Link></Button></div><p className="text-sm tabular">{fmt(r.current)} <span className="text-muted-foreground">/ {fmt(r.target)}</span></p><Progress className="mt-2 h-2" value={progress ? Math.min(100, progress.percent) : 0} /><p className="mt-2 text-xs text-muted-foreground">{r.target === null ? "Цель не задана" : !progress ? "Текущий результат неизвестен" : `${progress.percent}% · ${progress.remaining ? `Осталось ${fmt(progress.remaining)}` : r.money ? "Цель выполнена" : "Ориентир достигнут"}`}</p></div>;
  })}</Panel><div className="mt-3"><PersonalRevenue shifts={shifts.filter((s) => s.local_start_date.startsWith(month))} workplaces={settings.workplaces} selected={workplace} /></div></Section>;
}

function ValueChart({ data, field, line = false }: { data: Array<{ key: string; label: string; value: number | null }>; field: string; line?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!data.length || data.every((d) => d.value === null)) return <Panel className="p-5 text-sm text-muted-foreground">{data.length ? "Суммы за выбранный период пока неизвестны" : "Нет данных за выбранный период"}</Panel>;
  const detail = data.find((d) => d.key === selected);
  const axes = <><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><YAxis width={65} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} /></>;
  return <Panel className="p-3"><p className="mb-3 text-xs text-muted-foreground">{field} · ₽</p><ResponsiveContainer width="100%" height={230}>
    <BarChart data={data} margin={{ top: 30, right: 15, bottom: 5, left: 0 }}>
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
      <YAxis width={65} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip trigger="click" formatter={(v: number) => [formatMoney(v), field]} contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)" }} cursor={{ fill: "var(--muted)" }} />
      <Bar dataKey="value" fill="var(--chart-1)" radius={[5, 5, 0, 0]} isAnimationActive={false} onClick={(d) => setSelected(d.key)}><LabelList dataKey="value" position="top" formatter={(v: unknown) => typeof v === "number" ? formatNumber(v) : "—"} fill="var(--foreground)" fontSize={11} /></Bar>
    </BarChart>
  </ResponsiveContainer>{detail && <p role="status" className="mt-3 border-t pt-3 text-sm">{detail.label} · <Money value={detail.value} /></p>}<details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Значения за период</summary><div className="mt-2 divide-y">{data.map((d) => <Button key={d.key} variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal py-2 text-left" onClick={() => setSelected(d.key)}><span className="text-muted-foreground">{d.label}</span><Money value={d.value} /></Button>)}</div></details></Panel>;
}

export function PersonalAnalytics({ rows, revenueRows, settings, monthly, currentShifts }: { rows: AccountShift[]; revenueRows: AccountShift[]; settings: AccountSettings; monthly: boolean; currentShifts: AccountShift[] }) {
  const timezone = settings.profile.timezone;
  const summary = accountShiftSummary(rows);
  const groups = new Map<string, AccountShift[]>();
  for (const s of rows) { const date = formatInTimeZone(s.starts_at, timezone); const key = monthly ? date.slice(0, 7) : date; groups.set(key, [...(groups.get(key) ?? []), s]); }
  const data = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({ key, label: fmtDate(monthly ? key + "-01" : key, monthly ? "LLL yyyy" : "d MMM, EEE"), value: sumKnown(list.map((s) => s.earnings)).value }));
  const weekday = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, i) => {
    const known = rows.filter((s) => (new Date(`${formatInTimeZone(s.starts_at, timezone)}T12:00:00Z`).getUTCDay() + 6) % 7 === i && s.earnings !== null);
    const s = accountShiftSummary(known);
    return { key: label, label, value: s.earnings.value !== null && s.minutes ? Math.round(s.earnings.value / (s.minutes / 60)) : null };
  });
  const confirmed = rows.filter((s) => s.earnings !== null);
  const knownMinutes = accountShiftSummary(confirmed).minutes;
  const ranked = [...confirmed].sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0));
  const f = accountForecast(currentShifts, settings.workplaces);
  const map = new Map(settings.workplaces.map((w) => [w.id, w]));
  const structure = [{ label: "Почасовая оплата / ставки", value: sumKnown(confirmed.map((s) => s.base_pay)).value }, { label: "Процент от выручки", value: null }, { label: "Личные чаевые", value: sumKnown(confirmed.map((s) => s.tips)).value }, { label: "Премии", value: null }, { label: "Штрафы — вычет", value: null }];
  const revenueIds = [...new Set(revenueRows.map((s) => s.workplace_id))];
  const revenueKeys = [...new Set(revenueRows.map((s) => monthly ? s.local_start_date.slice(0, 7) : s.local_start_date))].sort();
  const revenueData = revenueKeys.map((key) => {
    const values: Record<string, string | number | null> = { key, label: fmtDate(monthly ? key + "-01" : key, monthly ? "LLL yyyy" : "d MMM") };
    revenueIds.forEach((id, i) => { values[`wp${i}`] = sumKnown(revenueRows.filter((s) => s.workplace_id === id && (monthly ? s.local_start_date.slice(0, 7) : s.local_start_date) === key).map((s) => s.revenue)).value; });
    return values;
  });
  const metrics = [{ label: "За смену", value: summary.earnings.value !== null && confirmed.length ? Math.round(summary.earnings.value / confirmed.length) : null }, { label: "За час", value: summary.earnings.value !== null && knownMinutes ? Math.round(summary.earnings.value / (knownMinutes / 60)) : null }, { label: "Чаевые", value: summary.tips.value }, { label: "Премии", value: null }, { label: "Штрафы", value: null }];
  return <>
    <Section title="Динамика заработка"><ValueChart data={data} field="Заработок" /></Section>
    <Section title="Динамика личной выручки"><Panel className="p-3"><div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">{revenueIds.map((id) => <span key={id}>{map.get(id)?.name ?? "Архивное место работы"}</span>)}</div>{revenueData.length ? <ResponsiveContainer width="100%" height={230}><LineChart data={revenueData} margin={{ top: 20, right: 15, bottom: 5, left: 0 }}>
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><YAxis width={65} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip trigger="click" formatter={(v: number, name: string) => [formatMoney(v), name]} contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)" }} />
      {revenueIds.map((id, i) => <Line key={id} dataKey={`wp${i}`} name={map.get(id)?.name ?? "Архивное место работы"} stroke={map.get(id) ? wpColor(map.get(id)?.color ?? "green") : "var(--muted-foreground)"} strokeWidth={2} type="linear" connectNulls={false} isAnimationActive={false} />)}
    </LineChart></ResponsiveContainer> : <p className="py-3 text-sm text-muted-foreground">Нет данных за выбранный период</p>}</Panel></Section>
    <Section title="Структура дохода"><Panel className="p-4"><p className="text-xs text-muted-foreground">Подтверждённые начисления за выбранный период.</p><dl className="mt-3 space-y-3 text-sm">{structure.map((r) => <div key={r.label} className="flex justify-between gap-3"><dt className="min-w-0 text-muted-foreground">{r.label}</dt><dd className="shrink-0"><Money value={r.value} /></dd></div>)}<div className="flex justify-between gap-3 border-t pt-3 font-semibold"><dt>Итого</dt><dd><Money value={summary.earnings.value} partial={summary.earnings.partial} /></dd></div></dl><p className="mt-3 text-xs text-muted-foreground">Детализация процента, премий и штрафов пока недоступна; итог показан по сохранённому заработку.</p></Panel></Section>
    <Section title="Эффективность по дням недели"><ValueChart data={weekday} field="Средний заработок за час" /></Section>
    {[{ title: "Самая прибыльная смена", shift: ranked[0], Icon: Trophy }, { title: "Наименее прибыльная смена", shift: ranked.at(-1), Icon: TrendingDown }].map(({ title, shift, Icon }) => <Section key={title} title={title}>{shift ? <Panel className="flex items-center gap-3 px-4"><Icon className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><PersonalShiftRow shift={shift} name={map.get(shift.workplace_id)?.name} color={map.get(shift.workplace_id)?.color} showDate /></div></Panel> : <Panel className="p-4 text-sm text-muted-foreground">Нет смен с подтверждённым заработком</Panel>}</Section>)}
    <Section title="Прогноз до конца месяца"><Panel className="p-4"><p className="text-xs text-muted-foreground">Текущий месяц · выбранное место работы</p><p className="mt-2 flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary" /><Money value={f.total} partial={f.actual.partial || f.missing > 0 || f.uncovered > 0} /></p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Подтверждённый заработок</dt><dd><Money value={f.actual.value} partial={f.actual.partial} /></dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Предстоящие смены по ставкам</dt><dd><Money value={f.upcoming > f.missing ? f.estimated : null} /></dd></div></dl><p className="mt-3 text-xs text-muted-foreground">{f.upcoming ? `${f.upcoming - f.missing} из ${f.upcoming} незавершённых смен учтены по ставкам. ` : "Нет незавершённых смен в текущем месяце. "}Предварительная сумма, без будущих чаевых, процента, премий и штрафов.</p></Panel></Section>
    <Section title="Другие показатели"><div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border">{metrics.map((r) => <div key={r.label} className="min-h-20 bg-card p-4"><p className="text-xs text-muted-foreground">{r.label}</p><p className="mt-1 font-semibold"><Money value={r.value} /></p></div>)}<div className="min-h-20 bg-card p-4"><p className="text-xs text-muted-foreground">Средняя смена</p><p className="mt-1 font-semibold">{summary.count ? formatHours(Math.round(summary.minutes / summary.count)) : "—"}</p></div></div></Section>
  </>;
}