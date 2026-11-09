import { describe, expect, it } from "vitest";
import {
  classifyShiftTiming, cleanMoney, estimateAccountPay, findAccountConflicts, localToUtc, shiftCancelPayload, shiftCompletePayload,
  shiftCreateCompletedPayload, shiftCreatePayload, shiftDeletePayload, shiftEditPayload, shiftEndDate, shiftStartPayload,
  validateShiftWrite, type AccountShift,
} from "@/lib/account-shifts";
import type { AccountWorkplace } from "@/lib/account-settings";

const workplace = { id: "11111111-1111-1111-1111-111111111111", timezone: "Europe/Moscow" } as AccountWorkplace;
const time = { workplace, date: "2026-11-10", start: "12:00", end: "22:00" };

const shift = (patch: Partial<AccountShift>): AccountShift => ({
  id: "22222222-2222-2222-2222-222222222222",
  workplace_id: workplace.id,
  local_start_date: "2026-11-10",
  local_end_date: "2026-11-10",
  start_time: "12:00",
  end_time: "22:00",
  starts_at: "2026-11-10T09:00:00.000Z",
  ends_at: "2026-11-10T19:00:00.000Z",
  status: "planned",
  revenue: null, tips: null, base_pay: null, earnings: null, comment: null,
  revision: 1, revenue_revision: 1,
  ...patch,
});

describe("localToUtc", () => {
  it("converts Moscow wall clock to UTC", () => {
    expect(localToUtc("2026-11-10", "12:00", "Europe/Moscow")).toBe("2026-11-10T09:00:00.000Z");
  });
  it("handles overnight end on the next local day", () => {
    expect(localToUtc("2026-11-11", "02:00", "Europe/Moscow")).toBe("2026-11-10T23:00:00.000Z");
  });
  it("rejects invalid input", () => {
    expect(() => localToUtc("not-a-date", "12:00", "Europe/Moscow")).toThrow();
  });
});

describe("shiftEndDate", () => {
  it("keeps the date for same-day shifts", () => {
    expect(shiftEndDate("2026-11-10", "12:00", "22:00")).toBe("2026-11-10");
  });
  it("moves to the next day when the shift crosses midnight", () => {
    expect(shiftEndDate("2026-11-10", "22:00", "06:00")).toBe("2026-11-11");
    expect(shiftEndDate("2026-12-31", "23:00", "01:00")).toBe("2027-01-01");
  });
});

describe("shift payloads", () => {
  it("create carries the complete time set with NULL money and empty adjustments", () => {
    const p = shiftCreatePayload(time, "  ночная  ", () => "33333333-3333-3333-3333-333333333333");
    expect(p).toMatchObject({
      id: "33333333-3333-3333-3333-333333333333",
      workplace_id: workplace.id,
      local_start_date: "2026-11-10",
      local_end_date: "2026-11-10",
      start_time: "12:00",
      end_time: "22:00",
      starts_at: "2026-11-10T09:00:00.000Z",
      ends_at: "2026-11-10T19:00:00.000Z",
      revenue: null, tips: null, comment: "ночная",
      adjustments: [], fixed_payments: [], override_conflicts: false,
    });
  });
  it("create of an overnight shift sets the next local end date", () => {
    const p = shiftCreatePayload({ workplace, date: "2026-11-10", start: "22:00", end: "06:00" }, "", () => "33333333-3333-3333-3333-333333333333");
    expect(p.local_end_date).toBe("2026-11-11");
    expect(p.ends_at).toBe("2026-11-11T03:00:00.000Z");
    expect(p.comment).toBeNull();
  });
  it("edit carries expected_revision and omits revenue so stored money stays untouched", () => {
    const p = shiftEditPayload(shift({ revision: 7 }), time, "") as Record<string, unknown>;
    expect(p["expected_revision"]).toBe(7);
    expect("revenue" in p).toBe(false);
    expect("tips" in p).toBe(false);
  });
  it("status and delete payloads carry only identity and revision", () => {
    const s = shift({ revision: 3 });
    expect(shiftStartPayload(s)).toEqual({ id: s.id, expected_revision: 3, override_conflicts: false });
    expect(shiftDeletePayload(s)).toEqual({ id: s.id, expected_revision: 3 });
    expect(shiftCancelPayload(s)).toMatchObject({ id: s.id, expected_revision: 3, comment: null });
    expect(shiftCompletePayload(s)).toMatchObject({ id: s.id, expected_revision: 3, starts_at: s.starts_at, ends_at: s.ends_at });
  });
});

