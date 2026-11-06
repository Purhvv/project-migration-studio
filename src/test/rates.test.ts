import { describe, expect, it } from "vitest";
import { estimatePay, forecast } from "@/lib/rates";
import type { Shift, Workplace } from "@/lib/types";

const rates = [
  { id: "a", start: "10:00", end: "18:00", hourly: 250 },
  { id: "b", start: "18:00", end: "02:00", hourly: 300 },
];
const wp: Workplace[] = [
  { id: "w1", name: "A", color: "sky", rates },
  { id: "w2", name: "B", color: "green", rates: [] },
];
const shift = (p: Partial<Shift>): Shift => ({
  id: Math.random().toString(), workplaceId: "w1", date: "2026-11-10", start: "12:00", end: "20:00", status: "planned",
  revenue: null, tips: null, basePay: null, bonuses: [], penalties: [], earnings: null, ...p,
});

describe("estimatePay", () => {
  it("applies each interval's rate", () => {
    // 6h × 250 + 2h × 300
    expect(estimatePay(rates, "2026-11-10", "12:00", "20:00")).toMatchObject({ kind: "ok", amount: 2100 });
  });
  it("recalculates when the end time changes", () => {
    expect(estimatePay(rates, "2026-11-10", "12:00", "22:00").amount).toBe(2700);
  });
  it("handles overnight windows", () => {
    expect(estimatePay(rates, "2026-11-10", "22:00", "02:00").amount).toBe(1200);
  });
  it("warns about time not covered by rates", () => {
    expect(estimatePay(rates, "2026-11-10", "08:00", "12:00")).toMatchObject({ kind: "partial", amount: 500, uncoveredMinutes: 120 });
  });
  it("gives no amount when rates are missing", () => {
    expect(estimatePay([], "2026-11-10", "08:00", "12:00")).toMatchObject({ kind: "no_rates", amount: null });
  });
});

describe("forecast", () => {
  it("adds estimates of upcoming shifts to actual earnings without counting completed shifts twice", () => {
    const shifts = [shift({}), shift({ status: "completed", earnings: 5000 })];
    const f = forecast(shifts, wp, { value: 5000, partial: false });
    expect(f.estimated).toBe(2100);
    expect(f.total).toBe(7100);
  });
  it("excludes cancelled shifts and flags shifts without rates", () => {
    const f = forecast([shift({ status: "cancelled" }), shift({ workplaceId: "w2" })], wp, { value: null, partial: false });
    expect(f.estimated).toBe(0);
    expect(f.missing).toBe(1);
    expect(f.total).toBeNull();
  });
});
