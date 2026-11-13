import { Button } from "@/components/ui/button";

/** Data-independent workplace filter shared by demo and personal screens. */
export function WorkplaceChips({ workplaces, value, onChange }: { workplaces: Array<{ id: string; name: string }>; value: string; onChange: (value: string) => void }) {
  if (workplaces.length < 2) return null;
  return <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Место работы">
    {[{ id: "all", name: "Все места" }, ...workplaces].map((w) => <Button key={w.id} size="sm" variant="ghost" aria-pressed={value === w.id} onClick={() => onChange(w.id)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${value === w.id ? "border-transparent bg-foreground text-background hover:bg-foreground hover:text-background" : "text-muted-foreground"}`}>{w.name}</Button>)}
  </div>;
}