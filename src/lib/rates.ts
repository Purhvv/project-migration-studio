import { addDays, format, parseISO } from "date-fns";
import type { RateInterval, Shift, Workplace } from "./types";

const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
};
/** 0 = Monday … 6 = Sunday */
const weekday = (iso: string) => (parseISO(iso).getDay() + 6) % 7;
const dayOk = (r: RateInterval, wd: number) => !r.weekdays?.length || r.weekdays.includes(wd);

function rateAt(rates: RateInterval[], date: string, minuteOfDay: number): RateInterval | undefined {
  const wd = weekday(date);
  const prevWd = (wd + 6) % 7;
  return rates.find((r) => {
    const s = toMin(r.start);
    const e = toMin(r.end);
    if (s < e) return minuteOfDay >= s && minuteOfDay < e && dayOk(r, wd);
    // overnight window (or full day when s === e)
    return (minuteOfDay >= s && dayOk(r, wd)) || (minuteOfDay < e && dayOk(r, prevWd));
  });
}

export type Estimate =
  | { kind: "no_rates"; amount: null; uncoveredMinutes: number }
  | { kind: "ok" | "partial"; amount: number; uncoveredMinutes: number };

/** Estimated pay for a time span using the workplace's configured rates only. */
export function estimatePay(rates: RateInterval[] | undefined, date: string, start: string, end: string): Estimate {
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 1440;
  if (!rates?.length) return { kind: "no_rates", amount: null, uncoveredMinutes: e - s };
  const nextDay = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
  let sum = 0;
  let uncovered = 0;
  for (let m = s; m < e; m++) {
    const r = m < 1440 ? rateAt(rates, date, m) : rateAt(rates, nextDay, m - 1440);
    if (r) sum += r.hourly / 60;
    else uncovered++;
  }
  return { kind: uncovered ? "partial" : "ok", amount: Math.round(sum), uncoveredMinutes: uncovered };
}

/** Shifts that are expected but not yet completed contribute an estimate. */
export const isUpcoming = (s: Shift) => s.status === "planned" || s.status === "in_progress" || s.status === "pending";

export interface Forecast {
  /** actual earnings of completed shifts */
  actual: { value: number | null; partial: boolean };
  /** sum of estimates for upcoming shifts */
  estimated: number;
  /** upcoming shifts without any estimate (rates missing) */
  missing: number;
  /** upcoming shifts with time not covered by rates */
  uncovered: number;
  upcoming: number;
  /** actual + estimated; null when nothing known */
  total: number | null;
}

/** Preliminary earnings = actual (completed only) + rate estimate (upcoming only). Each shift counted once. */
export function forecast(shifts: Shift[], workplaces: Workplace[], actual: Forecast["actual"]): Forecast {
  const wp = new Map(workplaces.map((w) => [w.id, w]));
  let estimated = 0;
  let missing = 0;
  let uncovered = 0;
  const up = shifts.filter(isUpcoming);
  for (const s of up) {
    const est = estimatePay(wp.get(s.workplaceId)?.rates, s.date, s.start, s.end);
    if (est.amount === null) missing++;
    else {
      estimated += est.amount;
      if (est.kind === "partial") uncovered++;
    }
  }
  const hasEst = up.length - missing > 0;
  const total = actual.value === null && !hasEst ? null : (actual.value ?? 0) + estimated;
  return { actual, estimated, missing, uncovered, upcoming: up.length, total };
}
