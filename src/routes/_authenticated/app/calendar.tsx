import { createFileRoute } from "@tanstack/react-router";
import { authHead } from "@/lib/auth";
import { PageHeader, Section } from "@/components/shared/primitives";
import { NoShifts } from "@/components/personal/PersonalEmpty";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => authHead("Мой календарь", "Личный календарь смен в Shiftly."),
  component: () => (
    <div className="space-y-5">
      <PageHeader title="Календарь" subtitle="Личное пространство" />
      <Section><NoShifts /></Section>
    </div>
  ),
});
