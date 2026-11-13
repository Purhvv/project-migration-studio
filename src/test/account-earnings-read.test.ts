import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ filters: [] as Array<[string, unknown]>, fail: false }));
vi.mock("@tanstack/react-start", () => {
  const chain = () => {
    const builder = { middleware: () => builder, server: () => builder, inputValidator: () => builder,
      handler: (fn: (v: unknown) => unknown) => async () => fn({ context: { verifiedUserId: "owner", supabase: {
        from: () => {
          const query = { select: () => query, eq: (k: string, v: unknown) => { reads.filters.push([k, v]); return query; },
            is: (k: string, v: unknown) => { reads.filters.push([k, v]); return query; }, order: () => query,
            then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: reads.fail ? {} : null, data: [{
              id: "saved", status: "completed", revenue: null, earnings: null, base_pay: 2100, fixed_pay: 300,
              commission_pay: null, tips: 500, start_time: "10:00:00", end_time: "17:00:00",
              shift_adjustments: [{ kind: "bonus", amount: 250 }, { kind: "penalty", amount: 100 }],
            }] }).then(resolve) };
          return query;
        },
      } } }) };
    return builder;
  };
  return { createServerFn: chain, createMiddleware: chain };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getAccountShifts } from "@/lib/account.functions";
import { accountShiftSummary } from "@/lib/account-statistics";

beforeEach(() => { reads.filters = []; reads.fail = false; });
describe("owner shift earnings read (mocked Supabase)", () => {
  it("reads back confirmed amounts into home/statistics without changing NULL payroll or revenue", async () => {
    const rows = await getAccountShifts();
    expect(reads.filters).toEqual([["user_id", "owner"], ["deleted_at", null]]);
    expect(rows[0]).toMatchObject({ revenue: null, earnings: null, confirmed_earnings: { value: 3050, partial: true } });
    expect(accountShiftSummary(rows).earnings).toEqual({ value: 3050, partial: true });
  });
  it("fails closed instead of inventing components after a read error", async () => {
    reads.fail = true;
    await expect(getAccountShifts()).rejects.toThrow("SHIFTLY_SHIFTS_UNAVAILABLE");
  });
});