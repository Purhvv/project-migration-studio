import { createFileRoute } from "@tanstack/react-router";
import { ShiftForm } from "@/components/shifts/ShiftForm";
import { useShifts } from "@/data/queries";
import { EmptyState, ErrorState } from "@/components/shared/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchX } from "lucide-react";
export const Route = createFileRoute("/shifts/$id/edit")({
  head: () => ({ meta: [
    { title: "Редактирование смены — Shiftly" }, { name: "description", content: "Изменение статуса, времени и начислений рабочей смены." },
    { property: "og:title", content: "Редактирование смены — Shiftly" }, { property: "og:description", content: "Исправление данных смены в Shiftly." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: EditShift,
});
function EditShift() {
  const { id } = Route.useParams(); const shifts = useShifts();
  if (shifts.isPending) return <Skeleton className="m-5 h-96" />;
  if (shifts.isError) return <ErrorState onRetry={() => shifts.refetch()} />;
  const shift = shifts.data.find((s) => s.id === id);
  return shift ? <ShiftForm key={shift.id} initial={shift} /> : <EmptyState icon={SearchX} title="Смена не найдена" />;
}