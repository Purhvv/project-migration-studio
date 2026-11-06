import { shiftMinutes } from "./format";
import type { Shift } from "./types";

/** Sum of known values; null when every value is unknown. `partial` flags missing data. */
export function sumKnown(values: Array<number | null>, emptyAsZero = false): { value: number | null; partial: boolean } {
  if (emptyAsZero && values.length === 0) return { value: 0, partial: false };
  const known = values.filter((v): v is number => v !== null);
  return { value: known.length ? known.reduce((a, b) => a + b, 0) : null, partial: known.length !== values.length };
}

export interface Summary {
  shifts: number;
  minutes: number;
  earnings: { value: number | null; partial: boolean };
  tips: { value: number | null; partial: boolean };
  revenue: { value: number | null; partial: boolean };
  bonuses: { value: number | null; partial: boolean };
  penalties: { value: number | null; partial: boolean };
}

/** Aggregates backend-provided values of completed shifts (no financial rules applied). */
export function summarize(shifts: Shift[]): Summary {
  const done = shifts.filter((s) => !s.deletedAt && s.status === "completed");
  return {
    shifts: done.length,
    minutes: done.reduce((a, s) => a + shiftMinutes(s.start, s.end), 0),
    earnings: sumKnown(done.map((s) => s.earnings)),
    tips: sumKnown(done.map((s) => s.tips)),
    // Legacy single-workplace callers only; never construct a cross-workplace total.
    revenue: new Set(done.map((s) => s.workplaceId)).size > 1 ? { value: null, partial: true } : sumKnown(done.map((s) => s.revenue)),
    bonuses: sumKnown(done.flatMap((s) => s.bonuses.map((b) => b.amount)), true),
    penalties: sumKnown(done.flatMap((s) => s.penalties.map((b) => b.amount)), true),
  };
}
