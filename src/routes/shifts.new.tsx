import { createFileRoute } from "@tanstack/react-router";
import { ShiftForm } from "@/components/shifts/ShiftForm";
export const Route = createFileRoute("/shifts/new")({
  validateSearch: (s: Record<string, unknown>): { date?: string } => typeof s['date'] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s['date']) ? { date: s['date'] } : {},
  head: () => ({ meta: [
    { title: "Новая смена — Shiftly" }, { name: "description", content: "Добавление рабочей смены и фактических начислений." },
    { property: "og:title", content: "Новая смена — Shiftly" }, { property: "og:description", content: "Добавление смены в календарь Shiftly." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: NewShift,
});
function NewShift() { const { date } = Route.useSearch(); return <ShiftForm initialDate={date} />; }
