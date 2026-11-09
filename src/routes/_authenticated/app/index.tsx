import { createFileRoute } from "@tanstack/react-router";
import { authHead } from "@/lib/auth";
import { Section } from "@/components/shared/primitives";
import { EmptyEarnings, NoShifts, NoWorkplaces, sessionName } from "@/components/personal/PersonalEmpty";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => authHead("Личное пространство", "Ваши смены, рабочие места и заработок в Shiftly."),
  component: PersonalHome,
});

function PersonalHome() {
  const { accountUser } = Route.useRouteContext();
  return (
    <div className="space-y-8">
      <header className="px-5 pt-6">
        <p className="text-sm text-muted-foreground">Личное пространство</p>
        <h1 className="font-display text-2xl font-semibold break-words">{sessionName(accountUser)}</h1>
      </header>
      <EmptyEarnings />
      <Section title="Места работы"><NoWorkplaces /></Section>
      <Section title="Смены"><NoShifts /></Section>
    </div>
  );
}
