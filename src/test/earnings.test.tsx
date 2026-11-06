import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Shift } from "@/lib/types";
import { computeEarnings, reconcileConfirmedEdit } from "@/lib/shift-management";
import { db } from "@/data/mock";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";

const base: Shift = {
  id: "s1", workplaceId: "w1", date: "2026-11-06", start: "12:00", end: "20:00", status: "completed",
  revenue: null, tips: null, basePay: null, earnings: null, bonuses: [], penalties: [],
};

describe("computeEarnings — single earnings formula", () => {
  it("ordinary shift: base pay + tips", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 1200 })).toBe(3200);
  });
  it("shift with confirmed commission", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 1200, commissionPay: 500 })).toBe(3700);
  });
  it("shift with several bonuses", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 0, bonuses: [{ id: "a", label: "Премия", amount: 700 }, { id: "b", label: "Доплата", amount: 300 }] })).toBe(3000);
  });
  it("shift with several penalties", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 0, penalties: [{ id: "a", label: "Опоздание", amount: 200 }, { id: "b", label: "Удержание", amount: 300 }] })).toBe(1500);
  });
  it("all components combined", () => {
    expect(computeEarnings({
      ...base, basePay: 2000, tips: 1200, commissionPay: 500,
      bonuses: [{ id: "a", label: "Премия", amount: 700 }, { id: "b", label: "Доплата", amount: 100 }],
      penalties: [{ id: "c", label: "Штраф", amount: 200 }],
    })).toBe(4300);
  });
  it("unknown tips make the total unknown, not zero", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: null })).toBeNull();
  });
  it("unknown commission makes the total unknown; unrecorded commission contributes nothing", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 1000, commissionPay: null })).toBeNull();
    expect(computeEarnings({ ...base, basePay: 2000, tips: 1000 })).toBe(3000);
  });
  it("unknown base pay makes the total unknown", () => {
    expect(computeEarnings({ ...base, basePay: null, tips: 1000 })).toBeNull();
  });
  it("unknown bonus or penalty amount makes the total unknown", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 0, bonuses: [{ id: "a", label: "Премия", amount: null }] })).toBeNull();
    expect(computeEarnings({ ...base, basePay: 2000, tips: 0, penalties: [{ id: "a", label: "Штраф", amount: null }] })).toBeNull();
  });
  it("empty adjustment lists mean no accruals or deductions", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 500, bonuses: [], penalties: [] })).toBe(2500);
  });
  it("explicit zero stays zero and differs from unknown", () => {
    expect(computeEarnings({ ...base, basePay: 2000, tips: 0 })).toBe(2000);
    expect(computeEarnings({ ...base, basePay: 2000, tips: null })).toBeNull();
  });
});

describe("unified formula across scenarios", () => {
  const planned: Shift = { ...base, id: "p1", status: "planned" };
  function setup(rows: Shift[]) {
    db.shifts = structuredClone(rows);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["shifts"], structuredClone(rows));
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { wrapper };
  }
  it("completing a planned shift uses the same formula", async () => {
    const { wrapper } = setup([planned]);
    const { result } = renderHook(() => useShiftSaveGuard(vi.fn()), { wrapper });
    const completed: Shift = { ...planned, status: "completed", basePay: 2000, tips: 1200, commissionPay: 500, bonuses: [{ id: "b", label: "Премия", amount: 300 }], penalties: [{ id: "p", label: "Штраф", amount: 100 }] };
    const done = vi.fn();
    act(() => result.current.saveShift({ ...completed, earnings: computeEarnings(completed) }, done));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(db.shifts?.[0]).toMatchObject({ status: "completed", earnings: 3900 });
  });
  it("completing with unknown tips stores an unknown total, not a partial one", async () => {
    const { wrapper } = setup([planned]);
    const { result } = renderHook(() => useShiftSaveGuard(vi.fn()), { wrapper });
    const completed: Shift = { ...planned, status: "completed", basePay: 2000, tips: null };
    const done = vi.fn();
    act(() => result.current.saveShift({ ...completed, earnings: computeEarnings(completed) }, done));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(db.shifts?.[0]?.earnings).toBeNull();
  });
  it("editing a confirmed shift reconciles against the same components without double counting", () => {
    const confirmed: Shift = { ...base, basePay: 2000, tips: 1200, commissionPay: 500, bonuses: [{ id: "b", label: "Премия", amount: 300 }], penalties: [], earnings: computeEarnings({ ...base, basePay: 2000, tips: 1200, commissionPay: 500, bonuses: [{ id: "b", label: "Премия", amount: 300 }], penalties: [] }) };
    expect(confirmed.earnings).toBe(4000);
    const edited = reconcileConfirmedEdit(confirmed, { ...confirmed, tips: 1500 });
    expect(edited.earnings).toBe(4300);
    // Re-applying the same edit must not add the delta twice.
    expect(reconcileConfirmedEdit(edited, edited).earnings).toBe(4300);
  });
  it("re-saving a completed shift keeps earnings without double accrual", async () => {
    const confirmed: Shift = { ...base, basePay: 2000, tips: 1200, commissionPay: 500, bonuses: [], penalties: [], earnings: 3700 };
    const { wrapper } = setup([confirmed]);
    const { result } = renderHook(() => useShiftSaveGuard(vi.fn()), { wrapper });
    const done = vi.fn();
    act(() => result.current.saveShift(confirmed, done));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    act(() => result.current.saveShift(confirmed, done));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(2));
    expect(db.shifts).toHaveLength(1);
    expect(db.shifts?.[0]?.earnings).toBe(3700);
  });
});
