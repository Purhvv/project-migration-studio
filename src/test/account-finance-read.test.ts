import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ calls: [] as Array<{ table: string; filters: Array<[string, unknown]> }>, fail: "" }));
vi.mock("@tanstack/react-start", () => {
  const chain = () => {
    let validate = (data: unknown) => data;
    const builder = { middleware: () => builder, server: () => builder, inputValidator: (fn: typeof validate) => { validate = fn; return builder; }, handler: (fn: (value: unknown) => unknown) => async ({ data }: { data: unknown }) => fn({ data: validate(data), context: { verifiedUserId: "verified-owner", supabase: { from: (table: string) => {
      const call = { table, filters: [] as Array<[string, unknown]> };
      reads.calls.push(call);
      const result = () => ({ error: reads.fail === table ? { message: "denied" } : null, data: table === "shifts" ? { id: "22222222-2222-2222-2222-222222222222", workplace_id: "w", local_start_date: "2026-11-12", start_time: "10:00:00", end_time: "17:00:00", status: "completed" } : table === "monthly_commission_results" ? null : [] });
      const query = { select: () => query, eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; }, is: (key: string, value: unknown) => { call.filters.push([key, value]); return query; }, order: () => query, limit: () => query, single: async () => result(), maybeSingle: async () => result(), then: (resolve: (r: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) };
      return query;
    } } } }) };
    return builder;
  };
  return { createServerFn: chain, createMiddleware: chain };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getAccountShiftFinances } from "@/lib/account.functions";

beforeEach(() => { reads.calls = []; reads.fail = ""; });
describe("detailed finance owner reads (mocked client)", () => {
  it("scopes all five reads to verified owner and the specific shift/month", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    await getAccountShiftFinances({ data: { id } });
    expect(reads.calls.map((c) => c.table)).toEqual(["shifts", "shift_adjustments", "shift_fixed_payments", "monthly_commission_results", "shift_financial_events"]);
    for (const call of reads.calls) expect(call.filters).toContainEqual(["user_id", "verified-owner"]);
    expect(reads.calls[0]?.filters).toContainEqual(["deleted_at", null]);
    expect(reads.calls[1]?.filters).toContainEqual(["shift_id", id]);
    expect(reads.calls[3]?.filters).toContainEqual(["month", "2026-11-01"]);
    expect(reads.calls[4]?.filters).toContainEqual(["subject_shift_id", id]);
  });
  it("does not substitute missing financial rows with invented data on read failure", async () => {
    reads.fail = "shift_adjustments";
    await expect(getAccountShiftFinances({ data: { id: "22222222-2222-2222-2222-222222222222" } })).rejects.toThrow("Не удалось загрузить детали начислений");
  });
});