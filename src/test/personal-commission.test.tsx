import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommissionPanel } from "@/components/personal/AccountPanels";
import type { AccountSettings } from "@/lib/account-settings";

const write = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => write }));
vi.mock("@/lib/account.functions", () => ({ accountWrite: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const settings: AccountSettings = { profile: { id: "owner", name: "Анна", currency: "RUB", timezone: "Europe/Moscow", monthly_goal: null, hours_goal: null, shifts_goal: null, revision: 1 }, workplaces: [{ id: "w", name: "Бар", color: "green", timezone: "Europe/Moscow", revenue_goal: null, revision: 1, rates: null, commission: null }] };
const mount = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><CommissionPanel settings={settings} userId="owner" /></QueryClientProvider>);
  return invalidate;
};

describe("commission editor protected writes", () => {
  it("sends fixed percent as a string and refreshes owner settings after success", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    const invalidate = mount();
    fireEvent.click(screen.getByRole("button", { name: "Фиксированный" }));
    fireEvent.change(screen.getByLabelText("Процент"), { target: { value: "1.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать правило" }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(write.mock.calls[0]?.[0].data).toMatchObject({ type: "publish_commission", payload: { workplace_id: "w", fixed_percent: "1.50", thresholds: [] } });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account", "owner"] }));
  });
  it("adds zero and reported revenue thresholds without numeric conversion", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Пороги", exact: true }));
    for (const [index, from, percent] of [[0, "0", "0"], [1, "1500000", "1.5"], [2, "1950000", "2"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: "Порог", exact: true }));
      fireEvent.change(screen.getAllByLabelText("Выручка от, ₽")[index], { target: { value: from } });
      fireEvent.change(screen.getAllByLabelText("Процент")[index], { target: { value: percent } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать правило" }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    const payload = write.mock.calls[0]?.[0].data.payload;
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).toMatchObject({ fixed_percent: null, thresholds: [{ from_amount: "0", percent: "0" }, { from_amount: "1500000", percent: "1.5" }, { from_amount: "1950000", percent: "2" }] });
  });
});