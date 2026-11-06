import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronLeft, CreditCard, LogOut, Shield, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, Section } from "@/components/shared/primitives";
import { useProfile, useUpdateProfile } from "@/data/queries";

export const Route = createFileRoute("/profile_/account")({
  head: () => ({
    meta: [
      { title: "Аккаунт — Shiftly" },
      { name: "description", content: "Личные данные, подписка, безопасность и управление аккаунтом Shiftly." },
      { property: "og:title", content: "Аккаунт — Shiftly" },
      { property: "og:description", content: "Настройки аккаунта Shiftly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

const soon = () => toast("Будет доступно после подключения аккаунта");

function AccountPage() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (profile) { setName(profile.name); setEmail(profile.email); }
  }, [profile]);

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center gap-2 px-5 pt-4">
        <Button size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">Аккаунт</h1>
      </header>

      <Section title="Личные данные">
        <Panel className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><UserRound className="size-4" />Профиль</div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Имя</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Почта</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Валюта</Label><Input value="Российский рубль (₽)" disabled /></div>
          <Button
            className="w-full"
            disabled={!name.trim()}
            onClick={() => update.mutate({ name: name.trim(), email: email.trim() }, { onSuccess: () => toast("Данные обновлены") })}
          >
            Сохранить
          </Button>
        </Panel>
      </Section>

      <Section title="Подписка">
        <Panel className="flex items-center gap-3 p-4">
          <CreditCard className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Бесплатный тариф</p>
            <p className="text-xs text-muted-foreground">Тариф и оплата</p>
          </div>
          <Button size="sm" variant="secondary" onClick={soon}>Изменить</Button>
        </Panel>
      </Section>

      <Section title="Безопасность">
        <Panel className="divide-y">
          <button onClick={soon} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm"><Shield className="size-5 text-muted-foreground" />Сменить пароль</button>
          <button onClick={soon} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm"><Shield className="size-5 text-muted-foreground" />Активные сессии</button>
        </Panel>
      </Section>

      <Section title="Управление аккаунтом">
        <Panel className="divide-y">
          <button onClick={soon} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm"><LogOut className="size-5 text-muted-foreground" />Выйти</button>
          <button onClick={soon} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-destructive"><Trash2 className="size-5" />Удалить аккаунт</button>
        </Panel>
      </Section>
    </div>
  );
}
