import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Moon, Sun, Save, Globe, CalendarDays, Tag, Trash2, Database, TrendingUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_TYPE_ICONS, DATA_MODULE_ICONS, CATEGORY_ICON_MAP, CATEGORY_ICON_KEYS, INVESTMENT_TYPE_ICONS } from "@/lib/icons";

const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

const CURRENCIES = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar (US$)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "Libra (£)" },
];

const DECIMAL_OPTIONS = [
  { value: "0", label: "0 casas" },
  { value: "2", label: "2 casas" },
  { value: "3", label: "3 casas" },
  { value: "4", label: "4 casas" },
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
  { value: "240", label: "4 horas" },
  { value: "360", label: "6 horas" },
  { value: "morning", label: "Manhã (6h–12h)" },
];

const CATEGORY_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#a855f7", "#84cc16",
];

// Calendar-based color palette for icon theming
const CALENDAR_PALETTE: Record<string, string> = {
  birthdays: "#ec4899",
  events: "#3b82f6",
  holidays: "#6b7280",
  cashflow: "#22c55e",
  investments: "#d4a017",
  projects: "#eab308",
  tasks: "#f97316",
};

// Section icon colors using calendar palette
const SECTION_COLORS: Record<string, string> = {
  calendar: CALENDAR_PALETTE.events,
  types: CALENDAR_PALETTE.events,
  categories: CALENDAR_PALETTE.cashflow,
  investments: CALENDAR_PALETTE.investments,
  data: "#ef4444",
  general: CALENDAR_PALETTE.events,
};

const DATA_MODULES = [
  { key: "calendar_events", label: "Calendário (Eventos)", desc: "Eventos, compromissos e lembretes do calendário" },
  { key: "categories", label: "Categorias", desc: "Categorias de receitas, despesas e projetos" },
  { key: "financial_accounts", label: "Carteira", desc: "Contas bancárias, cartões e carteiras digitais" },
  { key: "financial_entries", label: "Fluxo de Caixa", desc: "Lançamentos financeiros de receitas e despesas" },
  { key: "investments", label: "Investimentos", desc: "Ativos de renda fixa, variável e criptoativos" },
  { key: "project_phases", label: "Etapas de Projetos", desc: "Fases e marcos dos seus projetos" },
  { key: "project_resources", label: "Recursos de Projetos", desc: "Pessoas e recursos alocados em projetos" },
  { key: "projects", label: "Projetos", desc: "Projetos pessoais e profissionais" },
  { key: "tasks", label: "Tarefas", desc: "Tarefas avulsas e vinculadas a projetos" },
].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

const LAUNCH_TYPES = [
  { label: "Aniversário", color: CALENDAR_PALETTE.birthdays, desc: "Datas de aniversário com recorrência anual" },
  { label: "Evento", color: CALENDAR_PALETTE.events, desc: "Compromissos e eventos gerais" },
  { label: "Fluxo de Caixa", color: CALENDAR_PALETTE.cashflow, desc: "Contas a pagar e receber" },
  { label: "Investimento", color: CALENDAR_PALETTE.investments, desc: "Aportes e resgates de investimentos" },
  { label: "Projetos", color: CALENDAR_PALETTE.projects, desc: "Marcos e entregas de projetos" },
  { label: "Feriado", color: CALENDAR_PALETTE.holidays, desc: "Feriados nacionais (automático)" },
];

const INVESTMENT_TYPES = [
  { label: "Ações", color: "#3b82f6", desc: "Ações listadas em bolsa de valores", key: "stock" },
  { label: "FIIs", color: "#22c55e", desc: "Fundos de Investimento Imobiliário", key: "fii" },
  { label: "Criptoativos", color: "#f59e0b", desc: "Bitcoin, Ethereum e outros ativos digitais", key: "crypto" },
  { label: "ETFs", color: "#06b6d4", desc: "Exchange Traded Funds", key: "etf" },
  { label: "Renda Fixa", color: "#8b5cf6", desc: "CDB, Tesouro Direto, LCI, LCA", key: "fixed_income" },
  { label: "Outros", color: "#6b7280", desc: "Outros tipos de investimento", key: "other" },
];

