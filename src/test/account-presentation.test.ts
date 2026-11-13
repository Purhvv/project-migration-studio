import { describe, expect, it } from "vitest";
import { accountForecast, accountPeriodRange, accountPeriodShifts } from "@/lib/account-presentation";
import type { AccountShift } from "@/lib/account-shifts";
import type { AccountWorkplace } from "@/lib/account-settings";

const shift: AccountShift = { id: "s", workplace_id: "w", local_start_date: "2026-10-31", local_end_date: "2026-11-01", start_time: "23:00", end_time: "02:00", starts_at: "2026-10-31T22:00:00Z", ends_at: "2026-11-01T01:00:00Z", status: "completed", revenue: 12000, tips: 500, base_pay: 2000, earnings: 3380, comment: null, revision: 1, revenue_revision: 1 };
const workplace: AccountWorkplace = { id: "w", name: "Бар", color: "green", timezone: "UTC", revenue_goal: null, revision: 1, commission: null, rates: { id: "r", effective_from: "2026-10-01", revision: 1, intervals: [{ id: "i", kind: "hourly", start_time: "22:00", end_time: "03:00", hourly: 300, fixed_amount: null, label: "Ночь", weekdays: [], sort_order: 0 }] } };
describe("personal presentation periods and forecast", () => {
  it("offers inclusive week, month, year, all-time and custom ranges", () => {
    expect(accountPeriodRange("week", "2026-11-13")).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(accountPeriodRange("month", "2026-11-13")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(accountPeriodRange("year", "2026-11-13")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(accountPeriodRange("all", "2026-11-13")).toBeNull();
    expect(accountPeriodRange("custom", "2026-11-13", "2026-10-31", "2026-11-01")).toEqual({ from: "2026-10-31", to: "2026-11-01" });
  });
  it("keeps workplace revenue on its local start date while earnings use profile timezone", () => {
    const range = accountPeriodRange("month", "2026-11-13");
    expect(accountPeriodShifts([shift], range, "Europe/Moscow")).toEqual([shift]);
    expect(accountPeriodShifts([shift], range, "Europe/Moscow", "all", true)).toEqual([]);
    expect(accountPeriodShifts([shift], null, "Europe/Moscow", "other")).toEqual([]);
  });
  it("forecasts only hourly pay while preserving stored completed earnings", () => {
    const future = { ...shift, id: "future", status: "planned" as const, revenue: 999999, tips: 99999, earnings: 99999 };
    expect(accountForecast([shift, future], [workplace])).toMatchObject({ actual: { value: 3380, partial: false }, estimated: 900, upcoming: 1, total: 4280 });
    expect(accountForecast([future], [])).toMatchObject({ estimated: 0, missing: 1, total: null });
  });
});