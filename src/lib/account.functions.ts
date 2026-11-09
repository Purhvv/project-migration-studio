import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { selectRateVersions, validateRatePublication, workplaceToday } from "@/lib/account-rates";
import { isProfileOperation, validateWorkplaceEdit, writeErrorMessage, type AccountSettings, type AccountWorkplace, type AccountInterval, type ProfileOperation } from "@/lib/account-settings";

// The generated middleware checks claims. This additional boundary confirms the
// account with Auth, including revocation/deletion, before private reads.
const verifiedUser = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data.user || data.user.id !== context.userId || !data.user.email_confirmed_at) {
      throw new Error("SHIFTLY_SESSION_EXPIRED");
    }
    return next({ context: { verifiedUserId: data.user.id } });
  });

export const getAccountProfile = createServerFn({ method: "POST" })
  .middleware([verifiedUser])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles")
      .select("id, name, currency, timezone")
      .eq("id", context.verifiedUserId).single();
    if (error) throw new Error("SHIFTLY_PROFILE_UNAVAILABLE");
    return data;
  });

/** Owner-only settings read: identity comes from the verified session, RLS applies as the user. */
export const getAccountSettings = createServerFn({ method: "POST" })
  .middleware([verifiedUser])
  .handler(async ({ context }): Promise<AccountSettings> => {
    const uid = context.verifiedUserId;
    const db = context.supabase;
    const [profile, workplaces, rateVersions, intervals, commissions, thresholds] = await Promise.all([
      db.from("profiles").select("id, name, currency, timezone, monthly_goal, hours_goal, shifts_goal, revision").eq("id", uid).single(),
      db.from("workplaces").select("id, name, color, timezone, revenue_goal, revision").eq("user_id", uid).is("archived_at", null).order("created_at"),
      db.from("rate_versions").select("id, workplace_id, effective_from, revision").eq("user_id", uid).eq("sealed", true).order("effective_from", { ascending: false }),
      db.from("rate_intervals").select("id, rate_version_id, kind, start_time, end_time, hourly, fixed_amount, label, weekdays, sort_order").eq("user_id", uid).order("sort_order"),
      db.from("commission_rule_versions").select("id, workplace_id, effective_from, revision, mode, fixed_percent").eq("user_id", uid).order("effective_from", { ascending: false }),
      db.from("commission_thresholds").select("rule_version_id, from_amount, percent").eq("user_id", uid).order("from_amount"),
    ]);
    if (profile.error || workplaces.error || rateVersions.error || intervals.error || commissions.error || thresholds.error) throw new Error("SHIFTLY_PROFILE_UNAVAILABLE");
    const today = new Date().toISOString().slice(0, 10);
    // Versions are sorted newest first: pick the one in force today, else the earliest scheduled one.
    const pick = <T extends { workplace_id: string; effective_from: string }>(rows: T[], wid: string) => {
      const own = rows.filter((r) => r.workplace_id === wid);
      return own.find((r) => r.effective_from <= today) ?? own[own.length - 1] ?? null;
    };
    const list: AccountWorkplace[] = workplaces.data.map((w) => {
      const versions = rateVersions.data.filter((v) => v.workplace_id === w.id).map((v) => ({ id: v.id, effective_from: v.effective_from, revision: v.revision, intervals: intervals.data.filter((i) => i.rate_version_id === v.id).map(({ rate_version_id: _, ...i }) => ({ ...i, start_time: i.start_time?.slice(0, 5) ?? null, end_time: i.end_time?.slice(0, 5) ?? null }) as AccountInterval) }));
      const rv = selectRateVersions(versions, workplaceToday(w.timezone)).current;
      const cv = pick(commissions.data, w.id);
      return {
        ...w, color: w.color as AccountWorkplace["color"],
        rates: rv, rateVersions: versions,
        commission: cv ? { id: cv.id, effective_from: cv.effective_from, revision: cv.revision, mode: cv.mode as "none" | "fixed" | "thresholds", fixed_percent: cv.fixed_percent, thresholds: thresholds.data.filter((t) => t.rule_version_id === cv.id).map(({ from_amount, percent }) => ({ from_amount, percent })) } : null,
      };
    });
    return { profile: profile.data, workplaces: list };
  });

/** The only write path: approved shiftly_write RPC; the database derives the owner from auth.uid(). */
export const accountWrite = createServerFn({ method: "POST" })
  .middleware([verifiedUser])
  .inputValidator((input: { key: string; type: ProfileOperation; payload: Record<string, unknown> }) => {
    if (!input || !isProfileOperation(input.type)) throw new Error("Операция недоступна");
    if (typeof input.key !== "string" || !/^[0-9a-f-]{36}$/i.test(input.key)) throw new Error("Некорректный ключ операции");
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload) || "user_id" in input.payload) throw new Error("Некорректные данные");
    if (input.type === "publish_rates") validateRatePublication(input.payload);
    if (input.type === "workplace_edit") validateWorkplaceEdit(input.payload);
    return input;
  })
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc("shiftly_write", { p_key: data.key, p_type: data.type, p_payload: data.payload as never });
    if (error) {
      // Server-only diagnostics; never log bearer tokens or the user's request payload.
      console.error("Shiftly account write failed", { operation: data.type, code: error.code, message: error.message, details: error.details, hint: error.hint });
      throw new Error(writeErrorMessage(`${error.code ?? ""} ${error.message}`, data.type));
    }
    return { ok: true as const, saved: result !== null };
  });
