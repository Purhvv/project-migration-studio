import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";
import { authHead } from "@/lib/auth";
export const Route = createFileRoute("/forgot-password")({
  head: () => authHead("Восстановление пароля", "Получите ссылку для восстановления доступа к Shiftly."),
  component: () => <AuthForm mode="forgot" />,
});