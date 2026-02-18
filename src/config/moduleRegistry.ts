/**
 * Module Registry — single source of truth for all app modules and their tabs.
 *
 * To add a new module or tab:
 *   1. Add the entry here.
 *   2. The Preferences screen picks it up automatically.
 *   3. Each module view uses `useModulePreferences` to filter visible tabs.
 */

export interface ModuleTab {
  key: string;
  label: string;
  /** If true this tab is always shown and cannot be disabled */
  locked?: boolean;
}

export interface ModuleDefinition {
  key: string;
  label: string;
  tabs: ModuleTab[];
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    key: "calendar",
    label: "Calendário",
    tabs: [
      { key: "monthly", label: "Mensal", locked: true },
      { key: "today", label: "Diário" },
      { key: "3days", label: "3 Dias" },
      { key: "weekly", label: "Semanal" },
      { key: "yearly", label: "Anual" },
    ],
  },
  {
    key: "finances",
    label: "Finanças",
    tabs: [
      { key: "previsao", label: "Fluxo de Caixa", locked: true },
      { key: "indicadores", label: "Indicadores" },
      { key: "doar", label: "DOAR" },
    ],
  },
  {
    key: "investments",
    label: "Investimentos",
    tabs: [
      { key: "dashboard", label: "Dashboard", locked: true },
      { key: "stock", label: "Ações" },
      { key: "fii", label: "FIIs" },
      { key: "crypto", label: "Criptoativos" },
      { key: "etf", label: "ETFs" },
      { key: "fixed_income", label: "Renda Fixa" },
      { key: "other", label: "Outros" },
    ],
  },
  {
    key: "programs",
    label: "Projetos",
    tabs: [
      { key: "projects", label: "Projetos", locked: true },
      { key: "dashboard", label: "Dashboard" },
      { key: "programs", label: "Programas" },
      { key: "tasks", label: "Tarefas" },
    ],
  },
  {
    key: "patrimonio",
    label: "Patrimônio",
    tabs: [
      { key: "saldo", label: "Saldo Geral", locked: true },
    ],
  },
  {
    key: "dashboard",
    label: "Dashboard Global",
    tabs: [
      { key: "overview", label: "Visão Geral", locked: true },
    ],
  },
];

/** Helper: get a module definition by key */
export function getModuleDef(moduleKey: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.key === moduleKey);
}

/** Helper: get default enabled tabs (all) for a module */
export function getDefaultTabs(moduleKey: string): string[] {
  const mod = getModuleDef(moduleKey);
  return mod ? mod.tabs.map((t) => t.key) : [];
}

/** Build the full default preferences object */
export function buildDefaultPreferences(): Record<string, { abas: string[] }> {
  const prefs: Record<string, { abas: string[] }> = {};
  MODULE_REGISTRY.forEach((m) => {
    prefs[m.key] = { abas: m.tabs.map((t) => t.key) };
  });
  return prefs;
}