describe("validateShiftWrite (server boundary)", () => {
  it("accepts a well-formed create payload", () => {
    expect(() => validateShiftWrite("shift_create", shiftCreatePayload(time, "", () => "33333333-3333-3333-3333-333333333333"))).not.toThrow();
  });
  it("rejects non-UUID ids and bad revisions", () => {
    expect(() => validateShiftWrite("shift_create", { id: "x" })).toThrow();
    expect(() => validateShiftWrite("shift_delete", { id: "22222222-2222-2222-2222-222222222222", expected_revision: 0 })).toThrow();
  });
  it("rejects inverted or unparseable instants", () => {
    const p = { ...shiftCreatePayload(time, "", () => "33333333-3333-3333-3333-333333333333"), ends_at: "2026-11-10T08:00:00.000Z" };
    expect(() => validateShiftWrite("shift_create", p)).toThrow();
  });
  it("rejects override flags, money and adjustments this stage does not connect", () => {
    const base = shiftCreatePayload(time, "", () => "33333333-3333-3333-3333-333333333333");
    expect(() => validateShiftWrite("shift_create", { ...base, override_conflicts: true })).toThrow();
    expect(() => validateShiftWrite("shift_create", { ...base, revenue: "100" })).toThrow();
    expect(() => validateShiftWrite("shift_create", { ...base, adjustments: [{ kind: "bonus" }] })).toThrow();
  });
});

describe("classifyShiftTiming", () => {
  const now = Date.parse("2026-11-10T12:00:00.000Z");
  it("marks a fully ended shift as past, including overnight ones", () => {
    expect(classifyShiftTiming("2026-11-10T09:00:00.000Z", "2026-11-10T11:00:00.000Z", now)).toBe("past");
    expect(classifyShiftTiming("2026-11-09T19:00:00.000Z", "2026-11-10T03:00:00.000Z", now)).toBe("past");
  });
  it("marks a started but unfinished shift as current and a later one as future", () => {
    expect(classifyShiftTiming("2026-11-10T09:00:00.000Z", "2026-11-10T19:00:00.000Z", now)).toBe("current");
    expect(classifyShiftTiming("2026-11-10T13:00:00.000Z", "2026-11-10T19:00:00.000Z", now)).toBe("future");
  });
});

describe("cleanMoney", () => {
  it("keeps canonical decimal strings and maps empty input to NULL", () => {
    expect(cleanMoney("1500")).toBe("1500");
    expect(cleanMoney(" 250.50 ")).toBe("250.50");
    expect(cleanMoney("")).toBeNull();
    expect(cleanMoney("   ")).toBeNull();
  });
  it("rejects non-canonical or out-of-range sums instead of coercing them", () => {
    expect(() => cleanMoney("1.005")).toThrow();
    expect(() => cleanMoney("-100")).toThrow();
    expect(() => cleanMoney("1e6")).toThrow();
    expect(() => cleanMoney("1000000000000")).toThrow();
  });
});

describe("shiftCreateCompletedPayload", () => {
  const fin = { revenue: "18000", tips: "600", adjustments: [
    { kind: "bonus" as const, label: " За выходной ", amount: "500" },
    { kind: "penalty" as const, label: "Опоздание", amount: "" },
  ] };
  it("carries decimal-string money and named adjustments; unknown sums stay NULL", () => {
    const p = shiftCreateCompletedPayload(time, fin, "", () => "33333333-3333-3333-3333-333333333333");
    expect(p).toMatchObject({
      id: "33333333-3333-3333-3333-333333333333",
      workplace_id: workplace.id,
      starts_at: "2026-11-10T09:00:00.000Z",
      ends_at: "2026-11-10T19:00:00.000Z",
      revenue: "18000", tips: "600", fixed_payments: [], override_conflicts: false,
    });
    expect(p.adjustments).toEqual([
      { kind: "bonus", label: "За выходной", amount: "500", comment: null, sort_order: 0 },
      { kind: "penalty", label: "Опоздание", amount: null, comment: null, sort_order: 1 },
    ]);
  });
  it("rejects unnamed adjustments and bad money before the server boundary", () => {
    expect(() => shiftCreateCompletedPayload(time, { revenue: "1.005", tips: "", adjustments: [] }, "")).toThrow();
    expect(() => shiftCreateCompletedPayload(time, { revenue: "", tips: "", adjustments: [{ kind: "bonus", label: " ", amount: "100" }] }, "")).toThrow();
  });
  it("passes the server-boundary validation, unlike a planned create with money", () => {
    const p = shiftCreateCompletedPayload(time, fin, "", () => "33333333-3333-3333-3333-333333333333");
    expect(() => validateShiftWrite("shift_create_completed", p)).not.toThrow();
    expect(() => validateShiftWrite("shift_create", p)).toThrow();
  });
  it("boundary rejects JSON numbers, unknown adjustment kinds and fixed payments", () => {
    const p = shiftCreateCompletedPayload(time, fin, "", () => "33333333-3333-3333-3333-333333333333") as Record<string, unknown>;
    expect(() => validateShiftWrite("shift_create_completed", { ...p, revenue: 18000 })).toThrow();
    expect(() => validateShiftWrite("shift_create_completed", { ...p, adjustments: [{ kind: "fine", label: "x", amount: "1" }] })).toThrow();
    expect(() => validateShiftWrite("shift_create_completed", { ...p, fixed_payments: [{ rate_interval_id: "x" }] })).toThrow();
    expect(() => validateShiftWrite("shift_create_completed", { ...p, expected_revision: 1 })).not.toThrow();
  });
});

