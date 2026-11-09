import { queryOptions } from "@tanstack/react-query";
import { getAccountProfile, getAccountSettings, getAccountShifts } from "@/lib/account.functions";

// Private account caches never share keys or queryFns with the public mock demo.
export const accountProfileOptions = (userId: string) => queryOptions({
  queryKey: ["account", userId, "profile"],
  queryFn: () => getAccountProfile(),
  retry: false,
  staleTime: 0,
});

export const accountSettingsOptions = (userId: string) => queryOptions({
  queryKey: ["account", userId, "settings"],
  queryFn: () => getAccountSettings(),
  retry: false,
  staleTime: 0,
});

export const accountShiftsOptions = (userId: string) => queryOptions({
  queryKey: ["account", userId, "shifts"],
  queryFn: () => getAccountShifts(),
  retry: false,
  staleTime: 0,
});
