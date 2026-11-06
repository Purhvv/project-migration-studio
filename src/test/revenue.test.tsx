import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { workplaceRevenue, revenueByWorkplace, workplaceRevenueSeries } from "@/lib/revenue";
import { summarize } from "@/lib/summary";
import { chartSeries } from "@/lib/analytics";
import { moveToTrash, restoreShift, reconcileConfirmedEdit } from "@/lib/shift-management";
import { db } from "@/data/mock";
import { useUpdateRevenueGoal } from "@/data/queries";
import type { Shift, Workplace } from "@/lib/types";

const workplaces: Workplace[] = [
  { id: "w1", name: "Белуга", color: "sky", rates: [], revenueGoal: 100000 },
  { id: "w2", name: "Surf", color: "green", rates: [], revenueGoal: 150000 },
];
const shift: Shift = { id: "a", workplaceId: "w1", date: "2026-11-02", start: "10:00", end: "18:00", status: "completed", revenue: 80000, earnings: 3500, basePay: 2000, tips: 1000, commissionPay: 500, bonuses: [], penalties: [] };
const shifts = () => [structuredClone(shift), { ...structuredClone(shift), id: "b", workplaceId: "w2", revenue: 60000, commissionPay: 300 }];
describe("independent workplace revenue", () => {
  it("keeps Beluga 80000 and Surf 60000 separate", () => {
    expect(revenueByWorkplace(shifts(), workplaces).map((r) => r.revenue.value)).toEqual([80000, 60000]);
    expect(summarize(shifts()).revenue.value).toBeNull();
    expect(chartSeries(shifts(), false)[0]?.revenue).toBeNull();
    expect(summarize(shifts()).earnings.value).toBe(7000);
    expect(summarize(shifts()).tips.value).toBe(2000);
  });
  it("keeps different targets and 80% / 40% progress", () => {
    expect(revenueByWorkplace(shifts(), workplaces).map((r) => [r.target, r.progress])).toEqual([
      [100000, { percent: 80, remaining: 20000 }], [150000, { percent: 40, remaining: 90000 }],
    ]);
  });
  it("supplies both workplaces to all-workplace home and statistics views", () => {
    expect(revenueByWorkplace(shifts(), workplaces, "all").map((r) => r.workplace.id)).toEqual(["w1", "w2"]);
  });
  it("selected workplace removes every other metric and chart series", () => {
    expect(revenueByWorkplace(shifts(), workplaces, "w2").map((r) => r.revenue.value)).toEqual([60000]);
    expect(workplaceRevenueSeries(shifts(), workplaces, false, "w2")[0]).toMatchObject({ workplace0: 60000 });
    expect(workplaceRevenueSeries(shifts(), workplaces, false, "w2")[0]?.details).toHaveLength(1);
  });
  it("chart uses separate 80000 / 60000 lines on the same date", () => {
    expect(workplaceRevenueSeries(shifts(), workplaces, false)[0]).toMatchObject({ workplace0: 80000, workplace1: 60000 });
  });
  it("monthly history never adds other workplaces", () => {
    const rows = [...shifts(), { ...shift, id: "oct", date: "2026-10-02", revenue: 10000 }];
    expect(workplaceRevenueSeries(rows, workplaces, true).map((r) => [r.workplace0, r.workplace1])).toEqual([[10000, null], [80000, 60000]]);
  });
  it("one goal can be achieved without achieving another", () => {
    expect(revenueByWorkplace([{ ...shift, revenue: 100000 }, shifts()[1] as Shift], workplaces).map((r) => r.progress?.remaining)).toEqual([0, 90000]);
  });
  it("goal mutation changes only its workplace", async () => {
    const original = structuredClone(db.workplaces);
    db.workplaces = structuredClone(workplaces);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useUpdateRevenueGoal(), { wrapper });
    try {
      await act(async () => { await hook.result.current.mutateAsync({ workplaceId: "w1", value: 200000 }); });
      await waitFor(() => expect(db.workplaces[0]?.revenueGoal).toBe(200000));
      expect(db.workplaces[1]?.revenueGoal).toBe(150000);
    } finally { hook.unmount(); client.clear(); db.workplaces = original; }
  });
  it("moving a shift updates source and destination independently", () => {
    const rows = shifts(); rows[0] = { ...shift, workplaceId: "w2" };
    expect(revenueByWorkplace(rows, workplaces).map((r) => r.revenue.value)).toEqual([null, 140000]);
  });
  it("trash and restoration remove and restore only original revenue", () => {
    const rows = shifts(); moveToTrash(rows, "a");
    expect(revenueByWorkplace(rows, workplaces).map((r) => r.revenue.value)).toEqual([null, 60000]);
    restoreShift(rows, "a");
    expect(revenueByWorkplace(rows, workplaces).map((r) => r.revenue.value)).toEqual([80000, 60000]);
  });
  it("unknown revenue is null and known partial revenue stays incomplete", () => {
    expect(workplaceRevenue([{ ...shift, revenue: null }], "w1")).toMatchObject({ value: null, partial: true });
    expect(workplaceRevenue([shift, { ...shift, id: "unknown", revenue: null }], "w1")).toMatchObject({ value: 80000, partial: true, perShift: 80000, perHour: 10000 });
  });
  it("excludes cancelled and unfinished shifts", () => {
    expect(workplaceRevenue([{ ...shift, status: "cancelled" }, { ...shift, status: "pending" }], "w1").value).toBeNull();
  });
  it("revenue edits never infer or alter commission for either workplace", () => {
    const rows = shifts(); rows[0] = reconcileConfirmedEdit(shift, { ...shift, revenue: 100000 });
    expect(rows.map((r) => r.commissionPay)).toEqual([500, 300]);
    expect(rows.map((r) => r.earnings)).toEqual([3500, 3500]);
  });
  it("single workplace retains its own compact result", () => {
    expect(revenueByWorkplace([shift], [workplaces[0] as Workplace])).toHaveLength(1);
    expect(revenueByWorkplace([shift], [workplaces[0] as Workplace])[0]?.revenue.value).toBe(80000);
  });
  it("third workplace appears without inventing a goal or revenue", () => {
    const third: Workplace = { id: "w3", name: "Третье", color: "rose", rates: [] };
    const result = revenueByWorkplace(shifts(), [...workplaces, third]);
    expect(result).toHaveLength(3);
    expect(result[2]).toMatchObject({ target: null, progress: null, revenue: { value: null } });
  });
  it("month transfer updates each month's history", () => {
    const rows = shifts(); rows[0] = { ...shift, date: "2026-12-02" };
    expect(workplaceRevenueSeries(rows, workplaces, true).map((r) => [r.workplace0, r.workplace1])).toEqual([[null, 60000], [80000, null]]);
  });
});