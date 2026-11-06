import { useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cleanNumberInput, formatNumberInput } from "@/lib/format";

/** Parent keeps an ungrouped decimal string; grouping exists only in the input. */
export function NumberInput({ value, onValueChange, onKeyDown, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & { value: string; onValueChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  const applyValue = (input: HTMLInputElement, raw: string, pos: number) => {
    const logical = cleanNumberInput(raw.slice(0, pos)).length;
    const canonical = cleanNumberInput(raw);
    const formatted = formatNumberInput(canonical);
    let index = 0, count = 0;
    while (index < formatted.length && count < logical) {
      if (!/\s/.test(formatted[index] ?? "")) count++;
      index++;
    }
    caret.current = index;
    // Set immediately too: grouping-only edits may not change the parent's value.
    input.value = formatted;
    input.setSelectionRange(index, index);
    onValueChange(canonical);
  };
  return <Input {...props} ref={ref} type="text" inputMode="decimal" value={formatNumberInput(value)} onChange={(e) => applyValue(e.target, e.target.value, e.target.selectionStart ?? e.target.value.length)} onKeyDown={(e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const input = e.currentTarget;
    const pos = input.selectionStart;
    if (pos === null || input.selectionEnd !== pos) return;
    const raw = input.value;
    if (e.key === "Backspace" && pos > 1 && /\s/.test(raw[pos - 1] ?? "")) {
      e.preventDefault();
      applyValue(input, raw.slice(0, pos - 2) + raw.slice(pos), pos - 2);
    } else if (e.key === "Delete" && /\s/.test(raw[pos] ?? "")) {
      e.preventDefault();
      applyValue(input, raw.slice(0, pos) + raw.slice(pos + 2), pos);
    }
  }} />;
}