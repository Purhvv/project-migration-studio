import { describe, expect, it } from "vitest";
import { publishRatesPayload, rateDraftError, selectRateVersions, validHourly, validateRatePublication } from "@/lib/account-rates";

const rows = [
  { label: "Дневная", hourly: "250", start: "08:00", end: "17:00" },
  { label: "Вечерняя", hourly: "300", start: "17:00", end: "00:00" },
  { label: "Ночная", hourly: "350", start: "00:00", end: "08:00" },
];
describe("personal rate publication", () => {
  it("retains arbitrary names and example amounts as decimal strings", () => {
    const payload = publishRatesPayload("w", "2026-11-10", rows, []);
    expect(payload.intervals.map((r) => [r.label, r.hourly])).toEqual([["Дневная", "250"], ["Вечерняя", "300"], ["Ночная", "350"]]);
    expect(payload.acknowledge_overlap).toBe(false);
    expect(() => validateRatePublication(payload)).not.toThrow();
  });
  it("requires a positive rate and exact server money precision", () => {
    for (const value of ["0", "0.00", "-250", "NaN", "1e3", "250.001", "100000000"]) expect(validHourly(value)).toBe(false);
    expect(validHourly("0.01")).toBe(true);
    expect(validHourly("99999999.99")).toBe(true);
  });
  it("rejects invalid start/end and equal times", () => {
    for (const start of ["24:00", "08:60", "", "17:00"]) expect(rateDraftError([{ ...rows[0], start }])).not.toBeNull();
  });
  it("rejects direct and overnight overlaps", () => {
    expect(rateDraftError([rows[0], { ...rows[1], start: "16:00" }])).not.toBeNull();
    expect(rateDraftError([{ ...rows[0], start: "22:00", end: "02:00" }, { ...rows[1], start: "01:00", end: "08:00" }])).not.toBeNull();
  });
  it("accepts touching intervals at midnight", () => { expect(rateDraftError(rows)).toBeNull(); });
  it("checks the weekly wrap and retains weekday restrictions", () => {
    const overnight = { ...rows[0], start: "23:00", end: "02:00", weekdays: [6] };
    expect(rateDraftError([overnight, { ...rows[1], start: "01:00", end: "03:00", weekdays: [0] }])).not.toBeNull();
    expect(rateDraftError([overnight, { ...rows[1], start: "01:00", end: "03:00", weekdays: [1] }])).toBeNull();
    expect(publishRatesPayload("w", "2026-11-10", [overnight], []).intervals[0].weekdays).toEqual([6]);
  });
  it("blocks overlap acknowledgment and JSON-number money at the server boundary", () => {
    const p = publishRatesPayload("w", "2026-11-10", rows, []);
    expect(() => validateRatePublication({ ...p, acknowledge_overlap: true })).toThrow();
    expect(() => validateRatePublication({ ...p, intervals: [{ ...p.intervals[0], hourly: 250 }] })).toThrow();
  });
  it("requires a name, real date and at least one interval", () => {
    expect(() => publishRatesPayload("w", "2026-02-30", rows, [])).toThrow();
    expect(() => publishRatesPayload("w", "2026-11-10", [], [])).toThrow();
    expect(() => publishRatesPayload("w", "2026-11-10", [{ ...rows[0], label: " " }], [])).toThrow();
  });
  it("does not label scheduled versions as currently active", () => {
    const v = (id: string, effective_from: string) => ({ id, effective_from, revision: 1, intervals: [] });
    const future = v("future", "2026-12-01"), active = v("active", "2026-11-01");
    expect(selectRateVersions([future, active], "2026-11-09")).toEqual({ current: active, scheduled: [future] });
    expect(selectRateVersions([future], "2026-11-09").current).toBeNull();
  });
});