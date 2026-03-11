import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useCurrencyFormatter } from "@/hooks/useCurrencyFormatter";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDateFormat, type DateFormatType } from "@/contexts/DateFormatContext";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { ConfigDialog } from "@/components/shared/ConfigDialog";

import { ColorPaletteGrid } from "@/components/shared/ColorPaletteGrid";
import {
  Save, Globe, CalendarDays, Tag, Trash2, Database, TrendingUp, Plus, DollarSign,
  FolderKanban, Eye, Sparkles, Sunset, Flower2, Waves, ChevronDown, Users, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_TYPE_ICONS, DATA_MODULE_ICONS, CATEGORY_ICON_MAP, CATEGORY_ICON_KEYS, INVESTMENT_TYPE_ICONS } from "@/lib/icons";
import { MODULE_REGISTRY, getModuleDef } from "@/config/moduleRegistry";
import { useModulePreferences } from "@/hooks/useModulePreferences";
import TeamsSection from "@/components/preferences/TeamsSection";

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: React.ReactNode; gradient: string }[] = [
  { key: "soul", label: "Soul", icon: <Sparkles className="h-5 w-5" />, gradient: "from-amber-100 to-amber-200" },
  { key: "dark", label: "Dark", icon: <Sunset className="h-5 w-5" />, gradient: "from-gray-600 to-gray-800" },
  { key: "zen", label: "Zen", icon: <Flower2 className="h-5 w-5" />, gradient: "from-emerald-300 to-emerald-400" },
  { key: "ocean", label: "Ocean", icon: <Waves className="h-5 w-5" />, gradient: "from-sky-300 to-sky-400" },
];

const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

const CURRENCIES = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "BTC", label: "Bitcoin (₿)" },
];

const DECIMAL_OPTIONS = [
  { value: "0", label: "0 casas" },
  { value: "2", label: "2 casas" },
  { value: "3", label: "3 casas" },
  { value: "4", label: "4 casas" },
  { value: "8", label: "8 casas" },
];

const DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD / MM / YYYY" },
  { value: "YYYY/MM/DD", label: "YYYY / MM / DD" },
];

const WEEK_STARTS = [
  { value: "sunday", label: "Domingo" },
  { value: "monday", label: "Segunda-feira" },
];

const TIME_FORMATS = [
  { value: "24h", label: "24 horas (14:00)" },
  { value: "12h", label: "12 horas (2:00 PM)" },
];

const DEFAULT_VIEWS = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly", label: "Semanal" },
  { value: "today", label: "Diário" },
  { value: "3days", label: "3 Dias" },
];

const SLOT_DURATIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "120", label: "2 horas" },
];

const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#fbbf24", "#84cc16", "#10b981", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#d946ef", "#ec4899", "#6b7280",
];

const CALENDAR_PALETTE: Record<string, string> = {
  birthdays: "#ec4899", events: "#3b82f6", holidays: "#6b7280",
  cashflow: "#22c55e", investments: "#d4a017", projects: "#eab308", tasks: "#f97316",
};

const SECTION_COLORS: Record<string, string> = {
  calendar: CALENDAR_PALETTE.events, categories: CALENDAR_PALETTE.cashflow,
  investments: CALENDAR_PALETTE.investments, finances: CALENDAR_PALETTE.cashflow,
  projects: CALENDAR_PALETTE.projects, data: "#ef4444", general: CALENDAR_PALETTE.events,
};

const DATA_MODULES = [
  { key: "calendar_events", label: "Calendário (Eventos)", desc: "Eventos, compromissos e lembretes" },
  { key: "categories", label: "Categorias", desc: "Categorias de receitas, despesas e projetos" },
  { key: "financial_accounts", label: "Carteira", desc: "Contas bancárias, cartões e carteiras digitais" },
  { key: "financial_entries", label: "Fluxo de Caixa", desc: "Lançamentos financeiros" },
  { key: "investments", label: "Investimentos", desc: "Ativos de renda fixa, variável e criptoativos" },
  { key: "project_phases", label: "Etapas de Projetos", desc: "Fases e marcos" },
  { key: "project_resources", label: "Recursos de Projetos", desc: "Pessoas e recursos alocados" },
  { key: "projects", label: "Projetos", desc: "Projetos pessoais e profissionais" },
  { key: "tasks", label: "Tarefas", desc: "Tarefas avulsas e vinculadas" },
].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

