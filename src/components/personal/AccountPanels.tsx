import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Check, Plus, Trash2, Archive, ArrowLeft, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { accountWrite } from "@/lib/account.functions";
import { profileEditPayload, publishCommissionPayload, publishRatesPayload, validGoal, workplaceEditPayload, type AccountCommission, type AccountSettings, type AccountWorkplace, type GoalKey, type ProfileOperation } from "@/lib/account-settings";
import { supabase } from "@/integrations/supabase/client";
import { authError } from "@/lib/auth";
import { rateDraftError, selectRateVersions, validRateDate, workplaceToday, type HourlyDraft } from "@/lib/account-rates";
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
  const [ratesId, setRatesId] = useState<string | null>(null);
  const ratesWorkplace = settings.workplaces.find((w) => w.id === ratesId);
  if (ratesWorkplace) return <div className="space-y-4"><Button variant="ghost" onClick={() => setRatesId(null)}><ArrowLeft />Мои рабочие места</Button><h3 className="font-semibold">{ratesWorkplace.name} · Ставки</h3><RatesEditor workplace={ratesWorkplace} userId={userId} /></div>;
  if (editing) return <WorkplaceEditor userId={userId} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  return (
    <div className="space-y-3">
      {settings.workplaces.length ? (
        <div className="space-y-2">
          {settings.workplaces.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-2xl border border-l-4 bg-card px-4 py-3 shadow-card" style={{ borderLeftColor: wpColor(w.color) }}>
              <WorkplaceDot color={w.color} className="size-3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{w.name}</p>
                <p className="text-xs text-muted-foreground">Цель по выручке: <Money value={w.revenue_goal} /></p>
              </div>
              <div className="flex shrink-0 flex-col"><Button size="sm" variant="ghost" onClick={() => setRatesId(w.id)}>Ставки</Button><Button size="sm" variant="ghost" onClick={() => setEditing(w)}>Изменить</Button></div>
              <Button size="icon" variant="ghost" className="size-8" aria-label={`Архивировать ${w.name}`} disabled={save.isPending}
                onClick={() => { if (window.confirm(`Архивировать «${w.name}»? История смен сохранится.`)) save.mutate({ type: "workplace_archive", payload: { id: w.id, expected_revision: w.revision } }); }}>
                <Archive className="size-4" />
              </Button>
            </div>
          ))}
        </div>
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
  const [goal, setGoal] = useState(toInput(initial?.revenue_goal ?? null));
  const goalValue = parseNumberInput(goal);
  const goalOk = goalValue === null || goalValue > 0;
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim() || !goalOk) return;
      let payload: Record<string, unknown>;
      try { payload = workplaceEditPayload(initial, name, color, goalValue); } catch (err) { toast.error((err as Error).message); return; }
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
      <div className="space-y-1.5">
        <Label>Цель по выручке за месяц</Label>
        <NumberInput aria-label="Цель по выручке" placeholder="Не задана" value={goal} onValueChange={setGoal} />
        {goalOk ? <Note>Только для этого места. Оставьте пустым, чтобы не задавать.</Note> : <p className="text-xs text-negative">Число больше 0</p>}
      </div>
      <div className="grid grid-cols-2 gap-3"><Button type="button" variant="secondary" onClick={onDone}>Отмена</Button><Button type="submit" disabled={save.isPending || !name.trim() || !goalOk}>Сохранить</Button></div>
    </form>
  );
}

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

export function RatesEditor({ workplace: w, userId }: { workplace: AccountWorkplace; userId: string }) {
  const versions = w.rateVersions ?? (w.rates ? [w.rates] : []);
  const localToday = workplaceToday(w.timezone);
  const { current, scheduled } = selectRateVersions(versions, localToday);
  const [selected, setSelected] = useState<string>(current?.id ?? scheduled[0]?.id ?? "new");
  const version = versions.find((v) => v.id === selected) ?? null;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{current ? `Действующая версия №${current.revision} с ${current.effective_from}` : "Действующих ставок пока нет"}</p>
    <div className="space-y-1.5"><Label>Версия ставок</Label>
      <select aria-label="Версия ставок" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
        {current && <option value={current.id}>Действующая · с {current.effective_from}</option>}
        {scheduled.map((v) => <option key={v.id} value={v.id}>Запланирована · с {v.effective_from}</option>)}
        {versions.filter((v) => v.id !== current?.id && v.effective_from <= localToday).map((v) => <option key={v.id} value={v.id}>Прошлая №{v.revision} · с {v.effective_from}</option>)}
        <option value="new">Новая версия</option>
      </select>
    </div>
    <RateVersionForm key={`${w.id}:${selected}:${version?.id ?? "new"}`} workplace={w} userId={userId} version={version} />
  </div>;
}

