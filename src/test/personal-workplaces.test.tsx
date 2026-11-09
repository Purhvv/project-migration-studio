import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkplacesPanel } from "@/components/personal/AccountPanels";
import type { AccountSettings } from "@/lib/account-settings";

const write = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => write }));
vi.mock("@/lib/account.functions", () => ({ accountWrite: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const settings: AccountSettings = { profile: { id: "owner", name: "Анна", currency: "RUB", timezone: "Europe/Moscow", monthly_goal: null, hours_goal: null, shifts_goal: null, revision: 1 }, workplaces: [] };
const mount = (value = settings) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><WorkplacesPanel settings={value} userId="owner" /></QueryClientProvider>);

describe("workplace form protected write path", () => {
  it("creates with the reported goal as a string, never with a client owner", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Добавить место работы" }));
    fireEvent.change(screen.getByLabelText("Название рабочего места"), { target: { value: "«Светски»" } });
    fireEvent.change(screen.getByLabelText("Цель по выручке"), { target: { value: "1250000" } });
    fireEvent.click(screen.getByRole("button", { name: /^Сохранить$/ }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    const data = write.mock.calls[0]?.[0].data;
    expect(data.type).toBe("workplace_edit");
    expect(data.payload).toMatchObject({ name: "«Светски»", color: "green", revenue_goal: "1250000" });
    expect(data.payload).not.toHaveProperty("user_id");
    expect(data.payload).not.toHaveProperty("expected_revision");
  });
  it("edits an existing workplace and clears its goal with NULL", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    mount({ ...settings, workplaces: [{ id: "w", name: "Бар", color: "green", timezone: "Europe/Moscow", revenue_goal: 1250000, revision: 3, rates: null, commission: null }] });
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    fireEvent.change(screen.getByLabelText("Цель по выручке"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Сохранить$/ }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(write.mock.calls[0]?.[0].data.payload).toMatchObject({ id: "w", expected_revision: 3, revenue_goal: null });
  });
});