import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { authHead } from "@/lib/auth";
import { PersonalCalendar } from "@/components/personal/PersonalCalendar";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => authHead("Мой календарь", "Личный календарь смен в Shiftly."),
  component: function PersonalCalendarPage() {
    const { accountUser } = getRouteApi("/_authenticated").useRouteContext();
    return <PersonalCalendar userId={accountUser.id} />;
  },
});
