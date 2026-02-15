import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Settings, Tag, Plus, Edit2, Trash2, Moon, Sun, Save, Globe, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

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

const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

const CURRENCIES = [
  { value: "BRL", label: "Real (R$)", symbol: "R$" },
  { value: "USD", label: "Dólar (US$)", symbol: "US$" },
  { value: "EUR", label: "Euro (€)", symbol: "€" },
  { value: "GBP", label: "Libra (£)", symbol: "£" },
];

const DECIMAL_OPTIONS = [
  { value: "0", label: "0 casas" },
  { value: "2", label: "2 casas" },
  { value: "3", label: "3 casas" },
  { value: "4", label: "4 casas" },
];

export default function ProfileView() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [currency, setCurrency] = useState("BRL");
  const [decimalPlaces, setDecimalPlaces] = useState("2");
  const [categories, setCategories] = useState<any[]>([]);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);

  // Category form
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);
  const [catIcon, setCatIcon] = useState("💼");
  const [catIsRevenue, setCatIsRevenue] = useState(false);
  const [catIsExpense, setCatIsExpense] = useState(false);
  const [catIsProject, setCatIsProject] = useState(false);
  const [catBudget, setCatBudget] = useState("0");

  const fetchData = async () => {
    if (!user) return;
    const [profRes, catRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("categories").select("*").eq("user_id", user.id).order("name"),
    ]);
    if (profRes.data) {
      setProfile(profRes.data);
      setDisplayName(profRes.data.display_name || "");
      setLanguage((profRes.data as any).language || "pt-BR");
      setCurrency((profRes.data as any).currency || "BRL");
      setDecimalPlaces(String((profRes.data as any).decimal_places ?? 2));
    }
    if (catRes.data) setCategories(catRes.data);
  };

  useEffect(() => { fetchData(); }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      display_name: displayName,
      theme_preference: theme,
      language,
      currency,
      decimal_places: parseInt(decimalPlaces),
    } as any).eq("user_id", user.id);
    toast({ title: "Perfil salvo!" });
    fetchData();
  };

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

  const saveCat = async () => {
    if (!catName.trim() || !user) return;
    const payload: any = {
      name: catName.trim(),
      color: catColor,
      icon: catIcon,
      is_revenue: catIsRevenue,
      is_expense: catIsExpense,
      is_project: catIsProject,
      budget_amount: parseFloat(catBudget) || 0,
      user_id: user.id,
    };
    if (editingCat) {
      await supabase.from("categories").update(payload).eq("id", editingCat.id);
    } else {
      await supabase.from("categories").insert(payload);
    }
    setCatDialogOpen(false);
    fetchData();
  };

  const deleteCat = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    fetchData();
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Perfil & Configurações</h1>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5 text-sm">
              <User className="h-4 w-4" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5 text-sm">
              <Tag className="h-4 w-4" /> Categorias
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5 text-sm">
              <Settings className="h-4 w-4" /> Preferências
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados do Usuário</CardTitle>
                <CardDescription>Gerencie suas informações pessoais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">Email</Label>
                  <Input value={user?.email || ""} disabled className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Nome de Exibição</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" />
                </div>
                <Button onClick={saveProfile} size="sm" className="gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Categorias</CardTitle>
                  <CardDescription>Categorias unificadas para todos os módulos</CardDescription>
                </div>
                <Button size="sm" onClick={openNewCat} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Nova
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                      <span className="text-lg shrink-0">{cat.icon || "💼"}</span>
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#3b82f6" }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{cat.name}</span>
                        {cat.budget_amount > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Orçamento: R$ {Number(cat.budget_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs shrink-0">
                        {cat.is_revenue && <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">Receita</span>}
                        {cat.is_expense && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">Despesa</span>}
                        {cat.is_project && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Projeto</span>}
                      </div>
                      <button onClick={() => openEditCat(cat)} className="text-muted-foreground hover:text-foreground">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteCat(cat.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria cadastrada</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aparência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    <Label>Modo Escuro</Label>
                  </div>
                  <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Idioma e Moeda
                </CardTitle>
                <CardDescription>Configure o idioma e formato monetário do sistema</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">Idioma</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Moeda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Casas Decimais</Label>
                  <Select value={decimalPlaces} onValueChange={setDecimalPlaces}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DECIMAL_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={saveProfile} size="sm" className="gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Salvar Preferências
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Category Dialog */}
        <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCat ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Nome</Label>
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} className="mt-1" placeholder="Ex: Alimentação" />
              </div>
              <div>
                <Label className="text-sm">Ícone</Label>
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
                <Label className="text-sm">Cor</Label>
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
                <Label className="text-sm">Orçamento Mensal (planejamento)</Label>
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
                <Label className="text-sm">Usar em</Label>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-normal">Receitas</Label>
                  <Switch checked={catIsRevenue} onCheckedChange={setCatIsRevenue} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-normal">Despesas</Label>
                  <Switch checked={catIsExpense} onCheckedChange={setCatIsExpense} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-normal">Projetos</Label>
                  <Switch checked={catIsProject} onCheckedChange={setCatIsProject} />
                </div>
              </div>
              <Button onClick={saveCat} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
