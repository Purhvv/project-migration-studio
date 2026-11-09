import type { WorkplaceColor } from "@/lib/types";
export { publishRatesPayload, type HourlyDraft } from "@/lib/account-rates";

/** Only these approved shiftly_write operations are reachable from the personal space. */
export const PROFILE_OPERATIONS = ["profile_edit", "workplace_edit", "workplace_archive", "publish_rates", "publish_commission", "shift_create", "shift_edit", "shift_complete", "shift_delete", "shift_start", "shift_cancel"] as const;
export type ProfileOperation = (typeof PROFILE_OPERATIONS)[number];
export const isProfileOperation = (v: unknown): v is ProfileOperation =>
  typeof v === "string" && (PROFILE_OPERATIONS as readonly string[]).includes(v);

export type AccountProfile = { id: string; name: string; currency: string; timezone: string; monthly_goal: number | null; hours_goal: number | null; shifts_goal: number | null; revision: number };
export type AccountInterval = { id: string; kind: "hourly" | "fixed"; start_time: string | null; end_time: string | null; hourly: number | null; fixed_amount: number | null; label: string; weekdays: number[]; sort_order: number };
export type AccountRateVersion = { id: string; effective_from: string; revision: number; intervals: AccountInterval[] };
export type AccountCommission = { id: string; effective_from: string; revision: number; mode: "none" | "fixed" | "thresholds"; fixed_percent: number | null; thresholds: Array<{ from_amount: number; percent: number }> };
export type AccountWorkplace = { id: string; name: string; color: WorkplaceColor; timezone: string; revenue_goal: number | null; revision: number; rates: AccountRateVersion | null; rateVersions?: AccountRateVersion[]; commission: AccountCommission | null };
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

/** workplace_edit: create (no expected_revision) or edit; revenue goal belongs to this workplace only, null = unset. */
export function workplaceGoalError(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) return "Цель по выручке: укажите сумму с точностью до копеек.";
  const whole = (value.split(".")[0] ?? "").replace(/^0+/, "") || "0";
  if (whole.length > 12 || !/[1-9]/.test(value)) return "Цель по выручке: от 0,01 до 999 999 999 999,99 ₽.";
  return null;
}

/** Shared with the server boundary; DB still checks the full allow-list, identity and revision. */
export function validateWorkplaceEdit(payload: Record<string, unknown>) {
  if ("name" in payload && (typeof payload["name"] !== "string" || !payload["name"].trim())) throw new Error("Укажите название рабочего места.");
  if ("color" in payload && (typeof payload["color"] !== "string" || !["sky", "green", "amber", "rose", "violet", "orange"].includes(payload["color"]))) throw new Error("Выберите цвет рабочего места из палитры.");
  if ("revenue_goal" in payload) {
    const error = workplaceGoalError(payload["revenue_goal"]);
    if (error) throw new Error(error);
  }
}

export function workplaceEditPayload(initial: Pick<AccountWorkplace, "id" | "revision"> | null, name: string, color: WorkplaceColor, revenueGoal: string | null, newId: () => string = () => crypto.randomUUID()) {
  const trimmed = name.trim();
  const base = { name: trimmed, color, revenue_goal: revenueGoal };
  validateWorkplaceEdit(base);
  return initial ? { id: initial.id, expected_revision: initial.revision, ...base } : { id: newId(), ...base };
}

/** Exact decimal comparison only; no float conversion or automatic coercion at the RPC boundary. */
function decimalUnits(value: unknown, max: bigint, error: string): bigint {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(error);
  const [whole = "0", fraction = ""] = value.split(".");
  const significant = whole.replace(/^0+/, "") || "0";
  if (significant.length > 12) throw new Error(error);
  const units = BigInt(significant) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (units > max) throw new Error(error);
  return units;
}

