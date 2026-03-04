import { useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Auto-save hook with debounce. Calls saveFn when state changes.
 * Shows a discrete toast on save. Skips the initial render.
 *
 * Usage:
 *   useAutoSave(myState, async (s) => { await supabase... }, 1000);
 */
export function useAutoSave<T>(
  state: T,
  saveFn: (state: T) => Promise<void>,
  debounceMs = 1000
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirst = useRef(true);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await saveFnRef.current(state);
        toast({ title: "Alterações salvas!" });
      } catch {
        toast({ title: "Erro ao salvar", variant: "destructive" });
      }
    }, debounceMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, debounceMs]);
}
