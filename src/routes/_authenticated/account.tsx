import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Briefcase, Camera, Coins, LogOut, Palette, Percent, Sparkles, Target, UserCog, UserRound } from "lucide-react";
import { accountSettingsOptions } from "@/data/account-queries";
import { getAccountSettings } from "@/lib/account.functions";
import { authHead, authError, setWantsDemo } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ErrorState, NavChevron, PageHeader, Panel, Section } from "@/components/shared/primitives";
import { AppearancePanel, CommissionPanel, GoalsPanel, PersonalDataPanel, RatesPanel, SettingsRow, WorkplacesPanel } from "@/components/personal/AccountPanels";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => authHead("Профиль и настройки", "Личные данные, цели, места работы, ставки и оформление Shiftly."),
  component: Account,
});

type Sheet = "personal" | "goals" | "workplaces" | "rates" | "commission" | "appearance" | "manage";
const SHEETS: Record<Sheet, { title: string; text: string }> = {
  personal: { title: "Личные данные", text: "Имя и email аккаунта." },
  goals: { title: "Мои цели", text: "Цели на месяц по заработку, часам и сменам." },
  workplaces: { title: "Мои рабочие места", text: "Название и цвет места работы в календаре." },
  rates: { title: "Ставки", text: "Почасовые ставки по временным интервалам для каждого места." },
  commission: { title: "Процент от выручки", text: "Фиксированный процент или пороговая система." },
  appearance: { title: "Внешний вид", text: "Тема оформления сохраняется на этом устройстве." },
  manage: { title: "Управление учётной записью", text: "Действия с аккаунтом." },
};

function Account() {
  const { accountUser } = Route.useRouteContext();
  const fetchSettings = useServerFn(getAccountSettings);
  const settings = useQuery({ ...accountSettingsOptions(accountUser.id), queryFn: () => fetchSettings() });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Sheet | null>(null);
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

  const data = settings.data;
  const name = data?.profile.name ?? "";
  const ctx = data ? { settings: data, userId: accountUser.id } : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Профиль" subtitle="Личное пространство" />
      {settings.isPending ? <Section><p role="status" className="text-sm text-muted-foreground">Загружаем профиль…</p></Section>
        : settings.isError ? <Section><ErrorState onRetry={() => void settings.refetch()} /></Section> : (
        <>
          <Section>
            <button className="block w-full text-left active:opacity-80" onClick={() => setOpen("personal")} aria-label="Личные данные">
              <Panel className="flex items-center gap-4 p-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent font-display text-xl text-accent-foreground">{name.charAt(0) || <UserRound className="size-6" />}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{name}</p><p className="truncate text-sm text-muted-foreground">{accountUser.email}</p></div>
                <NavChevron />
              </Panel>
            </button>
          </Section>
          <Section title="Работа">
            <Panel className="divide-y overflow-hidden">
              <SettingsRow icon={Target} label="Мои цели" onClick={() => setOpen("goals")} />
              <SettingsRow icon={Briefcase} label="Мои рабочие места" hint={`${data?.workplaces.length ?? 0} активных`} onClick={() => setOpen("workplaces")} />
              <SettingsRow icon={Coins} label="Ставки" onClick={() => setOpen("rates")} />
              <SettingsRow icon={Percent} label="Процент от выручки" onClick={() => setOpen("commission")} />
            </Panel>
          </Section>
          <Section title="Приложение">
            <Panel className="divide-y overflow-hidden">
              <SettingsRow icon={Palette} label="Внешний вид" onClick={() => setOpen("appearance")} />
              <SettingsRow icon={Sparkles} label="AI-помощник" soon />
              <SettingsRow icon={Camera} label="Фото расписания" soon />
            </Panel>
          </Section>
        </>
      )}
      <Section title="Аккаунт">
        <Panel className="divide-y overflow-hidden">
          <SettingsRow icon={UserCog} label="Управление учётной записью" onClick={() => setOpen("manage")} />
          <button disabled={busy} onClick={() => void signOut()} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-negative active:bg-secondary"><LogOut className="size-5" />Выйти</button>
        </Panel>
        {error && <p role="alert" className="mt-3 text-sm text-negative">{error}</p>}
        <Button asChild variant="ghost" className="mt-3 w-full"><Link to="/" onClick={() => setWantsDemo(true)}>Открыть демоверсию</Link></Button>
      </Section>

      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent>
          {open && (
            <>
              <DrawerHeader className="text-left"><DrawerTitle>{SHEETS[open].title}</DrawerTitle><DrawerDescription>{SHEETS[open].text}</DrawerDescription></DrawerHeader>
              <div className="max-h-[75vh] overflow-y-auto px-4 pb-8">
                {open === "manage" ? (
                  <div className="space-y-3 text-sm">
                    <p className="rounded-2xl bg-secondary p-4 text-muted-foreground">Удаление аккаунта и выгрузка данных пока недоступны в приложении. Сменить email можно в разделе «Личные данные», пароль — через «Забыли пароль» на экране входа.</p>
                  </div>
                ) : open === "appearance" ? <AppearancePanel />
                  : !ctx ? null
                  : open === "personal" ? <PersonalDataPanel {...ctx} user={accountUser} />
                  : open === "goals" ? <GoalsPanel {...ctx} />
                  : open === "workplaces" ? <WorkplacesPanel {...ctx} />
                  : open === "rates" ? <RatesPanel {...ctx} />
                  : <CommissionPanel {...ctx} />}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
