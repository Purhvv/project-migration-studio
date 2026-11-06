import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMonth, formatMoney, UNKNOWN } from "@/lib/format";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 px-5 pt-6 pb-4">
      <div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("px-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border bg-card shadow-card", className)}>{children}</div>;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-8 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </div>
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Не удалось загрузить данные"
      text="Проверьте соединение и попробуйте ещё раз."
      action={<Button variant="secondary" onClick={onRetry}>Повторить</Button>}
    />
  );
}

/** Money value. Unknown values render as a dash, never as zero. */
export function Money({
  value,
  partial,
  tone = "default",
  sign,
  className,
}: {
  value: number | null;
  partial?: boolean;
  tone?: "default" | "positive" | "negative";
  sign?: "+" | "−";
  className?: string;
}) {
  if (value === null) return <span className={cn("tabular text-muted-foreground", className)}>{UNKNOWN}</span>;
  return (
    <span
      className={cn("tabular", tone === "positive" && "text-positive", tone === "negative" && "text-negative", className)}
      title={partial ? "Часть данных не заполнена" : undefined}
    >
      {sign && value !== 0 ? sign : ""}
      {formatMoney(value)}
      {partial && <sup className="ml-0.5 text-[0.6em] text-muted-foreground">*</sup>}
    </span>
  );
}

export function MonthSwitcher({ month, onChange, className }: { month: Date; onChange: (d: Date) => void; className?: string }) {
  const shift = (n: number) => onChange(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button size="icon" variant="ghost" className="size-8 rounded-full" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-28 text-center text-sm font-medium">{fmtMonth(month)}</span>
      <Button size="icon" variant="ghost" className="size-8 rounded-full" onClick={() => shift(1)} aria-label="Следующий месяц">
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            o.value === value ? "border-transparent bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NavChevron() {
  return <ChevronRight className="size-4 text-muted-foreground" />;
}
