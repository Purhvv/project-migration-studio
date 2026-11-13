import { Money, Panel, Section } from "@/components/shared/primitives";
import type { ShiftFinances } from "@/lib/account-finances";
import { formatNumber } from "@/lib/format";

export function ShiftFinanceDetails({ finances, workplaceName }: { finances: ShiftFinances; workplaceName: string }) {
  const { shift, adjustments, fixedPayments, commission } = finances;
  const rows = [
    { label: `Личная выручка · ${workplaceName}`, value: shift.revenue, kind: "default" },
    { label: "Базовая оплата", value: shift.base_pay, kind: "default" },
    { label: "Фиксированные выплаты", value: shift.fixed_pay, kind: "default" },
    ...fixedPayments.map((p) => ({ label: p.label_snapshot, value: p.amount_snapshot, kind: "default" })),
    { label: "Комиссия", value: shift.commission_pay, kind: "default" },
    { label: "Личные чаевые", value: shift.tips, kind: "default" },
    ...adjustments.map((a) => ({ label: a.label, value: a.amount, kind: a.kind })),
  ];
  return <Section title="Детали"><Panel className="divide-y text-sm">{rows.map((r, i) => <div key={i} className="flex items-start justify-between gap-3 px-4 py-3"><span className="min-w-0 break-words text-muted-foreground">{r.label}</span><Money value={r.value} tone={r.kind === "bonus" ? "positive" : r.kind === "penalty" ? "negative" : "default"} {...(r.kind === "bonus" ? { sign: "+" as const } : r.kind === "penalty" ? { sign: "−" as const } : {})} className="shrink-0 font-medium" /></div>)}<div className="flex justify-between gap-3 px-4 py-3 font-semibold"><span>Итоговый заработок</span><Money value={shift.earnings} tone={shift.earnings !== null && shift.earnings < 0 ? "negative" : "default"} /></div></Panel>
    <p className="mt-3 text-xs text-muted-foreground">{commission?.calculation_available ? `Применённый процент: ${formatNumber(commission.applied_percent)}%. ${commission.state === "preliminary" ? `Предварительный расчёт: ${commission.missing_revenue_count} смен с неизвестной выручкой.` : "Расчёт комиссии подтверждён."}` : "Правила комиссии не настроены — комиссия неизвестна."}</p>
  </Section>;
}

const EVENT_LABELS: Record<string, string> = { create: "Создание смены", edit: "Изменение смены", complete: "Завершение смены", commission_recalc: "Пересчёт комиссии", revenue_correction: "Исправление выручки", start: "Начало смены" };
const snapshot = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function ShiftFinanceHistory({ finances }: { finances: ShiftFinances }) {
  return <Section title="Финансовая история"><Panel className="divide-y px-4">{finances.events.map((event) => {
    const before = snapshot(event.before_snapshot), after = snapshot(event.after_snapshot);
    const changed = ["revenue", "tips", "base_pay", "fixed_pay", "commission_pay", "earnings"].filter((key) => before[key] !== after[key]);
    const labels: Record<string, string> = { revenue: "Выручка", tips: "Чаевые", base_pay: "Базовая оплата", fixed_pay: "Фиксированные выплаты", commission_pay: "Комиссия", earnings: "Итог" };
    const money = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
    return <div key={event.id} className="space-y-2 py-3"><p className="text-sm font-medium">{EVENT_LABELS[event.event_type] ?? "Финансовое событие"}</p><p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("ru-RU")}</p>{changed.map((key) => <p key={key} className="flex flex-wrap gap-1 text-xs text-muted-foreground">{labels[key]}: <Money value={money(before[key])} /> → <Money value={money(after[key])} /></p>)}</div>;
  })}{!finances.events.length && <p className="py-4 text-sm text-muted-foreground">Пока нет финансовых событий</p>}{finances.events.length === 100 && <p className="py-3 text-xs text-muted-foreground">Показаны последние 100 событий</p>}</Panel></Section>;
}