import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Settings, Tag, Plus, Edit2, Trash2, Moon, Sun, Save, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

const CATEGORY_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#a855f7", "#84cc16",
];

const CATEGORY_ICONS = [
  "💼", "🏠", "🚗", "🍔", "💊", "📚", "🎮", "✈️", "🎂",
  "💰", "📊", "🛒", "🎯", "⚡", "🔧", "📱", "🎵", "🏋️",
];

export default function ProfileView() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Tables<"categories"> | null>(null);

  // Category form
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);
  const [catIcon, setCatIcon] = useState("💼");
  const [catIsRevenue, setCatIsRevenue] = useState(false);
  const [catIsExpense, setCatIsExpense] = useState(false);
  const [catIsProject, setCatIsProject] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    const [profRes, catRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("categories").select("*").eq("user_id", user.id).order("name"),
    ]);
    if (profRes.data) {
      setProfile(profRes.data);
      setDisplayName(profRes.data.display_name || "");
    }
    if (catRes.data) setCategories(catRes.data);
  };

  useEffect(() => { fetchData(); }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      display_name: displayName,
      theme_preference: theme,
    }).eq("user_id", user.id);
    toast({ title: "Perfil salvo!" });
    fetchData();
  };

  const openNewCat = () => {
    setEditingCat(null);
    setCatName(""); setCatColor(CATEGORY_COLORS[0]); setCatIcon("💼");
    setCatIsRevenue(false); setCatIsExpense(false); setCatIsProject(false);
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: Tables<"categories">) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatColor(cat.color || CATEGORY_COLORS[0]);
    setCatIcon("💼"); // stored in name prefix or separate field
    setCatIsRevenue(cat.is_revenue || false);
    setCatIsExpense(cat.is_expense || false);
    setCatIsProject(cat.is_project || false);
    setCatDialogOpen(true);
  };

  const saveCat = async () => {
    if (!catName.trim() || !user) return;
    const payload = {
      name: catName.trim(),
      color: catColor,
      is_revenue: catIsRevenue,
      is_expense: catIsExpense,
      is_project: catIsProject,
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
        <h1 className="text-xl font-bold">Perfil & Configurações</h1>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5 text-xs">
              <Tag className="h-3.5 w-3.5" /> Categorias
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" /> Preferências
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
                  <Label className="text-xs">Email</Label>
                  <Input value={user?.email || ""} disabled className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Nome de Exibição</Label>
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
                    <div key={cat.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#3b82f6" }} />
                      <span className="flex-1 text-sm font-medium">{cat.name}</span>
                      <div className="flex items-center gap-1.5 text-[10px]">
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
          <TabsContent value="preferences" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preferências</CardTitle>
                <CardDescription>Personalize sua experiência</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    <Label>Modo Escuro</Label>
                  </div>
                  <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
                </div>
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
                <Label className="text-xs">Nome</Label>
                <Input value={catName} onChange={(e) => setCatName(e.target.value)} className="mt-1" placeholder="Ex: Alimentação" />
              </div>
              <div>
                <Label className="text-xs">Ícone</Label>
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
                <Label className="text-xs">Cor</Label>
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
              <div className="space-y-3">
                <Label className="text-xs">Usar em</Label>
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
