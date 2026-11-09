import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishCommissionPayload, workplaceEditPayload } from "@/lib/account-settings";

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