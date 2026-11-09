import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { accountProfileOptions } from "@/data/account-queries";
import { getAccountProfile } from "@/lib/account.functions";
import { authHead, authError, setWantsDemo } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { sessionName } from "@/components/personal/PersonalEmpty";
import { PageHeader, Section } from "@/components/shared/primitives";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => authHead("Личный аккаунт", "Профиль и доступ к личному аккаунту Shiftly."),
  component: Account,
});
function Account() {
  const { accountUser } = Route.useRouteContext();
  const fetchProfile = useServerFn(getAccountProfile);
  const profile = useQuery({ ...accountProfileOptions(accountUser.id), queryFn: () => fetchProfile() });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true); setError("");
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error: failure } = await supabase.auth.signOut();
    if (failure) { setError(authError(failure)); setBusy(false); return; }
    await navigate({ to: "/", replace: true });
  }
  return <div className="space-y-5"><PageHeader title="Профиль" subtitle="Личное пространство" /><Section>
    <UserRound className="mb-4 size-9 text-primary" />
    {profile.isPending ? <p role="status" className="text-sm text-muted-foreground">Загружаем профиль…</p> : profile.isError ? <div className="space-y-3"><p role="alert" className="text-sm text-negative">Не удалось загрузить профиль. Проверьте соединение или войдите снова.</p><Button variant="secondary" onClick={() => void profile.refetch()}>Повторить</Button></div> : <dl className="divide-y rounded-2xl border bg-card px-4">{[["Имя", sessionName(accountUser)], ["Email", accountUser.email ?? "—"], ["Валюта", profile.data.currency], ["Часовой пояс", profile.data.timezone]].map(([label, value]) => <div key={label} className="py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>}
    {error && <p role="alert" className="mt-4 text-sm text-negative">{error}</p>}
    <div className="mt-6 flex flex-col gap-3"><Button disabled={busy} variant="secondary" onClick={() => void signOut()}><LogOut />Выйти</Button><Button asChild variant="ghost"><Link to="/" onClick={() => setWantsDemo(true)}>Открыть демоверсию</Link></Button></div>
  </Section></div>;
}