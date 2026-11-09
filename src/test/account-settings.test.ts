import { describe, expect, it } from "vitest";
import { isProfileOperation, profileEditPayload, publishCommissionPayload, publishRatesPayload, validGoal } from "@/lib/account-settings";

const profile = { id: "u", name: "Анна", currency: "RUB", timezone: "Europe/Moscow", monthly_goal: 100000, hours_goal: null, shifts_goal: 12, revision: 3 };

describe("personal profile writes", () => {
  it("only exposes approved profile operations", () => {
    expect(isProfileOperation("profile_edit")).toBe(true);
    expect(isProfileOperation("shift_purge")).toBe(false);
  });
  it("profile_edit sends the allow-listed keys with the expected revision and no user id", () => {
    const p = profileEditPayload(profile, { hours_goal: 160 });
    expect(Object.keys(p).sort()).toEqual(["expected_revision", "hours_goal", "monthly_goal", "name", "shifts_goal", "timezone"]);
    expect(p).toMatchObject({ expected_revision: 3, hours_goal: 160, monthly_goal: 100000 });
  });
  it("shifts goal must be a positive integer", () => {
    expect(validGoal("shifts_goal", 2.5)).toBe(false);
    expect(validGoal("shifts_goal", 0)).toBe(false);
    expect(validGoal("hours_goal", null)).toBe(true);
  });
  it("commission versions start on the first of the month and reject percent above 100", () => {
    expect(publishCommissionPayload("w", "2026-12", "fixed", 5, []).effective_from).toBe("2026-12-01");
    expect(() => publishCommissionPayload("w", "2026-12", "fixed", 120, [])).toThrow();
  });
  it("publishing rates carries fixed payments over unchanged", () => {
    const p = publishRatesPayload("w", "2026-11-09", [{ start: "10:00", end: "18:00", hourly: 300 }], [{ id: "f", kind: "fixed", start_time: null, end_time: null, hourly: null, fixed_amount: 500, label: "Выход", weekdays: [], sort_order: 0 }]);
    expect(p.intervals).toHaveLength(2);
    expect(p.intervals[1]).toMatchObject({ kind: "fixed", fixed_amount: 500, hourly: null });
  });
});
