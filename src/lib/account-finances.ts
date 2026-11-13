import type { AccountShift, AdjustmentDraft } from "@/lib/account-shifts";
import { cleanMoney, shiftCompletePayload } from "@/lib/account-shifts";
import type { Json } from "@/integrations/supabase/types";

export type FinancialShift = AccountShift & {
  fixed_pay: number | null;
  commission_pay: number | null;
  commission_source: string;
};
export type FinancialAdjustment = { id: string; kind: string; label: string; amount: number | null; comment: string | null; sort_order: number };
export type ShiftFinances = {
  /** PostgreSQL NUMERIC subtotal; presentation converts only the returned value. */
  confirmedEarnings?: { value: number | null; partial: boolean };
  shift: FinancialShift;
  adjustments: FinancialAdjustment[];
  fixedPayments: Array<{ id: string; amount_snapshot: number | null; label_snapshot: string }>;
  commission: { state: string; calculation_available: boolean; applied_percent: number | null; missing_revenue_count: number } | null;
  events: Array<{ id: string; operation_id: string; event_type: string; created_at: string; before_snapshot: Json; after_snapshot: Json }>;
};

/** Exact bounds validation only; money arithmetic stays in PostgreSQL NUMERIC. */
export function validFinancialMoney(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "string" || !/^\d+(\.\d{1,2})?$/.test(v)) return false;
  const [whole = "0", fraction = ""] = v.split(".");
  const significant = whole.replace(/^0+/, "") || "0";
  return significant.length <= 12 && BigInt(significant) * 100n + BigInt(fraction.padEnd(2, "0")) <= 99999999999999n;
}

export function validateFinancialFields(payload: Record<string, unknown>) {
  for (const key of ["user_id", "base_pay", "fixed_pay", "commission_pay", "earnings", "status"]) {
    if (key in payload) throw new Error("Начисления и статус определяются сервером.");
  }
  for (const key of ["revenue", "tips"]) if (key in payload && !validFinancialMoney(payload[key])) throw new Error("Укажите сумму с точностью до копеек или оставьте поле пустым.");
  if ("revenue" in payload) {
    const revision = payload["expected_revenue_revision"];
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) throw new Error("Обновите данные смены перед исправлением выручки.");
  }
  if ("fixed_payments" in payload) throw new Error("Фиксированные выплаты сохраняются без изменений.");
  if ("adjustments" in payload) {
    if (!Array.isArray(payload["adjustments"])) throw new Error("Некорректные премии и штрафы.");
    for (const item of payload["adjustments"]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Некорректная корректировка.");
      const a = item as Record<string, unknown>;
      if ((a["kind"] !== "bonus" && a["kind"] !== "penalty") || typeof a["label"] !== "string" || !a["label"].trim() || !validFinancialMoney(a["amount"])) throw new Error("Укажите название и корректную сумму премии или штрафа.");
    }
  }
}

export function financialShiftPayload(shift: AccountShift, values: { revenue: string; tips: string; adjustments: Array<AdjustmentDraft & { comment?: string | null }> }) {
  return {
    ...shiftCompletePayload(shift),
    expected_revenue_revision: shift.revenue_revision,
    revenue: cleanMoney(values.revenue),
    tips: cleanMoney(values.tips),
    adjustments: values.adjustments.map((a, index) => {
      if (!a.label.trim()) throw new Error("Укажите название премии или штрафа.");
      return { kind: a.kind, label: a.label.trim().slice(0, 200), amount: cleanMoney(a.amount), comment: a.comment ?? null, sort_order: index };
    }),
  };
}

/** A failed request can be retried with the same key; changing the payload starts a new operation. */
export function financialRequest(previous: { key: string; signature: string } | null, type: string, payload: Record<string, unknown>, newKey: () => string = () => crypto.randomUUID()) {
  const signature = JSON.stringify({ type, payload });
  return previous?.signature === signature ? previous : { key: newKey(), signature };
}