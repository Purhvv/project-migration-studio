import { useWorkplaces } from "@/data/queries";
import { WorkplaceChips } from "./WorkplaceChips";

export function WorkplaceFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useWorkplaces();
  return <WorkplaceChips workplaces={data ?? []} value={value} onChange={onChange} />;
}
