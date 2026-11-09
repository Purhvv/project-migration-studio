import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { isPersonalPath } from "@/lib/auth";
import { BarChart3, CalendarDays, Camera, Home, PenLine, Plus, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Главная", icon: Home },
  { to: "/calendar", label: "Календарь", icon: CalendarDays },
  null,
  { to: "/stats", label: "Статистика", icon: BarChart3 },
  { to: "/profile", label: "Профиль", icon: User },
] as const;
const personalItems = [
  { to: "/app", label: "Главная", icon: Home },
  { to: "/app/calendar", label: "Календарь", icon: CalendarDays },
  null,
  { to: "/app/stats", label: "Статистика", icon: BarChart3 },
  { to: "/account", label: "Профиль", icon: User },
] as const;

export function BottomNav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const personal = isPersonalPath(pathname);
  const list = personal ? personalItems : items;
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl pb-safe">
        <ul className="mx-auto grid max-w-lg grid-cols-5 items-center px-2 pt-2">
          {list.map((it) =>
            it === null ? (
              <li key="add" className="flex justify-center">
                <button
                  onClick={() => (personal ? toast("Добавление смен в личном пространстве появится на следующем этапе") : setOpen(true))}
                  aria-label="Добавить"
                  className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab transition-transform active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.5} />
                </button>
              </li>
            ) : (
              <li key={it.to}>
                <Link
                  to={it.to}
                  activeOptions={{ exact: it.to === "/" || it.to === "/app" }}
                  className="group flex flex-col items-center gap-1 py-1 text-muted-foreground"
                  activeProps={{ className: "text-foreground" }}
                >
                  {({ isActive }) => (
                    <>
                      <it.icon className={cn("size-5", isActive && "text-primary")} />
                      <span className="text-[11px] font-medium">{it.label}</span>
                    </>
                  )}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
      <AddMenu open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AddMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const soon = () => toast("Функция появится на следующем этапе");
  const options = [
    { icon: PenLine, title: "Добавить смену вручную", text: "Заполните время и показатели", onClick: () => { onOpenChange(false); navigate({ to: "/shifts/new" }); } },
    { icon: Sparkles, title: "Добавить смену с помощью AI", text: "Опишите смену своими словами", onClick: soon, soon: true },
    { icon: Camera, title: "Загрузить фото графика", text: "Распознаем смены с фотографии", onClick: soon, soon: true },
  ];
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Новая смена</DrawerTitle>
          <DrawerDescription>Выберите способ добавления</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 px-4 pb-8">
          {options.map((o) => (
            <button key={o.title} onClick={o.onClick} className="flex w-full items-center gap-4 rounded-2xl bg-secondary p-4 text-left active:opacity-80">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <o.icon className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{o.title}</span>
                <span className="block text-sm text-muted-foreground">{o.text}</span>
              </span>
              {o.soon && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Скоро</span>}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
