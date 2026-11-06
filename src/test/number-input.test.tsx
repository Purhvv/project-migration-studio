import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NumberInput } from "@/components/shared/NumberInput";
import { cleanNumberInput, formatNumberInput, parseNumberInput } from "@/lib/format";

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