import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Check, Plus, Trash2, Archive } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { accountWrite } from "@/lib/account.functions";
import { profileEditPayload, publishCommissionPayload, publishRatesPayload, validGoal, type AccountCommission, type AccountSettings, type AccountWorkplace, type GoalKey, type HourlyDraft, type ProfileOperation } from "@/lib/account-settings";
import { supabase } from "@/integrations/supabase/client";
import { authError } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/shared/NumberInput";
import { EmptyState, Money, NavChevron, Panel } from "@/components/shared/primitives";
import { WORKPLACE_COLORS, WorkplaceDot, wpColor } from "@/components/shifts/shift-ui";
import { formatNumber, parseNumberInput } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { WorkplaceColor } from "@/lib/types";

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;
const Note = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;
const toInput = (n: number | null) => (n === null ? "" : String(n));

export function useAccountWrite(userId: string) {
  const write = useServerFn(accountWrite);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { type: ProfileOperation; payload: Record<string, unknown> }) => write({ data: { key: crypto.randomUUID(), ...v } }),
    onSuccess: () => { toast.success("Сохранено"); return qc.invalidateQueries({ queryKey: ["account", userId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });
}
type Ctx = { settings: AccountSettings; userId: string };

export function PersonalDataPanel({ settings, userId, user }: Ctx & { user: User }) {
  const save = useAccountWrite(userId);
  const [name, setName] = useState(settings.profile.name);
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const next = email.trim();
    if (!next || next === user.email) return;
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/auth/callback` });
    setEmailBusy(false);
    if (error) { toast.error(authError(error)); return; }
    setEmail("");
    toast.success("Письмо для подтверждения отправлено на новый адрес");
  }
  return (
    <div className="space-y-5">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ type: "profile_edit", payload: profileEditPayload(settings.profile, { name }) }); }}>
        <Label>Имя</Label>
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Имя" />
        <Button type="submit" className="w-full" disabled={save.isPending || !name.trim() || name.trim() === settings.profile.name}>Сохранить имя</Button>
      </form>
      <div className="space-y-1 rounded-2xl bg-secondary p-4 text-sm">
        <Label>Email</Label>
        <p className="break-words font-medium">{user.email ?? "—"}</p>
        <p className={cn("text-xs", user.email_confirmed_at ? "text-positive" : "text-muted-foreground")}>{user.email_confirmed_at ? "Подтверждён" : "Не подтверждён"}</p>
        {user.new_email && <p className="text-xs text-muted-foreground">Ожидает подтверждения: {user.new_email}</p>}
      </div>
      <form className="space-y-2" onSubmit={changeEmail}>
        <Label>Новый email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Новый email" />
        <Button type="submit" variant="secondary" className="w-full" disabled={emailBusy || !email.trim()}>Изменить email</Button>
        <Note>Адрес изменится только после перехода по ссылке из письма.</Note>
      </form>
      <Note>Часовой пояс: {settings.profile.timezone} · Валюта: {settings.profile.currency}</Note>
    </div>
  );
}

export function GoalsPanel({ settings, userId }: Ctx) {
  const save = useAccountWrite(userId);
  const p = settings.profile;
  const [vals, setVals] = useState<Record<GoalKey, string>>({ monthly_goal: toInput(p.monthly_goal), hours_goal: toInput(p.hours_goal), shifts_goal: toInput(p.shifts_goal) });
  const rows: Array<{ key: GoalKey; label: string; money?: boolean }> = [
    { key: "monthly_goal", label: "Цель по заработку за месяц", money: true },
    { key: "hours_goal", label: "Цель по рабочим часам" },
    { key: "shifts_goal", label: "Цель по количеству смен" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const value = parseNumberInput(vals[r.key]);
        const ok = validGoal(r.key, value);
        return (
          <form key={r.key} className="space-y-2 rounded-2xl border p-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate({ type: "profile_edit", payload: profileEditPayload(p, { [r.key]: value }) }); }}>
            <div className="flex items-center justify-between text-sm"><span>{r.label}</span>{r.money ? <Money value={p[r.key]} className="font-medium" /> : <span className="font-medium tabular">{formatNumber(p[r.key])}</span>}</div>
            <div className="flex gap-2">
              <NumberInput aria-label={r.label} placeholder="Не задана" value={vals[r.key]} onValueChange={(v) => setVals({ ...vals, [r.key]: v })} />
              <Button type="submit" disabled={save.isPending || !ok}>Сохранить</Button>
            </div>
            {!ok && <p className="text-xs text-negative">{r.key === "shifts_goal" ? "Целое число больше 0" : "Число больше 0"}</p>}
          </form>
        );
      })}
      <Note>Оставьте поле пустым, чтобы снять цель.</Note>
    </div>
  );
}

export function WorkplacesPanel({ settings, userId }: Ctx) {
  const [editing, setEditing] = useState<AccountWorkplace | "new" | null>(null);
  const save = useAccountWrite(userId);
  if (editing) return <WorkplaceEditor userId={userId} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      {settings.workplaces.length ? (
        <Panel className="divide-y">
          {settings.workplaces.map((w) => (
            <div key={w.id} className="flex items-center gap-2 px-4 py-3">
              <WorkplaceDot color={w.color} className="size-3" />
              <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(w)}>Изменить</Button>
              <Button size="icon" variant="ghost" className="size-8" aria-label={`Архивировать ${w.name}`} disabled={save.isPending}
                onClick={() => { if (window.confirm(`Архивировать «${w.name}»? История смен сохранится.`)) save.mutate({ type: "workplace_archive", payload: { id: w.id, expected_revision: w.revision } }); }}>
                <Archive className="size-4" />
              </Button>
            </div>
          ))}
        </Panel>
      ) : <EmptyState icon={Briefcase} title="Нет мест работы" text="Добавьте первое место работы" />}
      <Button variant="secondary" className="w-full" onClick={() => setEditing("new")}><Plus />Добавить место работы</Button>
      <Note>Места работы не удаляются, а архивируются, чтобы не потерять историю.</Note>
    </div>
  );
}

function WorkplaceEditor({ userId, initial, onDone }: { userId: string; initial: AccountWorkplace | null; onDone: () => void }) {
  const save = useAccountWrite(userId);
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<WorkplaceColor>(initial?.color ?? "green");
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      const payload = initial
        ? { id: initial.id, expected_revision: initial.revision, name: name.trim(), color }
        : { id: crypto.randomUUID(), name: name.trim(), color };
      save.mutate({ type: "workplace_edit", payload }, { onSuccess: onDone });
    }}>
      <div className="space-y-1.5"><Label>Название</Label><Input autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Бар «Хмель»" /></div>
      <div className="space-y-2">
        <Label>Цвет в календаре</Label>
        <div className="flex flex-wrap gap-3">
          {WORKPLACE_COLORS.map((c) => (
            <button key={c.value} type="button" aria-label={c.label} aria-pressed={color === c.value} onClick={() => setColor(c.value)}
              className={cn("grid size-10 place-items-center rounded-full ring-offset-2 ring-offset-background", color === c.value && "ring-2 ring-foreground")} style={{ backgroundColor: wpColor(c.value) }}>
              {color === c.value && <Check className="size-4 text-background" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onDone}>Отмена</Button><Button type="submit" disabled={save.isPending || !name.trim()}>Сохранить</Button></div>
    </form>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const nextMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toISOString().slice(0, 7); };

function WorkplacePicker({ settings, value, onChange }: { settings: AccountSettings; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {settings.workplaces.map((w) => (
        <button key={w.id} type="button" onClick={() => onChange(w.id)} aria-pressed={value === w.id}
          className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", value === w.id ? "border-primary" : "border-border")}>
          <WorkplaceDot color={w.color} />{w.name}
        </button>
      ))}
    </div>
  );
}

export function RatesPanel({ settings, userId }: Ctx) {
  const [wid, setWid] = useState<string | null>(settings.workplaces[0]?.id ?? null);
  const w = settings.workplaces.find((x) => x.id === wid);
  if (!w) return <EmptyState icon={Briefcase} title="Нет мест работы" text="Сначала добавьте место работы" />;
  return <div className="max-h-[65vh] space-y-4 overflow-y-auto"><WorkplacePicker settings={settings} value={wid} onChange={setWid} /><RatesEditor key={`${w.id}:${w.rates?.id ?? "none"}`} workplace={w} userId={userId} /></div>;
}

function RatesEditor({ workplace: w, userId }: { workplace: AccountWorkplace; userId: string }) {
  const save = useAccountWrite(userId);
  const initial: Array<{ start: string; end: string; hourly: string }> = (w.rates?.intervals ?? []).filter((i) => i.kind === "hourly").map((i) => ({ start: i.start_time ?? "10:00", end: i.end_time ?? "18:00", hourly: toInput(i.hourly) }));
  const [rows, setRows] = useState(initial);
  const [from, setFrom] = useState(today());
  const parsed: HourlyDraft[] = rows.map((r) => ({ start: r.start, end: r.end, hourly: parseNumberInput(r.hourly) ?? NaN }));
  const valid = parsed.length > 0 && parsed.every((r) => r.hourly > 0 && r.start && r.end && r.start !== r.end);
  const fixed = (w.rates?.intervals ?? []).filter((i) => i.kind === "fixed");
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{w.rates ? `Действующая версия №${w.rates.revision} с ${w.rates.effective_from}` : "Ставки не настроены — расчёт оплаты недоступен."}</p>
      <Panel className="divide-y">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 p-2">
            <Input type="time" aria-label="С" className="min-w-0 px-2" value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            <Input type="time" aria-label="До" className="min-w-0 px-2" value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            <NumberInput aria-label="₽ в час" placeholder="₽/ч" className="min-w-0" value={r.hourly} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, hourly: v } : x)))} />
            <Button size="icon" variant="ghost" className="size-8" aria-label="Удалить интервал" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary" onClick={() => setRows([...rows, { start: "10:00", end: "18:00", hourly: "" }])}><Plus className="size-4" />Интервал ставки</button>
      </Panel>
      {fixed.length > 0 && <Note>Фиксированные выплаты ({fixed.map((f) => f.label).join(", ")}) сохранятся в новой версии.</Note>}
      <div className="space-y-1.5"><Label>Новая версия действует с</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <Button className="w-full" disabled={save.isPending || !valid || !from}
        onClick={() => save.mutate({ type: "publish_rates", payload: publishRatesPayload(w.id, from, parsed, fixed) })}>Опубликовать ставки</Button>
      <Note>Изменение создаёт новую версию ставок; прошлые версии и завершённые смены не меняются. Если окончание раньше начала, интервал продолжается после полуночи.</Note>
    </div>
  );
}

export function CommissionPanel({ settings, userId }: Ctx) {
  const [wid, setWid] = useState<string | null>(settings.workplaces[0]?.id ?? null);
  const w = settings.workplaces.find((x) => x.id === wid);
  if (!w) return <EmptyState icon={Briefcase} title="Нет мест работы" text="Сначала добавьте место работы" />;
  return <div className="max-h-[65vh] space-y-4 overflow-y-auto"><WorkplacePicker settings={settings} value={wid} onChange={setWid} /><CommissionEditor key={`${w.id}:${w.commission?.id ?? "none"}`} workplace={w} userId={userId} /></div>;
}

const MODES: Array<{ value: AccountCommission["mode"]; label: string }> = [{ value: "none", label: "Нет" }, { value: "fixed", label: "Фиксированный" }, { value: "thresholds", label: "Пороги" }];

function CommissionEditor({ workplace: w, userId }: { workplace: AccountWorkplace; userId: string }) {
  const save = useAccountWrite(userId);
  const c = w.commission;
  const [mode, setMode] = useState<AccountCommission["mode"]>(c?.mode ?? "none");
  const [fixed, setFixed] = useState(toInput(c?.fixed_percent ?? null));
  const [rows, setRows] = useState((c?.thresholds ?? []).map((t) => ({ from: String(t.from_amount), percent: String(t.percent) })));
  const [month, setMonth] = useState(nextMonth());
  function publish() {
    try {
      const payload = publishCommissionPayload(w.id, month, mode, parseNumberInput(fixed), rows.map((r) => ({ from_amount: parseNumberInput(r.from) ?? NaN, percent: parseNumberInput(r.percent) ?? NaN })));
      save.mutate({ type: "publish_commission", payload });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Проверьте значения"); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{c ? `Текущее правило №${c.revision} с ${c.effective_from}: ${c.mode === "none" ? "без процента" : c.mode === "fixed" ? `${formatNumber(c.fixed_percent)} %` : `пороги (${c.thresholds.length})`}` : "Правило не настроено."}</p>
      <div className="grid grid-cols-3 gap-2">{MODES.map((m) => <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => setMode(m.value)} className={cn("rounded-xl border-2 px-2 py-2 text-sm", mode === m.value ? "border-primary" : "border-border")}>{m.label}</button>)}</div>
      {mode === "fixed" && <div className="space-y-1.5"><Label>Процент от выручки</Label><NumberInput aria-label="Процент" placeholder="%" value={fixed} onValueChange={setFixed} /></div>}
      {mode === "thresholds" && (
        <Panel className="divide-y">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 p-2">
              <NumberInput aria-label="Выручка от, ₽" placeholder="От, ₽" value={r.from} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
              <NumberInput aria-label="Процент" placeholder="%" value={r.percent} onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, percent: v } : x)))} />
              <Button size="icon" variant="ghost" className="size-8" aria-label="Удалить порог" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary" onClick={() => setRows([...rows, { from: "", percent: "" }])}><Plus className="size-4" />Порог</button>
        </Panel>
      )}
      <div className="space-y-1.5"><Label>Действует с месяца</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <Button className="w-full" disabled={save.isPending} onClick={publish}>Опубликовать правило</Button>
      <Note>Правило применяется с первого дня выбранного месяца. Прошлые закрытые месяцы не пересчитываются.</Note>
    </div>
  );
}

export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["dark", "light"] as const).map((t) => (
        <button key={t} onClick={() => setTheme(t)} aria-pressed={theme === t} className={cn("rounded-2xl border-2 p-4 text-left text-sm font-medium", theme === t ? "border-primary" : "border-border")}>{t === "dark" ? "Тёмная" : "Светлая"}</button>
      ))}
    </div>
  );
}

export function SettingsRow({ icon: Icon, label, hint, soon, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; hint?: string; soon?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={soon} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-secondary disabled:opacity-60">
      <Icon className="size-5 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium">{label}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</span>
      {soon ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Soon</span> : <NavChevron />}
    </button>
  );
}
