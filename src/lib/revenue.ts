import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { shiftMinutes } from "./format";
import { sumKnown } from "./summary";
import { goalProgress } from "./analytics";
import type { Shift, Workplace } from "./types";

/** Revenue can only be calculated for one explicitly identified workplace. */
export function workplaceRevenue(shifts: Shift[], workplaceId: string) {
  const completed = shifts.filter((s) => !s.deletedAt && s.status === "completed" && s.workplaceId === workplaceId);
  const known = completed.filter((s) => s.revenue !== null);
  const revenue = sumKnown(completed.map((s) => s.revenue));
  const knownMinutes = known.reduce((total, s) => total + shiftMinutes(s.start, s.end), 0);
  return { ...revenue, shifts: completed.length,
    perShift: revenue.value === null || !known.length ? null : Math.round(revenue.value / known.length),
    perHour: revenue.value === null || !knownMinutes ? null : Math.round(revenue.value / (knownMinutes / 60)),
  };
}

export function revenueByWorkplace(shifts: Shift[], workplaces: Workplace[], selected = "all") {
  return workplaces.filter((w) => selected === "all" || w.id === selected).map((workplace) => {
    const revenue = workplaceRevenue(shifts, workplace.id);
    const target = workplace.revenueGoal ?? null;
    return { workplace, revenue, target, progress: goalProgress(revenue.value, target) };
  });
}

/** Separate chart values, never a total; missing dates remain unknown, not zero. */
export function workplaceRevenueSeries(shifts: Shift[], workplaces: Workplace[], monthly: boolean, selected = "all") {
  const visible = workplaces.filter((w) => selected === "all" || w.id === selected);
  const completed = shifts.filter((s) => !s.deletedAt && s.status === "completed" && visible.some((w) => w.id === s.workplaceId));
  const keys = [...new Set(completed.map((s) => monthly ? s.date.slice(0, 7) : s.date))].sort();
  return keys.map((key) => {
    const list = completed.filter((s) => (monthly ? s.date.slice(0, 7) : s.date) === key);
    const values: Record<string, number | null> = {};
    const details = visible.map((workplace, i) => {
      const revenue = workplaceRevenue(list, workplace.id);
      values[`workplace${i}`] = revenue.value;
      return { workplace, revenue };
    });
    return { key, label: format(parseISO(monthly ? key + "-01" : key), monthly ? "LLL yyyy" : "d MMM, EEE", { locale: ru }), ...values, details };
  });
}