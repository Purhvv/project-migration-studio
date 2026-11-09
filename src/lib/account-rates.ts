import type { AccountInterval, AccountRateVersion } from "@/lib/account-settings";

export type HourlyDraft = { label: string; start: string; end: string; hourly: string; weekdays?: number[] };
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const minute = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Decimal validation only; monetary calculations remain in PostgreSQL NUMERIC. */
export function validHourly(value: string): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
  const whole = (value.split(".")[0] ?? "").replace(/^0+/, "") || "0";
  return whole.length <= 8 && /[1-9]/.test(value);
}

export function validRateDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function rateDraftError(rows: HourlyDraft[], hasFixed = false): string | null {
  if (!rows.length && !hasFixed) return "Добавьте хотя бы один интервал";
  for (const r of rows) {
    if (!r.label.trim()) return "Укажите название каждой ставки";
    if (!validHourly(r.hourly)) return "Ставка: от 0,01 до 99 999 999,99 ₽, не более двух знаков после запятой";
    if (!timePattern.test(r.start) || !timePattern.test(r.end) || r.start === r.end) return "Укажите корректное и различающееся время начала и окончания";
    if (r.weekdays?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Некорректные дни недели";
  }
  const windows = rows.flatMap((r, index) => (r.weekdays?.length ? r.weekdays : [0, 1, 2, 3, 4, 5, 6]).map((day) => {
    const start = minute(r.start), end = minute(r.end);
    return { index, start: day * 1440 + start, end: day * 1440 + end + (end < start ? 1440 : 0) };
  }));
  if (windows.some((a) => windows.some((b) => a.index !== b.index && [-10080, 0, 10080].some((offset) => a.start < b.end + offset && a.end > b.start + offset)))) return "Интервалы пересекаются, в том числе после полуночи";
  return null;
}

export function publishRatesPayload(workplaceId: string, effectiveFrom: string, hourly: HourlyDraft[], keepFixed: AccountInterval[]) {
  const fixed = keepFixed.filter((f) => f.kind === "fixed");
  const error = rateDraftError(hourly, fixed.length > 0);
  if (error) throw new Error(error);
  if (!validRateDate(effectiveFrom)) throw new Error("Укажите корректную дату начала действия");
  return { workplace_id: workplaceId, effective_from: effectiveFrom, note: null, acknowledge_overlap: false, intervals: [
    ...hourly.map((r, i) => ({ kind: "hourly", start_time: r.start, end_time: r.end, hourly: r.hourly, fixed_amount: null, label: r.label.trim(), weekdays: r.weekdays ?? [], sort_order: i })),
    ...fixed.map((f, i) => ({ kind: "fixed", start_time: null, end_time: null, hourly: null, fixed_amount: f.fixed_amount === null ? null : String(f.fixed_amount), label: f.label, weekdays: f.weekdays, sort_order: hourly.length + i })),
  ] };
}

/** Enforce the editor's no-overlap rule even for direct server-function calls. DB validates ownership and NUMERIC. */
export function validateRatePublication(payload: Record<string, unknown>) {
  if (payload["acknowledge_overlap"] !== false || !Array.isArray(payload["intervals"])) throw new Error("Некорректные данные ставок");
  const rows: HourlyDraft[] = [];
  let fixed = false;
  for (const value of payload["intervals"]) {
    if (!value || typeof value !== "object") throw new Error("Некорректный интервал");
    const r = value as Record<string, unknown>;
    if (r["kind"] === "fixed") { fixed = true; continue; }
    if (r["kind"] !== "hourly" || typeof r["label"] !== "string" || typeof r["hourly"] !== "string" || typeof r["start_time"] !== "string" || typeof r["end_time"] !== "string" || !Array.isArray(r["weekdays"]) || r["weekdays"].some((d) => typeof d !== "number")) throw new Error("Некорректный интервал");
    rows.push({ label: r["label"], hourly: r["hourly"], start: r["start_time"], end: r["end_time"], weekdays: r["weekdays"] });
  }
  const error = rateDraftError(rows, fixed);
  if (error) throw new Error(error);
  if (typeof payload["effective_from"] !== "string" || !validRateDate(payload["effective_from"])) throw new Error("Укажите корректную дату начала действия");
}

export function selectRateVersions(versions: AccountRateVersion[], date: string) {
  const sorted = [...versions].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return { current: sorted.find((v) => v.effective_from <= date) ?? null, scheduled: sorted.filter((v) => v.effective_from > date).reverse() };
}

export const workplaceToday = (timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());