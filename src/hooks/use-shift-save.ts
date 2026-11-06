import { useState } from "react";
import { useSaveShift, useShifts } from "@/data/queries";
import { findShiftConflicts } from "@/lib/overlaps";
import type { Shift } from "@/lib/types";

/** All interactive shift writes pass this gate; override is explicit. */
export function useShiftSaveGuard(onCancel: () => void) {
  const save = useSaveShift();
  const shifts = useShifts();
  const [request, setRequest] = useState<{ shift: Shift; onSuccess: () => void } | null>(null);
  const conflicts = request ? findShiftConflicts(request.shift, shifts.data ?? []) : [];
  const persist = (shift: Shift, onSuccess: () => void) => save.mutate(shift, {
    onSuccess: () => { setRequest(null); onSuccess(); },
  });
  return {
    saveShift: (shift: Shift, onSuccess: () => void) => {
      if (!shifts.data || shifts.isError || save.isPending) return;
      if (findShiftConflicts(shift, shifts.data).length) setRequest({ shift, onSuccess });
      else persist(shift, onSuccess);
    },
    ready: !!shifts.data && !shifts.isError,
    warning: {
      conflicts,
      pending: save.isPending,
      onFix: () => setRequest(null),
      onSave: () => { if (request && !save.isPending) persist(request.shift, request.onSuccess); },
      onCancel: () => { setRequest(null); onCancel(); },
    },
  };
}