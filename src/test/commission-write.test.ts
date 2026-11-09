import { describe, expect, it } from "vitest";
import { publishCommissionPayload } from "@/lib/account-settings";

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
});