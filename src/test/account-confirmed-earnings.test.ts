import { describe, expect, it } from "vitest";
import { confirmedAccountEarnings } from "@/lib/account-confirmed-earnings";

const row = { earnings: null, base_pay: 2100, fixed_pay: 300, commission_pay: null, tips: 500,
  shift_adjustments: [{ kind: "bonus", amount: 250 }, { kind: "penalty", amount: 100 }] };

describe("confirmed payroll when revenue/commission is unknown", () => {
  it("retains stored pay, tips and adjustments without inventing commission", () => {
    expect(confirmedAccountEarnings(row)).toEqual({ value: 3050, partial: true });
    expect(row.earnings).toBeNull();
    expect(row.commission_pay).toBeNull();
  });
  it("never replaces the final stored payroll with a component sum", () => {
    expect(confirmedAccountEarnings({ ...row, earnings: 3380 })).toEqual({ value: 3380, partial: false });
  });
  it("keeps wholly unknown components unknown, including adjustments", () => {
    expect(confirmedAccountEarnings({ earnings: null, base_pay: null, fixed_pay: null, commission_pay: null, tips: null,
      shift_adjustments: [{ kind: "bonus", amount: null }] })).toEqual({ value: null, partial: true });
  });
  it("preserves confirmed zero and negative subtotals", () => {
    expect(confirmedAccountEarnings({ ...row, base_pay: 0, fixed_pay: 0, tips: null, shift_adjustments: [] })).toEqual({ value: 0, partial: true });
    expect(confirmedAccountEarnings({ ...row, base_pay: null, fixed_pay: null, tips: null, shift_adjustments: [{ kind: "penalty", amount: 100 }] })).toEqual({ value: -100, partial: true });
  });
});