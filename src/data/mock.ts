/**
 * TEMPORARY demo data + in-memory store for the interface prototype.
 * Replaced by Supabase queries in src/data/queries.ts — screens never import this file.
 * Changes live only until the page is reloaded.
 */
import { addDays, format, startOfDay } from "date-fns";
import { computeEarnings } from "@/lib/shift-management";
import type { Shift, ShiftStatus, UserProfile, Workplace } from "@/lib/types";

export const mockProfile: UserProfile = {
  id: "u1",
  name: "Алина",
  email: "alina@example.com",
  currency: "RUB",
  monthlyGoal: 120000,
};

/** Demo rates — invented sample settings, editable in Профиль → Ставки. */
export const mockWorkplaces: Workplace[] = [
  {
    id: "w1",
    name: "Ресторан «Белуга»",
    color: "sky",
    rates: [
      { id: "r1", start: "10:00", end: "18:00", hourly: 250 },
      { id: "r2", start: "18:00", end: "02:00", hourly: 300 },
    ],
  },
  { id: "w2", name: "Кофейня Surf", color: "green", rates: [{ id: "r3", start: "07:00", end: "15:00", hourly: 220 }] },
];

const pattern: Array<[number, string, string, string, ShiftStatus?]> = [
  [-27, "w1", "12:00", "23:00"],
  [-25, "w2", "08:00", "14:00"],
  [-23, "w1", "12:00", "23:00"],
  [-21, "w1", "16:00", "00:00"],
  [-20, "w2", "08:00", "14:00"],
  [-18, "w1", "12:00", "23:00"],
  [-16, "w1", "12:00", "22:00", "cancelled"],
  [-14, "w2", "08:00", "15:00"],
  [-13, "w1", "16:00", "23:30"],
  [-11, "w1", "12:00", "23:00"],
  [-9, "w2", "08:00", "14:00"],
  [-9, "w1", "17:00", "23:00"],
  [-7, "w1", "12:00", "23:00"],
  [-5, "w1", "12:00", "22:00"],
  [-4, "w2", "08:00", "14:00"],
  [-2, "w1", "12:00", "23:00"],
  [-1, "w1", "16:00", "00:00", "pending"],
  [0, "w2", "08:00", "16:00", "in_progress"],
  [1, "w1", "12:00", "23:00"],
  [3, "w2", "08:00", "14:00"],
  [3, "w1", "17:00", "23:00"],
  [5, "w1", "12:00", "23:00"],
  [8, "w1", "12:00", "22:00"],
  [10, "w2", "08:00", "14:00"],
];

function seeded(i: number) {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function buildMockShifts(today = new Date()): Shift[] {
  const base = startOfDay(today);
  return pattern.map(([offset, wp, start, end, forced], i) => {
    const date = format(addDays(base, offset), "yyyy-MM-dd");
    const status: ShiftStatus = forced ?? (offset < 0 ? "completed" : "planned");
    const completed = status === "completed";
    const r = seeded(i);
    const revenue = wp === "w1" ? Math.round((38000 + r * 30000) / 100) * 100 : Math.round((14000 + r * 8000) / 100) * 100;
    const tips = Math.round((wp === "w1" ? 1800 + r * 3200 : 600 + r * 1200) / 50) * 50;
    const basePay = wp === "w1" ? 2500 + Math.round(revenue * 0.03) : 1800;
    const bonuses = completed && i % 5 === 0 ? [{ id: `b${i}`, label: "Премия за план", amount: 1000 }] : [];
    const penalties = completed && i % 7 === 3 ? [{ id: `p${i}`, label: "Опоздание", amount: 500 }] : [];
    const unknownTips = completed && i === 13;
    const earnings = completed
      ? basePay + (unknownTips ? 0 : tips) + bonuses.reduce((s, b) => s + (b.amount ?? 0), 0) - penalties.reduce((s, p) => s + (p.amount ?? 0), 0)
      : null;
    return {
      id: `s${i + 1}`,
      workplaceId: wp,
      date,
      start,
      end,
      status,
      revenue: completed ? revenue : null,
      tips: completed ? (unknownTips ? null : tips) : null,
      basePay: completed ? basePay : null,
      bonuses,
      penalties,
      earnings: unknownTips ? null : earnings,
      comment: i === 4 ? "Подменяла коллегу" : undefined,
    } satisfies Shift;
  });
}

/** In-memory "database" used until Supabase is connected. */
export const db: { shifts: Shift[] | null; workplaces: Workplace[]; profile: UserProfile } = {
  shifts: null,
  workplaces: structuredClone(mockWorkplaces),
  profile: { ...mockProfile },
};
export const dbShifts = () => (db.shifts ??= buildMockShifts());
