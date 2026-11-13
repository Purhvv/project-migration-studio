import { describe, expect, it } from "vitest";
import { financialRequest, financialShiftPayload, validFinancialMoney } from "@/lib/account-finances";
import { validateShiftWrite, type AccountShift } from "@/lib/account-shifts";

const shift: AccountShift = { id: "22222222-2222-2222-2222-222222222222", workplace_id: "11111111-1111-1111-1111-111111111111", local_start_date: "2026-11-12", local_end_date: "2026-11-12", start_time: "10:00", end_time: "17:00", starts_at: "2026-11-12T07:00:00Z", ends_at: "2026-11-12T14:00:00Z", status: "completed", revenue: 12000, tips: 500, base_pay: 2100, earnings: 3380, comment: null, revision: 7, revenue_revision: 3 };
describe("stage 4.4 financial writes", () => {
  it("saves optional financial fields as NULL with both concurrency revisions", () => {
    const p = financialShiftPayload(shift, { revenue: "", tips: "", adjustments: [] });
    expect(p).toMatchObject({ id: shift.id, expected_revision: 7, expected_revenue_revision: 3, revenue: null, tips: null, adjustments: [], starts_at: shift.starts_at, ends_at: shift.ends_at });
    expect(() => validateShiftWrite("shift_complete", p)).not.toThrow();
    expect(() => validateShiftWrite("shift_edit", p)).not.toThrow();
  });
  it("preserves decimal strings for multiple editable adjustments and removes deleted entries", () => {
    const p = financialShiftPayload(shift, { revenue: "18000.25", tips: "600.50", adjustments: [{ kind: "bonus", label: " Выходной ", amount: "500.25" }, { kind: "bonus", label: "Продажи", amount: "" }, { kind: "penalty", label: "Опоздание", amount: "100" }] });
    expect(p.revenue).toBe("18000.25");
    expect(p.tips).toBe("600.50");
    expect(p.adjustments).toEqual([{ kind: "bonus", label: "Выходной", amount: "500.25", comment: null, sort_order: 0 }, { kind: "bonus", label: "Продажи", amount: null, comment: null, sort_order: 1 }, { kind: "penalty", label: "Опоздание", amount: "100", comment: null, sort_order: 2 }]);
    expect(financialShiftPayload(shift, { revenue: "0", tips: "0", adjustments: [] }).adjustments).toEqual([]);
  });
  it("never sends derived payroll, raw status, user identity or replacement fixed payments", () => {
    const p = financialShiftPayload(shift, { revenue: "12000", tips: "500", adjustments: [] });
    for (const key of ["user_id", "base_pay", "fixed_pay", "commission_pay", "earnings", "status", "fixed_payments"]) {
      expect(p).not.toHaveProperty(key);
      expect(() => validateShiftWrite("shift_edit", { ...p, [key]: "1" })).toThrow();
    }
  });
  it("rejects numeric money, missing revenue revision, unnamed entries and excess precision", () => {
    const p = financialShiftPayload(shift, { revenue: "12000", tips: "500", adjustments: [] });
    expect(() => validateShiftWrite("shift_edit", { ...p, revenue: 12000 })).toThrow();
    expect(() => validateShiftWrite("shift_complete", { ...p, expected_revenue_revision: 0 })).toThrow();
    expect(() => validateShiftWrite("shift_edit", { ...p, adjustments: [{ kind: "bonus", label: "", amount: "1" }] })).toThrow();
    expect(validFinancialMoney("1.005")).toBe(false);
    expect(validFinancialMoney("999999999999.99")).toBe(true);
    expect(validFinancialMoney("1000000000000")).toBe(false);
    expect(validFinancialMoney(null)).toBe(true);
  });
  it("reuses a failed operation key only for an identical payload", () => {
    const p = financialShiftPayload(shift, { revenue: "12000", tips: "500", adjustments: [] });
    const request = financialRequest(null, "shift_edit", p, () => "first");
    expect(financialRequest(request, "shift_edit", p, () => "second").key).toBe("first");
    expect(financialRequest(request, "shift_edit", { ...p, tips: "501" }, () => "second").key).toBe("second");
  });
});