const LAUNCH_TYPES = [
  { label: "Aniversário", color: CALENDAR_PALETTE.birthdays, desc: "Recorrência anual" },
  { label: "Evento", color: CALENDAR_PALETTE.events, desc: "Compromissos gerais" },
  { label: "Fluxo de Caixa", color: CALENDAR_PALETTE.cashflow, desc: "Contas a pagar/receber" },
  { label: "Investimento", color: CALENDAR_PALETTE.investments, desc: "Aportes e resgates" },
  { label: "Projetos", color: CALENDAR_PALETTE.projects, desc: "Marcos e entregas" },
  { label: "Feriado", color: CALENDAR_PALETTE.holidays, desc: "Feriados nacionais (automático)" },
];

const INVESTMENT_TYPES = [
  { label: "Ações", color: "#3b82f6", desc: "Ações listadas em bolsa", key: "stock" },
  { label: "FIIs", color: "#22c55e", desc: "Fundos Imobiliários", key: "fii" },
  { label: "Criptoativos", color: "#f59e0b", desc: "Bitcoin, Ethereum e outros", key: "crypto" },
  { label: "ETFs", color: "#06b6d4", desc: "Exchange Traded Funds", key: "etf" },
  { label: "Renda Fixa", color: "#8b5cf6", desc: "CDB, Tesouro, LCI, LCA", key: "fixed_income" },
  { label: "Outros", color: "#6b7280", desc: "Outros tipos", key: "other" },
];

const CALENDAR_VIEWS = [
  { key: "monthly", label: "Mensal", desc: "Visualização mensal", locked: true },
  { key: "today", label: "Diário", desc: "Visualização do dia" },
  { key: "3days", label: "3 Dias", desc: "Visualização de três dias" },
  { key: "weekly", label: "Semanal", desc: "Visualização semanal" },
  { key: "yearly", label: "Anual", desc: "Visualização anual" },
];

const FINANCE_TABS = [
  { key: "previsao", label: "Fluxo de Caixa", desc: "Previsão de receitas/despesas", locked: true },
  { key: "indicadores", label: "Indicadores", desc: "Gráficos financeiros" },
  { key: "doar", label: "DOAR", desc: "Demonstração de Origens" },
];

const PROJECT_TABS = [
  { key: "projects", label: "Projetos", desc: "Lista de projetos", locked: true },
  { key: "dashboard", label: "Dashboard", desc: "Visão geral e métricas" },
  { key: "programs", label: "Programas", desc: "Agrupamento de projetos" },
  { key: "tasks", label: "Tarefas", desc: "Tarefas avulsas e vinculadas" },
];

