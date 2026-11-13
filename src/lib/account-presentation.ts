import type { AccountShift } from "@/lib/account-shifts";
import { estimateAccountPay } from "@/lib/account-shifts";
import type { AccountWorkplace } from "@/lib/account-settings";
import { formatInTimeZone } from "@/lib/account-statistics-time";
import { accountShiftSummary } from "@/lib/account-statistics";
import type { Forecast } from "@/lib/rates";

export type AccountPeriod = "week" | "month" | "year" | "all" | "custom";

/** Calendar boundaries in the profile timezone; custom endpoints are inclusive. */
export function accountPeriodRange(period: AccountPeriod, today: string, from = "", to = ""): { from: string; to: string } | null {
  if (period === "all") return null;
  if (period === "custom") return { from, to };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  const d = new Date(`${today}T12:00:00Z`);
  if (period === "week") {
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    const start = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    return { from: start, to: d.toISOString().slice(0, 10) };
  }
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return { from: `${today.slice(0, 7)}-01`, to: d.toISOString().slice(0, 10) };
}

export function accountPeriodShifts(shifts: AccountShift[], range: { from: string; to: string } | null, timezone: string, workplace = "all", localRevenue = false) {
  return shifts.filter((s) => {
    const date = localRevenue ? s.local_start_date : formatInTimeZone(s.starts_at, timezone);
    return s.status === "completed" && (workplace === "all" || s.workplace_id === workplace) && (!range || (date >= range.from && date <= range.to));
  });
}

/** Reuse the existing version-aware hourly estimate; no projected commission/tips/adjustments. */
export function accountForecast(shifts: AccountShift[], workplaces: AccountWorkplace[]): Forecast {
  const actual = accountShiftSummary(shifts).earnings;
  const wp = new Map(workplaces.map((w) => [w.id, w]));
  const up = shifts.filter((s) => ["planned", "in_progress", "pending"].includes(s.status));
  let estimated = 0, missing = 0, uncovered = 0;
  for (const s of up) {
    const workplace = wp.get(s.workplace_id);
    const est = workplace ? estimateAccountPay(workplace, s.local_start_date, s.start_time, s.end_time) : null;
    if (est?.amount == null) missing++;
    else { estimated += est.amount; if (est.uncoveredMinutes) uncovered++; }
  }
  return { actual, estimated, missing, uncovered, upcoming: up.length, total: actual.value === null && up.length === missing ? null : (actual.value ?? 0) + estimated };
}