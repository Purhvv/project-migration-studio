import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";
import { db } from "@/data/mock";
import type { Shift } from "@/lib/types";

const shift: Shift = { id: "existing", workplaceId: "w1", date: "2026-11-06", start: "22:00", end: "02:00", status: "planned", earnings: null, basePay: null, revenue: null, tips: null, bonuses: [], penalties: [] };
function setup() {
  db.shifts = [structuredClone(shift)];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["shifts"], structuredClone(db.shifts));
  const cancel = vi.fn();
  const hook = renderHook(() => useShiftSaveGuard(cancel), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...hook, cancel };
}
describe("shift save gate", () => {
  it("does not create an overlapping night shift before explicit override", async () => {
    const { result } = setup();
    const done = vi.fn();
    const candidate = { ...shift, id: "new", workplaceId: "w2", date: "2026-11-07", start: "01:00", end: "05:00" };
    act(() => result.current.saveShift(candidate, done));
    expect(result.current.warning.conflicts[0]?.minutes).toBe(60);
    expect(db.shifts).toHaveLength(1);
    act(() => result.current.warning.onSave());
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(db.shifts?.find((s) => s.id === "new")?.start).toBe("01:00");
  });
  it("fix and cancel discard the pending write", () => {
    const { result, cancel } = setup();
    act(() => result.current.saveShift({ ...shift, id: "new" }, vi.fn()));
    act(() => result.current.warning.onFix());
    expect(result.current.warning.conflicts).toEqual([]);
    expect(db.shifts).toHaveLength(1);
    act(() => result.current.saveShift({ ...shift, id: "new" }, vi.fn()));
    act(() => result.current.warning.onCancel());
    expect(cancel).toHaveBeenCalledOnce();
    expect(db.shifts).toHaveLength(1);
  });
  it("rechecks date edits and replaces rather than duplicates the shift", async () => {
    const { result } = setup();
    const original = { ...shift, id: "edit", date: "2026-11-08" };
    db.shifts?.push(original);
    const done = vi.fn();
    act(() => result.current.saveShift({ ...original, date: "2026-11-06" }, done));
    expect(result.current.warning.conflicts).toHaveLength(1);
    expect(db.shifts?.find((s) => s.id === "edit")?.date).toBe("2026-11-08");
    act(() => result.current.warning.onSave());
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(db.shifts?.filter((s) => s.id === "edit")).toHaveLength(1);
    expect(db.shifts?.find((s) => s.id === "edit")?.date).toBe("2026-11-06");
  });
});