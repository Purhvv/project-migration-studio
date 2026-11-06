/** Domain types. Shapes mirror the future Supabase tables. */
export type ShiftStatus = "planned" | "in_progress" | "pending" | "completed" | "cancelled";

/** Named palette keys; each maps to a `--wp-<key>` CSS token. */
export type WorkplaceColor = "sky" | "green" | "amber" | "rose" | "violet" | "orange";

/** Hourly rate valid inside a daily time window. end <= start means the window runs past midnight. */
export interface RateInterval {
  id: string;
  /** HH:mm */
  start: string;
  end: string;
  hourly: number;
  /** 0 = Monday … 6 = Sunday; empty/undefined = every day. Applies to the day the window starts. */
  weekdays?: number[] | undefined;
}

export interface Workplace {
  id: string;
  name: string;
  color: WorkplaceColor;
  /** Configured hourly rates; empty = not configured (no estimate possible). */
  rates: RateInterval[];
}

export interface Adjustment {
  id: string;
  label: string;
  /** null = amount not known yet */
  amount: number | null;
}

export interface Shift {
  id: string;
  workplaceId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  start: string;
  end: string;
  status: ShiftStatus;
  /** Actual financial values (entered/confirmed); null means unknown. */
  revenue: number | null;
  tips: number | null;
  basePay: number | null;
  /** Confirmed commission only; missing means not separately recorded. */
  commissionPay?: number | null;
  bonuses: Adjustment[];
  penalties: Adjustment[];
  earnings: number | null;
  comment?: string | undefined;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  currency: string;
  /** Monthly earnings goal; null = not set */
  monthlyGoal: number | null;
  /** Monthly personal revenue goal, independent from monthlyGoal; null = not set.
   *  Future: plan-based commission tiers can attach here. */
  revenueGoal: number | null;
  hoursGoal?: number | null;
  shiftsGoal?: number | null;
}
