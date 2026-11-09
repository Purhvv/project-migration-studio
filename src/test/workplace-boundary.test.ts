import { describe, expect, it } from "vitest";
import { validateWorkplaceEdit, writeErrorMessage } from "@/lib/account-settings";

describe("workplace server validation", () => {
  it("rejects JSON-number money rather than relaxing the RPC contract", () => {
    expect(() => validateWorkplaceEdit({ name: "Бар", color: "green", revenue_goal: 1250000 })).toThrow();
    expect(() => validateWorkplaceEdit({ name: "Бар", color: "green", revenue_goal: "1250000" })).not.toThrow();
  });
  it("accepts all database palette keys but not hex colours", () => {
    for (const color of ["sky", "green", "amber", "rose", "violet", "orange"]) expect(() => validateWorkplaceEdit({ color })).not.toThrow();
    expect(() => validateWorkplaceEdit({ color: "#00ff00" })).toThrow();
  });
  it("does not expose raw database errors", () => {
    const raw = "22023 Money field revenue_goal must be a decimal string, never a JSON number";
    expect(writeErrorMessage(raw, "workplace_edit")).not.toContain("22023");
    expect(writeErrorMessage("unknown internal detail", "workplace_edit")).not.toContain("internal detail");
  });
});