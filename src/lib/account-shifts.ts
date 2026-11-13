import { selectRateVersions } from "@/lib/account-rates";
import type { AccountWorkplace } from "@/lib/account-settings";
import { shiftMinutes } from "@/lib/format";
import type { ShiftStatus } from "@/lib/types";

/** Shift row as read from Supabase for the verified owner. Times are trimmed to HH:mm. */
export type AccountShift = {
  id: string;
  workplace_id: string;
  local_start_date: string;
  local_end_date: string;
  start_time: string;
  end_time: string;
  /** UTC instants derived by the database from the workplace timezone. */
  starts_at: string;
  ends_at: string;
  status: ShiftStatus;
  revenue: number | null;
  tips: number | null;
  base_pay: number | null;
  earnings: number | null;
  comment: string | null;
  revision: number;
  revenue_revision: number;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Offset of the IANA timezone at the given instant, in ms (local wall clock minus UTC). */
function tzOffsetMs(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - instant;
}

/** Wall-clock date + time in the workplace timezone → UTC ISO instant. */
export function localToUtc(date: string, time: string, timezone: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(naive)) throw new Error("Некорректные дата или время смены.");
  const first = tzOffsetMs(naive, timezone);
  const second = tzOffsetMs(naive - first, timezone);
  return new Date(naive - second).toISOString();
}

/** Local end date: the next calendar day when the shift runs past midnight. */
export function shiftEndDate(date: string, start: string, end: string): string {
  if (end > start) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface ShiftTimeInput {
  workplace: Pick<AccountWorkplace, "id" | "timezone">;
  date: string;
  start: string;
  end: string;
}

/** Complete local+UTC time set; the RPC rejects partial time updates. */
export function shiftTimeFields({ workplace, date, start, end }: ShiftTimeInput) {
  if (!datePattern.test(date)) throw new Error("Укажите дату смены.");
  if (!timePattern.test(start) || !timePattern.test(end) || start === end) throw new Error("Укажите корректное и различающееся время начала и окончания.");
  const local_end_date = shiftEndDate(date, start, end);
  return {
    workplace_id: workplace.id,
    local_start_date: date,
    local_end_date,
    start_time: start,
    end_time: end,
    starts_at: localToUtc(date, start, workplace.timezone),
    ends_at: localToUtc(local_end_date, end, workplace.timezone),
  };
}

const cleanComment = (comment: string) => {
  const trimmed = comment.trim();
  return trimmed ? trimmed.slice(0, 2000) : null;
};

/** shift_create: revenue/tips stay NULL this stage; adjustments and fixed payments are not connected yet. */
export function shiftCreatePayload(time: ShiftTimeInput, comment: string, newId: () => string = () => crypto.randomUUID()) {
  return {
    id: newId(),
    ...shiftTimeFields(time),
    revenue: null,
    tips: null,
    comment: cleanComment(comment),
    adjustments: [] as unknown[],
    fixed_payments: [] as unknown[],
    override_conflicts: false,
  };
}

/** Canonical decimal string accepted by the RPC money contract; empty input means unknown → NULL. */
export const MONEY_PATTERN = /^[0-9]+(\.[0-9]{1,2})?$/;
const MONEY_MAX = 999999999999.99;

/** Decimal-string money for the RPC: trims, rejects JSON numbers and out-of-range sums, keeps NULL for unknown. */
export function cleanMoney(value: string): string | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  if (!MONEY_PATTERN.test(trimmed) || Number(trimmed) > MONEY_MAX) throw new Error("Сумма: от 0 до 999 999 999 999,99 ₽, не более двух знаков после запятой.");
  return trimmed;
}

export type AdjustmentDraft = { kind: "bonus" | "penalty"; label: string; amount: string };

