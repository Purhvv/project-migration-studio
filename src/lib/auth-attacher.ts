import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// Session reads here attach a token only; the server revalidates the user.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  return next({ headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
});