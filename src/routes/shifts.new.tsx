import { createFileRoute, useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Chips, Panel } from "@/components/shared/primitives";
import { RateEstimate } from "@/components/shifts/estimate";
import { ConflictWarning } from "@/components/shifts/ConflictWarning";
import { NumberInput } from "@/components/shared/NumberInput";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";
import { useWorkplaces } from "@/data/queries";
import { formatHours, parseNumberInput, shiftMinutes } from "@/lib/format";
import type { ShiftStatus } from "@/lib/types";

export const Route = createFileRoute("/shifts/new")({
  validateSearch: (s: Record<string, unknown>): { date?: string } =>
    typeof s['date'] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s['date']) ? { date: s['date'] } : {},
  head: () => ({
    meta: [
      { title: "Новая смена — Shiftly" },
      { name: "description", content: "Добавьте запланированную или завершённую смену." },
      { property: "og:title", content: "Новая смена — Shiftly" },
      { property: "og:description", content: "Быстрое добавление смены." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewShift,
});

interface Adj { id: number; label: string; amount: string }

function NewShift() {
  const router = useRouter();
  const { date: initialDate } = Route.useSearch();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: workplaces } = useWorkplaces();
  const [date, setDate] = useState(initialDate ?? today);
  const [status, setStatus] = useState<ShiftStatus>(date < today ? "completed" : "planned");
  const [workplace, setWorkplace] = useState<string>("");
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("22:00");
  const [bonuses, setBonuses] = useState<Adj[]>([]);
  const [penalties, setPenalties] = useState<Adj[]>([]);
  const [revenue, setRevenue] = useState("");
  const [tips, setTips] = useState("");
  const [comment, setComment] = useState("");
  const guard = useShiftSaveGuard(() => router.history.back());
  const wpId = workplace || workplaces?.[0]?.id || "";
  const done = status === "completed";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wpId) { toast("Выберите место работы"); return; }
    const num = parseNumberInput;
    const adj = (l: Adj[], p: string) => l.map((a) => ({ id: `${p}${a.id}`, label: a.label || "Без причины", amount: num(a.amount) }));
    guard.saveShift(
      {
        id: `s${Date.now()}`, workplaceId: wpId, date, start, end, status,
        revenue: done ? num(revenue) : null, tips: done ? num(tips) : null,
        // actual totals come from the backend/payroll; unknown until confirmed
        basePay: null, earnings: null,
        bonuses: done ? adj(bonuses, "b") : [], penalties: done ? adj(penalties, "p") : [],
        comment: comment || undefined,
      },
      () => {
          toast("Смена сохранена", { description: "Демо-режим: данные хранятся до перезагрузки страницы." });
          router.navigate({ to: "/calendar" });
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6 px-5 pt-4 pb-6">
      <header className="flex items-center gap-2">
        <Button type="button" size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">Новая смена</h1>
      </header>

      <Chips
        value={status}
        onChange={setStatus}
        options={[{ value: "planned", label: "Запланированная" }, { value: "completed", label: "Завершённая" }]}
      />

      <Panel className="space-y-4 p-4">
        <Field label="Место работы">
          <Select value={wpId} onValueChange={setWorkplace}>
            <SelectTrigger><SelectValue placeholder="Выберите место" /></SelectTrigger>
            <SelectContent>
              {workplaces?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Дата"><Input type="date" className={dtCls} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={done ? "Факт. начало" : "Начало"}><Input type="time" className={dtCls} value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label={done ? "Факт. окончание" : "Окончание"}><Input type="time" className={dtCls} value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
        </div>
        {start && end && <p className="text-xs text-muted-foreground">Продолжительность: {formatHours(shiftMinutes(start, end))}</p>}
      </Panel>

      {done && (
        <Panel className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Выручка"><NumberInput aria-label="Выручка" placeholder="₽" value={revenue} onValueChange={setRevenue} /></Field>
            <Field label="Личные чаевые"><NumberInput aria-label="Личные чаевые" placeholder="₽" value={tips} onValueChange={setTips} /></Field>
          </div>
          <AdjList title="Премии" items={bonuses} onChange={setBonuses} />
          <AdjList title="Штрафы" items={penalties} onChange={setPenalties} />
        </Panel>
      )}

      <Field label="Комментарий"><Textarea rows={2} placeholder="Необязательно" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>

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
  const update = (id: number, patch: Partial<Adj>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{title}</Label>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-primary" onClick={() => onChange([...items, { id: Date.now(), label: "", amount: "" }])}>
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