/** Timing of a new shift against the current moment, on real UTC instants (overnight already resolved). */
export function classifyShiftTiming(starts_at: string, ends_at: string, now: number = Date.now()): "past" | "current" | "future" {
  const start = Date.parse(starts_at);
  const end = Date.parse(ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "future";
  if (end <= now) return "past";
  if (start > now) return "future";
  return "current";
}

/** shift_create_completed: an already-finished shift saved atomically as completed with its financial data. */
export function shiftCreateCompletedPayload(time: ShiftTimeInput, fin: { revenue: string; tips: string; adjustments: AdjustmentDraft[] }, comment: string, newId: () => string = () => crypto.randomUUID()) {
  const adjustments = fin.adjustments.map((a, index) => {
    const label = a.label.trim();
    if (!label) throw new Error("Укажите название премии или штрафа.");
    return { kind: a.kind, label: label.slice(0, 200), amount: cleanMoney(a.amount), comment: null, sort_order: index };
  });
  return {
    id: newId(),
    ...shiftTimeFields(time),
    revenue: cleanMoney(fin.revenue),
    tips: cleanMoney(fin.tips),
    comment: cleanComment(comment),
    adjustments,
    fixed_payments: [] as unknown[],
    override_conflicts: false,
  };
}

/** shift_edit: time set is always complete; revenue/tips are omitted so the RPC keeps stored values. */
export function shiftEditPayload(shift: Pick<AccountShift, "id" | "revision">, time: ShiftTimeInput, comment: string) {
  return {
    id: shift.id,
    expected_revision: shift.revision,
    ...shiftTimeFields(time),
    comment: cleanComment(comment),
    override_conflicts: false,
  };
}

/** shift_complete keeps the stored time and money; only the status machine moves. */
export function shiftCompletePayload(shift: AccountShift) {
  return {
    id: shift.id,
    expected_revision: shift.revision,
    workplace_id: shift.workplace_id,
    local_start_date: shift.local_start_date,
    local_end_date: shift.local_end_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    starts_at: shift.starts_at,
    ends_at: shift.ends_at,
    comment: shift.comment,
    override_conflicts: false,
  };
}

export const shiftStartPayload = (shift: Pick<AccountShift, "id" | "revision">) =>
  ({ id: shift.id, expected_revision: shift.revision, override_conflicts: false });

export const shiftCancelPayload = (shift: Pick<AccountShift, "id" | "revision">, comment?: string) =>
  ({ id: shift.id, expected_revision: shift.revision, override_conflicts: false, comment: comment?.trim() ? comment.trim().slice(0, 2000) : null });

export const shiftDeletePayload = (shift: Pick<AccountShift, "id" | "revision">) =>
  ({ id: shift.id, expected_revision: shift.revision });

export type ShiftOperation = "shift_create" | "shift_create_completed" | "shift_edit" | "shift_complete" | "shift_delete" | "shift_start" | "shift_cancel";
export const SHIFT_OPERATIONS: readonly ShiftOperation[] = ["shift_create", "shift_create_completed", "shift_edit", "shift_complete", "shift_delete", "shift_start", "shift_cancel"];

/** Server-boundary validation for shift payloads; the DB still enforces ownership, revisions and the status machine. */
export function validateShiftWrite(type: ShiftOperation, payload: Record<string, unknown>) {
  if (typeof payload["id"] !== "string" || !uuidPattern.test(payload["id"])) throw new Error("Некорректные данные смены.");
  if (type !== "shift_create" && type !== "shift_create_completed") {
    const revision = payload["expected_revision"];
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) throw new Error("Некорректная версия смены.");
  }
  if (type === "shift_delete" || type === "shift_start" || type === "shift_cancel") return;
  if (typeof payload["workplace_id"] !== "string" || !uuidPattern.test(payload["workplace_id"])) throw new Error("Выберите место работы.");
  if (typeof payload["local_start_date"] !== "string" || !datePattern.test(payload["local_start_date"])) throw new Error("Укажите дату смены.");
  if (typeof payload["local_end_date"] !== "string" || !datePattern.test(payload["local_end_date"])) throw new Error("Укажите дату смены.");
  if (typeof payload["start_time"] !== "string" || !timePattern.test(payload["start_time"])) throw new Error("Укажите время начала.");
  if (typeof payload["end_time"] !== "string" || !timePattern.test(payload["end_time"])) throw new Error("Укажите время окончания.");
  const starts = Date.parse(String(payload["starts_at"]));
  const ends = Date.parse(String(payload["ends_at"]));
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) throw new Error("Проверьте дату и время смены.");
  if ("comment" in payload && payload["comment"] !== null && typeof payload["comment"] !== "string") throw new Error("Некорректный комментарий.");
  if (payload["override_conflicts"] !== false) throw new Error("Пересечения смен требуют явного подтверждения.");
  if (type === "shift_create_completed") {
    const validMoney = (v: unknown) => v === null || (typeof v === "string" && MONEY_PATTERN.test(v) && Number(v) <= 999999999999.99);
    if ("revenue" in payload && !validMoney(payload["revenue"])) throw new Error("Выручка: сумма с точностью до копеек или пусто.");
    if ("tips" in payload && !validMoney(payload["tips"])) throw new Error("Чаевые: сумма с точностью до копеек или пусто.");
    if ("fixed_payments" in payload && (!Array.isArray(payload["fixed_payments"]) || payload["fixed_payments"].length > 0)) throw new Error("Фиксированные выплаты появятся на следующем этапе.");
    if ("adjustments" in payload) {
      if (!Array.isArray(payload["adjustments"])) throw new Error("Некорректные премии и штрафы.");
      for (const item of payload["adjustments"] as unknown[]) {
        const a = item as Record<string, unknown>;
        if (!a || typeof a !== "object" || (a["kind"] !== "bonus" && a["kind"] !== "penalty")) throw new Error("Некорректные премии и штрафы.");
        if (typeof a["label"] !== "string" || !a["label"].trim()) throw new Error("Укажите название премии или штрафа.");
        if (!validMoney(a["amount"])) throw new Error("Сумма премии или штрафа: с точностью до копеек или пусто.");
      }
    }
    return;
  }
  for (const key of ["adjustments", "fixed_payments"] as const) {
    if (key in payload && (!Array.isArray(payload[key]) || payload[key].length > 0)) throw new Error("Премии, штрафы и фиксированные выплаты появятся на следующем этапе.");
  }
  if ("revenue" in payload && payload["revenue"] !== null) throw new Error("Выручка подключается на следующем этапе.");
  if ("tips" in payload && payload["tips"] !== null) throw new Error("Чаевые подключаются на следующем этапе.");
}

