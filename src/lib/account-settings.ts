import type { WorkplaceColor } from "@/lib/types";

/** Only these approved shiftly_write operations are reachable from the personal profile. */
export const PROFILE_OPERATIONS = ["profile_edit", "workplace_edit", "workplace_archive", "publish_rates", "publish_commission"] as const;
export type ProfileOperation = (typeof PROFILE_OPERATIONS)[number];
export const isProfileOperation = (v: unknown): v is ProfileOperation =>
  typeof v === "string" && (PROFILE_OPERATIONS as readonly string[]).includes(v);

export type AccountProfile = { id: string; name: string; currency: string; timezone: string; monthly_goal: number | null; hours_goal: number | null; shifts_goal: number | null; revision: number };
export type AccountInterval = { id: string; kind: "hourly" | "fixed"; start_time: string | null; end_time: string | null; hourly: number | null; fixed_amount: number | null; label: string; weekdays: number[]; sort_order: number };
export type AccountRateVersion = { id: string; effective_from: string; revision: number; intervals: AccountInterval[] };
export type AccountCommission = { id: string; effective_from: string; revision: number; mode: "none" | "fixed" | "thresholds"; fixed_percent: number | null; thresholds: Array<{ from_amount: number; percent: number }> };
export type AccountWorkplace = { id: string; name: string; color: WorkplaceColor; timezone: string; revenue_goal: number | null; revision: number; rates: AccountRateVersion | null; commission: AccountCommission | null };
export type AccountSettings = { profile: AccountProfile; workplaces: AccountWorkplace[] };

export type GoalKey = "monthly_goal" | "hours_goal" | "shifts_goal";

/** profile_edit requires the full allow-listed key set; unchanged fields are resent as-is. */
export function profileEditPayload(p: AccountProfile, patch: Partial<Pick<AccountProfile, "name" | GoalKey>>) {
  const next = { ...p, ...patch };
  return { expected_revision: p.revision, name: next.name.trim(), timezone: p.timezone, monthly_goal: next.monthly_goal, hours_goal: next.hours_goal, shifts_goal: next.shifts_goal };
}

export function validGoal(key: GoalKey, value: number | null): boolean {
  if (value === null) return true;
  if (!Number.isFinite(value) || value <= 0) return false;
  return key === "shifts_goal" ? Number.isInteger(value) : true;
}

export type HourlyDraft = { start: string; end: string; hourly: number };

/** Rates are versioned: a change publishes a new version; existing fixed payments are carried over unchanged. */
export function publishRatesPayload(workplaceId: string, effectiveFrom: string, hourly: HourlyDraft[], keepFixed: AccountInterval[]) {
  const intervals = [
    ...hourly.map((r, i) => ({ kind: "hourly", start_time: r.start, end_time: r.end, hourly: r.hourly, fixed_amount: null, label: `${r.start}–${r.end}`, weekdays: [], sort_order: i })),
    ...keepFixed.filter((f) => f.kind === "fixed").map((f, i) => ({ kind: "fixed", start_time: null, end_time: null, hourly: null, fixed_amount: f.fixed_amount, label: f.label, weekdays: f.weekdays, sort_order: hourly.length + i })),
  ];
  return { workplace_id: workplaceId, effective_from: effectiveFrom, note: null, acknowledge_overlap: false, intervals };
}

/** Commission versions start on the first day of a month. */
export function publishCommissionPayload(workplaceId: string, month: string, mode: AccountCommission["mode"], fixedPercent: number | null, thresholds: Array<{ from_amount: number; percent: number }>) {
  const percentOk = (n: number | null) => n !== null && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Укажите месяц начала действия");
  if (mode === "fixed" && !percentOk(fixedPercent)) throw new Error("Процент должен быть от 0 до 100");
  if (mode === "thresholds" && (thresholds.length === 0 || thresholds.some((t) => !percentOk(t.percent) || !(t.from_amount >= 0)))) throw new Error("Проверьте пороги: сумма ≥ 0, процент от 0 до 100");
  return { workplace_id: workplaceId, effective_from: `${month}-01`, mode, fixed_percent: mode === "fixed" ? fixedPercent : null, thresholds: mode === "thresholds" ? thresholds : [] };
}

export function writeErrorMessage(raw: string): string {
  if (/revision conflict/i.test(raw)) return "Данные изменились на другом устройстве. Обновите и повторите.";
  if (/Historical publication/i.test(raw)) return "Нельзя менять правила задним числом: в этом периоде уже есть завершённые смены.";
  if (/duplicate key|unique/i.test(raw)) return "На эту дату уже опубликована версия. Выберите другую дату.";
  if (/check constraint|22023|required|must be/i.test(raw)) return "Проверьте введённые значения.";
  return "Не удалось сохранить. Попробуйте ещё раз.";
}
