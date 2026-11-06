import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export const UNKNOWN = "—";
export const GROUP_SPACE = "\u202f";

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits }).format(value).replace(/[\u00a0 ]/g, GROUP_SPACE);
}

/** Canonical editable decimal string, no grouping in stored values. */
export function cleanNumberInput(value: string): string {
  const clean = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [integer = "", ...fraction] = clean.split(".");
  return integer.replace(/^0+(?=\d)/, "") + (fraction.length ? "." + fraction.join("").slice(0, 2) : "");
}

export function formatNumberInput(value: string): string {
  const [integer = "", fraction] = cleanNumberInput(value).split(".");
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SPACE) + (fraction !== undefined ? "," + fraction : "");
}

export function parseNumberInput(value: string): number | null {
  const clean = cleanNumberInput(value);
  if (!clean || clean === ".") return null;
  const n = Number(clean);
  return Number.isFinite(n) && n <= Number.MAX_SAFE_INTEGER ? n : null;
}

export function formatMoney(value: number | null | undefined, currency = "RUB"): string {
  if (value === null || value === undefined) return UNKNOWN;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
   }).format(value).replace(/[\u00a0 ]/g, GROUP_SPACE);
}

export function formatHours(minutes: number | null): string {
  if (minutes === null) return UNKNOWN;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${formatNumber(h)} ч ${formatNumber(m)} мин` : `${formatNumber(h)} ч`;
}

export function formatHoursShort(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}ч`;
}

/** Duration in minutes; overnight shifts wrap past midnight. */
export function shiftMinutes(start: string, end: string): number {
  const [sh = 0, sm = 0] = start.split(":").map(Number);
  const [eh = 0, em = 0] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

export const fmtDate = (iso: string, pattern: string) =>
  format(parseISO(iso), pattern, { locale: ru });

export const fmtMonth = (d: Date) => {
  const s = format(d, "LLLL yyyy", { locale: ru });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
