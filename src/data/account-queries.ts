import { queryOptions } from "@tanstack/react-query";
import { getAccountProfile } from "@/lib/account.functions";

// Private account caches never share keys or queryFns with the public mock demo.
export const accountProfileOptions = (userId: string) => queryOptions({
  queryKey: ["account", userId, "profile"],
  queryFn: () => getAccountProfile(),
  retry: false,
  staleTime: 0,
});