const CC_COLORS = ["#ef4444", "#f97316", "#fbbf24", "#84cc16", "#10b981", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#d946ef", "#ec4899", "#6b7280"];

// ─── Searchable section keys ────────────────────────────────────────────────


// ─── ToggleRow ──────────────────────────────────────────────────────────────

function ToggleRow({
  icon, iconColor, colorDot, label, desc, enabled, locked, onToggle, onDoubleClick,
}: {
  icon?: React.ReactNode; iconColor?: string; colorDot?: string;
  label: string; desc?: string; enabled?: boolean; locked?: boolean;
  onToggle?: (checked: boolean) => void; onDoubleClick?: () => void;
}) {
  const row = (
    <div
      onDoubleClick={onDoubleClick}
      className="flex items-center gap-3 rounded-lg border border-border/40 p-2.5 hover:bg-muted/30 transition-colors duration-200 cursor-pointer select-none"
    >
      {icon && <span className="shrink-0" style={{ color: iconColor }}>{icon}</span>}
      {colorDot && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorDot }} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
      </div>
      {locked && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground/50 cursor-default">🔒</span>
            </TooltipTrigger>
            <TooltipContent side="left"><p className="text-xs">Obrigatória</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {onToggle !== undefined && (
        <Switch
          checked={enabled}
          disabled={locked}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className={cn(locked && "opacity-40")}
        />
      )}
    </div>
  );
  return row;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PreferencesView() {
  const { user } = useAuth();
  const { theme, setTheme: setAppTheme } = useTheme();
  const { toast } = useToast();
  const { format: formatCurrency } = useCurrencyFormatter();
  const { setCurrency: setGlobalCurrency } = useCurrency();
  const { dateFormat, setDateFormat: setGlobalDateFormat } = useDateFormat();
  const { prefs, setTabEnabled, saving: moduleSaving } = useModulePreferences();

  // General prefs state
  const [language, setLanguage] = useState("pt-BR");
  const [currency, setCurrency] = useState("BRL");
  const [decimalPlaces, setDecimalPlaces] = useState("2");

  // Calendar prefs
  const [weekStart, setWeekStart] = useState("sunday");
  const [timeFormat, setTimeFormat] = useState("24h");
  const [defaultView, setDefaultView] = useState("monthly");
  const [slotDuration, setSlotDuration] = useState("60");
  const [showWeekNumbers, setShowWeekNumbers] = useState(true);
  const [showFinancials, setShowFinancials] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showHolidays, setShowHolidays] = useState(false);

  // Categories
  const [categories, setCategories] = useState<any[]>([]);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);
  const [catIcon, setCatIcon] = useState("briefcase");
  const [catIsRevenue, setCatIsRevenue] = useState(false);
  const [catIsExpense, setCatIsExpense] = useState(false);
  const [catIsProject, setCatIsProject] = useState(false);
  const [catBudget, setCatBudget] = useState("0");

  // Cost centers
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [ccDialogOpen, setCcDialogOpen] = useState(false);
  const [editingCc, setEditingCc] = useState<any>(null);
  const [ccName, setCcName] = useState("");
  const [ccDesc, setCcDesc] = useState("");
  const [ccColor, setCcColor] = useState("#3b82f6");

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [newPmName, setNewPmName] = useState("");

  // Data management
  const [dataToggles, setDataToggles] = useState<Record<string, boolean>>({});


  // Placeholder dialogs
  const [calEditDialog, setCalEditDialog] = useState<{ open: boolean; label: string; color: string } | null>(null);
  const [invEditDialog, setInvEditDialog] = useState<{ open: boolean; label: string; color: string } | null>(null);
  const [dataEditDialog, setDataEditDialog] = useState<{ open: boolean; key: string; label: string } | null>(null);

  // ─── Fetch profile data ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
      if (data) {
        setLanguage((data as any).language || "pt-BR");
        setCurrency((data as any).currency || "BRL");
        setDecimalPlaces(String((data as any).decimal_places ?? 2));
      }
    });
    fetchCategories();
    fetchCostCenters();
    fetchPaymentMethods();
  }, [user]);

  const fetchCategories = async () => {
    if (!user) return;
    const { data } = await supabase.from("categories").select("*").eq("user_id", user.id).order("name");
    if (data) setCategories(data);
  };

  const fetchCostCenters = async () => {
    if (!user) return;
    const { data } = await supabase.from("cost_centers" as any).select("*").eq("user_id", user.id).order("name");
    if (data) setCostCenters(data as any[]);
  };

  const DEFAULT_PAYMENT_METHODS = ["PIX", "Boleto", "Cartão de crédito", "Cartão de débito", "TED", "DOC", "Dinheiro", "Transferência interna"];

  const fetchPaymentMethods = async () => {
    if (!user) return;
    const { data } = await supabase.from("payment_methods" as any).select("*").eq("user_id", user.id).order("name");
    if (data && data.length > 0) {
      setPaymentMethods(data as any[]);
    } else if (data && data.length === 0) {
      // Seed default payment methods
      const toInsert = DEFAULT_PAYMENT_METHODS.map(name => ({
        user_id: user.id, name, is_active: true, is_system: true,
      }));
      await supabase.from("payment_methods" as any).insert(toInsert);
      const { data: seeded } = await supabase.from("payment_methods" as any).select("*").eq("user_id", user.id).order("name");
      if (seeded) setPaymentMethods(seeded as any[]);
    }
  };

  const togglePaymentMethod = async (id: string, active: boolean) => {
    await supabase.from("payment_methods" as any).update({ is_active: active }).eq("id", id);
    fetchPaymentMethods();
  };

  const addPaymentMethod = async () => {
    if (!newPmName.trim() || !user) return;
    await supabase.from("payment_methods" as any).insert({ user_id: user.id, name: newPmName.trim(), is_active: true, is_system: false });
    setNewPmName("");
    fetchPaymentMethods();
    toast({ title: "Forma de pagamento adicionada!" });
  };

  // ─── Auto-save general prefs ─────────────────────────────────────────────

  const generalPrefs = { language, currency, decimalPlaces };

  useAutoSave(generalPrefs, async (state) => {
    if (!user) return;
    await supabase.from("profiles").update({
      language: state.language,
      currency: state.currency,
      decimal_places: parseInt(state.decimalPlaces),
      theme_preference: theme,
    } as any).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("lovable:currency-changed", { detail: { currency: state.currency } }));
  }, 1000);

  // ─── Currency change handler ─────────────────────────────────────────────

  const handleCurrencyChange = (val: string) => {
    setCurrency(val);
    // Auto-adjust decimal places
    if (val === "BTC") setDecimalPlaces("8");
    else if (["BRL", "USD", "EUR"].includes(val)) setDecimalPlaces("2");
    setGlobalCurrency(val);
    toast({ title: `Moeda alterada para ${CURRENCIES.find(c => c.value === val)?.label}` });
  };

  // ─── Category CRUD ───────────────────────────────────────────────────────

  const openNewCat = () => {
    setEditingCat(null); setCatName(""); setCatColor(CATEGORY_COLORS[0]); setCatIcon("briefcase");
    setCatIsRevenue(false); setCatIsExpense(false); setCatIsProject(false); setCatBudget("0");
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: any) => {
    setEditingCat(cat); setCatName(cat.name); setCatColor(cat.color || CATEGORY_COLORS[0]);
    setCatIcon(cat.icon || "briefcase"); setCatIsRevenue(cat.is_revenue || false);
    setCatIsExpense(cat.is_expense || false); setCatIsProject(cat.is_project || false);
    setCatBudget(String(cat.budget_amount || 0)); setCatDialogOpen(true);
  };

  const saveCat = async () => {
    if (!catName.trim() || !user) return;
    const payload: any = {
      name: catName.trim(), color: catColor, icon: catIcon,
      is_revenue: catIsRevenue, is_expense: catIsExpense, is_project: catIsProject,
      budget_amount: parseFloat(catBudget) || 0, user_id: user.id,
    };
    if (editingCat) await supabase.from("categories").update(payload).eq("id", editingCat.id);
    else await supabase.from("categories").insert(payload);
    setCatDialogOpen(false); fetchCategories();
    toast({ title: "Categoria salva!" });
  };

  const deleteCat = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    fetchCategories();
    toast({ title: "Categoria excluída" });
  };

  // ─── Cost Center CRUD ────────────────────────────────────────────────────

  const openNewCc = () => { setEditingCc(null); setCcName(""); setCcDesc(""); setCcColor("#3b82f6"); setCcDialogOpen(true); };
  const openEditCc = (cc: any) => { setEditingCc(cc); setCcName(cc.name); setCcDesc(cc.description || ""); setCcColor(cc.color || "#3b82f6"); setCcDialogOpen(true); };

  const saveCc = async () => {
    if (!ccName.trim() || !user) return;
    const payload: any = { name: ccName.trim(), description: ccDesc || null, color: ccColor, user_id: user.id, is_active: true };
    if (editingCc) await supabase.from("cost_centers" as any).update(payload).eq("id", editingCc.id);
    else await supabase.from("cost_centers" as any).insert(payload);
    setCcDialogOpen(false); fetchCostCenters();
    toast({ title: "Programa salvo!" });
  };

  const deleteCc = async () => {
    if (!editingCc) return;
    await supabase.from("cost_centers" as any).delete().eq("id", editingCc.id);
    setCcDialogOpen(false); fetchCostCenters();
    toast({ title: "Programa excluído" });
  };

  // ─── Data management ─────────────────────────────────────────────────────

  const allDataToggled = DATA_MODULES.every(m => dataToggles[m.key]);
  const toggleAllData = () => {
    const newState = !allDataToggled;
    const t: Record<string, boolean> = {};
    DATA_MODULES.forEach(m => { t[m.key] = newState; });
    setDataToggles(t);
  };

  const handleClearData = async () => {
    if (!user) return;
    const selected = DATA_MODULES.filter(m => dataToggles[m.key]);
    if (selected.length === 0) { toast({ title: "Selecione ao menos um módulo" }); return; }
    const confirmed = window.confirm(`Tem certeza que deseja limpar ${selected.length} módulo(s)? Esta ação é irreversível.`);
    if (!confirmed) return;
    for (const mod of selected) {
      if (mod.key === "projects") {
        await supabase.from("project_resources").delete().eq("user_id", user.id);
        await supabase.from("project_phases").delete().eq("user_id", user.id);
        await supabase.from("tasks").delete().eq("user_id", user.id).not("project_id", "is", null);
        await supabase.from("projects").delete().eq("user_id", user.id);
      } else if (mod.key === "project_phases") {
        await supabase.from("project_phases").delete().eq("user_id", user.id);
      } else if (mod.key === "project_resources") {
        await supabase.from("project_resources").delete().eq("user_id", user.id);
      } else if (mod.key === "tasks") {
        await supabase.from("tasks").delete().eq("user_id", user.id);
      } else {
        await supabase.from(mod.key as any).delete().eq("user_id", user.id);
      }
    }
    toast({ title: `${selected.length} módulo(s) limpos!` });
    setDataToggles({});
    fetchCategories();
  };

  // ─── Module toggles ──────────────────────────────────────────────────────

  const handleModuleToggle = (moduleKey: string, tabKey: string, checked: boolean) => {
    setTabEnabled(moduleKey, tabKey, checked);
  };

  const isTabOn = (moduleKey: string, tabKey: string) => prefs[moduleKey]?.abas?.includes(tabKey) ?? true;
  const isTabLocked = (moduleKey: string, tabKey: string) => {
    const mod = getModuleDef(moduleKey);
    return mod?.tabs.find(t => t.key === tabKey)?.locked ?? false;
  };


  // ─── Accordion default ───────────────────────────────────────────────────

  

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto pb-8">
          <Accordion
            type="multiple"
            defaultValue={["general"]}
            className="w-full space-y-8"
          >
            {/* ═══════════ GERAL ═══════════ */}
            {(
              <AccordionItem value="general" className="border-none">
                <AccordionTrigger className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2.5 px-4 border-b border-border font-semibold text-sm hover:no-underline data-[state=open]:bg-background">
                  <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Geral</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-6 pb-16 space-y-6">

                  {/* Theme Selector */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Tema Visual</Label>
                    <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
                      {THEME_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setAppTheme(opt.key)}
                          className={cn(
                            "flex-1 flex flex-col items-center gap-1 rounded-lg py-2.5 transition-all duration-400 relative",
                            theme === opt.key
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          style={{ transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                        >
                          {opt.icon}
                          <span className="text-[10px] font-medium">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language / Currency / Decimals */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Idioma</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Moeda</Label>
                      <Select value={currency} onValueChange={handleCurrencyChange}>
                        <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Preview: {formatCurrency(1234.56)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Casas Decimais</Label>
                      <Select value={decimalPlaces} onValueChange={setDecimalPlaces}>
                        <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>{DECIMAL_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Date format */}
                  <div className="max-w-xs">
                    <Label className="text-xs">Formato de data</Label>
                    <Select value={dateFormat} onValueChange={(v) => setGlobalDateFormat(v as DateFormatType)}>
                      <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATE_FORMAT_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  {/* ── Categorias (subseção) ── */}
                  <Accordion type="multiple" className="w-full">
                    <AccordionItem value="categories-sub" className="border border-border/40 rounded-lg overflow-hidden">
                      <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline bg-muted/20">
                        <span className="flex items-center gap-2"><Tag className="h-3.5 w-3.5" style={{ color: SECTION_COLORS.categories }} /> Categorias</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] text-muted-foreground">Clique duas vezes para editar. Use o FAB (+) para criar novas.</p>
                        </div>
                        <div className="space-y-1.5">
                          {categories.map((cat) => (
                            <div
                              key={cat.id}
                              onDoubleClick={() => openEditCat(cat)}
                              className="flex items-center gap-3 rounded-lg border border-border/40 p-2 hover:bg-muted/30 transition-colors duration-200 cursor-pointer select-none"
                            >
                              <span className="shrink-0" style={{ color: cat.color || "#3b82f6" }}>
                                {CATEGORY_ICON_MAP[cat.icon] || CATEGORY_ICON_MAP["briefcase"]}
                              </span>
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#3b82f6" }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">{cat.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {[cat.is_revenue && "Receita", cat.is_expense && "Despesa", cat.is_project && "Projeto"].filter(Boolean).join(" · ") || "Sem classificação"}
                                  {cat.budget_amount > 0 && ` · Orçamento: ${formatCurrency(Number(cat.budget_amount))}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] shrink-0">
                                {cat.is_revenue && <span className="rounded bg-[hsl(var(--success))]/10 px-1.5 py-0.5 text-[hsl(var(--success))]">R</span>}
                                {cat.is_expense && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">D</span>}
                                {cat.is_project && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">P</span>}
                              </div>
                            </div>
                          ))}
                          {categories.length === 0 && (
                            <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma categoria cadastrada</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* ── Programas (ex-Centro de Custo) ── */}
                    <AccordionItem value="programs-sub" className="border border-border/40 rounded-lg overflow-hidden mt-2">
                      <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline bg-muted/20">
                        <span className="flex items-center gap-2"><FolderKanban className="h-3.5 w-3.5" style={{ color: SECTION_COLORS.finances }} /> Programas</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] text-muted-foreground">Clique duas vezes para editar. Use o FAB (+) para criar novos.</p>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openNewCc}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {costCenters.map((cc: any) => (
                            <ToggleRow
                              key={cc.id}
                              colorDot={cc.color}
                              label={cc.name}
                              desc={cc.description || "Sem descrição"}
                              onDoubleClick={() => openEditCc(cc)}
                            />
                          ))}
                          {costCenters.length === 0 && (
                            <p className="py-4 text-center text-xs text-muted-foreground">Nenhum programa cadastrado</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* ── Limpeza de dados ── */}
                    <AccordionItem value="advanced-sub" className="border border-border/40 rounded-lg overflow-hidden mt-2">
                      <AccordionTrigger className="px-3 py-2 text-xs font-semibold hover:no-underline bg-muted/20">
                        <span className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-destructive" /> Limpeza de dados</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3 pt-3">
                        <p className="text-[11px] text-muted-foreground mb-2">Selecione módulos para limpar dados. Ação irreversível.</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between rounded-lg border border-border/40 p-2 bg-muted/20">
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-semibold">Selecionar Todos</span>
                            </div>
                            <Switch checked={allDataToggled} onCheckedChange={toggleAllData} />
                          </div>
                          {DATA_MODULES.map(mod => (
                            <ToggleRow
                              key={mod.key}
                              icon={DATA_MODULE_ICONS[mod.key]}
                              iconColor={CALENDAR_PALETTE.events}
                              label={mod.label}
                              desc={mod.desc}
                              enabled={!!dataToggles[mod.key]}
                              onToggle={() => setDataToggles(prev => ({ ...prev, [mod.key]: !prev[mod.key] }))}
                              onDoubleClick={() => setDataEditDialog({ open: true, key: mod.key, label: mod.label })}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-2 pt-3">
                          <Button variant="destructive" size="sm" className="gap-1.5 text-xs" onClick={handleClearData}
                            disabled={!DATA_MODULES.some(m => dataToggles[m.key])}>
                            <Trash2 className="h-3.5 w-3.5" /> Limpar selecionados
                          </Button>
                          <Button variant="ghost" size="sm" className="text-xs ml-auto" onClick={() => setDataToggles({})}>Cancelar</Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════ EQUIPES ═══════════ */}
            {(
              <AccordionItem value="teams" className="border-none">
                <AccordionTrigger className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2.5 px-4 border-b border-border font-semibold text-sm hover:no-underline">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4 text-pink-500" /> Equipes</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-6 pb-16 space-y-4">
                  <TeamsSection />
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════ CALENDÁRIO ═══════════ */}
            {(
              <AccordionItem value="calendar" className="border-none">
                <AccordionTrigger className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2.5 px-4 border-b border-border font-semibold text-sm hover:no-underline">
                  <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" style={{ color: SECTION_COLORS.calendar }} /> Calendário</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-6 pb-16 space-y-4">
                  {/* Types */}
                  <p className="text-[11px] text-muted-foreground">Tipos de lançamento. Clique duas vezes para editar.</p>
                  <div className="space-y-1.5">
                    {LAUNCH_TYPES.map((type) => (
                      <ToggleRow
                        key={type.label}
                        icon={LAUNCH_TYPE_ICONS[type.label]}
                        iconColor={type.color}
                        colorDot={type.color}
                        label={type.label}
                        desc={type.desc}
                        onDoubleClick={() => setCalEditDialog({ open: true, label: type.label, color: type.color })}
                      />
                    ))}
                  </div>

                  {/* Views */}
                  <p className="text-[11px] text-muted-foreground pt-2">Visualizações disponíveis.</p>
                  <div className="space-y-1.5">
                    {CALENDAR_VIEWS.map((view) => (
                      <ToggleRow
                        key={view.key}
                        icon={<Eye className="h-5 w-5" />}
                        iconColor="hsl(var(--muted-foreground))"
                        label={view.label}
                        desc={view.desc}
                        enabled={isTabOn("calendar", view.key)}
                        locked={view.locked}
                        onToggle={(checked) => handleModuleToggle("calendar", view.key, checked)}
                      />
                    ))}
                  </div>

                  {/* Calendar settings */}
                  <Card className="border-border/40 rounded-lg">
                    <CardContent className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Início da semana</Label>
                          <Select value={weekStart} onValueChange={setWeekStart}>
                            <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{WEEK_STARTS.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Formato de hora</Label>
                          <Select value={timeFormat} onValueChange={setTimeFormat}>
                            <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{TIME_FORMATS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Visão padrão</Label>
                          <Select value={defaultView} onValueChange={setDefaultView}>
                            <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{DEFAULT_VIEWS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Intervalo de horários</Label>
                          <Select value={slotDuration} onValueChange={setSlotDuration}>
                            <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{SLOT_DURATIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between"><Label className="text-xs">Mostrar números das semanas</Label><Switch checked={showWeekNumbers} onCheckedChange={setShowWeekNumbers} /></div>
                        <div className="flex items-center justify-between"><Label className="text-xs">Mostrar resumo financeiro</Label><Switch checked={showFinancials} onCheckedChange={setShowFinancials} /></div>
                        <div className="flex items-center justify-between"><Label className="text-xs">Mostrar tarefas concluídas</Label><Switch checked={showCompleted} onCheckedChange={setShowCompleted} /></div>
                        <div className="flex items-center justify-between"><Label className="text-xs">Feriados oficiais do Brasil 🇧🇷</Label><Switch checked={showHolidays} onCheckedChange={setShowHolidays} /></div>
                      </div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════ FINANÇAS ═══════════ */}
            {(
              <AccordionItem value="finances" className="border-none">
                <AccordionTrigger className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2.5 px-4 border-b border-border font-semibold text-sm hover:no-underline">
                  <span className="flex items-center gap-2"><DollarSign className="h-4 w-4" style={{ color: SECTION_COLORS.finances }} /> Finanças</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-6 pb-16 space-y-4">
                  <p className="text-[11px] text-muted-foreground">Abas e configurações do módulo financeiro.</p>
                  <div className="space-y-1.5">
                    {FINANCE_TABS.map((tab) => (
                      <ToggleRow
                        key={tab.key}
                        icon={<DollarSign className="h-5 w-5" />}
                        iconColor={SECTION_COLORS.finances}
                        label={tab.label}
                        desc={tab.desc}
                        enabled={isTabOn("finances", tab.key)}
                        locked={tab.locked}
                        onToggle={(checked) => handleModuleToggle("finances", tab.key, checked)}
                      />
                    ))}
                  </div>

                   {/* Programas section moved to Geral > Programas accordion */}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════ INVESTIMENTOS ═══════════ */}
            {(
              <AccordionItem value="investments" className="border-none">
                <AccordionTrigger className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2.5 px-4 border-b border-border font-semibold text-sm hover:no-underline">
                  <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" style={{ color: SECTION_COLORS.investments }} /> Investimentos</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-6 pb-16 space-y-4">
                  <p className="text-[11px] text-muted-foreground">Tipos de ativos. Clique duas vezes para editar.</p>
                  <div className="space-y-1.5">
                    <ToggleRow
                      icon={<TrendingUp className="h-5 w-5" />}
                      iconColor={SECTION_COLORS.investments}
                      label="Dashboard"
                      desc="Visão geral e métricas"
                      enabled={isTabOn("investments", "dashboard")}
                      locked={isTabLocked("investments", "dashboard")}
                      onToggle={(checked) => handleModuleToggle("investments", "dashboard", checked)}
                    />
                    {INVESTMENT_TYPES.map((type) => (
                      <ToggleRow
                        key={type.key}
                        icon={INVESTMENT_TYPE_ICONS[type.key] || <TrendingUp className="h-5 w-5" />}
                        iconColor={type.color}
                        colorDot={type.color}
                        label={type.label}
                        desc={type.desc}
                        enabled={isTabOn("investments", type.key)}
                        locked={isTabLocked("investments", type.key)}
                        onToggle={(checked) => handleModuleToggle("investments", type.key, checked)}
                        onDoubleClick={() => setInvEditDialog({ open: true, label: type.label, color: type.color })}
                      />
                    ))}
                  </div>

                  <Card className="border-border/40 rounded-lg">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between"><Label className="text-xs">Atualização automática de preços (cripto)</Label><Switch defaultChecked /></div>
                      <div className="flex items-center justify-between"><Label className="text-xs">Exibir valores em múltiplas moedas</Label><Switch defaultChecked /></div>
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* ═══════════ PROJETOS ═══════════ */}
            {(
              <AccordionItem value="projects" className="border-none">
                <AccordionTrigger className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2.5 px-4 border-b border-border font-semibold text-sm hover:no-underline">
                  <span className="flex items-center gap-2"><FolderKanban className="h-4 w-4" style={{ color: SECTION_COLORS.projects }} /> Projetos</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-6 pb-16 space-y-4">
                  <p className="text-[11px] text-muted-foreground">Abas e configurações do módulo de projetos.</p>
                  <div className="space-y-1.5">
                    {PROJECT_TABS.map((tab) => (
                      <ToggleRow
                        key={tab.key}
                        icon={<FolderKanban className="h-5 w-5" />}
                        iconColor={SECTION_COLORS.projects}
                        label={tab.label}
                        desc={tab.desc}
                        enabled={isTabOn("programs", tab.key)}
                        locked={tab.locked}
                        onToggle={(checked) => handleModuleToggle("programs", tab.key, checked)}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </ScrollArea>

      {/* ─── Dialogs ──────────────────────────────────────────────────────── */}

      {/* Category Dialog */}
      <ConfigDialog
        open={catDialogOpen}
        title={editingCat ? "Editar Categoria" : "Nova Categoria"}
        onClose={() => setCatDialogOpen(false)}
        onSave={saveCat}
        saveDisabled={!catName.trim()}
        footerLeft={editingCat ? (
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { deleteCat(editingCat.id); setCatDialogOpen(false); }}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        ) : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} className="mt-1 text-sm rounded-lg" placeholder="Ex: Alimentação" />
          </div>
          <div>
            <Label className="text-xs">Orçamento Mensal</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={catBudget}
                onChange={(e) => setCatBudget(e.target.value.replace(/[^0-9.,]/g, ""))} className="pl-9 text-sm rounded-lg" />
            </div>
          </div>
        </div>
        <div>
          <Label className="text-xs">Ícone</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CATEGORY_ICON_KEYS.map((key) => (
                <button key={key} onClick={() => setCatIcon(key)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-200",
                    catIcon === key ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:border-muted-foreground text-muted-foreground"
                  )}>{CATEGORY_ICON_MAP[key]}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Cor</Label>
          <div className="mt-1">
            <ColorPaletteGrid selected={catColor} onSelect={setCatColor} />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Usar em</Label>
          <div className="flex items-center justify-between"><Label className="font-normal text-xs">Receitas</Label><Switch checked={catIsRevenue} onCheckedChange={setCatIsRevenue} /></div>
          <div className="flex items-center justify-between"><Label className="font-normal text-xs">Despesas</Label><Switch checked={catIsExpense} onCheckedChange={setCatIsExpense} /></div>
          <div className="flex items-center justify-between"><Label className="font-normal text-xs">Projetos</Label><Switch checked={catIsProject} onCheckedChange={setCatIsProject} /></div>
        </div>
      </ConfigDialog>

      {/* Programa Dialog */}
      <ConfigDialog
        open={ccDialogOpen}
        title={editingCc ? "Editar Programa" : "Novo Programa"}
        onClose={() => setCcDialogOpen(false)}
        onSave={saveCc}
        saveDisabled={!ccName.trim()}
        footerLeft={editingCc ? (
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={deleteCc}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        ) : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={ccName} onChange={(e) => setCcName(e.target.value)} className="mt-1 text-sm rounded-lg" placeholder="Ex: TI, Marketing..." />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={ccDesc} onChange={(e) => setCcDesc(e.target.value)} className="mt-1 text-sm rounded-lg" placeholder="Opcional" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Cor</Label>
          <div className="mt-1">
            <ColorPaletteGrid selected={ccColor} onSelect={setCcColor} />
          </div>
        </div>
      </ConfigDialog>

      {/* Placeholder Dialogs */}
      <Dialog open={!!calEditDialog?.open} onOpenChange={(open) => !open && setCalEditDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle className="text-sm">{calEditDialog?.label}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Configurações de "{calEditDialog?.label}" em breve.</p>
          <div className="flex justify-end pt-4 border-t border-border/20"><Button variant="ghost" size="sm" onClick={() => setCalEditDialog(null)}>Fechar</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invEditDialog?.open} onOpenChange={(open) => !open && setInvEditDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle className="text-sm">{invEditDialog?.label}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Configurações de "{invEditDialog?.label}" em breve.</p>
          <div className="flex justify-end pt-4 border-t border-border/20"><Button variant="ghost" size="sm" onClick={() => setInvEditDialog(null)}>Fechar</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dataEditDialog?.open} onOpenChange={(open) => !open && setDataEditDialog(null)}>
        <DialogContent><DialogHeader><DialogTitle className="text-sm">{dataEditDialog?.label}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Configurações de "{dataEditDialog?.label}" em breve.</p>
          <div className="flex justify-end pt-4 border-t border-border/20"><Button variant="ghost" size="sm" onClick={() => setDataEditDialog(null)}>Fechar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
