import { describe, expect, it } from "vitest";
import { allShiftConflicts, conflictTouchesDate, findShiftConflicts } from "@/lib/overlaps";
import type { Shift } from "@/lib/types";
const s: Shift = { id: "a", workplaceId: "w1", date: "2026-11-06", start: "10:00", end: "18:00", status: "planned", earnings: null, basePay: null, revenue: null, tips: null, bonuses: [], penalties: [] };
describe("shift overlaps", () => {
  it("detects two hours across workplaces", () => {
    const c = findShiftConflicts(s, [{ ...s, id: "b", workplaceId: "w2", start: "16:00", end: "23:00" }])[0];
    expect(c?.minutes).toBe(120);
    expect(c?.start).toBe(Date.parse("2026-11-06T16:00:00Z"));
    expect(c?.end).toBe(Date.parse("2026-11-06T18:00:00Z"));
  });
  it("checks same workplace and multiple conflicts", () => {
    expect(findShiftConflicts(s, [{ ...s, id: "b" }, { ...s, id: "c" }])).toHaveLength(2);
  });
  it("ignores self, cancelled shifts and touching endpoints", () => {
    expect(findShiftConflicts(s, [s, { ...s, id: "b", status: "cancelled" }, { ...s, id: "c", start: "18:00", end: "23:00" }])).toEqual([]);
    expect(findShiftConflicts({ ...s, status: "cancelled" }, [{ ...s, id: "b" }])).toEqual([]);
  });
  it("detects overlaps across midnight and different dates", () => {
    const list = allShiftConflicts([{ ...s, start: "22:00", end: "02:00" }, { ...s, id: "b", date: "2026-11-07", start: "01:00", end: "05:00" }]);
    expect(list).toHaveLength(1);
    const conflict = list[0];
    expect(conflict?.minutes).toBe(60);
    if (!conflict) throw new Error("Expected conflict");
    expect(conflictTouchesDate(conflict, "2026-11-07")).toBe(true);
    expect(conflictTouchesDate(conflict, "2026-11-06")).toBe(false);
  });
  it("rechecks date, time and workplace edits without mutating old shifts", () => {
    const old = { ...s, id: "b", date: "2026-11-07" };
    expect(findShiftConflicts(s, [old])).toHaveLength(0);
    expect(findShiftConflicts({ ...s, date: "2026-11-07", workplaceId: "w2" }, [old])).toHaveLength(1);
    expect(old.date).toBe("2026-11-07");
    expect(old.start).toBe("10:00");
  });
});