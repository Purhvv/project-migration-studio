/**
 * Data access layer. Screens only use these query options / hooks.
 * To connect Supabase, replace the queryFn / mutationFn bodies — no screen changes required.
 */
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db, dbShifts } from "./mock";
import type { Shift, UserProfile, Workplace } from "@/lib/types";

const delay = <T,>(v: T, ms = 350) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

export const shiftsQuery = queryOptions({
  queryKey: ["shifts"],
  queryFn: (): Promise<Shift[]> => delay(dbShifts()),
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
export const useWorkplaces = () => useQuery(workplacesQuery);
export const useProfile = () => useQuery(profileQuery);

function useWrite<T>(key: string[], fn: (input: T) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => fn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export const useSaveShift = () =>
  useWrite<Shift>(["shifts"], (s) => {
    const list = dbShifts();
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = s;
    else list.push(s);
  });

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
