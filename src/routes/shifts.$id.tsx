import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, SearchX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RateEstimate } from "@/components/shifts/estimate";
import { NumberInput } from "@/components/shared/NumberInput";
import { ConflictWarning } from "@/components/shifts/ConflictWarning";
import { useShiftSaveGuard } from "@/hooks/use-shift-save";
import { isUpcoming } from "@/lib/rates";
import type { Shift, Workplace } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Money, Panel, Section } from "@/components/shared/primitives";
import { shiftDayLabel, StatusBadge, useWorkplaceMap, WorkplaceDot } from "@/components/shifts/shift-ui";
import { useShifts } from "@/data/queries";
import { formatHours, parseNumberInput, shiftMinutes } from "@/lib/format";

export const Route = createFileRoute("/shifts/$id")({
  head: () => ({
    meta: [
      { title: "Смена — Shiftly" },
      { name: "description", content: "Подробности смены: время, место работы и заработок." },
      { property: "og:title", content: "Смена — Shiftly" },
      { property: "og:description", content: "Подробности рабочей смены." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShiftDetails,
});

function ShiftDetails() {
  const { id } = Route.useParams();
  const router = useRouter();
  const shifts = useShifts();
  const wpMap = useWorkplaceMap();
  const shift = shifts.data?.find((s) => s.id === id);
  const workplace = shift ? wpMap.get(shift.workplaceId) : undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2 px-5 pt-4">
        <Button size="icon" variant="ghost" className="-ml-2 rounded-full" onClick={() => router.history.back()} aria-label="Назад">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="font-display text-xl font-semibold">Смена</h1>
      </header>
      {shifts.isPending ? (
        <div className="px-5"><Skeleton className="h-64 rounded-3xl" /></div>
      ) : shifts.isError ? (
        <div className="px-5"><ErrorState onRetry={() => shifts.refetch()} /></div>
      ) : !shift ? (
        <div className="px-5">
          <EmptyState icon={SearchX} title="Смена не найдена" action={<Button asChild><Link to="/calendar">К календарю</Link></Button>} />
        </div>
      ) : (
        <>
          <Section>
            <div className="bg-hero rounded-3xl border p-5 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{shiftDayLabel(shift.date)}</p>
                  <p className="mt-1 text-sm text-muted-foreground tabular">
                    {shift.start}–{shift.end} · {formatHours(shiftMinutes(shift.start, shift.end))}
                  </p>
                </div>
                <StatusBadge status={shift.status} />
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm">
                {workplace && <WorkplaceDot color={workplace.color} />}
                {wpMap.get(shift.workplaceId)?.name}
              </p>
              {shift.status === "completed" && (
                <div className="mt-5 border-t pt-4">
                  <p className="text-xs text-muted-foreground">Общий заработок</p>
                  <p className="font-display text-3xl font-semibold"><Money value={shift.earnings} /></p>
                </div>
              )}
            </div>
          </Section>
          {shift.status === "completed" && (
            <Section title="Детали">
              <Panel className="divide-y text-sm">
                <Row label="Личная выручка" node={<Money value={shift.revenue} />} />
                <Row label="Ставка" node={<Money value={shift.basePay} />} />
                <Row label="Личные чаевые" node={<Money value={shift.tips} />} />
                {shift.bonuses.map((b) => <Row key={b.id} label={b.label} node={<Money value={b.amount} tone="positive" sign="+" />} />)}
                {shift.penalties.map((p) => <Row key={p.id} label={p.label} node={<Money value={p.amount} tone="negative" sign="−" />} />)}
              </Panel>
            </Section>
          )}
          {shift.status !== "cancelled" && <UpcomingActions key={shift.id + shift.date + shift.start + shift.end} shift={shift} workplace={workplace} />}
          {shift.comment && (
            <Section title="Комментарий"><p className="text-sm text-muted-foreground">{shift.comment}</p></Section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{node}</span>
    </div>
  );
}

function UpcomingActions({ shift, workplace }: { shift: Shift; workplace: Workplace | undefined }) {
  const guard = useShiftSaveGuard(() => { setDate(shift.date); setStart(shift.start); setEnd(shift.end); });
  const [date, setDate] = useState(shift.date);
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const [finishing, setFinishing] = useState(false);
  const changed = date !== shift.date || start !== shift.start || end !== shift.end;
  return (
    <Section title="Время и оплата">
      <Panel className="space-y-4 p-4">
        <div className="min-w-0 space-y-1.5"><Label className="text-xs text-muted-foreground">Дата</Label><Input aria-label="Дата смены" type="date" className="block w-full min-w-0 appearance-none" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5"><Label className="text-xs text-muted-foreground">Начало</Label><Input aria-label="Начало смены" type="time" className="block w-full min-w-0 appearance-none" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
          <div className="min-w-0 space-y-1.5"><Label className="text-xs text-muted-foreground">Окончание</Label><Input aria-label="Окончание смены" type="time" className="block w-full min-w-0 appearance-none" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
        </div>
        {isUpcoming(shift) && <><RateEstimate workplace={workplace} date={date} start={start} end={end} /><p className="text-xs text-muted-foreground">Чаевые, процент от выручки, премии и штрафы не прогнозируются.</p></>}
        {changed && (
          <Button className="w-full" variant="secondary" disabled={!date || !start || !end || !guard.ready || guard.warning.pending} onClick={() => guard.saveShift({ ...shift, date, start, end }, () => toast("Дата и время смены обновлены"))}>
            Сохранить время
          </Button>
        )}
        {isUpcoming(shift) && <Button className="w-full" disabled={changed} onClick={() => setFinishing(true)}>Завершить смену</Button>}
      </Panel>
      <ConflictWarning {...guard.warning} />
      <FinishDrawer open={finishing} onClose={() => setFinishing(false)} shift={shift} />
    </Section>
  );
}

const num = parseNumberInput;

function FinishDrawer({ open, onClose, shift }: { open: boolean; onClose: () => void; shift: Shift }) {
  const guard = useShiftSaveGuard(onClose);
  const [basePay, setBasePay] = useState("");
  const [tips, setTips] = useState("");
  const [revenue, setRevenue] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bp = num(basePay);
    const tp = num(tips);
    guard.saveShift(
      { ...shift, status: "completed", basePay: bp, tips: tp, revenue: num(revenue), earnings: bp === null ? null : bp + (tp ?? 0) },
      () => { toast("Смена завершена"); onClose(); },
    );
  };
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <form onSubmit={submit} className="px-4 pb-8">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle>Завершить смену</DrawerTitle>
            <DrawerDescription>Введите фактические начисления — они попадут в фактический заработок вместо расчёта по ставке.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Начислено по ставке</Label><NumberInput aria-label="Начислено по ставке" placeholder="₽" value={basePay} onValueChange={setBasePay} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1.5"><Label className="text-xs text-muted-foreground">Личные чаевые</Label><NumberInput aria-label="Личные чаевые" placeholder="₽" value={tips} onValueChange={setTips} /></div>
              <div className="min-w-0 space-y-1.5"><Label className="text-xs text-muted-foreground">Личная выручка</Label><NumberInput aria-label="Личная выручка" placeholder="₽" value={revenue} onValueChange={setRevenue} /></div>
            </div>
            <Button type="submit" disabled={!guard.ready || guard.warning.pending || num(basePay) === null} className="w-full" size="lg">Подтвердить</Button>
          </div>
        </form>
        <ConflictWarning {...guard.warning} />
      </DrawerContent>
    </Drawer>
  );
}
