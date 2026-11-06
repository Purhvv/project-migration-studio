import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Shift } from "@/lib/types";
import { activeShifts, clearTrash, expiredTrashIds, isTrashExpired, moveToTrash, purgeShift, reconcileConfirmedEdit, restoreShift, trashedShifts } from "@/lib/shift-management";
import { summarize } from "@/lib/summary";
import { forecast } from "@/lib/rates";
import { db } from "@/data/mock";
import { shiftsQuery, trashQuery, useRestoreShift, useSaveShift, useTrashShift } from "@/data/queries";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";
import { findShiftConflicts } from "@/lib/overlaps";

const sample = (): Shift => ({ id: "s1", workplaceId: "w1", date: "2026-11-06", start: "12:00", end: "18:00", status: "completed", earnings: 4200, basePay: 2000, revenue: 30000, tips: 1200, commissionPay: 500, bonuses: [{ id: "b", label: "Премия", amount: 700 }], penalties: [{ id: "p", label: "Штраф", amount: 200 }], comment: "Оригинал" });
function setup(rows: Shift[]) {
  db.shifts = structuredClone(rows);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["shifts"], activeShifts(structuredClone(rows)));
  client.setQueryData(["trash"], trashedShifts(structuredClone(rows)));
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
describe("shift editing", () => {
  it.each(["planned", "in_progress", "pending", "completed", "cancelled"] as const)("edits %s in place, preserving its ID", async (status) => {
    const initial = { ...sample(), status }; const { wrapper } = setup([initial]);
    const { result } = renderHook(() => useSaveShift(), { wrapper });
    await act(() => result.current.mutateAsync({ ...initial, comment: "Исправлено", start: "13:00" }));
    expect(db.shifts).toHaveLength(1); expect(db.shifts?.[0]).toMatchObject({ id: "s1", status, comment: "Исправлено", start: "13:00" });
  });
  it("updates workplace and month without applying current rates to confirmed payroll", async () => {
    const initial = sample(); const { wrapper } = setup([initial]); const { result } = renderHook(() => useSaveShift(), { wrapper });
    await act(() => result.current.mutateAsync(reconcileConfirmedEdit(initial, { ...initial, workplaceId: "w2", date: "2026-12-01" })));
    expect(db.shifts?.[0]).toMatchObject({ workplaceId: "w2", date: "2026-12-01", earnings: 4200 });
    expect(summarize(activeShifts(db.shifts ?? []).filter(s => s.date.startsWith("2026-11"))).shifts).toBe(0);
    expect(summarize(activeShifts(db.shifts ?? []).filter(s => s.date.startsWith("2026-12"))).earnings.value).toBe(4200);
  });
  it("updates personal revenue without inventing commission", () => {
    const initial = sample(); const updated = reconcileConfirmedEdit(initial, { ...initial, revenue: 60000 });
    expect(updated.revenue).toBe(60000); expect(updated.commissionPay).toBe(500); expect(updated.earnings).toBe(4200);
    expect(summarize([updated]).revenue.value).toBe(60000);
  });
  it("updates tips, adds/edits/removes bonuses and penalties without losing the payroll remainder", () => {
    const initial = sample();
    const updated = reconcileConfirmedEdit(initial, { ...initial, tips: 1500, bonuses: [{ id: "b", label: "Премия", amount: 900 }, { id: "new", label: "Доплата", amount: 100 }], penalties: [] });
    expect(updated.earnings).toBe(5000);
    expect(reconcileConfirmedEdit(updated, { ...updated, bonuses: [], penalties: [{ id: "new-p", label: "Удержание", amount: 300 }] }).earnings).toBe(3700);
  });
  it("keeps unknown earnings and adjustments unknown", () => {
    const initial = { ...sample(), earnings: null, tips: null };
    expect(reconcileConfirmedEdit(initial, { ...initial, tips: 1000 }).earnings).toBeNull();
    const known = sample(); expect(reconcileConfirmedEdit(known, { ...known, bonuses: [{ id: "b", label: "Премия", amount: null }] }).earnings).toBeNull();
    expect(reconcileConfirmedEdit(known, { ...known, revenue: null }).revenue).toBeNull();
  });
});
describe("trash lifecycle", () => {
  it.each(["planned", "in_progress", "pending", "completed", "cancelled"] as const)("soft deletes %s without changing original status or amounts", (status) => {
    const original = { ...sample(), status }; const rows = [structuredClone(original)];
    moveToTrash(rows, "s1", new Date("2026-11-06T12:00:00Z"));
    expect(activeShifts(rows)).toHaveLength(0); expect(rows[0]).toEqual({ ...original, deletedAt: "2026-11-06T12:00:00.000Z" });
  });
  it("excludes trash from actual earnings, revenue, hours, count and forecast", () => {
    const rows = [sample(), { ...sample(), id: "planned", status: "planned" as const, earnings: null }];
    moveToTrash(rows, "s1"); moveToTrash(rows, "planned");
    expect(summarize(activeShifts(rows))).toMatchObject({ shifts: 0, minutes: 0, earnings: { value: null }, revenue: { value: null } });
    expect(forecast(activeShifts(rows), db.workplaces, { value: null, partial: false })).toMatchObject({ upcoming: 0, estimated: 0 });
  });
  it("restores original financial data and status exactly, idempotently", () => {
    const original = sample(); const rows = [structuredClone(original)];
    moveToTrash(rows, "s1"); restoreShift(rows, "s1"); restoreShift(rows, "s1");
    expect(rows).toEqual([original]); expect(summarize(activeShifts(rows)).earnings.value).toBe(4200);
  });
  it("repeated deletion preserves its initial timestamp and never changes workplaces", () => {
    const workplaces = structuredClone(db.workplaces); const rows = [sample()];
    moveToTrash(rows, "s1", new Date("2026-11-06T12:00:00Z")); moveToTrash(rows, "s1", new Date("2026-11-07T12:00:00Z"));
    expect(rows[0]?.deletedAt).toBe("2026-11-06T12:00:00.000Z"); expect(db.workplaces).toEqual(workplaces);
  });
  it("permanent deletion is idempotent and never removes active rows", () => {
    const rows = [sample(), { ...sample(), id: "keep" }]; moveToTrash(rows, "s1"); purgeShift(rows, "s1"); purgeShift(rows, "s1"); purgeShift(rows, "keep");
    expect(rows.map(s => s.id)).toEqual(["keep"]);
  });
  it("clears only trash", () => {
    const rows = [sample(), { ...sample(), id: "keep" }, { ...sample(), id: "trash2" }]; moveToTrash(rows, "s1"); moveToTrash(rows, "trash2"); clearTrash(rows); clearTrash(rows);
    expect(rows.map(s => s.id)).toEqual(["keep"]);
  });
  it("expires at exactly 30 days, detects candidates but does not simulate automatic purging", () => {
    const rows = [sample()]; const deleted = Date.parse("2026-11-06T12:00:00Z"); moveToTrash(rows, "s1", new Date(deleted));
    const day30 = Date.parse("2026-12-06T12:00:00Z");
    expect(isTrashExpired(rows[0] ?? sample(), day30 - 1)).toBe(false); expect(isTrashExpired(rows[0] ?? sample(), day30)).toBe(true);
    expect(expiredTrashIds(rows, day30)).toEqual(["s1"]); expect(rows).toHaveLength(1); expect(() => restoreShift(rows, "s1", day30)).toThrow("Срок восстановления истёк");
  });
  it("sorts recently deleted first", () => {
    const rows = [sample(), { ...sample(), id: "recent" }]; moveToTrash(rows, "s1", new Date("2026-11-05")); moveToTrash(rows, "recent", new Date("2026-11-06"));
    expect(trashedShifts(rows).map(s => s.id)).toEqual(["recent", "s1"]);
  });
  it("requires explicit override to restore conflicting shifts, then restores once", async () => {
    const original = { ...sample(), deletedAt: new Date().toISOString() }; const { wrapper } = setup([original, { ...sample(), id: "other", workplaceId: "w2" }]);
    const { result } = renderHook(() => useShiftSaveGuard(vi.fn(), "restore"), { wrapper }); const done = vi.fn();
    act(() => result.current.saveShift(original, done)); expect(result.current.warning.conflicts[0]?.minutes).toBe(360); expect(activeShifts(db.shifts ?? [])).toHaveLength(1);
    act(() => result.current.warning.onSave()); await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(activeShifts(db.shifts ?? [])).toHaveLength(2); expect(db.shifts?.filter(s => s.id === "s1")).toHaveLength(1);
  });
  it("allows correcting restoration time before the same conflict gate", async () => {
    const original = { ...sample(), deletedAt: new Date().toISOString() }; const { wrapper } = setup([original, { ...sample(), id: "other" }]);
    const { result } = renderHook(() => useShiftSaveGuard(vi.fn(), "restore"), { wrapper }); const done = vi.fn();
    act(() => result.current.saveShift(original, done)); act(() => result.current.warning.onFix());
    act(() => result.current.saveShift({ ...original, start: "18:00", end: "20:00" }, done)); await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(db.shifts?.find(s => s.id === "s1")).toMatchObject({ start: "18:00", end: "20:00", tips: 1200, comment: "Оригинал" });
  });
  it("blocks restoration after expiry at mutation time", async () => {
    const expired = { ...sample(), deletedAt: "2000-01-01T00:00:00Z" }; const { wrapper } = setup([expired]); const { result } = renderHook(() => useRestoreShift(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync(expired)).rejects.toThrow("Срок восстановления истёк"); });
    expect(activeShifts(db.shifts ?? [])).toHaveLength(0);
  });
  it("invalidates active and trash query results after a delete", async () => {
    const { wrapper, client } = setup([sample()]); const { result } = renderHook(() => useTrashShift(), { wrapper });
    await act(() => result.current.mutateAsync("s1"));
    expect(await client.fetchQuery(shiftsQuery)).toEqual([]); expect((await client.fetchQuery(trashQuery))[0]?.id).toBe("s1");
  });
  it("ignores deleted shifts during active conflict checks", () => {
    const rows = [sample()]; moveToTrash(rows, "s1");
    expect(findShiftConflicts({ ...sample(), id: "new" }, rows)).toEqual([]);
  });
});