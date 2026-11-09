import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthContext, authError } from "@/lib/auth";

const sdk = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: sdk } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

describe("Auth rules", () => {
  it("does not sign in after signup without a confirmed session", async () => {
    sdk.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<AuthContext.Provider value={{ user: null, loading: false, recovery: false }}><AuthForm mode="signup" /></AuthContext.Provider>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "safe-password-123" } });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), { target: { value: "safe-password-123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Создать аккаунт" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(sdk.signUp).toHaveBeenCalledOnce());
    expect(sdk.signUp.mock.calls[0]?.[0].options.emailRedirectTo).toBe(`${window.location.origin}/auth/callback`);
    expect(navigate).not.toHaveBeenCalled();
  });
  it("uses the required public recovery destination", async () => {
    sdk.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<AuthForm mode="forgot" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Отправить письмо" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(sdk.resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", { redirectTo: `${window.location.origin}/reset-password` }));
  });
  it("rejects mismatching passwords without an Auth write", () => {
    render(<AuthForm mode="signup" />);
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "safe-password-123" } });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), { target: { value: "different-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Создать аккаунт" }).closest("form") as HTMLFormElement);
    expect(sdk.signUp).not.toHaveBeenCalled();
  });
  it("does not let an ordinary signed-in session reset a password", () => {
    render(<AuthForm mode="reset" />);
    expect(screen.getByRole("button", { name: "Сохранить пароль" })).toBeDisabled();
    expect(sdk.updateUser).not.toHaveBeenCalled();
  });
  it("never exposes raw provider errors", () => {
    expect(authError({ message: "private provider diagnostics" })).not.toContain("private provider diagnostics");
  });
});