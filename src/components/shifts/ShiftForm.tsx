import { useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shared/primitives";
import { RateEstimate } from "@/components/shifts/estimate";
import { ConflictWarning } from "@/components/shifts/ConflictWarning";
import { NumberInput } from "@/components/shared/NumberInput";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";
import { useWorkplaces } from "@/data/queries";
import { formatHours, parseNumberInput, shiftMinutes } from "@/lib/format";
import { reconcileConfirmedEdit } from "@/lib/shift-management";
import { STATUS_META } from "@/components/shifts/shift-ui";
import type { Shift, ShiftStatus } from "@/lib/types";

interface Adj { id: string; label: string; amount: string }

export function ShiftForm({ initial, initialDate }: { initial?: Shift; initialDate?: string }) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: workplaces } = useWorkplaces();
  const [date, setDate] = useState(initial?.date ?? initialDate ?? today);
  const [status, setStatus] = useState<ShiftStatus>(initial?.status ?? (date < today ? "completed" : "planned"));
  const [workplace, setWorkplace] = useState<string>(initial?.workplaceId ?? "");
  const [start, setStart] = useState(initial?.start ?? "12:00");
  const [end, setEnd] = useState(initial?.end ?? "22:00");
  const [bonuses, setBonuses] = useState<Adj[]>(initial?.bonuses.map(a => ({ ...a, amount: a.amount === null ? "" : String(a.amount) })) ?? []);
  const [penalties, setPenalties] = useState<Adj[]>(initial?.penalties.map(a => ({ ...a, amount: a.amount === null ? "" : String(a.amount) })) ?? []);
  const [revenue, setRevenue] = useState(initial?.revenue == null ? "" : String(initial.revenue));
  const [tips, setTips] = useState(initial?.tips == null ? "" : String(initial.tips));
  const [comment, setComment] = useState(initial?.comment == null ? "" : String(initial.comment));
  const [basePay, setBasePay] = useState(initial?.basePay == null ? "" : String(initial.basePay));
  const [commission, setCommission] = useState(initial?.commissionPay == null ? "" : String(initial.commissionPay));
  const [earnings, setEarnings] = useState(initial?.earnings == null ? "" : String(initial.earnings));
  const guard = useShiftSaveGuard(() => router.history.back());
  const wpId = workplace || workplaces?.[0]?.id || "";
  const done = status !== "planned";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wpId) { toast("Выберите место работы"); return; }
    const num = parseNumberInput;
    const adj = (l: Adj[]) => l.map((a) => ({ id: a.id, label: a.label || "Без причины", amount: num(a.amount) }));
    const candidate: Shift = {
      ...initial, id: initial?.id ?? `s${crypto.randomUUID()}`, workplaceId: wpId, date, start, end, status,
      revenue: num(revenue), tips: num(tips), basePay: num(basePay), commissionPay: num(commission),
      earnings: num(earnings), bonuses: adj(bonuses), penalties: adj(penalties), comment: comment || undefined,
    };
    const enteredTotalChanged = num(earnings) !== (initial?.earnings ?? null);
    const updated = enteredTotalChanged ? candidate : reconcileConfirmedEdit(initial, candidate);
    guard.saveShift(updated, () => {
      toast(initial ? "Смена обновлена" : "Смена сохранена", { description: "Демо-режим: данные хранятся до перезагрузки страницы." });
      if (initial) router.navigate({ to: "/shifts/$id", params: { id: initial.id } });
      else router.navigate({ to: "/calendar" });
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6 px-5 pt-4 pb-6">
      <header className="flex items-center gap-2">
        <Button type="button" size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">{initial ? "Редактировать смену" : "Новая смена"}</h1>
      </header>

      <Field label="Статус"><Select value={status} onValueChange={(v) => setStatus(v as ShiftStatus)}><SelectTrigger aria-label="Статус"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></Field>

      <Panel className="space-y-4 p-4">
        <Field label="Место работы">
          <Select value={wpId} onValueChange={setWorkplace}>
            <SelectTrigger aria-label="Место работы"><SelectValue placeholder="Выберите место" /></SelectTrigger>
            <SelectContent>
              {workplaces?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Дата"><Input aria-label="Дата смены" type="date" className={dtCls} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={done ? "Факт. начало" : "Начало"}><Input aria-label="Начало смены" type="time" className={dtCls} value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label={done ? "Факт. окончание" : "Окончание"}><Input aria-label="Окончание смены" type="time" className={dtCls} value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
        </div>
        {start && end && <p className="text-xs text-muted-foreground">Продолжительность: {formatHours(shiftMinutes(start, end))}</p>}
      </Panel>

      {done && (
        <Panel className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Выручка"><NumberInput aria-label="Выручка" placeholder="₽" value={revenue} onValueChange={setRevenue} /></Field>
            <Field label="Личные чаевые"><NumberInput aria-label="Личные чаевые" placeholder="₽" value={tips} onValueChange={setTips} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начислено по ставке"><NumberInput aria-label="Начислено по ставке" value={basePay} onValueChange={setBasePay} placeholder="₽" /></Field>
            <Field label="Подтверждённый процент"><NumberInput aria-label="Подтверждённый процент" value={commission} onValueChange={setCommission} placeholder="₽" /></Field>
          </div>
          <Field label="Подтверждённый заработок"><NumberInput aria-label="Подтверждённый заработок" value={earnings} onValueChange={setEarnings} placeholder="₽" /></Field>
          <AdjList title="Премии" items={bonuses} onChange={setBonuses} />
          <AdjList title="Штрафы" items={penalties} onChange={setPenalties} />
        </Panel>
      )}

      <Field label="Комментарий"><Textarea aria-label="Комментарий" rows={2} placeholder="Необязательно" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>

      <div className="space-y-3 rounded-2xl border bg-card p-4">
        {done ? (
          <p className="text-xs text-muted-foreground">Итоговый заработок появится после подтверждения начислений.</p>
        ) : (
          <>
            <RateEstimate workplace={workplaces?.find((w) => w.id === wpId)} date={date} start={start} end={end} />
            <p className="text-xs text-muted-foreground">Без чаевых, процента от выручки, премий и штрафов.</p>
          </>
        )}
        <Button type="submit" disabled={!guard.ready || guard.warning.pending} className="w-full" size="lg">Сохранить смену</Button>
      </div>
      <ConflictWarning {...guard.warning} />
    </form>
  );
}

/** Native date/time inputs on iOS ignore width without these. */
const dtCls = "block w-full min-w-0 appearance-none text-left [&::-webkit-date-and-time-value]:text-left";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function AdjList({ title, items, onChange }: { title: string; items: Adj[]; onChange: (v: Adj[]) => void }) {
  const update = (id: string, patch: Partial<Adj>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{title}</Label>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-primary" onClick={() => onChange([...items, { id: crypto.randomUUID(), label: "", amount: "" }])}>
          <Plus className="size-4" />Добавить
        </Button>
      </div>
      {items.map((i) => (
        <div key={i.id} className="flex gap-2">
          <Input placeholder="Причина" className="min-w-0" value={i.label} onChange={(e) => update(i.id, { label: e.target.value })} />
          <NumberInput aria-label={`Сумма: ${title}`} placeholder="₽" className="w-24 shrink-0" value={i.amount} onValueChange={(amount) => update(i.id, { amount })} />
          <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => onChange(items.filter((x) => x.id !== i.id))} aria-label="Удалить">
            <Minus className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