describe("findAccountConflicts", () => {
  const existing = shift({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
  it("detects overlap across workplaces on real UTC instants", () => {
    const found = findAccountConflicts({ id: null, starts_at: "2026-11-10T18:00:00.000Z", ends_at: "2026-11-10T23:00:00.000Z" }, [existing]);
    expect(found).toHaveLength(1);
    expect(found[0]!.minutes).toBe(60);
    expect(found[0]!.other.id).toBe(existing.id);
  });
  it("ignores the shift itself, cancelled shifts and disjoint times", () => {
    expect(findAccountConflicts({ id: existing.id, starts_at: existing.starts_at, ends_at: existing.ends_at }, [existing])).toHaveLength(0);
    expect(findAccountConflicts({ id: null, starts_at: existing.starts_at, ends_at: existing.ends_at }, [shift({ status: "cancelled" })])).toHaveLength(0);
    expect(findAccountConflicts({ id: null, starts_at: "2026-11-10T19:00:00.000Z", ends_at: "2026-11-10T21:00:00.000Z" }, [existing])).toHaveLength(0);
  });
  it("catches an overnight shift overlapping an early-morning one", () => {
    const night = shift({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", starts_at: "2026-11-10T19:00:00.000Z", ends_at: "2026-11-11T03:00:00.000Z" });
    const morning = shift({ id: "cccccccc-cccc-cccc-cccc-cccccccccccc", starts_at: "2026-11-11T02:00:00.000Z", ends_at: "2026-11-11T06:00:00.000Z" });
    expect(findAccountConflicts({ id: night.id, starts_at: night.starts_at, ends_at: night.ends_at }, [morning])).toHaveLength(1);
  });
});

describe("estimateAccountPay", () => {
  const wp = (intervals: unknown[]): AccountWorkplace => ({
    ...workplace,
    name: "Бар", color: "green", revenue_goal: null, revision: 1, rates: null, commission: null,
    rateVersions: [{ id: "v1", effective_from: "2026-01-01", revision: 1, intervals: intervals as never }],
  });
  it("returns null without a rate version in force on the shift date", () => {
    const w = wp([{ id: "i1", kind: "hourly", start_time: "10:00", end_time: "22:00", hourly: 300, fixed_amount: null, label: "День", weekdays: [], sort_order: 0 }]);
    expect(estimateAccountPay(w, "2025-12-01", "12:00", "22:00").amount).toBeNull();
    expect(estimateAccountPay(wp([]), "2026-11-10", "12:00", "22:00")).toMatchObject({ amount: null, hasRates: false });
  });
  it("sums hourly intervals inside one shift", () => {
    const w = wp([
      { id: "i1", kind: "hourly", start_time: "10:00", end_time: "18:00", hourly: 300, fixed_amount: null, label: "День", weekdays: [], sort_order: 0 },
      { id: "i2", kind: "hourly", start_time: "18:00", end_time: "23:00", hourly: 400, fixed_amount: null, label: "Вечер", weekdays: [], sort_order: 1 },
    ]);
    // 12:00–20:00 → 6 ч × 300 + 2 ч × 400 = 2600
    expect(estimateAccountPay(w, "2026-11-10", "12:00", "20:00")).toMatchObject({ amount: 2600, uncoveredMinutes: 0 });
  });
  it("covers overnight hours with an overnight interval", () => {
    const w = wp([{ id: "i1", kind: "hourly", start_time: "22:00", end_time: "06:00", hourly: 500, fixed_amount: null, label: "Ночь", weekdays: [], sort_order: 0 }]);
    expect(estimateAccountPay(w, "2026-11-10", "22:00", "06:00")).toMatchObject({ amount: 4000, uncoveredMinutes: 0 });
  });
  it("reports uncovered minutes instead of inventing a full sum", () => {
    const w = wp([{ id: "i1", kind: "hourly", start_time: "12:00", end_time: "18:00", hourly: 300, fixed_amount: null, label: "День", weekdays: [], sort_order: 0 }]);
    const est = estimateAccountPay(w, "2026-11-10", "12:00", "22:00");
    expect(est.amount).toBe(1800);
    expect(est.uncoveredMinutes).toBe(240);
  });
  it("ignores fixed-payment intervals in the hourly estimate", () => {
    const w = wp([{ id: "i1", kind: "fixed", start_time: null, end_time: null, hourly: null, fixed_amount: 1500, label: "Выход", weekdays: [], sort_order: 0 }]);
    expect(estimateAccountPay(w, "2026-11-10", "12:00", "22:00")).toMatchObject({ amount: null, hasRates: false });
  });
});
