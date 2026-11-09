import { describe, expect, it } from "vitest";
import { workplaceEditPayload } from "@/lib/account-settings";

describe("workplace RPC money contract regression", () => {
  it("creates with the reported revenue goal as a decimal string", () => {
    expect(workplaceEditPayload(null, "«Светски»", "green", "1250000", () => "id")).toMatchObject({ color: "green", revenue_goal: "1250000" });
  });
  it("edits with exact cents as a decimal string", () => {
    expect(workplaceEditPayload({ id: "w", revision: 2 }, "Бар", "sky", "1250000.25")).toMatchObject({ expected_revision: 2, revenue_goal: "1250000.25" });
  });
  it("keeps an unset revenue goal NULL", () => {
    expect(workplaceEditPayload(null, "Бар", "green", null, () => "id").revenue_goal).toBeNull();
  });
  it("rejects values exceeding the database precision or range", () => {
    expect(() => workplaceEditPayload(null, "Бар", "green", "1.001")).toThrow();
    expect(() => workplaceEditPayload(null, "Бар", "green", "1000000000000")).toThrow();
  });
});