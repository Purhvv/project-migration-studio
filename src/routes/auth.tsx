import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";
import { authHead } from "@/lib/auth";
export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({ reason: search.reason === "session" ? "session" : undefined }),
  head: () => authHead("Вход", "Вход в личный аккаунт Shiftly по email и паролю."),
  component: () => <AuthForm mode="login" reason={Route.useSearch().reason} />,
});