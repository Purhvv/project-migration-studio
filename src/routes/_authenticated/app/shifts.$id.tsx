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
import { STATUS_META, StatusIcon, WorkplaceDot } from "@/components/shifts/shift-ui";
import { accountWrite } from "@/lib/account.functions";
import { estimateAccountPay, shiftActions, shiftCancelPayload, shiftCompletePayload, shiftDeletePayload, shiftStartPayload, type AccountShift } from "@/lib/account-shifts";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { formatHours, fmtDate, shiftMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  if (shifts.isError) return <div className="px-5 pt-6"><ErrorState onRetry={() => shifts.refetch()} /></div>;
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
    <div className="space-y-5 px-5 pt-4 pb-6">
      <header className="flex items-center gap-2">
        <Button type="button" size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">Смена</h1>
      </header>

      <Panel className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          {workplace && <WorkplaceDot color={workplace.color} />}
          <span className={cn("truncate", shift.status === "cancelled" && "line-through")}>{workplace?.name ?? "Место работы"}</span>
        </div>
        <p className="text-sm">{fmtDate(shift.local_start_date, "EEEE, d MMMM")}</p>
        <p className="text-sm text-muted-foreground tabular">
          {shift.start_time}–{shift.end_time} · {formatHours(shiftMinutes(shift.start_time, shift.end_time))}
          {shift.local_end_date !== shift.local_start_date && " · через полночь"}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><StatusIcon status={shift.status} />{STATUS_META[shift.status].label}</p>
        {shift.comment && <p className="text-sm text-muted-foreground">{shift.comment}</p>}
      </Panel>

      <Section>
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
      </Section>

      <div className="space-y-3">
        {actions.includes("start") && (
          <Button className="w-full" size="lg" disabled={action.isPending} onClick={() => run("shift_start", shiftStartPayload(shift))}>Начать смену</Button>
        )}
        {actions.includes("complete") && (
          <Button className="w-full" size="lg" disabled={action.isPending} onClick={() => run("shift_complete", shiftCompletePayload(shift))}>Завершить смену</Button>
        )}
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

export type { AccountShift };
