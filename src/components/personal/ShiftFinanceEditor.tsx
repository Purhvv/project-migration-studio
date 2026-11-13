import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/shared/NumberInput";
import { Money } from "@/components/shared/primitives";
import { financialRequest, financialShiftPayload, type ShiftFinances } from "@/lib/account-finances";
import { accountWrite } from "@/lib/account.functions";
import type { AdjustmentDraft } from "@/lib/account-shifts";

export function ShiftFinanceEditor({ finances, userId, onSaved, onCancel }: { finances: ShiftFinances; userId: string; onSaved: () => void; onCancel: () => void }) {
  const shift = finances.shift;
  const completed = shift.status === "completed";
  const [revenue, setRevenue] = useState(shift.revenue === null ? "" : String(shift.revenue));
  const [tips, setTips] = useState(shift.tips === null ? "" : String(shift.tips));
  const [adjustments, setAdjustments] = useState<Array<AdjustmentDraft & { comment?: string | null }>>(finances.adjustments.map((a) => ({ kind: a.kind === "penalty" ? "penalty" : "bonus", label: a.label, amount: a.amount === null ? "" : String(a.amount), comment: a.comment })));
  const [error, setError] = useState("");
  const request = useRef<{ key: string; signature: string } | null>(null);
  const write = useServerFn(accountWrite);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      const type = completed ? "shift_edit" : "shift_complete";
      request.current = financialRequest(request.current, type, payload);
      return write({ data: { key: request.current.key, type, payload } });
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["account", userId] }); onSaved(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить. Повторите попытку."),
  });
  const update = (index: number, patch: Partial<AdjustmentDraft>) => setAdjustments((rows) => rows.map((a, i) => i === index ? { ...a, ...patch } : a));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    setError("");
    try { save.mutate(financialShiftPayload(shift, { revenue, tips, adjustments })); }
    catch (e) { setError(e instanceof Error ? e.message : "Проверьте начисления."); }
  };
  return <form onSubmit={submit} className="space-y-4">
    <div className="flex items-center justify-between gap-3 border-b pb-3 text-sm"><span className="text-muted-foreground">Базовая оплата по ставкам</span><Money value={shift.base_pay} className="font-semibold" /></div>
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 space-y-1.5"><span className="text-xs text-muted-foreground">Выручка</span><NumberInput aria-label="Выручка" placeholder="Неизвестна" value={revenue} onValueChange={setRevenue} disabled={save.isPending} /></label>
      <label className="min-w-0 space-y-1.5"><span className="text-xs text-muted-foreground">Личные чаевые</span><NumberInput aria-label="Личные чаевые" placeholder="Неизвестны" value={tips} onValueChange={setTips} disabled={save.isPending} /></label>
    </div>
    {(["bonus", "penalty"] as const).map((kind) => {
      const title = kind === "bonus" ? "Премии" : "Штрафы";
      return <div key={kind} className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{title}</p><Button type="button" variant="ghost" size="sm" className="h-7 text-primary" disabled={save.isPending} onClick={() => setAdjustments([...adjustments, { kind, label: "", amount: "" }])}><Plus className="size-4" />Добавить {kind === "bonus" ? "премию" : "штраф"}</Button></div>
        {adjustments.map((a, index) => a.kind === kind && <div key={index} className="flex items-start gap-2"><Input className="min-w-0 flex-1" aria-label={`${title}: название ${index + 1}`} placeholder="Причина" value={a.label} disabled={save.isPending} onChange={(e) => update(index, { label: e.target.value })} /><NumberInput className="w-24 shrink-0" aria-label={`${title}: сумма ${index + 1}`} placeholder="Сумма" value={a.amount} disabled={save.isPending} onValueChange={(amount) => update(index, { amount })} /><Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Удалить корректировку ${index + 1}`} disabled={save.isPending} onClick={() => setAdjustments(adjustments.filter((_, i) => i !== index))}><X className="size-4" /></Button></div>)}
      </div>;
    })}
    <p className="text-xs text-muted-foreground">Базовая оплата, фиксированные выплаты, комиссия и итог рассчитываются сервером. Выручка не прибавляется к заработку. Пустые суммы остаются неизвестными.</p>
    {error && <p role="alert" className="text-sm text-negative">{error}</p>}
    <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>{save.isPending ? "Сохраняем…" : completed ? "Сохранить финансы" : "Подтвердить завершение"}</Button>
    <Button type="button" variant="secondary" className="w-full" disabled={save.isPending} onClick={onCancel}>Отмена</Button>
  </form>;
}