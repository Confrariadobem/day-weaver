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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Moon, Sun, Save, Globe, CalendarDays, Tag, Plus, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  { value: "afternoon", label: "Tarde (12h–18h)" },
  { value: "night", label: "Noite (18h–00h)" },
  { value: "period", label: "Por Período (Manhã/Tarde/Noite)" },
];

const CATEGORY_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#a855f7", "#84cc16",
];

const CATEGORY_ICONS = [
  "💼", "🏠", "🚗", "🍔", "💊", "📚", "🎮", "✈️", "🎂",
  "💰", "📊", "🛒", "🎯", "⚡", "🔧", "📱", "🎵", "🏋️",
  "🎬", "👕", "🐶", "🌱", "☕", "🎁",
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
  const [catIcon, setCatIcon] = useState("💼");
  const [catIsRevenue, setCatIsRevenue] = useState(false);
  const [catIsExpense, setCatIsExpense] = useState(false);
  const [catIsProject, setCatIsProject] = useState(false);
  const [catBudget, setCatBudget] = useState("0");
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

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
      language,
      currency,
      decimal_places: parseInt(decimalPlaces),
      theme_preference: theme,
    } as any).eq("user_id", user.id);
    toast({ title: "Preferências salvas!" });
  };

  // Category handlers
  const openNewCat = () => {
    setEditingCat(null);
    setCatName(""); setCatColor(CATEGORY_COLORS[0]); setCatIcon("💼");
    setCatIsRevenue(false); setCatIsExpense(false); setCatIsProject(false);
    setCatBudget("0");
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: any) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatColor(cat.color || CATEGORY_COLORS[0]);
    setCatIcon(cat.icon || "💼");
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

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Preferências</h1>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="calendar">Calendário</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
          </TabsList>

          {/* ===== GERAL ===== */}
          <TabsContent value="general" className="space-y-6 mt-4">
            {/* Appearance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  Aparência
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Label>Modo Escuro</Label>
                  <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
                </div>
              </CardContent>
            </Card>

            {/* Language & Currency */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4" /> Idioma e Moeda
                </CardTitle>
                <CardDescription>Configure o idioma e formato monetário</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Idioma</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Moeda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Casas Decimais</Label>
                  <Select value={decimalPlaces} onValueChange={setDecimalPlaces}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DECIMAL_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Button onClick={savePrefs} className="gap-2">
              <Save className="h-4 w-4" /> Salvar Preferências
            </Button>
          </TabsContent>

          {/* ===== CALENDÁRIO ===== */}
          <TabsContent value="calendar" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4" /> Configurações do Calendário
                </CardTitle>
                <CardDescription>Personalize sua agenda e visualização</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Início da semana</Label>
                  <Select value={weekStart} onValueChange={setWeekStart}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEK_STARTS.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Formato de hora</Label>
                  <Select value={timeFormat} onValueChange={setTimeFormat}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIME_FORMATS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Visão padrão</Label>
                  <Select value={defaultView} onValueChange={setDefaultView}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_VIEWS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Intervalo de horários (agenda)</Label>
                  <Select value={slotDuration} onValueChange={setSlotDuration}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SLOT_DURATIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label>Mostrar números das semanas</Label>
                    <Switch checked={showWeekNumbers} onCheckedChange={setShowWeekNumbers} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Mostrar resumo financeiro</Label>
                    <Switch checked={showFinancials} onCheckedChange={setShowFinancials} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Mostrar tarefas concluídas</Label>
                    <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Feriados oficiais do Brasil 🇧🇷</Label>
                    <Switch checked={showHolidays} onCheckedChange={setShowHolidays} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={savePrefs} className="gap-2">
              <Save className="h-4 w-4" /> Salvar Preferências
            </Button>
          </TabsContent>

          {/* ===== CATEGORIAS ===== */}
          <TabsContent value="categories" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="h-4 w-4" /> Categorias
                  </CardTitle>
                  <CardDescription>Categorias unificadas para todos os módulos. Clique duas vezes para editar.</CardDescription>
                </div>
                <Button size="sm" onClick={openNewCat} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Nova
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      onClick={() => handleCatRowClick(cat)}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors cursor-pointer select-none"
                    >
                      <span className="text-lg shrink-0">{cat.icon || "💼"}</span>
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#3b82f6" }} />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{cat.name}</span>
                        {cat.budget_amount > 0 && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            Orçamento: R$ {Number(cat.budget_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs shrink-0">
                        {cat.is_revenue && <span className="rounded bg-[hsl(var(--success))]/10 px-1.5 py-0.5 text-[hsl(var(--success))]">Receita</span>}
                        {cat.is_expense && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">Despesa</span>}
                        {cat.is_project && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Projeto</span>}
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <p className="py-8 text-center text-muted-foreground">Nenhuma categoria cadastrada</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Category Dialog */}
            <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCat ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome</Label>
                    <Input value={catName} onChange={(e) => setCatName(e.target.value)} className="mt-1" placeholder="Ex: Alimentação" />
                  </div>
                  <div>
                    <Label>Ícone</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {CATEGORY_ICONS.map((icon) => (
                        <button
                          key={icon}
                          onClick={() => setCatIcon(icon)}
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors",
                            catIcon === icon ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground"
                          )}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setCatColor(color)}
                          className={cn(
                            "h-7 w-7 rounded-full border-2 transition-transform",
                            catColor === color ? "scale-110 border-foreground" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Orçamento Mensal</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={catBudget}
                        onChange={(e) => setCatBudget(e.target.value.replace(/[^0-9.,]/g, ""))}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Usar em</Label>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Receitas</Label>
                      <Switch checked={catIsRevenue} onCheckedChange={setCatIsRevenue} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Despesas</Label>
                      <Switch checked={catIsExpense} onCheckedChange={setCatIsExpense} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="font-normal">Projetos</Label>
                      <Switch checked={catIsProject} onCheckedChange={setCatIsProject} />
                    </div>
                  </div>
                  {editingCat && (
                    <Button
                      variant="ghost"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => { deleteCat(editingCat.id); setCatDialogOpen(false); }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir Categoria
                    </Button>
                  )}
                  <Button onClick={saveCat} className="w-full">Salvar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
