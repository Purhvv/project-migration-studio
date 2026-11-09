import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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