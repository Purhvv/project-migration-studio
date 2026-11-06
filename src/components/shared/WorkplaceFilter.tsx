import { useWorkplaces } from "@/data/queries";
import { Chips } from "./primitives";

export function WorkplaceFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useWorkplaces();
  if (!data || data.length < 2) return null;
  return (
    <Chips
      value={value}
      onChange={onChange}
      options={[{ value: "all", label: "Все места" }, ...data.map((w) => ({ value: w.id, label: w.name }))]}
    />
  );
}
