import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, isPersonalPath, type AuthState } from "@/lib/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ user: null, loading: true, recovery: false });
  useEffect(() => {
    let active = true;
    let identity: string | null = null;
    let revision = 0;
    const validate = async () => {
      const captured = revision;
      const { data } = await supabase.auth.getUser();
      if (!active || captured !== revision) return;
      const user = data.user?.email_confirmed_at ? data.user : null;
      if (identity && identity !== user?.id) {
        await queryClient.cancelQueries({ queryKey: ["account"] });
        queryClient.removeQueries({ queryKey: ["account"] });
      }
      identity = user?.id ?? null;
      setState((previous) => ({ ...previous, user, loading: false }));
      if (!user && isPersonalPath(router.state.location.pathname)) {
        void router.navigate({ to: "/", replace: true });
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      revision += 1;
      const user = session?.user.email_confirmed_at ? session.user : null;
      const changed = identity !== (user?.id ?? null);
      identity = user?.id ?? null;
      // Do not await Auth calls in its own callback (SDK lock).
      setState((previous) => ({ user, loading: false, recovery: event === "PASSWORD_RECOVERY" || (event !== "SIGNED_OUT" && previous.recovery) }));
      if (changed || event === "SIGNED_OUT") {
        void queryClient.cancelQueries({ queryKey: ["account"] }).then(() => queryClient.removeQueries({ queryKey: ["account"] }));
      }
      if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
        void router.invalidate();
        if (event !== "SIGNED_OUT") void queryClient.invalidateQueries({ queryKey: ["account"] });
      }
      if (event === "SIGNED_OUT" && isPersonalPath(router.state.location.pathname)) {
        void router.navigate({ to: "/", replace: true });
      }
    });
    void validate();
    const onVisible = () => { if (document.visibilityState === "visible") void validate(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void validate(), 60_000);
    return () => {
      active = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [router, queryClient]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}