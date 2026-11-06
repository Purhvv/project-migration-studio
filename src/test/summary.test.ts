import { describe, expect, it } from "vitest";
import { sumKnown } from "@/lib/summary";

describe("sumKnown", () => {
  it("keeps all-unknown values unknown instead of zero", () => {
    expect(sumKnown([null, null]).value).toBeNull();
  });
  it("sums known values and flags missing ones", () => {
    expect(sumKnown([100, null, 50])).toEqual({ value: 150, partial: true });
  });
});
