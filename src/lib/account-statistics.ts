import type { AccountShift } from "@/lib/account-shifts";
import { formatInTimeZone } from "@/lib/account-statistics-time";
import { sumKnown } from "@/lib/summary";

export function completedAccountShifts(shifts: AccountShift[], month: string | null, timezone: string, workplace = "all") {
  return shifts.filter((s) => s.status === "completed" && (workplace === "all" || s.workplace_id === workplace)
    && (month === null || formatInTimeZone(s.starts_at, timezone).startsWith(month)))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
}

/** Read stored confirmed totals only. Never derive actual payroll from rates or revenue. */
export function accountShiftSummary(shifts: AccountShift[]) {
  const completed = shifts.filter((s) => s.status === "completed");
  return {
    count: completed.length,
    minutes: completed.reduce((total, s) => total + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000, 0),
    earnings: sumKnown(completed.map((s) => s.earnings)),
    tips: sumKnown(completed.map((s) => s.tips)),
  };
}

/** Revenue periods belong to the workplace's local start date, not the profile timezone. */
export function accountWorkplaceRevenue(shifts: AccountShift[], workplace: string, month: string | null) {
  return sumKnown(shifts.filter((s) => s.status === "completed" && s.workplace_id === workplace
    && (month === null || s.local_start_date.startsWith(month))).map((s) => s.revenue));
}