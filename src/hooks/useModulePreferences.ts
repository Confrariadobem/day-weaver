import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MODULE_REGISTRY, buildDefaultPreferences, getModuleDef } from "@/config/moduleRegistry";

type ModulePrefs = Record<string, { abas: string[] }>;

/**
 * Single hook for reading / writing module-tab preferences.
 *
 * Usage in a module view:
 *   const { visibleTabs } = useModulePreferences("investments");
 *   // visibleTabs = ["dashboard","stock","fii",...]
 *
 * Usage in Preferences screen:
 *   const { prefs, setTabEnabled, saving } = useModulePreferences();
 */
export function useModulePreferences(moduleKey?: string) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ModulePrefs>(buildDefaultPreferences());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch once
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("module_preferences")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const raw = (data as any)?.module_preferences;
        if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
          // Merge with defaults so new modules/tabs are included
          const defaults = buildDefaultPreferences();
          const merged: ModulePrefs = {};
          for (const mod of MODULE_REGISTRY) {
            merged[mod.key] = {
              abas: raw[mod.key]?.abas ?? defaults[mod.key].abas,
            };
          }
          setPrefs(merged);
        }
        setLoaded(true);
      });
  }, [user]);

  // Persist to backend
  const persist = useCallback(
    async (next: ModulePrefs) => {
      if (!user) return;
      setSaving(true);
      await supabase
        .from("profiles")
        .update({ module_preferences: next } as any)
        .eq("user_id", user.id);
      setSaving(false);
      window.dispatchEvent(new Event("lovable:data-changed"));
    },
    [user]
  );

  /** Toggle a single tab on/off for a module */
  const setTabEnabled = useCallback(
    (modKey: string, tabKey: string, enabled: boolean) => {
      setPrefs((prev) => {
        const mod = getModuleDef(modKey);
        if (!mod) return prev;
        const lockedKeys = mod.tabs.filter((t) => t.locked).map((t) => t.key);
        let current = prev[modKey]?.abas ?? mod.tabs.map((t) => t.key);
        if (enabled) {
          if (!current.includes(tabKey)) current = [...current, tabKey];
        } else {
          // Cannot disable locked tabs
          if (lockedKeys.includes(tabKey)) return prev;
          current = current.filter((k) => k !== tabKey);
        }
        const next = { ...prev, [modKey]: { abas: current } };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  /** Bulk-set all tabs for a module */
  const setModuleTabs = useCallback(
    (modKey: string, abas: string[]) => {
      setPrefs((prev) => {
        const next = { ...prev, [modKey]: { abas } };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // Visible tabs for a specific module (filtered, ordered)
  const visibleTabs = useMemo(() => {
    if (!moduleKey) return [];
    const mod = getModuleDef(moduleKey);
    if (!mod) return [];
    const enabled = prefs[moduleKey]?.abas ?? mod.tabs.map((t) => t.key);
    // Preserve order from registry
    return mod.tabs.filter((t) => enabled.includes(t.key)).map((t) => t.key);
  }, [moduleKey, prefs]);

  /** Check if a specific module has at least one active tab (for global dashboard) */
  const isModuleActive = useCallback(
    (modKey: string) => {
      const mod = getModuleDef(modKey);
      if (!mod) return false;
      const abas = prefs[modKey]?.abas ?? mod.tabs.map((t) => t.key);
      return abas.length > 0;
    },
    [prefs]
  );

  /** Check if a specific tab is enabled in a module */
  const isTabEnabled = useCallback(
    (modKey: string, tabKey: string) => {
      const mod = getModuleDef(modKey);
      if (!mod) return false;
      const abas = prefs[modKey]?.abas ?? mod.tabs.map((t) => t.key);
      return abas.includes(tabKey);
    },
    [prefs]
  );

  return {
    prefs,
    loaded,
    saving,
    visibleTabs,
    setTabEnabled,
    setModuleTabs,
    isModuleActive,
    isTabEnabled,
  };
}
