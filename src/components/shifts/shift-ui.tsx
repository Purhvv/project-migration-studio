import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Check, Clock, Hourglass, Play, X } from "lucide-react";
import { useWorkplaces } from "@/data/queries";
import { capitalize, fmtDate, formatHours, shiftMinutes } from "@/lib/format";
import type { Shift, ShiftStatus, Workplace, WorkplaceColor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Money, NavChevron } from "@/components/shared/primitives";
import { ShiftActions } from "@/components/shifts/ShiftActions";

export const WORKPLACE_COLORS: Array<{ value: WorkplaceColor; label: string }> = [
  { value: "sky", label: "Голубой" },
  { value: "green", label: "Зелёный" },
  { value: "amber", label: "Жёлтый" },
  { value: "orange", label: "Оранжевый" },
  { value: "rose", label: "Красный" },
  { value: "violet", label: "Фиолетовый" },
];

/** CSS value for a workplace colour token. */
export const wpColor = (c: WorkplaceColor) => `var(--wp-${c})`;

export function WorkplaceDot({ color, className }: { color: WorkplaceColor; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ backgroundColor: wpColor(color) }} />;
}

export function useWorkplaceMap() {
  const { data } = useWorkplaces();
  return new Map((data ?? []).map((w) => [w.id, w]));
}

/** Status is shown with icon + label in neutral colours — colour is reserved for the workplace. */
export const STATUS_META: Record<ShiftStatus, { label: string; icon: LucideIcon }> = {
  planned: { label: "Запланирована", icon: Clock },
  in_progress: { label: "В процессе", icon: Play },
  pending: { label: "Ожидает подтверждения", icon: Hourglass },
  completed: { label: "Завершена", icon: Check },
  cancelled: { label: "Отменена", icon: X },
};

export function StatusIcon({ status, className }: { status: ShiftStatus; className?: string }) {
  const Icon = STATUS_META[status].icon;
  return <Icon aria-label={STATUS_META[status].label} className={cn("size-3 shrink-0", className)} strokeWidth={2.75} />;
}

export function StatusBadge({ status }: { status: ShiftStatus }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      <StatusIcon status={status} />
      {STATUS_META[status].label}
    </span>
  );
}

export function ShiftRow({ shift, showDate = true }: { shift: Shift; showDate?: boolean }) {
  const wp = useWorkplaceMap().get(shift.workplaceId);
  return (
    <div className="flex min-w-0 items-center gap-1"><Link
      to="/shifts/$id"
      params={{ id: shift.id }}
      className={cn("flex min-w-0 flex-1 items-center gap-3 py-3.5 transition-colors active:opacity-70", shift.status === "cancelled" && "opacity-60")}
    >
      {showDate && (
        <div className="grid w-11 shrink-0 place-items-center rounded-xl bg-secondary py-1.5 text-center leading-tight">
          <span className="text-base font-semibold tabular">{fmtDate(shift.date, "d")}</span>
          <span className="text-[11px] text-muted-foreground">{fmtDate(shift.date, "EEEEEE")}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {wp && <WorkplaceDot color={wp.color} />}
          <span className="truncate">{wp?.name ?? "Место работы"}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular">
          {shift.start}–{shift.end} · {formatHours(shiftMinutes(shift.start, shift.end))}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {shift.status === "completed" ? (
          <Money value={shift.earnings} className="text-sm font-semibold" />
        ) : (
          <StatusBadge status={shift.status} />
        )}
      </div>
      <NavChevron />
    </Link><ShiftActions shift={shift} /></div>
  );
}

export const shiftDayLabel = (iso: string) => capitalize(fmtDate(iso, "EEEE, d MMMM"));

export type { Workplace };
