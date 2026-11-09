import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { authHead } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyEarnings, NoShifts, NoWorkplaces, sessionName } from "@/components/personal/PersonalEmpty";
import { PersonalShiftRow } from "@/components/personal/PersonalCalendar";
import { ErrorState, Panel, Section } from "@/components/shared/primitives";
import { WorkplaceDot } from "@/components/shifts/shift-ui";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";
import { workplaceToday } from "@/lib/account-rates";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => authHead("Личное пространство", "Ваши смены, рабочие места и заработок в Shiftly."),
  component: PersonalHome,
});

function PersonalHome() {
  const { accountUser } = Route.useRouteContext();
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  const workplaces = settings.data?.workplaces ?? [];
  const wpMap = new Map(workplaces.map((w) => [w.id, w]));
  const today = workplaceToday(settings.data?.profile.timezone ?? "Europe/Moscow");
  const upcoming = (shifts.data ?? [])
    .filter((s) => s.local_start_date >= today && (s.status === "planned" || s.status === "in_progress" || s.status === "pending"))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <header className="px-5 pt-6">
        <p className="text-sm text-muted-foreground">Личное пространство</p>
        <h1 className="font-display text-2xl font-semibold break-words">{sessionName(accountUser)}</h1>
      </header>
      <EmptyEarnings />
      <Section title="Места работы">
        {settings.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : settings.isError ? (
          <ErrorState onRetry={() => settings.refetch()} />
        ) : workplaces.length ? (
          <Panel className="divide-y">
            {workplaces.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                <WorkplaceDot color={w.color} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</span>
              </div>
            ))}
          </Panel>
        ) : (
          <NoWorkplaces />
        )}
      </Section>
      <Section
        title="Ближайшие смены"
        action={workplaces.length > 0 ? (
          <Button asChild size="sm" variant="ghost" className="text-primary">
            <Link to="/app/shifts/new"><Plus className="size-4" />Добавить</Link>
          </Button>
        ) : undefined}
      >
        {shifts.isPending ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : shifts.isError ? (
          <ErrorState onRetry={() => shifts.refetch()} />
        ) : upcoming.length ? (
          <Panel className="divide-y px-4">
            {upcoming.map((s) => <PersonalShiftRow key={s.id} shift={s} name={wpMap.get(s.workplace_id)?.name} color={wpMap.get(s.workplace_id)?.color} />)}
          </Panel>
        ) : (
          <NoShifts />
        )}
      </Section>
    </div>
  );
}
