/**
 * Data access layer. Screens only use these query options / hooks.
 * To connect Supabase, replace the queryFn / mutationFn bodies — no screen changes required.
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db, dbShifts } from "./mock";
import type { Shift, UserProfile, Workplace } from "@/lib/types";
import { activeShifts, trashedShifts, moveToTrash, restoreShift, purgeShift, clearTrash } from "@/lib/shift-management";

const delay = <T,>(v: T, ms = 350) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

export const shiftsQuery = queryOptions({
  queryKey: ["shifts"],
  queryFn: (): Promise<Shift[]> => delay(activeShifts(dbShifts())),
  staleTime: 60_000,
});

export const workplacesQuery = queryOptions({
  queryKey: ["workplaces"],
  queryFn: (): Promise<Workplace[]> => delay(db.workplaces, 200),
  staleTime: 60_000,
});

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: (): Promise<UserProfile> => delay(db.profile, 150),
  staleTime: 60_000,
});

export const useShifts = () => useQuery(shiftsQuery);
export const trashQuery = queryOptions({ queryKey: ["trash"], queryFn: (): Promise<Shift[]> => delay(trashedShifts(dbShifts())), staleTime: 60_000 });
export const useTrash = () => useQuery(trashQuery);
export const useWorkplaces = () => useQuery(workplacesQuery);
export const useProfile = () => useQuery(profileQuery);

function useWrite<T>(key: string[], fn: (input: T) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => fn(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      if (key[0] === "shifts") await qc.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export const useSaveShift = () =>
  useWrite<Shift>(["shifts"], (s) => {
    const list = dbShifts();
    const i = list.findIndex((x) => x.id === s.id);
    if (list[i]?.deletedAt || s.deletedAt) throw new Error("Сначала восстановите смену из корзины");
    if (i >= 0) list[i] = s;
    else list.push(s);
  });

export const useTrashShift = () => useWrite<string>(["shifts"], (id) => moveToTrash(dbShifts(), id));
export const useRestoreShift = () => useWrite<Shift>(["shifts"], (s) => {
  const list = dbShifts(); const original = list.find((item) => item.id === s.id);
  if (!original?.deletedAt) return;
  restoreShift(list, s.id);
  const { deletedAt: _deletedAt, ...restored } = s;
  Object.assign(original, restored);
});
export const usePurgeShift = () => useWrite<string>(["shifts"], (id) => purgeShift(dbShifts(), id));
export const useClearTrash = () => useWrite<void>(["shifts"], () => clearTrash(dbShifts()));

export const useSaveWorkplace = () =>
  useWrite<Workplace>(["workplaces"], (w) => {
    const i = db.workplaces.findIndex((x) => x.id === w.id);
    if (i >= 0) db.workplaces[i] = w;
    else db.workplaces.push(w);
  });

export const useUpdateProfile = () =>
  useWrite<Partial<UserProfile>>(["profile"], (p) => {
    db.profile = { ...db.profile, ...p };
  });

export const useUpdateRevenueGoal = () =>
  useWrite<{ workplaceId: string; value: number | null }>(["workplaces"], ({ workplaceId, value }) => {
    const workplace = db.workplaces.find((w) => w.id === workplaceId);
    if (!workplace) throw new Error("Место работы не найдено");
    if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new Error("Укажите положительную цель");
    workplace.revenueGoal = value;
  });
