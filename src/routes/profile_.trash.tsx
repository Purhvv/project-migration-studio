import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Money, Panel, Section } from "@/components/shared/primitives";
import { ConfirmAction } from "@/components/shifts/ShiftActions";
import { StatusBadge, useWorkplaceMap, WorkplaceDot } from "@/components/shifts/shift-ui";
import { ConflictWarning } from "@/components/shifts/ConflictWarning";
import { useClearTrash, usePurgeShift, useTrash } from "@/data/queries";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";
import { fmtDate } from "@/lib/format";
import { isTrashExpired, trashExpiresAt } from "@/lib/shift-management";
import type { Shift } from "@/lib/types";

export const Route = createFileRoute("/profile_/trash")({
  head: () => ({ meta: [
    { title: "Корзина смен — Shiftly" }, { name: "description", content: "Восстановление удалённых смен в течение 30 дней и окончательное удаление." },
    { property: "og:title", content: "Корзина смен — Shiftly" }, { property: "og:description", content: "Удалённые смены и восстановление в Shiftly." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: TrashPage,
});
function TrashPage() {
  const trash = useTrash(); const map = useWorkplaceMap(); const purge = usePurgeShift(); const clear = useClearTrash(); const router = useRouter();
  const guard = useShiftSaveGuard(() => {}, "restore");
  const [confirm, setConfirm] = useState<Shift | "all" | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const restore = (shift: Shift) => {
    if (isTrashExpired(shift)) { toast("Срок восстановления истёк"); return; }
    guard.saveShift(shift, () => toast("Смена восстановлена"));
  };
  return <div className="space-y-5 pb-6">
    <header className="flex items-center gap-2 px-5 pt-4"><Button variant="ghost" size="icon" onClick={() => router.history.back()} aria-label="Назад"><ChevronLeft /></Button><h1 className="flex-1 font-display text-xl font-semibold">Корзина</h1>
      {!!trash.data?.length && <Button variant="ghost" size="icon" aria-label="Очистить корзину" title="Очистить корзину" onClick={() => setConfirm("all")}><Trash2 /></Button>}
    </header>
    <Section><p className="text-xs text-muted-foreground">Демо-режим: изменения исчезнут после перезагрузки. Восстановление доступно 30 дней; автоматическое удаление пока не подключено.</p></Section>
    <Section>{trash.isPending ? <Skeleton className="h-40" /> : trash.isError ? <ErrorState onRetry={() => trash.refetch()} /> : !trash.data.length ? <EmptyState icon={Trash2} title="Корзина пуста" action={<Button asChild variant="secondary"><Link to="/calendar">К календарю</Link></Button>} /> :
      <div className="space-y-3">{trash.data.map((shift) => {
        const wp = map.get(shift.workplaceId); const expired = isTrashExpired(shift, now); const expires = trashExpiresAt(shift);
        return <Panel key={shift.id} className="space-y-3 p-4">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">{wp && <WorkplaceDot color={wp.color} />}<span className="truncate">{wp?.name ?? "Место работы"}</span></p>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm tabular">{fmtDate(shift.date, "dd.MM.yyyy")} · {shift.start}–{shift.end}</p><Money value={shift.earnings} className="text-sm font-semibold" /></div>
          <StatusBadge status={shift.status} />
          <p className="text-xs text-muted-foreground">Удалена {shift.deletedAt ? fmtDate(shift.deletedAt, "dd.MM.yyyy HH:mm") : "—"}<br />{expired ? "Срок восстановления истёк" : expires ? `Восстановить до ${fmtDate(new Date(expires).toISOString(), "dd.MM.yyyy HH:mm")}` : "—"}</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={expired || !guard.ready || guard.warning.pending} onClick={() => restore(shift)}><RotateCcw />Восстановить</Button><Button variant="ghost" size="sm" className="text-negative" onClick={() => setConfirm(shift)}><Trash2 />Удалить навсегда</Button></div>
        </Panel>;
      })}</div>
    }</Section>
    <ConflictWarning {...guard.warning} onFix={() => {
      const shift = guard.warning.conflicts[0]?.first; guard.warning.onFix();
      if (shift) router.navigate({ to: "/profile/trash", search: {} });
      toast("Восстановите с подтверждением либо исправьте время конфликтующей активной смены");
    }} />
    <ConfirmAction open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "all" ? "Очистить корзину?" : "Удалить смену навсегда?"} description={confirm === "all" ? "Все смены в корзине будут удалены навсегда. Восстановить их будет невозможно." : "Восстановить её будет невозможно"} action={confirm === "all" ? "Очистить" : "Удалить навсегда"} pending={purge.isPending || clear.isPending} onConfirm={() => {
      const onSuccess = () => { setConfirm(null); toast("Удалено навсегда"); };
      if (confirm === "all") clear.mutate(undefined, { onSuccess }); else if (confirm) purge.mutate(confirm.id, { onSuccess });
    }} />
  </div>;
}