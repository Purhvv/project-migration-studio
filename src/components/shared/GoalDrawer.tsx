import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { NumberInput } from "@/components/shared/NumberInput";
import { parseNumberInput } from "@/lib/format";
import { useUpdateProfile, useUpdateRevenueGoal } from "@/data/queries";

export type GoalField = "revenueGoal" | "monthlyGoal" | "hoursGoal" | "shiftsGoal";
export function GoalDrawer({ open, onClose, field, title, value, workplaceId }: { open: boolean; onClose: () => void; field: GoalField; title: string; value: number | null; workplaceId?: string | undefined }) {
  const update = useUpdateProfile();
  const updateRevenue = useUpdateRevenueGoal();
  const [v, setV] = useState("");
  useEffect(() => { if (open) setV(value ? String(value) : ""); }, [open, value]);
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <form
          className="space-y-3 px-4 pb-8"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseNumberInput(v);
            if (v.trim() && (n === null || n <= 0 || (field === "shiftsGoal" && !Number.isInteger(n)))) return;
            if (field === "revenueGoal") {
              if (!workplaceId) return;
              updateRevenue.mutate({ workplaceId, value: n }, { onSuccess: onClose });
            } else update.mutate({ [field]: n }, { onSuccess: onClose });
          }}
        >
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{field === "hoursGoal" ? "Часы на месяц — ориентир, не повод для переработок." : field === "shiftsGoal" ? "Количество смен на месяц." : "Сумма на месяц."} Оставьте пустым, чтобы убрать цель.</DrawerDescription>
          </DrawerHeader>
          <NumberInput autoFocus placeholder={field === "hoursGoal" ? "Часы" : field === "shiftsGoal" ? "Смены" : "₽"} value={v} onValueChange={setV} aria-label={title} />
          <Button type="submit" className="w-full" size="lg">Сохранить</Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
