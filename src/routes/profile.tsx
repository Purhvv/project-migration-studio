import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Bell, Briefcase, Check, Coins, Download, Palette, Percent, Plus, Sparkles, Target, Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { EmptyState, Money, NavChevron, PageHeader, Panel, Section } from "@/components/shared/primitives";
import { GoalDrawer, type GoalField } from "@/components/shared/GoalDrawer";
import { NumberInput } from "@/components/shared/NumberInput";
import { formatNumber, parseNumberInput } from "@/lib/format";
import { WORKPLACE_COLORS, WorkplaceDot, wpColor } from "@/components/shifts/shift-ui";
import { useProfile, useSaveWorkplace, useWorkplaces } from "@/data/queries";
import type { RateInterval, Workplace, WorkplaceColor } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Профиль и настройки — Shiftly" },
      { name: "description", content: "Места работы, ставки, цели, уведомления и внешний вид Shiftly." },
      { property: "og:title", content: "Профиль и настройки — Shiftly" },
      { property: "og:description", content: "Настройки аккаунта и мест работы." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

type SectionId =
  | "workplaces" | "rates" | "commission" | "goals" | "notifications" | "ai" | "appearance" | "export";

const groups: Array<{ title: string; items: Array<{ id: SectionId; label: string; icon: LucideIcon; text: string }> }> = [
  {
    title: "Работа",
    items: [
      { id: "workplaces", label: "Места работы", icon: Briefcase, text: "Название и цвет места работы в календаре." },
      { id: "rates", label: "Ставки", icon: Coins, text: "Почасовые ставки по временным интервалам для каждого места работы." },
      { id: "commission", label: "Процент от выручки", icon: Percent, text: "Процент от личной выручки по каждому месту работы." },
      { id: "goals", label: "Финансовые цели", icon: Target, text: "Цели по заработку и по личной выручке на месяц." },
    ],
  },
  {
    title: "Приложение",
    items: [
      { id: "notifications", label: "Уведомления", icon: Bell, text: "Напоминания о сменах и итогах дня." },
      { id: "ai", label: "Настройки AI", icon: Sparkles, text: "Добавление смен текстом и по фото графика." },
      { id: "appearance", label: "Внешний вид", icon: Palette, text: "Тема оформления." },
      { id: "export", label: "Экспорт данных", icon: Download, text: "Выгрузка смен и заработка в CSV или PDF." },
    ],
  },
];
const all = groups.flatMap((g) => g.items);

function ProfilePage() {
  const { data: profile } = useProfile();
  const [open, setOpen] = useState<SectionId | null>(null);
  const current = all.find((i) => i.id === open);

  return (
    <div className="space-y-6">
      <PageHeader title="Профиль" />
      <Section>
        <Link to="/profile/account" className="block active:opacity-80" aria-label="Аккаунт и настройки">
          <Panel className="flex items-center gap-4 p-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent font-display text-xl text-accent-foreground">
              {profile?.name.charAt(0) ?? ""}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{profile?.name ?? " "}</p>
              <p className="text-sm text-muted-foreground">Бесплатный тариф · аккаунт</p>
            </div>
            <NavChevron />
          </Panel>
        </Link>
      </Section>
      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <Panel className="divide-y overflow-hidden">
            {g.items.map((it) => (
              <button key={it.id} onClick={() => setOpen(it.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary">
                <it.icon className="size-5 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{it.label}</span>
                <NavChevron />
              </button>
            ))}
          </Panel>
        </Section>
      ))}
      <Section><Button asChild variant="ghost" className="w-full justify-start gap-3 px-4"><Link to="/profile/trash"><Trash2 className="size-5 text-muted-foreground" /><span className="flex-1 text-left">Корзина</span><NavChevron /></Link></Button></Section>

      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent>
          {current && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{current.label}</DrawerTitle>
                <DrawerDescription>{current.text}</DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-8">
                {current.id === "workplaces" ? <WorkplacesPanel /> : current.id === "rates" ? <RatesPanel /> : current.id === "goals" ? <GoalsPanel /> : current.id === "appearance" ? <AppearancePanel /> : (
                  <p className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
                    Раздел будет доступен после подключения аккаунта.
                  </p>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function WorkplacesPanel() {
  const { data } = useWorkplaces();
  const [editing, setEditing] = useState<Workplace | "new" | null>(null);
  if (editing) return <WorkplaceEditor initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      {data?.length ? (
        <Panel className="divide-y">
          {data.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-4 py-3">
              <WorkplaceDot color={w.color} className="size-3" />
              <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(w)}>Изменить</Button>
            </div>
          ))}
        </Panel>
      ) : (
        <EmptyState icon={Briefcase} title="Нет мест работы" text="Добавьте первое место работы" />
      )}
      <Button variant="secondary" className="w-full" onClick={() => setEditing("new")}><Plus />Добавить место работы</Button>
      <p className="text-xs text-muted-foreground">Демо-режим: изменения хранятся до перезагрузки страницы.</p>
    </div>
  );
}

function WorkplaceEditor({ initial, onDone }: { initial: Workplace | null; onDone: () => void }) {
  const save = useSaveWorkplace();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<WorkplaceColor>(initial?.color ?? "violet");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        save.mutate({ id: initial?.id ?? `w${Date.now()}`, rates: initial?.rates ?? [], name: name.trim(), color }, { onSuccess: onDone });
      }}
    >
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Название</p>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Бар «Хмель»" />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Цвет в календаре</p>
        <div className="flex flex-wrap gap-3">
          {WORKPLACE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
              className={cn("grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-background", color === c.value && "ring-2 ring-foreground")}
              style={{ backgroundColor: wpColor(c.value) }}
            >
              {color === c.value && <Check className="size-4 text-background" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onDone}>Отмена</Button>
        <Button type="submit">Сохранить</Button>
      </div>
    </form>
  );
}

