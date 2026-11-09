import { useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { AlertTriangle, ChevronLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Money, Panel } from "@/components/shared/primitives";
import { STATUS_META, StatusIcon, WorkplaceDot } from "@/components/shifts/shift-ui";
import { accountWrite } from "@/lib/account.functions";
import { estimateAccountPay, findAccountConflicts, shiftCreatePayload, shiftDeletePayload, shiftEditPayload, shiftTimeFields, type AccountConflict, type AccountShift } from "@/lib/account-shifts";
import type { AccountWorkplace } from "@/lib/account-settings";
import { formatHours, fmtDate, shiftMinutes } from "@/lib/format";

interface FormProps {
  userId: string;
  workplaces: AccountWorkplace[];
  shifts: AccountShift[];
  initial?: AccountShift;
  initialDate?: string | undefined;
}

/** Personal shift form: writes only through accountWrite → shiftly_write; never shows demo data. */
export function PersonalShiftForm({ userId, workplaces, shifts, initial, initialDate }: FormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const write = useServerFn(accountWrite);
  const today = format(new Date(), "yyyy-MM-dd");
  const [workplaceId, setWorkplaceId] = useState(initial?.workplace_id ?? workplaces[0]?.id ?? "");
  const [date, setDate] = useState(initial?.local_start_date ?? initialDate ?? today);
  const [start, setStart] = useState(initial?.start_time ?? "12:00");
  const [end, setEnd] = useState(initial?.end_time ?? "22:00");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [conflicts, setConflicts] = useState<AccountConflict[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const workplace = workplaces.find((w) => w.id === workplaceId);
  const mutation = useMutation({
    mutationFn: (input: { type: "shift_create" | "shift_edit"; payload: Record<string, unknown> }) =>
      write({ data: { key: crypto.randomUUID(), type: input.type, payload: input.payload } }),
    onSuccess: async () => {
      toast.success(initial ? "Смена обновлена" : "Смена сохранена");
      await queryClient.invalidateQueries({ queryKey: ["account", userId] });
      if (initial) router.navigate({ to: "/app/shifts/$id", params: { id: initial.id } });
      else router.navigate({ to: "/app/calendar" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить. Попробуйте ещё раз."),
  });
  const deletion = useMutation({
    mutationFn: () => write({ data: { key: crypto.randomUUID(), type: "shift_delete", payload: shiftDeletePayload(initial!) } }),
    onSuccess: async () => {
      toast.success("Смена удалена");
      await queryClient.invalidateQueries({ queryKey: ["account", userId] });
      router.navigate({ to: "/app/calendar" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить. Попробуйте ещё раз."),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workplace) { toast.error("Выберите место работы"); return; }
    let time;
    try {
      time = shiftTimeFields({ workplace, date, start, end });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Проверьте дату и время смены.");
      return;
    }
    const found = findAccountConflicts({ id: initial?.id ?? null, starts_at: time.starts_at, ends_at: time.ends_at }, shifts);
    if (found.length) { setConflicts(found); return; }
    setConflicts([]);
    mutation.mutate(initial
      ? { type: "shift_edit", payload: shiftEditPayload(initial, { workplace, date, start, end }, comment) }
      : { type: "shift_create", payload: shiftCreatePayload({ workplace, date, start, end }, comment) });
  };

  const estimate = workplace && start && end && start !== end ? estimateAccountPay(workplace, date, start, end) : null;
  const showEstimate = !initial || initial.status === "planned" || initial.status === "in_progress" || initial.status === "pending";

  return (
    <form onSubmit={submit} className="space-y-6 px-5 pt-4 pb-6">
      <header className="flex items-center gap-2">
        <Button type="button" size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">{initial ? "Редактировать смену" : "Новая смена"}</h1>
      </header>

      {initial && (
        <Panel className="flex items-center gap-2 p-4 text-sm">
          <StatusIcon status={initial.status} />
          <span>{STATUS_META[initial.status].label}</span>
        </Panel>
      )}

      <Panel className="space-y-4 p-4">
        <Field label="Место работы">
          <Select value={workplaceId} onValueChange={setWorkplaceId}>
            <SelectTrigger aria-label="Место работы"><SelectValue placeholder="Выберите место" /></SelectTrigger>
            <SelectContent>
              {workplaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  <span className="flex items-center gap-2"><WorkplaceDot color={w.color} />{w.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Дата"><Input aria-label="Дата смены" type="date" className={dtCls} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><Input aria-label="Начало смены" type="time" className={dtCls} value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="Окончание"><Input aria-label="Окончание смены" type="time" className={dtCls} value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
        </div>
        {start && end && start !== end && (
          <p className="text-xs text-muted-foreground">
            Продолжительность: {formatHours(shiftMinutes(start, end))}
            {end <= start && " · переходит через полночь"}
          </p>
        )}
      </Panel>

      <Field label="Комментарий"><Textarea aria-label="Комментарий" rows={2} placeholder="Необязательно" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>

      {conflicts.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-negative/40 bg-negative/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-negative"><AlertTriangle className="size-4 shrink-0" />Пересечение с другой сменой</p>
          {conflicts.map((c) => (
            <p key={c.other.id} className="text-xs text-muted-foreground">
              {fmtDate(c.other.local_start_date, "dd.MM.yyyy")} · {c.other.start_time}–{c.other.end_time} · пересечение {formatHours(c.minutes)}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">Измените время или дату — конфликтующая смена не сохраняется автоматически.</p>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border bg-card p-4">
        {showEstimate && estimate && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 text-muted-foreground">Предварительная оплата по ставке</span>
              <Money value={estimate.amount} className="shrink-0 font-semibold" />
            </div>
            {!estimate.hasRates && <p className="text-xs text-muted-foreground">Для этого места на дату смены нет действующих ставок.</p>}
            {estimate.hasRates && estimate.uncoveredMinutes > 0 && (
              <p className="text-xs text-muted-foreground">{formatHours(estimate.uncoveredMinutes)} смены не покрыты ставками и не учтены в сумме.</p>
            )}
            <p className="text-xs text-muted-foreground">Без чаевых, процента от выручки, премий и штрафов.</p>
          </div>
        )}
        <Button type="submit" disabled={mutation.isPending || deletion.isPending || !workplaces.length} className="w-full" size="lg">Сохранить смену</Button>
        {initial && (
          <Button type="button" variant="ghost" className="w-full text-negative" onClick={() => setConfirmDelete(true)} disabled={mutation.isPending || deletion.isPending}>
            <Trash2 className="size-4" />Удалить смену
          </Button>
        )}
      </div>

      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Удалить смену?</DrawerTitle>
            <DrawerDescription>Смена переместится в корзину. Это действие можно отменить восстановлением в течение 30 дней.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-8">
            <Button className="w-full" variant="destructive" onClick={() => deletion.mutate()} disabled={deletion.isPending}>Удалить</Button>
            <Button className="w-full" variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button>
          </div>
        </DrawerContent>
      </Drawer>
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
