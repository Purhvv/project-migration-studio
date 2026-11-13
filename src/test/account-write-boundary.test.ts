import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishCommissionPayload, workplaceEditPayload } from "@/lib/account-settings";
import { financialShiftPayload } from "@/lib/account-finances";
import type { AccountShift } from "@/lib/account-shifts";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => {
  const chain = () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      server: () => builder,
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: (input: unknown) => unknown) => async ({ data }: { data: unknown }) => fn({ data: validate(data), context: { verifiedUserId: "owner", supabase: { rpc } } }),
    };
    return builder;
  };
  return { createServerFn: chain, createMiddleware: chain };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { accountWrite } from "@/lib/account.functions";

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { id: "saved" }, error: null }); });
const key = "00000000-0000-4000-8000-000000000001";
describe("accountWrite RPC forwarding (mocked Supabase, not hosted verification)", () => {
  it("forwards complete/edit finances in one RPC with decimals, NULL and both revisions", async () => {
    const shift: AccountShift = { id: key, workplace_id: key, local_start_date: "2026-11-12", local_end_date: "2026-11-12", start_time: "10:00", end_time: "17:00", starts_at: "2026-11-12T07:00:00Z", ends_at: "2026-11-12T14:00:00Z", status: "completed", revenue: null, tips: null, base_pay: null, earnings: null, comment: null, revision: 7, revenue_revision: 3 };
    const payload = financialShiftPayload(shift, { revenue: "18000.25", tips: "", adjustments: [{ kind: "bonus", label: "Выходной", amount: "500.25" }] });
    for (const type of ["shift_complete", "shift_edit"] as const) {
      await accountWrite({ data: { key, type, payload } });
      expect(rpc).toHaveBeenLastCalledWith("shiftly_write", { p_key: key, p_type: type, p_payload: payload });
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("creates and edits workplaces with the real RPC argument names and preserves NULL/revision", async () => {
    for (const payload of [workplaceEditPayload(null, "Бар", "green", "1250000", () => key), workplaceEditPayload({ id: key, revision: 3 }, "Кафе", "sky", null)]) {
      await accountWrite({ data: { key, type: "workplace_edit", payload } });
      expect(rpc).toHaveBeenLastCalledWith("shiftly_write", { p_key: key, p_type: "workplace_edit", p_payload: payload });
    }
  });
  it("forwards fixed commission and threshold decimals unchanged", async () => {
    for (const payload of [publishCommissionPayload(key, "2026-12", "fixed", "1.50", []), publishCommissionPayload(key, "2026-12", "thresholds", null, [{ from_amount: "0", percent: "0" }, { from_amount: "1500000", percent: "1.5" }])]) {
      await accountWrite({ data: { key, type: "publish_commission", payload } });
      expect(rpc).toHaveBeenLastCalledWith("shiftly_write", { p_key: key, p_type: "publish_commission", p_payload: payload });
    }
  });
  it("rejects numeric commission before reaching the database", async () => {
    await expect(accountWrite({ data: { key, type: "publish_commission", payload: { effective_from: "2026-12-01", mode: "fixed", fixed_percent: 1.5, thresholds: [] } } })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("continues rejecting client-supplied ownership", async () => {
    await expect(accountWrite({ data: { key, type: "workplace_edit", payload: { user_id: "other", name: "Бар" } } })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});