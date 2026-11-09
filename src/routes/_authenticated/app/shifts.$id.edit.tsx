import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { authHead } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/primitives";
import { PersonalShiftForm } from "@/components/personal/PersonalShiftForm";
import { accountSettingsOptions, accountShiftsOptions } from "@/data/account-queries";

export const Route = createFileRoute("/_authenticated/app/shifts/$id/edit")({
  head: () => authHead("Редактировать смену", "Изменение смены в личном пространстве Shiftly."),
  component: EditPersonalShift,
});

function EditPersonalShift() {
  const { id } = Route.useParams();
  const { accountUser } = getRouteApi("/_authenticated").useRouteContext();
  const settings = useQuery(accountSettingsOptions(accountUser.id));
  const shifts = useQuery(accountShiftsOptions(accountUser.id));
  if (settings.isPending || shifts.isPending) return <div className="px-5 pt-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  const shift = (shifts.data ?? []).find((s) => s.id === id);
  if (!shift) {
    return (
      <div className="px-5 pt-6">
        <EmptyState icon={AlertTriangle} title="Смена не найдена" text="Возможно, она была удалена." action={<Button asChild variant="secondary"><Link to="/app/calendar">К календарю</Link></Button>} />
      </div>
    );
  }
  return <PersonalShiftForm userId={accountUser.id} workplaces={settings.data?.workplaces ?? []} shifts={shifts.data ?? []} initial={shift} />;
}
