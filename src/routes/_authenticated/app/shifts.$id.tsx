import { createFileRoute, getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authHead } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Money, Panel, Section } from "@/components/shared/primitives";
import { StatusBadge, shiftDayLabel, WorkplaceDot } from "@/components/shifts/shift-ui";
import { accountWrite } from "@/lib/account.functions";
import { estimateAccountPay, shiftActions, shiftCancelPayload, shiftCompletePayload, shiftDeletePayload, shiftStartPayload } from "@/lib/account-shifts";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { formatHours, fmtDate, shiftMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { accountShiftFinancesOptions } from "@/data/account-queries";
import { ShiftFinanceEditor } from "@/components/personal/ShiftFinanceEditor";
import { ShiftFinanceDetails, ShiftFinanceHistory } from "@/components/personal/ShiftFinanceDetails";

export const Route = createFileRoute("/_authenticated/app/shifts/$id")({
  head: () => authHead("Смена", "Детали смены в личном пространстве Shiftly."),
  component: PersonalShiftDetails,
});

type ShiftActionType = "shift_start" | "shift_complete" | "shift_cancel" | "shift_delete";

function PersonalShiftDetails() {
  const { id } = Route.useParams();
  const { accountUser } = getRouteApi("/_authenticated").useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const write = useServerFn(accountWrite);
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const finances = useQuery(accountShiftFinancesOptions(accountUser.id, id));
  const [financialOpen, setFinancialOpen] = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);

  const action = useMutation({
    mutationFn: (input: { type: ShiftActionType; payload: Record<string, unknown> }) =>
      write({ data: { key: crypto.randomUUID(), type: input.type, payload: input.payload } }),
    onSuccess: async (_r, input) => {
      toast.success(input.type === "shift_delete" ? "Смена удалена" : "Смена обновлена");
      await queryClient.invalidateQueries({ queryKey: ["account", accountUser.id] });
      setConfirm(null);
      if (input.type === "shift_delete") router.navigate({ to: "/app/calendar" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить. Попробуйте ещё раз."),
  });

  if (shifts.isPending || settings.isPending) return <div className="px-5 pt-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  if (shifts.isError || settings.isError) return <div className="px-5 pt-6"><ErrorState onRetry={() => { shifts.refetch(); settings.refetch(); }} /></div>;
  const shift = (shifts.data ?? []).find((s) => s.id === id);
  if (!shift) {
    return (
      <div className="px-5 pt-6">
        <EmptyState icon={AlertTriangle} title="Смена не найдена" text="Возможно, она была удалена." action={<Button asChild variant="secondary"><Link to="/app/calendar">К календарю</Link></Button>} />
      </div>
    );
  }
  const workplace = (settings.data?.workplaces ?? []).find((w) => w.id === shift.workplace_id);
  const actions = shiftActions(shift.status);
  const estimate = workplace && shift.status !== "completed" && shift.status !== "cancelled"
    ? estimateAccountPay(workplace, shift.local_start_date, shift.start_time, shift.end_time)
    : null;

  const run = (type: ShiftActionType, payload: Record<string, unknown>) => action.mutate({ type, payload });

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-center gap-2 px-5 pt-4">
        <Button type="button" size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">Смена</h1>
      </header>

      <Section><div className="bg-hero rounded-3xl border p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{shiftDayLabel(shift.local_start_date)}</p><p className="mt-1 text-sm text-muted-foreground tabular">{shift.start_time}–{shift.end_time} · {formatHours(shiftMinutes(shift.start_time, shift.end_time))}{shift.local_end_date !== shift.local_start_date && " · через полночь"}</p></div><StatusBadge status={shift.status} /></div>
        <p className="mt-3 flex items-center gap-2 text-sm">{workplace && <WorkplaceDot color={workplace.color} />}<span className={cn("min-w-0 break-words", shift.status === "cancelled" && "line-through")}>{workplace?.name ?? "Место работы"}</span></p>
        {shift.status === "completed" && <div className="mt-5 border-t pt-4"><p className="text-xs text-muted-foreground">Общий заработок</p><p className="break-words font-display text-3xl font-semibold"><Money value={shift.earnings} tone={shift.earnings !== null && shift.earnings < 0 ? "negative" : "default"} /></p></div>}
      </div></Section>
      {shift.status === "completed" && (finances.isPending ? <Section><Skeleton className="h-48 rounded-2xl" /></Section> : finances.isError ? <Section><ErrorState onRetry={() => finances.refetch()} /></Section> : finances.data && <ShiftFinanceDetails finances={finances.data} workplaceName={workplace?.name ?? "Место работы"} />)}
      {estimate && <Section title="Время и оплата">
        <Panel className="space-y-2 p-4">
          {shift.status === "completed" ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Заработок</span>
              <Money value={shift.earnings} className="font-semibold" />
            </div>
          ) : estimate ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Предварительная оплата по ставке</span>
              <Money value={estimate.amount} className="font-semibold" />
            </div>
          ) : null}
          {shift.status !== "completed" && shift.status !== "cancelled" && (
            <p className="text-xs text-muted-foreground">Без чаевых, процента от выручки, премий и штрафов.</p>
          )}
        </Panel>
      </Section>}

      <div className="space-y-3 px-5">
        {actions.includes("start") && (
          <Button className="w-full" size="lg" disabled={action.isPending} onClick={() => run("shift_start", shiftStartPayload(shift))}>Начать смену</Button>
        )}
        {actions.includes("complete") && (
          <Button className="w-full" size="lg" disabled={action.isPending} onClick={() => setFinancialOpen(true)}>Завершить смену</Button>
        )}
        {shift.status === "completed" && <Button variant="secondary" className="w-full" onClick={() => setFinancialOpen(true)}><Pencil className="size-4" />Редактировать финансы</Button>}
        {shift.status !== "cancelled" && (
          <Button asChild variant="secondary" className="w-full">
            <Link to="/app/shifts/$id/edit" params={{ id: shift.id }}><Pencil className="size-4" />Редактировать</Link>
          </Button>
        )}
        {actions.includes("cancel") && (
          <Button variant="ghost" className="w-full text-negative" disabled={action.isPending} onClick={() => setConfirm("cancel")}>Отменить смену</Button>
        )}
        <Button variant="ghost" className="w-full text-negative" disabled={action.isPending} onClick={() => setConfirm("delete")}>
          <Trash2 className="size-4" />Удалить смену
        </Button>
      </div>
      {shift.comment && <Section title="Комментарий"><p className="break-words text-sm text-muted-foreground">{shift.comment}</p></Section>}
      {finances.data && <ShiftFinanceHistory finances={finances.data} />}

      <Drawer open={financialOpen} onOpenChange={setFinancialOpen}><DrawerContent>
        <DrawerHeader className="text-left"><DrawerTitle>{shift.status === "completed" ? "Редактировать финансы" : "Завершить смену"}</DrawerTitle><DrawerDescription>Фактические начисления смены. Заполните известные суммы.</DrawerDescription></DrawerHeader>
        <div className="max-h-[70dvh] overflow-y-auto px-4 pb-8">{finances.isPending ? <Skeleton className="h-48 rounded-2xl" /> : finances.isError ? <ErrorState onRetry={() => finances.refetch()} /> : finances.data && <ShiftFinanceEditor key={finances.data.shift.revision} finances={finances.data} userId={accountUser.id} onSaved={() => { setFinancialOpen(false); toast.success(shift.status === "completed" ? "Финансы сохранены" : "Смена завершена"); }} onCancel={() => setFinancialOpen(false)} />}</div>
      </DrawerContent></Drawer>

      <Drawer open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{confirm === "delete" ? "Удалить смену?" : "Отменить смену?"}</DrawerTitle>
            <DrawerDescription>
              {confirm === "delete"
                ? "Смена переместится в корзину. Восстановить её можно в течение 30 дней."
                : "Смена будет помечена как отменённая и перестанет участвовать в расчётах."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-8">
            <Button
              className="w-full"
              variant="destructive"
              disabled={action.isPending}
              onClick={() => confirm === "delete" ? run("shift_delete", shiftDeletePayload(shift)) : run("shift_cancel", shiftCancelPayload(shift))}
            >
              {confirm === "delete" ? "Удалить" : "Отменить смену"}
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => setConfirm(null)}>Назад</Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
