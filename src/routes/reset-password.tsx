import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";
import { authHead } from "@/lib/auth";
export const Route = createFileRoute("/reset-password")({
  head: () => authHead("Новый пароль", "Установите новый пароль аккаунта Shiftly по ссылке из письма."),
  component: () => <AuthForm mode="reset" />,
});