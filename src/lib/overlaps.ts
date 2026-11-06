import { shiftMinutes } from "./format";
import type { Shift } from "./types";
export interface ShiftConflict { first: Shift; second: Shift; start: number; end: number; minutes: number }

/** UTC is a wall-clock coordinate here, not a timezone conversion. */
export function shiftInterval(shift: Pick<Shift, "date" | "start" | "end">) {
  const start = Date.parse(`${shift.date}T${shift.start}:00Z`);
  return { start, end: start + shiftMinutes(shift.start, shift.end) * 60000 };
}
export function findShiftConflicts(candidate: Shift, shifts: Shift[]): ShiftConflict[] {
  if (candidate.status === "cancelled") return [];
  const a = shiftInterval(candidate);
  if (!Number.isFinite(a.start)) return [];
  return shifts.flatMap((other) => {
    if (other.id === candidate.id || other.status === "cancelled") return [];
    const b = shiftInterval(other);
    const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
    return end > start ? [{ first: candidate, second: other, start, end, minutes: (end - start) / 60000 }] : [];
  });
}
export function allShiftConflicts(shifts: Shift[]) {
  return shifts.flatMap((shift, i) => findShiftConflicts(shift, shifts.slice(i + 1)));
}
export function conflictTouchesDate(conflict: ShiftConflict, date: string) {
  const start = Date.parse(`${date}T00:00:00Z`);
  return conflict.start < start + 86400000 && conflict.end > start;
}
export function conflictTime(value: number) {
  const iso = new Date(value).toISOString();
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}