import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NumberInput } from "@/components/shared/NumberInput";
import { cleanNumberInput, formatMoney, formatNumber, formatNumberInput, parseNumberInput } from "@/lib/format";

afterEach(cleanup);
function Harness() {
  const [value, setValue] = useState("");
  return <NumberInput aria-label="Amount" value={value} onValueChange={setValue} />;
}
describe("numeric input", () => {
  it("groups with U+202F without changing monetary values", () => {
    expect(formatNumberInput("1234567.89")).toBe("1\u202f234\u202f567,89");
    expect(parseNumberInput("1\u202f234\u202f567,89")).toBe(1234567.89);
  });
  it("keeps empty unknown and rejects unsafe magnitudes", () => {
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("9007199254740992")).toBeNull();
    expect(cleanNumberInput("12 345,60 ₽")).toBe("12345.60");
  });
  it("renders non-finite money as unknown rather than a financial value", () => {
    expect(formatMoney(NaN)).toBe("—");
    expect(formatMoney(Infinity)).toBe("—");
  });
  it("groups the requested large integer examples with narrow nonbreaking spaces", () => {
    expect(formatNumber(12500)).toBe("12\u202f500");
    expect(formatNumber(178000345)).toBe("178\u202f000\u202f345");
    expect(formatNumber(2000)).toBe("2\u202f000");
    expect(formatNumber(950)).toBe("950");
  });
  it("deletes digits next to grouping boundaries without jumping to the end", () => {
    render(<Harness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Amount" });
    fireEvent.change(input, { target: { value: "12345", selectionStart: 5 } });
    input.setSelectionRange(3, 3);
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(input.value).toBe("1\u202f345");
    expect(input.selectionStart).toBe(1);
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(input.value).toBe("145");
    expect(input.selectionStart).toBe(1);
  });
  it("preserves logical caret when inserting in the middle", () => {
    render(<Harness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Amount" });
    fireEvent.change(input, { target: { value: "123456", selectionStart: 6 } });
    fireEvent.change(input, { target: { value: "1293\u202f456", selectionStart: 3 } });
    expect(input.value).toBe("1\u202f293\u202f456");
    expect(input.selectionStart).toBe(4);
  });
  it("handles pasted decimal money and deleting all digits", () => {
    render(<Harness />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Amount" });
    fireEvent.change(input, { target: { value: "12 345,60 ₽", selectionStart: 11 } });
    expect(input.value).toBe("12\u202f345,60");
    fireEvent.change(input, { target: { value: "", selectionStart: 0 } });
    expect(input.value).toBe("");
    expect(input.selectionStart).toBe(0);
  });
});