import { createFileRoute } from "@tanstack/react-router";
import { authHead } from "@/lib/auth";
import { PageHeader, Section } from "@/components/shared/primitives";
import { EmptyEarnings, NoShifts } from "@/components/personal/PersonalEmpty";

export const Route = createFileRoute("/_authenticated/app/stats")({
  head: () => authHead("Моя статистика", "Личная статистика заработка в Shiftly."),
  component: () => (
    <div className="space-y-5">
      <PageHeader title="Статистика" subtitle="Личное пространство" />
      <EmptyEarnings title="Фактический заработок" />
      <Section><NoShifts /></Section>
    </div>
  ),
});