function RatesPanel() {
  const { data } = useWorkplaces();
  const save = useSaveWorkplace();
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState({ start: "10:00", end: "18:00", hourly: "" });
  const update = (w: Workplace, rates: RateInterval[]) => save.mutate({ ...w, rates });
  return (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto">
      {data?.map((w) => (
        <div key={w.id} className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium"><WorkplaceDot color={w.color} />{w.name}</p>
          <Panel className="divide-y">
            {w.rates.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Ставки не настроены — расчёт оплаты недоступен.</p>}
            {w.rates.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 tabular">{r.start}–{r.end}</span>
                <span className="tabular"><Money value={r.hourly} /> / ч</span>
                <Button size="icon" variant="ghost" className="size-8" aria-label="Удалить ставку" onClick={() => update(w, w.rates.filter((x) => x.id !== r.id))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {adding === w.id ? (
              <form
                className="grid grid-cols-[1fr_1fr_1fr] gap-2 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const hourly = parseNumberInput(draft.hourly);
                  if (!hourly || hourly <= 0) return;
                  update(w, [...w.rates, { id: `r${Date.now()}`, start: draft.start, end: draft.end, hourly }]);
                  setAdding(null);
                }}
              >
                <Input type="time" aria-label="С" className="min-w-0 px-2" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
                <Input type="time" aria-label="До" className="min-w-0 px-2" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
                <NumberInput aria-label="₽ в час" placeholder="₽/ч" className="min-w-0" value={draft.hourly} onValueChange={(hourly) => setDraft({ ...draft, hourly })} />
                <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(null)}>Отмена</Button>
                <Button type="submit" size="sm" className="col-span-2">Добавить</Button>
              </form>
            ) : (
              <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary" onClick={() => { setDraft({ start: "10:00", end: "18:00", hourly: "" }); setAdding(w.id); }}>
                <Plus className="size-4" />Интервал ставки
              </button>
            )}
          </Panel>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Если окончание раньше начала, интервал продолжается после полуночи.</p>
    </div>
  );
}

function GoalsPanel() {
  const { data: p } = useProfile();
  const [edit, setEdit] = useState<GoalField | null>(null);
  const rows = [
    { field: "monthlyGoal" as const, label: "Цель по заработку", value: p?.monthlyGoal ?? null },
    { field: "revenueGoal" as const, label: "Цель по личной выручке", value: p?.revenueGoal ?? null },
    { field: "hoursGoal" as const, label: "Ориентир по часам", value: p?.hoursGoal ?? null },
    { field: "shiftsGoal" as const, label: "Цель по сменам", value: p?.shiftsGoal ?? null },
  ];
  const cur = rows.find((r) => r.field === edit);
  return (
    <div className="space-y-3">
      <Panel className="divide-y">
        {rows.map((r) => (
          <button key={r.field} onClick={() => setEdit(r.field)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
            <span className="flex-1">{r.label}</span>
            {r.field === "hoursGoal" || r.field === "shiftsGoal" ? <span className="font-medium tabular">{formatNumber(r.value)}</span> : <Money value={r.value} className="font-medium" />}
            <NavChevron />
          </button>
        ))}
      </Panel>
      <p className="text-xs text-muted-foreground">Цели независимы друг от друга. Повышенный процент за выполнение плана появится позже.</p>
      <GoalDrawer open={!!cur} onClose={() => setEdit(null)} field={cur?.field ?? "monthlyGoal"} title={cur?.label ?? ""} value={cur?.value ?? null} />
    </div>
  );
}

function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          className={cn("rounded-2xl border-2 p-4 text-left text-sm font-medium", theme === t ? "border-primary" : "border-border")}
        >
          {t === "dark" ? "Тёмная" : "Светлая"}
        </button>
      ))}
    </div>
  );
}
