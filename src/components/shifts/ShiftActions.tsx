import { Link, useRouter } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogHeader, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTrashShift } from "@/data/queries";
import type { Shift } from "@/lib/types";

export function ConfirmAction({ open, onClose, title, description, action, onConfirm, pending }: {
  open: boolean; onClose: () => void; title: string; description: string; action: string; onConfirm: () => void; pending?: boolean;
}) {
  return <AlertDialog open={open} onOpenChange={(o) => !o && !pending && onClose()}><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md rounded-lg">
    <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter className="gap-2"><Button variant="secondary" disabled={pending} onClick={onClose}>Отмена</Button><Button variant="destructive" disabled={pending} onClick={onConfirm}>{action}</Button></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
export function ShiftActions({ shift, detailed = false }: { shift: Shift; detailed?: boolean }) {
  const [deleting, setDeleting] = useState(false); const trash = useTrashShift(); const router = useRouter();
  return <>
    {detailed ? <div className="flex flex-wrap gap-2">
      <Button asChild variant="secondary" className="flex-1"><Link to="/shifts/$id/edit" params={{ id: shift.id }}><Pencil />Редактировать</Link></Button>
      <Button variant="ghost" className="text-negative" onClick={() => setDeleting(true)}><Trash2 />Удалить смену</Button>
    </div> : <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Действия смены" title="Действия смены"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to="/shifts/$id/edit" params={{ id: shift.id }}><Pencil />Редактировать</Link></DropdownMenuItem><DropdownMenuItem className="text-negative" onSelect={() => setDeleting(true)}><Trash2 />Удалить смену</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>}
    <ConfirmAction open={deleting} onClose={() => setDeleting(false)} title="Удалить смену?" description="Смена будет перемещена в корзину. Ты сможешь восстановить её в течение 30 дней" action="Удалить" pending={trash.isPending} onConfirm={() => trash.mutate(shift.id, {
      onSuccess: () => { setDeleting(false); toast("Смена перемещена в корзину"); if (detailed) router.navigate({ to: "/calendar" }); },
      onError: () => toast("Не удалось удалить смену"),
    })} />
  </>;
}