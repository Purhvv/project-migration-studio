import { Link } from "@tanstack/react-router";
import { Briefcase, CalendarPlus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { EmptyState, Money, Panel, Section } from "@/components/shared/primitives";

export function sessionName(user: User): string {
  const meta = user.user_metadata ?? {};
  const raw = typeof meta["name"] === "string" ? meta["name"] : typeof meta["full_name"] === "string" ? meta["full_name"] : "";
  return raw.trim() || user.email || "—";
}

export function NoWorkplaces() {
  return <EmptyState icon={Briefcase} title="Нет рабочих мест" text="Добавьте первое место работы, чтобы планировать смены." action={<Button asChild><Link to="/account">Добавить место работы</Link></Button>} />;
}

export function NoShifts() {
  return <EmptyState icon={CalendarPlus} title="Нет смен" text="Добавьте первую смену, чтобы видеть заработок." action={<Button asChild variant="secondary"><Link to="/app/shifts/new">Добавить первую смену</Link></Button>} />;
}

export function EmptyEarnings({ title = "Заработок за месяц" }: { title?: string }) {
  return (
    <Section>
      <Panel className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 font-display text-3xl font-semibold"><Money value={null} /></p>
        <p className="mt-2 text-xs text-muted-foreground">Пока нет подтверждённых смен</p>
      </Panel>
    </Section>
  );
}
