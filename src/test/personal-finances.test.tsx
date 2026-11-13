import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShiftFinanceEditor } from "@/components/personal/ShiftFinanceEditor";
import type { ShiftFinances } from "@/lib/account-finances";

const write = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => write }));
vi.mock("@/lib/account.functions", () => ({ accountWrite: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const finances: ShiftFinances = {
  shift: { id: "22222222-2222-2222-2222-222222222222", workplace_id: "11111111-1111-1111-1111-111111111111", local_start_date: "2026-11-12", local_end_date: "2026-11-12", start_time: "10:00", end_time: "17:00", starts_at: "2026-11-12T07:00:00Z", ends_at: "2026-11-12T14:00:00Z", status: "completed", revenue: 12000, tips: 500, base_pay: 2100, fixed_pay: 0, commission_pay: 180, commission_source: "monthly", earnings: 3380, comment: null, revision: 7, revenue_revision: 3 },
  adjustments: [{ id: "a", kind: "bonus", label: "Продажи", amount: 600, comment: "Сохранить комментарий", sort_order: 0 }], fixedPayments: [], events: [], commission: { state: "final", calculation_available: true, applied_percent: 1.5, missing_revenue_count: 0 },
};
function mount(data = finances) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const saved = vi.fn();
  render(<QueryClientProvider client={client}><ShiftFinanceEditor finances={data} userId="owner" onSaved={saved} onCancel={vi.fn()} /></QueryClientProvider>);
  return { saved, invalidate: vi.spyOn(client, "invalidateQueries") };
}
describe("financial form (mocked write, not hosted saving)", () => {
  it("completes an active shift atomically with optional NULL finances", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    const { saved, invalidate } = mount({ ...finances, shift: { ...finances.shift, status: "in_progress", revenue: null, tips: null }, adjustments: [] });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить завершение" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(write.mock.calls[0]?.[0].data).toMatchObject({ type: "shift_complete", payload: { revenue: null, tips: null, adjustments: [], expected_revision: 7, expected_revenue_revision: 3 } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account", "owner"] });
  });
  it("edits money, adds several adjustments and deletes an existing one", async () => {
    write.mockResolvedValue({ ok: true, saved: true });
    mount();
    fireEvent.change(screen.getByLabelText("Выручка"), { target: { value: "18000.25" } });
    fireEvent.change(screen.getByLabelText("Личные чаевые"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Удалить корректировку 1"));
    fireEvent.click(screen.getByRole("button", { name: "Добавить премию" }));
    fireEvent.change(screen.getByLabelText("Премии: название 1"), { target: { value: "Выходной" } });
    fireEvent.change(screen.getByLabelText("Премии: сумма 1"), { target: { value: "500.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить штраф" }));
    fireEvent.change(screen.getByLabelText("Штрафы: название 2"), { target: { value: "Опоздание" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить финансы" }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    const { type, payload } = write.mock.calls[0]?.[0].data;
    expect(type).toBe("shift_edit");
    expect(payload).toMatchObject({ revenue: "18000.25", tips: null, adjustments: [{ kind: "bonus", label: "Выходной", amount: "500.25" }, { kind: "penalty", label: "Опоздание", amount: null }] });
    expect(payload).not.toHaveProperty("fixed_payments");
  });
  it("retains values and the idempotency key after a failed request", async () => {
    write.mockRejectedValueOnce(new Error("Не удалось сохранить")).mockResolvedValueOnce({ ok: true, saved: true });
    const { saved } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить финансы" }));
    await screen.findByRole("alert");
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить финансы" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(write.mock.calls[0]?.[0].data.key).toBe(write.mock.calls[1]?.[0].data.key);
    expect(write.mock.calls[1]?.[0].data.payload.adjustments[0].comment).toBe("Сохранить комментарий");
  });
});