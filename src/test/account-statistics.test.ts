import { describe, expect, it } from "vitest";
import { accountShiftSummary, accountWorkplaceRevenue, completedAccountShifts } from "@/lib/account-statistics";
import type { AccountShift } from "@/lib/account-shifts";

const shift = (patch: Partial<AccountShift> = {}): AccountShift => ({
  id: "past", workplace_id: "bar", local_start_date: "2026-11-12", local_end_date: "2026-11-12",
  start_time: "10:00", end_time: "17:00", starts_at: "2026-11-12T07:00:00Z", ends_at: "2026-11-12T14:00:00Z",
  status: "completed", earnings: 3380, base_pay: 2100, revenue: 12000, tips: 500,
  comment: null, revision: 1, revenue_revision: 1, ...patch,
});

describe("saved personal shifts in home and statistics", () => {
  it("includes confirmed components when unknown revenue makes the final total unknown", () => {
    const saved = shift({ revenue: null, earnings: null, confirmed_earnings: { value: 3050, partial: true } });
    expect(accountShiftSummary([saved]).earnings).toEqual({ value: 3050, partial: true });
    expect(accountShiftSummary([saved, shift()]).earnings).toEqual({ value: 6430, partial: true });
    expect(accountWorkplaceRevenue([saved], "bar", "2026-11")).toEqual({ value: null, partial: true });
  });
  it("includes a saved past completed shift in monthly earnings and recent history", () => {
    const saved = shift();
    const input = [saved, shift({ id: "planned", status: "planned", earnings: 99999 }), shift({ id: "cancelled", status: "cancelled" })];
    expect(completedAccountShifts(input, "2026-11", "Europe/Moscow").map((s) => s.id)).toEqual(["past"]);
    expect(completedAccountShifts(input, null, "Europe/Moscow")).toEqual([saved]);
    expect(accountShiftSummary(input)).toEqual({ count: 1, minutes: 420, earnings: { value: 3380, partial: false }, tips: { value: 500, partial: false } });
  });
  it("keeps unknown earnings unknown and sums only stored confirmed totals", () => {
    expect(accountShiftSummary([shift({ earnings: null })]).earnings).toEqual({ value: null, partial: true });
    expect(accountShiftSummary([shift(), shift({ earnings: null })]).earnings).toEqual({ value: 3380, partial: true });
    expect(accountShiftSummary([]).earnings.value).toBeNull();
    expect(accountShiftSummary([shift({ earnings: 0 })]).earnings.value).toBe(0);
  });
  it("filters workplace and month and orders recent completed shifts newest first", () => {
    const rows = [shift(), shift({ id: "older", starts_at: "2026-10-12T07:00:00Z" }), shift({ id: "other", workplace_id: "cafe" })];
    expect(completedAccountShifts(rows, "2026-11", "Europe/Moscow", "bar").map((s) => s.id)).toEqual(["past"]);
    expect(completedAccountShifts(rows, null, "Europe/Moscow", "bar").map((s) => s.id)).toEqual(["past", "older"]);
  });
  it("uses profile timezone for earnings and workplace start month for independent revenue", () => {
    const boundary = shift({ starts_at: "2026-10-31T22:00:00Z", local_start_date: "2026-10-31" });
    expect(completedAccountShifts([boundary], "2026-11", "Europe/Moscow")).toHaveLength(1);
    expect(completedAccountShifts([boundary], "2026-11", "UTC")).toHaveLength(0);
    const rows = [boundary, shift({ workplace_id: "cafe", revenue: 99000 })];
    expect(accountWorkplaceRevenue(rows, "bar", "2026-10").value).toBe(12000);
    expect(accountWorkplaceRevenue(rows, "bar", "2026-11").value).toBeNull();
    expect(accountWorkplaceRevenue(rows, "cafe", "2026-11").value).toBe(99000);
  });
});