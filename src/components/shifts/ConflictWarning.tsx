import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useWorkplaceMap } from "@/components/shifts/shift-ui";
import { formatHours, fmtDate } from "@/lib/format";
import { conflictTime, type ShiftConflict } from "@/lib/overlaps";

export function ConflictList({ conflicts }: { conflicts: ShiftConflict[] }) {
  const map = useWorkplaceMap();
  return <div className="divide-y rounded-xl border border-negative/40 bg-negative/5 px-3">{conflicts.map((c) => <div key={c.first.id + c.second.id} className="space-y-1 py-3 text-sm">
    {[c.first, c.second].map((s) => <p key={s.id}><span className="font-medium">{map.get(s.workplaceId)?.name ?? "Место работы не найдено"}</span><br /><span className="text-xs text-muted-foreground">{fmtDate(s.date, "dd.MM.yyyy")} · {s.start}–{s.end}</span></p>)}
    <p className="text-negative">Пересечение: {formatHours(c.minutes)}</p><p className="text-xs text-muted-foreground">{conflictTime(c.start)} — {conflictTime(c.end)}</p>
  </div>)}</div>;
}
export function ConflictWarning({ conflicts, onFix, onSave, onCancel, pending = false }: { conflicts: ShiftConflict[]; onFix: () => void; onSave: () => void; onCancel: () => void; pending?: boolean }) {
  return <Drawer open={conflicts.length > 0} onOpenChange={(o) => !o && onFix()}><DrawerContent className="max-h-[90dvh]">
    <DrawerHeader className="text-left"><DrawerTitle className="flex items-center gap-2"><AlertTriangle className="size-5 shrink-0 text-negative" />Обнаружено пересечение смен</DrawerTitle><DrawerDescription>Время совпадает с существующими сменами. Их время не будет изменено.</DrawerDescription></DrawerHeader>
    <div className="space-y-3 overflow-y-auto px-4 pb-8"><ConflictList conflicts={conflicts} /><Button type="button" className="w-full" variant="secondary" onClick={onFix}>Исправить время</Button><Button type="button" className="w-full" onClick={onSave} disabled={pending}>Всё равно сохранить</Button><Button type="button" className="w-full" variant="ghost" onClick={onCancel}>Отмена</Button></div>
  </DrawerContent></Drawer>;
}