import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type AuthState = { user: User | null; loading: boolean; recovery: boolean };
export const AuthContext = createContext<AuthState>({ user: null, loading: true, recovery: false });
export const useAuth = () => useContext(AuthContext);

export function authError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  switch (code) {
    case "invalid_credentials": return "Неверный email или пароль.";
    case "email_not_confirmed": return "Подтвердите email по ссылке из письма, затем войдите.";
    case "user_already_exists": case "email_exists": return "Этот email уже зарегистрирован. Попробуйте войти или восстановить пароль.";
    case "weak_password": return "Пароль слишком простой. Используйте более длинный и сложный пароль.";
    case "same_password": return "Новый пароль должен отличаться от прежнего.";
    case "over_email_send_rate_limit": case "over_request_rate_limit": return "Слишком много попыток. Подождите немного и повторите.";
    case "otp_expired": return "Ссылка истекла. Запросите новое письмо.";
    case "signup_disabled": case "email_provider_disabled": return "Регистрация по email пока недоступна.";
    default: return "Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.";
  }
}

export function authHead(title: string, description: string) {
  const fullTitle = `${title} — Shiftly`;
  return { meta: [
    { title: fullTitle }, { name: "description", content: description },
    { property: "og:title", content: fullTitle }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] };
}
/** Personal (signed-in) space lives under /app; /account is its profile screen. */
export function isPersonalPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/account";
}

const DEMO_KEY = "shiftly-demo-opt-in";
/** A signed-in user explicitly chose to browse the public demo in this tab. */
export function wantsDemo(): boolean {
  try { return sessionStorage.getItem(DEMO_KEY) === "1"; } catch { return false; }
}
export function setWantsDemo(value: boolean) {
  try { if (value) sessionStorage.setItem(DEMO_KEY, "1"); else sessionStorage.removeItem(DEMO_KEY); } catch { /* storage unavailable */ }
}
