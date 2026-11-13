import { sumKnown } from "@/lib/summary";

type StoredComponents = {
  earnings: number | null;
  base_pay: number | null;
  fixed_pay: number | null;
  commission_pay: number | null;
  tips: number | null;
  shift_adjustments: Array<{ kind: string; amount: number | null }>;
};

/** Read-side subtotal of stored components only; never substitutes for the database's full total. */
export function confirmedAccountEarnings(row: StoredComponents) {
  if (row.earnings !== null) return { value: row.earnings, partial: false };
  return sumKnown([
    row.base_pay, row.fixed_pay, row.commission_pay, row.tips,
    ...row.shift_adjustments.map((a) => a.amount === null ? null : a.kind === "penalty" ? -a.amount : a.amount),
  ]);
}