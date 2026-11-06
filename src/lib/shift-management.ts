import type { Shift } from "./types";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export function trashExpiresAt(shift: Shift): number | null {
  if (!shift.deletedAt) return null;
  const deleted = Date.parse(shift.deletedAt);
  return Number.isFinite(deleted) ? deleted + TRASH_RETENTION_MS : null;
}
export function isTrashExpired(shift: Shift, now = Date.now()): boolean {
  const expires = trashExpiresAt(shift);
  return expires !== null && now >= expires;
}
/** Pure eligibility selection for a future scheduled server purge. No automatic local deletion. */
export const expiredTrashIds = (shifts: Shift[], now = Date.now()) =>
  shifts.filter((s) => s.deletedAt && isTrashExpired(s, now)).map((s) => s.id);
export const activeShifts = (shifts: Shift[]) => shifts.filter((s) => !s.deletedAt);
export const trashedShifts = (shifts: Shift[]) => shifts.filter((s) => s.deletedAt)
  .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
export function moveToTrash(shifts: Shift[], id: string, now = new Date()): void {
  const shift = shifts.find((s) => s.id === id);
  if (shift && !shift.deletedAt) shift.deletedAt = now.toISOString();
}
export function restoreShift(shifts: Shift[], id: string, now = Date.now()): void {
  const shift = shifts.find((s) => s.id === id);
  if (!shift?.deletedAt) return;
  if (isTrashExpired(shift, now)) throw new Error("Срок восстановления истёк");
  delete shift.deletedAt;
}
export function purgeShift(shifts: Shift[], id: string): void {
  const index = shifts.findIndex((s) => s.id === id && s.deletedAt);
  if (index >= 0) shifts.splice(index, 1);
}
export function clearTrash(shifts: Shift[]): void {
  for (let i = shifts.length - 1; i >= 0; i--) if (shifts[i]?.deletedAt) shifts.splice(i, 1);
}
/** Adjust only entered actual components; preserve the confirmed payroll remainder.
 * Never infer commission from revenue or actual hourly pay from today's rates. */
export function reconcileConfirmedEdit(original: Shift | undefined, edited: Shift): Shift {
  if (!original || original.earnings === null) return { ...edited, earnings: null };
  const entries = (s: Shift) => new Map([
    ["base", s.basePay], ["tips", s.tips], ["commission", s.commissionPay ?? null],
    ...s.bonuses.map((a) => [`bonus:${a.id}`, a.amount] as const),
    ...s.penalties.map((a) => [`penalty:${a.id}`, a.amount === null ? null : -a.amount] as const),
  ]);
  const before = entries(original), after = entries(edited);
  let total = original.earnings;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.has(key) ? before.get(key) : 0;
    const b = after.has(key) ? after.get(key) : 0;
    if (a === b) continue;
    if (a == null || b == null) return { ...edited, earnings: null };
    total += b - a;
  }
  return { ...edited, earnings: total };
}