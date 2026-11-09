import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { authHead } from "@/lib/auth";
import { EmptyState } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonalShiftForm } from "@/components/personal/PersonalShiftForm";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";

export const Route = createFileRoute("/_authenticated/app/shifts/new")({
  validateSearch: (s: Record<string, unknown>): { date?: string } =>
    typeof s["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["date"]) ? { date: s["date"] } : {},
  head: () => authHead("Новая смена", "Планирование смены в личном пространстве Shiftly."),
  component: NewPersonalShift,
});

function NewPersonalShift() {
  const { accountUser } = getRouteApi("/_authenticated").useRouteContext();
  const { date } = Route.useSearch();
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  if (settings.isPending || shifts.isPending) return <div className="px-5 pt-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  const workplaces = settings.data?.workplaces ?? [];
  if (!workplaces.length) {
    return (
      <div className="px-5 pt-6">
        <EmptyState
          icon={Briefcase}
          title="Сначала добавьте место работы"
          text="Смена привязывается к рабочему месту с его ставками и часовым поясом."
          action={<Button asChild><Link to="/account">Добавить место работы</Link></Button>}
        />
      </div>
    );
  }
  return <PersonalShiftForm userId={accountUser.id} workplaces={workplaces} shifts={shifts.data ?? []} initialDate={date} />;
}
