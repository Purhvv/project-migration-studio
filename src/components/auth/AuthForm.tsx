import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Section } from "@/components/shared/primitives";
import { authError, useAuth } from "@/lib/auth";

type Mode = "login" | "signup" | "forgot" | "reset";
const titles = { login: "Вход", signup: "Регистрация", forgot: "Восстановление", reset: "Новый пароль" };

export function AuthForm({ mode, reason }: { mode: Mode; reason?: string | undefined }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recoveryLink, setRecoveryLink] = useState(false);
  useEffect(() => {
    if (mode === "reset") {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      setRecoveryLink(hash.get("type") === "recovery");
      if (hash.has("error")) setError("Ссылка недействительна или истекла. Запросите новое письмо.");
    }
  }, [mode]);
  useEffect(() => {
    if ((mode === "login" || mode === "signup") && auth.user && !auth.loading && !auth.recovery) {
      void navigate({ to: "/app", replace: true });
    }
  }, [auth.user, auth.loading, auth.recovery, mode, navigate]);
  const canReset = !!auth.user && (auth.recovery || recoveryLink);
  async function resendConfirmation() {
    if (!email.trim()) { setError("Введите email, чтобы запросить письмо подтверждения."); return; }
    setBusy(true); setError("");
    try {
      const { error: failure } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (failure) throw failure;
      setSuccess("Если email ожидает подтверждения, на него придёт новая ссылка. Проверьте почту.");
    } catch (failure) { setError(authError(failure)); }
    finally { setBusy(false); }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setSuccess("");
    if ((mode === "signup" || mode === "reset") && password !== confirmation) {
      setError("Пароли не совпадают."); return;
    }
    if (mode === "reset" && !canReset) { setError("Откройте ссылку из письма для восстановления пароля."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (failure) throw failure;
        await navigate({ to: "/app", replace: true });
      } else if (mode === "signup") {
        const { data, error: failure } = await supabase.auth.signUp({ email: email.trim(), password,
          options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (failure) throw failure;
        setPassword(""); setConfirmation("");
        if (data.session) await navigate({ to: "/app", replace: true });
        else setSuccess("Проверьте почту: мы отправили ссылку для подтверждения email. После подтверждения вы сможете войти.");
      } else if (mode === "forgot") {
        const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (failure) throw failure;
        setSuccess("Если этот email зарегистрирован, на него придёт письмо со ссылкой для восстановления пароля.");
      } else {
        const { error: failure } = await supabase.auth.updateUser({ password });
        if (failure) throw failure;
        // End the recovery session; a fresh login uses the new password.
        await supabase.auth.signOut();
        setPassword(""); setConfirmation("");
        setSuccess("Пароль изменён. Войдите с новым паролем.");
      }
    } catch (failure) { setError(authError(failure)); }
    finally { setBusy(false); }
  };
  const hasPassword = mode !== "forgot";
  return <div className="space-y-5">
    <PageHeader title={titles[mode]} subtitle="Shiftly" />
    <Section>
      <ShieldCheck className="mb-6 size-9 text-primary" />
      {reason === "session" && !success && <p role="status" className="mb-4 text-sm text-muted-foreground">Войдите, чтобы открыть личный аккаунт. Если сессия истекла, войдите снова.</p>}
      {success ? <div className="space-y-5"><p role="status" className="text-sm text-positive">{success}</p><Button asChild className="w-full"><Link to="/auth">Перейти ко входу</Link></Button></div> :
      <form onSubmit={submit} className="space-y-5">
        {mode === "signup" && <label className="block space-y-2 text-sm"><span>Имя</span><Input autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" /></label>}
        {mode !== "reset" && <label className="block space-y-2 text-sm"><span>Email</span><Input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
        {hasPassword && <div className="space-y-2 text-sm"><label htmlFor="auth-password">{mode === "reset" ? "Новый пароль" : "Пароль"}</label><div className="relative"><Input id="auth-password" required type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" /><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={show ? "Скрыть пароль" : "Показать пароль"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</Button></div></div>}
        {(mode === "signup" || mode === "reset") && <label className="block space-y-2 text-sm"><span>Повторите пароль</span><Input required type={show ? "text" : "password"} autoComplete="new-password" minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>}
        {mode === "reset" && !auth.loading && !canReset && <p className="text-sm text-muted-foreground">Откройте ссылку из письма. Если она истекла, запросите новую.</p>}
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        {mode === "login" && error && <Button type="button" disabled={busy} variant="ghost" className="w-full whitespace-normal" onClick={() => void resendConfirmation()}>Отправить подтверждение email повторно</Button>}
        <Button type="submit" className="w-full" disabled={busy || (mode === "reset" && !canReset)}>{busy && <LoaderCircle className="animate-spin motion-reduce:animate-none" />}{mode === "login" ? "Войти" : mode === "signup" ? "Создать аккаунт" : mode === "forgot" ? "Отправить письмо" : "Сохранить пароль"}</Button>
      </form>}
      <div className="mt-5 flex flex-col gap-2">
        {mode === "login" && <><Button asChild variant="ghost"><Link to="/register">Создать аккаунт</Link></Button><Button asChild variant="ghost"><Link to="/forgot-password">Забыли пароль?</Link></Button></>}
        {mode === "reset" && !success && <Button asChild variant="ghost"><Link to="/forgot-password">Запросить новую ссылку</Link></Button>}
        {mode !== "login" && !success && <Button asChild variant="ghost"><Link to="/auth">Уже есть аккаунт? Войти</Link></Button>}
        <Button asChild variant="secondary"><Link to="/">Вернуться в демо</Link></Button>
      </div>
    </Section>
  </div>;
}