import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Auto-save hook with debounce. Calls saveFn when state changes (deep comparison).
 * Shows a discrete toast on save. Skips the initial render.
 */
export function useAutoSave<T>(
  state: T,
  saveFn: (state: T) => Promise<void>,
  debounceMs = 1000
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirst = useRef(true);
  const saveFnRef = useRef(saveFn);
  const prevJson = useRef<string>("");
  saveFnRef.current = saveFn;

  const stateJson = JSON.stringify(state);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      prevJson.current = stateJson;
      return;
    }

    // Skip if value hasn't actually changed
    if (stateJson === prevJson.current) return;
    prevJson.current = stateJson;

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
  }, [stateJson, debounceMs]);
}
