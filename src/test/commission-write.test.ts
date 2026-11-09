import { describe, expect, it } from "vitest";
import { publishCommissionPayload, validateCommissionPublication, writeErrorMessage } from "@/lib/account-settings";

describe("commission RPC decimal contract", () => {
  it("keeps the fixed percentage as an exact decimal string", () => {
    expect(publishCommissionPayload("w", "2026-12", "fixed", "1.50", []).fixed_percent).toBe("1.50");
  });
  it("keeps threshold amounts and percentages as decimal strings", () => {
    expect(publishCommissionPayload("w", "2026-11", "thresholds", null, [
      { from_amount: "0", percent: "0" },
      { from_amount: "1500000", percent: "1.5" },
      { from_amount: "1950000", percent: "2" },
    ]).thresholds).toEqual([
      { from_amount: "0", percent: "0" },
      { from_amount: "1500000", percent: "1.5" },
      { from_amount: "1950000", percent: "2" },
    ]);
  });
  it("rejects the exact numeric payload observed in the failed request", () => {
    expect(() => validateCommissionPublication({ workplace_id: "w", effective_from: "2026-11-01", mode: "thresholds", fixed_percent: null, thresholds: [{ from_amount: 1500000, percent: 1.5 }, { from_amount: 1950000, percent: 2 }] })).toThrow();
  });
  it("requires the first threshold to start at zero", () => {
    expect(() => publishCommissionPayload("w", "2026-11", "thresholds", null, [{ from_amount: "1500000", percent: "1.5" }])).toThrow("Первый порог");
  });
  it("requires strictly increasing amounts without duplicate numeric values", () => {
    expect(() => publishCommissionPayload("w", "2026-11", "thresholds", null, [{ from_amount: "0", percent: "0" }, { from_amount: "0.00", percent: "2" }])).toThrow("строго возрастать");
    expect(() => publishCommissionPayload("w", "2026-11", "thresholds", null, [{ from_amount: "0", percent: "0" }, { from_amount: "1950000", percent: "2" }, { from_amount: "1500000", percent: "1.5" }])).toThrow("строго возрастать");
  });
  it("accepts zero and 100 percent but rejects precision and range errors", () => {
    for (const value of ["0", "100"]) expect(publishCommissionPayload("w", "2026-12", "fixed", value, []).fixed_percent).toBe(value);
    for (const value of ["100.01", "1.501", "", "NaN"]) expect(() => publishCommissionPayload("w", "2026-12", "fixed", value, [])).toThrow();
  });
  it("keeps unused commission values explicitly NULL and the threshold list empty", () => {
    expect(publishCommissionPayload("w", "2026-12", "none", null, [])).toMatchObject({ fixed_percent: null, thresholds: [] });
  });
  it("rejects impossible publication months", () => {
    expect(() => publishCommissionPayload("w", "2026-13", "none", null, [])).toThrow();
  });
  it("maps the observed SQL error to a field-specific safe message", () => {
    expect(writeErrorMessage("22023 Money field from_amount must be a decimal string, never a JSON number", "publish_commission")).toContain("Выручка порога");
    expect(writeErrorMessage("Threshold rules must start at zero", "publish_commission")).toContain("0 ₽");
  });
});