export default function PreferencesView() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [language, setLanguage] = useState("pt-BR");
  const [currency, setCurrency] = useState("BRL");
  const [decimalPlaces, setDecimalPlaces] = useState("2");
  const [weekStart, setWeekStart] = useState("sunday");
  const [timeFormat, setTimeFormat] = useState("24h");
  const [defaultView, setDefaultView] = useState("monthly");
  const [slotDuration, setSlotDuration] = useState("60");
  const [showWeekNumbers, setShowWeekNumbers] = useState(true);
  const [showFinancials, setShowFinancials] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showHolidays, setShowHolidays] = useState(false);

  // Categories state
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
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Data module toggles
  const [dataToggles, setDataToggles] = useState<Record<string, boolean>>({});
  const lastDataClickRef = useRef<{ key: string; time: number } | null>(null);
  const [dataEditDialog, setDataEditDialog] = useState<{ open: boolean; key: string; label: string } | null>(null);

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
  }, [user]);

  const fetchCategories = async () => {
    if (!user) return;
    const { data } = await supabase.from("categories").select("*").eq("user_id", user.id).order("name");
    if (data) setCategories(data);
  };

  const savePrefs = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      language, currency,
      decimal_places: parseInt(decimalPlaces),
      theme_preference: theme,
    } as any).eq("user_id", user.id);
    toast({ title: "Preferências salvas!" });
  };

  const openNewCat = () => {
    setEditingCat(null);
    setCatName("");
    setCatColor(CATEGORY_COLORS[0]);
    setCatIcon("briefcase");
    setCatIsRevenue(false);
    setCatIsExpense(false);
    setCatIsProject(false);
    setCatBudget("0");
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: any) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatColor(cat.color || CATEGORY_COLORS[0]);
    setCatIcon(cat.icon || "briefcase");
    setCatIsRevenue(cat.is_revenue || false);
    setCatIsExpense(cat.is_expense || false);
    setCatIsProject(cat.is_project || false);
    setCatBudget(String(cat.budget_amount || 0));
    setCatDialogOpen(true);
  };

  const handleCatRowClick = (cat: any) => {
    const now = Date.now();
    if (lastClickRef.current?.id === cat.id && now - lastClickRef.current.time < 400) {
      openEditCat(cat);
      lastClickRef.current = null;
    } else {
      lastClickRef.current = { id: cat.id, time: now };
    }
  };

  const saveCat = async () => {
    if (!catName.trim() || !user) return;
    const payload: any = {
      name: catName.trim(), color: catColor, icon: catIcon,
      is_revenue: catIsRevenue, is_expense: catIsExpense, is_project: catIsProject,
      budget_amount: parseFloat(catBudget) || 0, user_id: user.id,
    };
    if (editingCat) {
      await supabase.from("categories").update(payload).eq("id", editingCat.id);
    } else {
      await supabase.from("categories").insert(payload);
    }
    setCatDialogOpen(false);
    fetchCategories();
  };

  const deleteCat = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    fetchCategories();
  };

  const allDataToggled = DATA_MODULES.every(m => dataToggles[m.key]);
  const toggleAllData = () => {
    const newState = !allDataToggled;
    const newToggles: Record<string, boolean> = {};
    DATA_MODULES.forEach(m => { newToggles[m.key] = newState; });
    setDataToggles(newToggles);
  };

  const toggleDataModule = (key: string) => {
    setDataToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDataRowClick = (mod: { key: string; label: string }) => {
    const now = Date.now();
    if (lastDataClickRef.current?.key === mod.key && now - lastDataClickRef.current.time < 400) {
      setDataEditDialog({ open: true, key: mod.key, label: mod.label });
      lastDataClickRef.current = null;
    } else {
      lastDataClickRef.current = { key: mod.key, time: now };
    }
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
    toast({ title: `${selected.length} módulo(s) limpos com sucesso!` });
    setDataToggles({});
    fetchCategories();
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 max-w-3xl mx-auto">

        {/* ═══ CALENDÁRIO ═══ */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" style={{ color: SECTION_COLORS.calendar }} />
            Calendário
          </h2>
          <p className="text-xs text-muted-foreground">Tipos de lançamento, configurações de visualização e preferências da agenda.</p>

          {/* Types list first (like investments pattern) */}
          <div className="space-y-1.5 pt-1">
            {LAUNCH_TYPES.map((type) => (
              <div key={type.label} className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors cursor-pointer select-none">
                <span className="shrink-0" style={{ color: type.color }}>{LAUNCH_TYPE_ICONS[type.label]}</span>
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{type.label}</p>
                  <p className="text-[11px] text-muted-foreground">{type.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Calendar settings */}
          <Card className="mt-3">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Início da semana</Label>
                  <Select value={weekStart} onValueChange={setWeekStart}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{WEEK_STARTS.map(w => <SelectItem key={w.value} value={w.value} className="text-xs">{w.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Formato de hora</Label>
                  <Select value={timeFormat} onValueChange={setTimeFormat}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_FORMATS.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Visão padrão</Label>
                  <Select value={defaultView} onValueChange={setDefaultView}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DEFAULT_VIEWS.map(v => <SelectItem key={v.value} value={v.value} className="text-xs">{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Intervalo de horários</Label>
                  <Select value={slotDuration} onValueChange={setSlotDuration}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{SLOT_DURATIONS.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mostrar números das semanas</Label>
                  <Switch checked={showWeekNumbers} onCheckedChange={setShowWeekNumbers} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mostrar resumo financeiro</Label>
                  <Switch checked={showFinancials} onCheckedChange={setShowFinancials} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mostrar tarefas concluídas</Label>
                  <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Feriados oficiais do Brasil 🇧🇷</Label>
                  <Switch checked={showHolidays} onCheckedChange={setShowHolidays} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ CATEGORIAS ═══ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4" style={{ color: SECTION_COLORS.categories }} />
                Categorias
              </h2>
              <p className="text-xs text-muted-foreground">Categorias unificadas para receitas, despesas e projetos. Clique duas vezes para editar.</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openNewCat}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={() => handleCatRowClick(cat)}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors cursor-pointer select-none"
              >
                <span className="shrink-0" style={{ color: cat.color || "#3b82f6" }}>
                  {CATEGORY_ICON_MAP[cat.icon] || CATEGORY_ICON_MAP["briefcase"]}
                </span>
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#3b82f6" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{cat.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[cat.is_revenue && "Receita", cat.is_expense && "Despesa", cat.is_project && "Projeto"].filter(Boolean).join(" · ") || "Sem classificação"}
                    {cat.budget_amount > 0 && ` · Orçamento: R$ ${Number(cat.budget_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                  {cat.is_revenue && <span className="rounded bg-[hsl(var(--success))]/10 px-1.5 py-0.5 text-[hsl(var(--success))]">R</span>}
                  {cat.is_expense && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">D</span>}
                  {cat.is_project && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">P</span>}
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma categoria cadastrada</p>
            )}
          </div>
        </div>

        {/* ═══ INVESTIMENTOS ═══ */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: SECTION_COLORS.investments }} />
            Investimentos
          </h2>
          <p className="text-xs text-muted-foreground">Tipos de ativos disponíveis e configurações de cotações automáticas.</p>

          <div className="space-y-1.5 pt-1">
            {INVESTMENT_TYPES.map((type) => (
              <div key={type.label} className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors cursor-pointer select-none">
                <span className="shrink-0" style={{ color: type.color }}>
                  {INVESTMENT_TYPE_ICONS[type.key] || <TrendingUp className="h-5 w-5" />}
                </span>
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{type.label}</p>
                  <p className="text-[11px] text-muted-foreground">{type.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Card className="mt-3">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Atualização automática de preços (cripto)</Label>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Exibir valores em múltiplas moedas</Label>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ GERAL ═══ */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4" style={{ color: SECTION_COLORS.general }} />
            Geral
          </h2>
          <p className="text-xs text-muted-foreground">Aparência, idioma, moeda e formato numérico.</p>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-2">
                  {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  Modo Escuro
                </Label>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div>
                  <Label className="text-xs">Idioma</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Moeda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Casas Decimais</Label>
                  <Select value={decimalPlaces} onValueChange={setDecimalPlaces}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DECIMAL_OPTIONS.map(d => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ DADOS ═══ */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-destructive">
            <Database className="h-4 w-4" />
            Gerenciamento de Dados
          </h2>
          <p className="text-xs text-muted-foreground">Selecione os módulos que deseja limpar. Clique duas vezes para editar. Esta ação é irreversível.</p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg border border-border p-2.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold">Selecionar Todos</span>
              </div>
              <Switch checked={allDataToggled} onCheckedChange={toggleAllData} />
            </div>

            {DATA_MODULES.map(mod => (
              <div
                key={mod.key}
                onClick={() => handleDataRowClick(mod)}
                className="flex items-center justify-between rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span style={{ color: CALENDAR_PALETTE.events }}>{DATA_MODULE_ICONS[mod.key]}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{mod.label}</p>
                    <p className="text-[11px] text-muted-foreground">{mod.desc}</p>
                  </div>
                </div>
                <Switch
                  checked={!!dataToggles[mod.key]}
                  onCheckedChange={() => toggleDataModule(mod.key)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="destructive" size="sm" className="gap-1.5 text-xs" onClick={handleClearData}
              disabled={!DATA_MODULES.some(m => dataToggles[m.key])}>
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </Button>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDataToggles({})}>Cancelar</Button>
            </div>
          </div>
        </div>

        {/* Save footer */}
        <div className="flex items-center gap-2 pt-2 pb-4 border-t border-border/30">
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" className="text-xs">Cancelar</Button>
            <Button size="sm" className="text-xs gap-1.5" onClick={savePrefs}>
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      </div>

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">{editingCat ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} className="mt-1 text-xs" placeholder="Ex: Alimentação" />
            </div>
            <div>
              <Label className="text-xs">Ícone</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CATEGORY_ICON_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setCatIcon(key)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                      catIcon === key ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground text-muted-foreground"
                    )}
                  >
                    {CATEGORY_ICON_MAP[key]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setCatColor(color)}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform",
                      catColor === color ? "scale-110 border-foreground" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Orçamento Mensal</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                <Input
                  type="text" inputMode="decimal" placeholder="0,00"
                  value={catBudget}
                  onChange={(e) => setCatBudget(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="pl-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Usar em</Label>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-xs">Receitas</Label>
                <Switch checked={catIsRevenue} onCheckedChange={setCatIsRevenue} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-xs">Despesas</Label>
                <Switch checked={catIsExpense} onCheckedChange={setCatIsExpense} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-xs">Projetos</Label>
                <Switch checked={catIsProject} onCheckedChange={setCatIsProject} />
              </div>
            </div>
            {/* Standardized footer: Excluir left, Cancelar + Salvar right */}
            <div className="flex items-center gap-2 pt-4 border-t border-border/20">
              {editingCat && (
                <Button variant="destructive" size="sm" className="gap-1.5 text-xs"
                  onClick={() => { deleteCat(editingCat.id); setCatDialogOpen(false); }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCatDialogOpen(false)}>Cancelar</Button>
                <Button size="sm" className="text-xs gap-1.5" onClick={saveCat}>
                  <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Data module edit dialog */}
      <Dialog open={!!dataEditDialog?.open} onOpenChange={(open) => !open && setDataEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">{dataEditDialog?.label}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Configurações do módulo "{dataEditDialog?.label}" em breve.</p>
          <div className="flex items-center gap-2 pt-4 border-t border-border/20">
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDataEditDialog(null)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