/** Shared form/server validation matches the existing NUMERIC helpers and seal trigger. */
export function validateCommissionPublication(payload: Record<string, unknown>) {
  if (typeof payload["effective_from"] !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(payload["effective_from"])) throw new Error("Укажите месяц начала действия");
  const mode = payload["mode"];
  if (!["none", "fixed", "thresholds"].includes(String(mode))) throw new Error("Выберите тип комиссии.");
  const rows = payload["thresholds"];
  if (!Array.isArray(rows)) throw new Error("Укажите пороги комиссии.");
  if (mode === "fixed") decimalUnits(payload["fixed_percent"], 10000n, "Процент: от 0 до 100, не более двух знаков после запятой.");
  else if (payload["fixed_percent"] !== null) throw new Error("Фиксированный процент допустим только для фиксированной комиссии.");
  if (mode !== "thresholds") {
    if (rows.length) throw new Error("Пороги допустимы только для пороговой комиссии.");
    return;
  }
  if (!rows.length) throw new Error("Добавьте первый порог с выручкой от 0 ₽.");
  let previous = -1n;
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Проверьте пороги комиссии.");
    const amount = decimalUnits(row.from_amount, 99999999999999n, "Выручка порога: от 0 до 999 999 999 999,99 ₽, не более двух знаков после запятой.");
    decimalUnits(row.percent, 10000n, "Процент порога: от 0 до 100, не более двух знаков после запятой.");
    if (index === 0 && amount !== 0n) throw new Error("Первый порог должен начинаться с выручки 0 ₽.");
    if (amount <= previous) throw new Error("Суммы порогов должны строго возрастать без повторов.");
    previous = amount;
  }
}

/** Commission versions start on the first day of a month; preserve editor decimal strings. */
export function publishCommissionPayload(workplaceId: string, month: string, mode: AccountCommission["mode"], fixedPercent: string | null, thresholds: Array<{ from_amount: string; percent: string }>) {
  const payload = { workplace_id: workplaceId, effective_from: `${month}-01`, mode, fixed_percent: mode === "fixed" ? fixedPercent : null, thresholds: mode === "thresholds" ? thresholds : [] };
  validateCommissionPublication(payload);
  return payload;
}

export function writeErrorMessage(raw: string, operation?: ProfileOperation): string {
  if (operation === "publish_commission") {
    if (/Threshold rules must start at zero/i.test(raw)) return "Первый порог должен начинаться с выручки 0 ₽.";
    if (/Money field from_amount/i.test(raw)) return "Выручка порога: укажите сумму от 0 до 999 999 999 999,99 ₽ с точностью до копеек.";
    if (/Money field (fixed_percent|percent)/i.test(raw)) return "Процент: от 0 до 100, не более двух знаков после запятой.";
    if (/commission_thresholds.*(unique|key)|duplicate key.*commission_thresholds/i.test(raw)) return "Суммы порогов должны строго возрастать без повторов.";
  }
  if (operation === "workplace_edit") {
    if (/Money field revenue_goal/i.test(raw)) return "Цель по выручке: укажите сумму от 0,01 до 999 999 999 999,99 ₽ с точностью до копеек или оставьте поле пустым.";
    if (/workplaces_color_check/i.test(raw)) return "Выберите цвет рабочего места из палитры.";
    if (/workplaces_name_check|not-null constraint.*name/i.test(raw)) return "Укажите название рабочего места.";
    if (/workplaces_revenue_goal/i.test(raw)) return "Цель по выручке должна быть больше нуля или не задана.";
  }
  if (operation?.startsWith("shift_")) {
    if (/Shift conflicts require explicit override/i.test(raw)) return "Смена пересекается по времени с другой сменой. Измените время.";
    if (/Only a planned shift can be started/i.test(raw)) return "Начать можно только запланированную смену.";
    if (/Only an active shift can be completed/i.test(raw)) return "Завершить можно только активную смену.";
    if (/Only an active shift can be cancelled/i.test(raw)) return "Отменить можно только активную смену.";
    if (/Cannot assign new shifts to archived workplace/i.test(raw)) return "Рабочее место в архиве. Выберите другое место.";
    if (/Restore shift before editing/i.test(raw)) return "Смена в корзине. Сначала восстановите её.";
    if (/complete time set|one complete set/i.test(raw)) return "Проверьте дату и время смены.";
    if (/Workplace move must explicitly replace fixed payments/i.test(raw)) return "Перенос смены с фиксированными выплатами пока недоступен.";
  }
  if (/revision conflict/i.test(raw)) return "Данные изменились на другом устройстве. Обновите и повторите.";
  if (/Historical publication/i.test(raw)) return "Нельзя менять правила задним числом: в этом периоде уже есть завершённые смены.";
  if (/duplicate key|unique/i.test(raw)) return "На эту дату уже опубликована версия. Выберите другую дату.";
  if (/check constraint|22023|required|must be/i.test(raw)) return "Проверьте введённые значения.";
  return "Не удалось сохранить. Попробуйте ещё раз.";
}
