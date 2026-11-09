import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authHead, authError } from "@/lib/auth";
import { PageHeader, Section } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth_/callback")({
  head: () => authHead("Подтверждение email", "Подтверждение email для входа в Shiftly."),
  component: Callback,
});
function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function finish() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const search = new URLSearchParams(window.location.search);
      if (hash.has("error") || search.has("error")) { setError("Ссылка недействительна или истекла. Попробуйте войти или запросить новое письмо."); return; }
      const code = search.get("code");
      if (code) {
        const { error: failure } = await supabase.auth.exchangeCodeForSession(code);
        if (failure) { if (active) setError(authError(failure)); return; }
      }
      const { data, error: failure } = await supabase.auth.getUser();
      if (!active) return;
      if (failure || !data.user?.email_confirmed_at) setError("Не удалось подтвердить вход. Откройте свежую ссылку из письма или войдите снова.");
      else await navigate({ to: "/app", replace: true });
    }
    void finish();
    return () => { active = false; };
  }, [navigate]);
  return <><PageHeader title="Подтверждение email" /><Section><p role={error ? "alert" : "status"} className="text-sm text-muted-foreground">{error || "Проверяем подтверждение…"}</p>{error && <Button asChild className="mt-5"><Link to="/auth">Перейти ко входу</Link></Button>}</Section></>;
}