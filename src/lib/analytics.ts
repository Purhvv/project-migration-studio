import { format, getDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { shiftMinutes } from "./format";
import { sumKnown } from "./summary";
import type { Shift } from "./types";

export function chartSeries(shifts: Shift[], monthly: boolean) {
  const groups = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = monthly ? s.date.slice(0, 7) : s.date;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({
    key,
    label: format(parseISO(list[0]?.date ?? key + "-01"), monthly ? "LLL yyyy" : "d MMM, EEE", { locale: ru }),
    earnings: sumKnown(list.map((s) => s.earnings)).value,
    revenue: sumKnown(list.map((s) => s.revenue)).value,
    partial: list.some((s) => s.earnings === null || s.revenue === null),
    earningsPartial: list.some((s) => s.earnings === null),
    revenuePartial: list.some((s) => s.revenue === null),
    shifts: list.length,
    minutes: list.reduce((a, s) => a + shiftMinutes(s.start, s.end), 0),
  }));
}

export function weekdaySeries(shifts: Shift[]) {
  return ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, i) => {
    const list = shifts.filter((s) => (getDay(parseISO(s.date)) + 6) % 7 === i);
    const known = list.filter((s) => s.earnings !== null);
    const minutes = list.reduce((a, s) => a + shiftMinutes(s.start, s.end), 0);
    const knownMinutes = known.reduce((a, s) => a + shiftMinutes(s.start, s.end), 0);
    const earnings = sumKnown(list.map((s) => s.earnings));
    return { label, shifts: list.length, minutes, earnings: earnings.value, partial: earnings.partial,
      value: earnings.value !== null && knownMinutes ? Math.round(earnings.value / (knownMinutes / 60)) : null };
  });
}

/** Structure covers only shifts whose final total is confirmed. No invented commission. */
export function incomeStructure(shifts: Shift[]) {
  const confirmed = shifts.filter((s) => s.earnings !== null);
  const base = sumKnown(confirmed.map((s) => s.basePay)).value;
  const tips = sumKnown(confirmed.map((s) => s.tips)).value;
  const commission = sumKnown(confirmed.map((s) => s.commissionPay ?? null)).value;
  const bonuses = sumKnown(confirmed.flatMap((s) => s.bonuses.map((a) => a.amount)), true);
  const penalties = sumKnown(confirmed.flatMap((s) => s.penalties.map((a) => a.amount)), true);
  const total = sumKnown(confirmed.map((s) => s.earnings)).value;
  const gross = (base ?? 0) + (tips ?? 0) + (commission ?? 0) + (bonuses.value ?? 0);
  const remainder = total === null ? null : total - (gross - (penalties.value ?? 0));
  const incomplete = confirmed.some((s) => s.basePay === null || s.tips === null || s.commissionPay == null || s.bonuses.some((a) => a.amount === null) || s.penalties.some((a) => a.amount === null));
  return { total, penalties, remainder, incomplete, excluded: shifts.length - confirmed.length, rows: [
    { name: "Почасовая оплата / ставки", value: base, color: "var(--chart-1)" },
    { name: "Процент от выручки", value: commission, color: "var(--chart-4)" },
    { name: "Личные чаевые", value: tips, color: "var(--chart-2)" },
    { name: "Премии", value: bonuses.value, color: "var(--chart-3)" },
  ], gross };
}

export function adjustmentHistory(shifts: Shift[], kind: "bonuses" | "penalties") {
  return [...shifts].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
    .flatMap((shift) => shift[kind].map((operation) => ({ shift, operation })));
}

export function goalProgress(current: number | null, target: number | null) {
  return current === null || target === null || target <= 0 ? null : { percent: Math.round(current / target * 100), remaining: Math.max(0, target - current) };
}