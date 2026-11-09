import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";
import { authHead } from "@/lib/auth";
export const Route = createFileRoute("/register")({
  head: () => authHead("Регистрация", "Создание аккаунта Shiftly с подтверждением email."),
  component: () => <AuthForm mode="signup" />,
});