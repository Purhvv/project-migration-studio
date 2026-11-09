import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RatesEditor } from "@/components/personal/AccountPanels";
import type { AccountWorkplace } from "@/lib/account-settings";

const write = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => write }));
vi.mock("@/lib/account.functions", () => ({ accountWrite: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const workplace: AccountWorkplace = { id: "beluga", name: "Белуга", color: "green", timezone: "Europe/Moscow", revenue_goal: null, revision: 1, rates: null, commission: null, rateVersions: [] };
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><RatesEditor workplace={workplace} userId="test-owner" /></QueryClientProvider>);

describe("personal rate editor writes", () => {
  it("submits arbitrary names and decimal money via publish_rates, never a user id", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Добавить интервал" }));
    fireEvent.change(screen.getByLabelText("Название ставки 1"), { target: { value: "Дневная" } });
    fireEvent.change(screen.getByLabelText("Оплата ставки 1"), { target: { value: "250.25" } });
    fireEvent.change(screen.getByLabelText("Дата начала ставок"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать ставки" }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    const data = write.mock.calls[0]?.[0].data;
    expect(data.type).toBe("publish_rates");
    expect(data.payload).not.toHaveProperty("user_id");
    expect(data.payload.intervals[0]).toMatchObject({ label: "Дневная", hourly: "250.25", start_time: "08:00", end_time: "17:00" });
  });
  it("does not write overlapping intervals and permits removing the conflict", () => {
    mount();
    for (let i = 1; i <= 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Добавить интервал" }));
      fireEvent.change(screen.getByLabelText(`Название ставки ${i}`), { target: { value: `Ставка ${i}` } });
      fireEvent.change(screen.getByLabelText(`Оплата ставки ${i}`), { target: { value: "250" } });
    }
    expect(screen.getByRole("button", { name: "Опубликовать ставки" })).toBeDisabled();
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить интервал 2" }));
    expect(screen.getByRole("button", { name: "Опубликовать ставки" })).toBeEnabled();
  });
});