function RateVersionForm({ workplace: w, userId, version }: { workplace: AccountWorkplace; userId: string; version: AccountWorkplace["rates"] }) {
  const save = useAccountWrite(userId);
  const [rows, setRows] = useState<HourlyDraft[]>((version?.intervals ?? []).filter((i) => i.kind === "hourly").map((i) => ({ label: i.label, start: i.start_time ?? "", end: i.end_time ?? "", hourly: toInput(i.hourly), weekdays: i.weekdays })));
  const [from, setFrom] = useState(workplaceToday(w.timezone));
  const fixed = (version?.intervals ?? []).filter((i) => i.kind === "fixed");
  const error = rateDraftError(rows, fixed.length > 0);
  function update(index: number, patch: Partial<HourlyDraft>) { setRows((old) => old.map((r, i) => i === index ? { ...r, ...patch } : r)); }
  function publish(e: React.FormEvent) {
    e.preventDefault();
    if (error || !validRateDate(from)) return;
    if (w.rateVersions?.some((v) => v.effective_from === from) || w.rates?.effective_from === from) { toast.error("На эту дату уже есть версия. Выберите другую дату."); return; }
    if (version && !window.confirm(`Опубликовать новую версию с ${from}? Завершённые смены не изменятся.`)) return;
    try { save.mutate({ type: "publish_rates", payload: publishRatesPayload(w.id, from, rows, fixed) }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Проверьте ставки"); }
  }
  return <form className="space-y-4" onSubmit={publish}>
    <fieldset disabled={save.isPending} className="min-w-0 space-y-3">
      {!rows.length && <p className="py-3 text-center text-sm text-muted-foreground">Почасовых ставок нет</p>}
      {rows.map((r, i) => <div key={i} className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center gap-2"><Input aria-label={`Название ставки ${i + 1}`} value={r.label} placeholder="Название ставки" maxLength={200} onChange={(e) => update(i, { label: e.target.value })} /><Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" aria-label={`Удалить интервал ${i + 1}`} title="Удалить интервал" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></div>
        <div className="grid grid-cols-2 gap-2"><div className="min-w-0 space-y-1"><Label>Начало</Label><Input type="time" aria-label={`Начало интервала ${i + 1}`} className="min-w-0 px-2" value={r.start} onChange={(e) => update(i, { start: e.target.value })} /></div><div className="min-w-0 space-y-1"><Label>Окончание</Label><Input type="time" aria-label={`Окончание интервала ${i + 1}`} className="min-w-0 px-2" value={r.end} onChange={(e) => update(i, { end: e.target.value })} /></div></div>
        <div className="space-y-1"><Label>Оплата, ₽/час</Label><NumberInput aria-label={`Оплата ставки ${i + 1}`} placeholder="250" value={r.hourly} onValueChange={(hourly) => update(i, { hourly })} /></div>
        {!!r.weekdays?.length && <Note>Дни: {r.weekdays.map((d) => ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][d]).join(", ")}</Note>}
      </div>)}
      <Button type="button" variant="secondary" className="w-full" onClick={() => setRows([...rows, { label: "", start: "08:00", end: "17:00", hourly: "", weekdays: [] }])}><Plus />Добавить интервал</Button>
      {error && rows.length > 0 && <p role="alert" className="text-xs text-negative">{error}</p>}
      {fixed.length > 0 && <Note>Фиксированные выплаты сохранятся без изменений.</Note>}
      <fieldset className="space-y-2"><legend className="mb-2 text-xs text-muted-foreground">Применение изменений</legend>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="rate-application" checked readOnly className="mt-1 accent-primary" />Только с указанной даты</label>
        <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="radio" name="rate-application" disabled className="mt-1" />Пересчитать прошлые смены — недоступно</label>
      </fieldset>
      <div className="space-y-1.5"><Label>Новая версия действует с</Label><Input type="date" aria-label="Дата начала ставок" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      {!validRateDate(from) && <p role="alert" className="text-xs text-negative">Укажите корректную дату</p>}
      <Button type="submit" className="w-full" disabled={save.isPending || !!error || !validRateDate(from)}>{save.isPending && <LoaderCircle className="size-4 animate-spin" />}{save.isPending ? "Сохраняем…" : "Опубликовать ставки"}</Button>
    </fieldset>
    <Note>Завершённые смены сохраняют прежний расчёт. Серверная операция пересчёта истории пока не реализована.</Note>
  </form>;
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