export type AccountConflict = { other: AccountShift; minutes: number };

/** Overlap check on real UTC instants; cancelled shifts never conflict. */
export function findAccountConflicts(candidate: { id: string | null; starts_at: string; ends_at: string }, shifts: AccountShift[]): AccountConflict[] {
  const a0 = Date.parse(candidate.starts_at);
  const a1 = Date.parse(candidate.ends_at);
  if (!Number.isFinite(a0) || !Number.isFinite(a1)) return [];
  return shifts.flatMap((s) => {
    if (s.id === candidate.id || s.status === "cancelled") return [];
    const b0 = Date.parse(s.starts_at);
    const b1 = Date.parse(s.ends_at);
    const start = Math.max(a0, b0);
    const end = Math.min(a1, b1);
    return end > start ? [{ other: s, minutes: (end - start) / 60000 }] : [];
  });
}

export type AccountEstimate = { amount: number | null; uncoveredMinutes: number; hasRates: boolean };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
/** 0 = Monday … 6 = Sunday, matching the stored weekdays convention. */
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Preliminary pay from the workplace's sealed hourly rates in force on the shift date. Never fabricates a sum. */
export function estimateAccountPay(workplace: AccountWorkplace, date: string, start: string, end: string): AccountEstimate {
  const versions = workplace.rateVersions ?? (workplace.rates ? [workplace.rates] : []);
  const version = selectRateVersions(versions, date).current;
  const hourly = (version?.intervals ?? []).filter((i) => i.kind === "hourly" && i.start_time && i.end_time && i.hourly !== null);
  const total = shiftMinutes(start, end);
  if (!hourly.length) return { amount: null, uncoveredMinutes: total, hasRates: false };
  const nextDay = shiftEndDate(date, "23:59", "00:00");
  const rateAt = (day: string, minuteOfDay: number) => {
    const wd = weekdayOf(day);
    const prevWd = (wd + 6) % 7;
    return hourly.find((r) => {
      if (!r.start_time || !r.end_time) return false;
      const s = toMin(r.start_time);
      const e = toMin(r.end_time);
      const days = r.weekdays?.length ? r.weekdays : [0, 1, 2, 3, 4, 5, 6];
      if (s < e) return minuteOfDay >= s && minuteOfDay < e && days.includes(wd);
      return (minuteOfDay >= s && days.includes(wd)) || (minuteOfDay < e && days.includes(prevWd));
    });
  };
  const s = toMin(start);
  const e = s + total;
  let sum = 0;
  let uncovered = 0;
  for (let m = s; m < e; m++) {
    const r = m < 1440 ? rateAt(date, m) : rateAt(nextDay, m - 1440);
    if (r?.hourly !== null && r?.hourly !== undefined) sum += r.hourly / 60;
    else uncovered++;
  }
  return { amount: uncovered === total ? null : Math.round(sum), uncoveredMinutes: uncovered, hasRates: true };
}

/** Status transitions offered by the existing RPC status machine. */
export function shiftActions(status: ShiftStatus): Array<"start" | "complete" | "cancel"> {
  switch (status) {
    case "planned": return ["start", "complete", "cancel"];
    case "in_progress":
    case "pending": return ["complete", "cancel"];
    default: return [];
  }
}
