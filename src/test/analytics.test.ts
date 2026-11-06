import { describe, expect, it } from "vitest";
import { adjustmentHistory, chartSeries, goalProgress, incomeStructure, weekdaySeries } from "@/lib/analytics";
import type { Shift } from "@/lib/types";
const shift: Shift = { id: "a", workplaceId: "w1", date: "2026-11-02", start: "10:00", end: "18:00", status: "completed", revenue: 12500, basePay: 2000, tips: 1000, earnings: 3500, commissionPay: 0, bonuses: [{ id: "b", label: "Премия", amount: 1000 }], penalties: [{ id: "p", label: "Штраф", amount: 500 }] };
describe("statistics rules", () => {
  it("keeps unknown chart values null, not zero", () => {
    expect(chartSeries([{ ...shift, earnings: null, revenue: null }], false)[0]).toMatchObject({ earnings: null, revenue: null });
  });
  it("aggregates confirmed period money, shifts and hours", () => {
    expect(chartSeries([shift, { ...shift, id: "b" }], true)[0]).toMatchObject({ earnings: 7000, revenue: 25000, shifts: 2, minutes: 960 });
  });
  it("distinguishes weekdays without data from real zero earnings", () => {
    const rows = weekdaySeries([{ ...shift, earnings: 0 }]);
    expect(rows[0]?.value).toBe(0);
    expect(rows[1]?.value).toBeNull();
    expect(rows.map((x) => x.label)).toEqual(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);
  });
  it("keeps penalties out of positive structure and reconciles total", () => {
    const s = incomeStructure([shift]);
    expect(s.gross).toBe(4000);
    expect(s.penalties.value).toBe(500);
    expect(s.total).toBe(3500);
    expect(s.remainder).toBe(0);
    expect(s.rows.some((x) => x.name.includes("Штраф"))).toBe(false);
  });
  it("never infers commission from personal revenue", () => {
    expect(incomeStructure([{ ...shift, commissionPay: null }]).rows[1]?.value).toBeNull();
  });
  it("shows each adjustment separately newest first", () => {
    const rows = adjustmentHistory([shift, { ...shift, id: "new", date: "2026-11-05", bonuses: [{ id: "b1", label: "A", amount: 100 }, { id: "b2", label: "B", amount: 200 }] }], "bonuses");
    expect(rows.map((x) => x.operation.id)).toEqual(["b1", "b2", "b"]);
  });
  it("goals calculate independent progress and do not invent unknown results", () => {
    expect(goalProgress(12500, 25000)).toEqual({ percent: 50, remaining: 12500 });
    expect(goalProgress(1000, 1000)).toEqual({ percent: 100, remaining: 0 });
    expect(goalProgress(null, 25000)).toBeNull();
  });
});