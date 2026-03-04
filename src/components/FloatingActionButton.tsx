import { useState, useCallback } from "react";
import { Plus, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ColorPaletteGrid } from "@/components/shared/ColorPaletteGrid";
import { CATEGORY_ICON_MAP, CATEGORY_ICON_KEYS } from "@/lib/icons";
import EventEditDialog from "@/components/calendar/EventEditDialog";
import type { ModuleKey } from "@/components/NavSidebar";

type EventType = "birthday" | "event" | "cashflow" | "investment" | "project" | "patrimonio" | "programa";
type FabAction = "event" | "categoria" | "centro_custo";

const MODULE_TO_EVENT_TYPE: Partial<Record<ModuleKey, EventType>> = {
  calendar: "event",
  finances: "cashflow",
  investments: "investment",
  programs: "project",
  patrimonio: "patrimonio",
  dashboard: "event",
};

const FAB_OPTIONS: { key: FabAction; label: string; color: string }[] = [
  { key: "categoria", label: "Categoria", color: "#06b6d4" },
  { key: "centro_custo", label: "Centro de Custo", color: "#06b6d4" },
  { key: "event", label: "Lançamento", color: "#3b82f6" },
];

const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#fbbf24", "#84cc16", "#10b981", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#d946ef", "#ec4899", "#6b7280",
];

interface FloatingActionButtonProps {
  activeModule?: ModuleKey;
}

export default function FloatingActionButton({ activeModule }: FloatingActionButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultDate] = useState(() => new Date());

  // Category dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0]);
  const [catIcon, setCatIcon] = useState("briefcase");
  const [catIsRevenue, setCatIsRevenue] = useState(false);
  const [catIsExpense, setCatIsExpense] = useState(false);
  const [catIsProject, setCatIsProject] = useState(false);
  const [catBudget, setCatBudget] = useState("0");
  const [catNameError, setCatNameError] = useState("");

  // Cost center dialog state
  const [ccDialogOpen, setCcDialogOpen] = useState(false);
  const [ccName, setCcName] = useState("");
  const [ccDesc, setCcDesc] = useState("");
  const [ccColor, setCcColor] = useState("#3b82f6");
  const [ccNameError, setCcNameError] = useState("");

  const defaultEventType = activeModule ? MODULE_TO_EVENT_TYPE[activeModule] : undefined;

  const handleSaved = () => {
    window.dispatchEvent(new CustomEvent("lovable:data-changed"));
    setRefreshKey(k => k + 1);
  };

  const handleFabAction = (action: FabAction) => {
    setMenuOpen(false);
    if (action === "categoria") {
      setCatName(""); setCatColor(CATEGORY_COLORS[0]); setCatIcon("briefcase");
      setCatIsRevenue(false); setCatIsExpense(false); setCatIsProject(false);
      setCatBudget("0"); setCatNameError("");
      setCatDialogOpen(true);
    } else if (action === "centro_custo") {
      setCcName(""); setCcDesc(""); setCcColor("#3b82f6"); setCcNameError("");
      setCcDialogOpen(true);
    } else {
      setEventOpen(true);
    }
  };

  // Validate unique category name
  const validateCatName = useCallback(async (name: string) => {
    if (!name.trim()) { setCatNameError("Nome obrigatório"); return false; }
    if (!user) return false;
    const { data } = await supabase.from("categories").select("id").eq("user_id", user.id).ilike("name", name.trim());
    if (data && data.length > 0) { setCatNameError("Nome já existe"); return false; }
    setCatNameError(""); return true;
  }, [user]);

  const saveCat = async () => {
    if (!user) return;
    const valid = await validateCatName(catName);
    if (!valid) return;
    await supabase.from("categories").insert({
      name: catName.trim(), color: catColor, icon: catIcon,
      is_revenue: catIsRevenue, is_expense: catIsExpense, is_project: catIsProject,
      budget_amount: parseFloat(catBudget) || 0, user_id: user.id,
    });
    setCatDialogOpen(false);
    toast({ title: "✓ Categoria salva!", className: "bg-[hsl(160_60%_45%/0.9)] text-white border-border max-w-[280px] rounded-lg shadow-md", duration: 2000 });
    handleSaved();
  };

  // Validate unique CC name
  const validateCcName = useCallback(async (name: string) => {
    if (!name.trim()) { setCcNameError("Nome obrigatório"); return false; }
    if (!user) return false;
    const { data } = await supabase.from("cost_centers" as any).select("id").eq("user_id", user.id).ilike("name", name.trim());
    if (data && data.length > 0) { setCcNameError("Nome já existe"); return false; }
    setCcNameError(""); return true;
  }, [user]);

  const saveCc = async () => {
    if (!user) return;
    const valid = await validateCcName(ccName);
    if (!valid) return;
    await supabase.from("cost_centers" as any).insert({
      name: ccName.trim(), description: ccDesc || null, color: ccColor,
      user_id: user.id, is_active: true,
    });
    setCcDialogOpen(false);
    toast({ title: "✓ Centro de custo salvo!", className: "bg-[hsl(160_60%_45%/0.9)] text-white border-border max-w-[280px] rounded-lg shadow-md", duration: 2000 });
    handleSaved();
  };

  return (
    <>
      {/* FAB Menu */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full",
                  "bg-primary text-primary-foreground shadow-lg",
                  "transition-all duration-200 hover:scale-110 hover:shadow-xl",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                )}
                aria-label="Novo"
              >
                <Plus className={cn("h-7 w-7 transition-transform duration-200", menuOpen && "rotate-45")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={12}>Novo</TooltipContent>
          </Tooltip>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-48 p-1.5 space-y-0.5" sideOffset={8}>
          {FAB_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleFabAction(opt.key)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.color }} />
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Event Dialog */}
      <EventEditDialog
        key={refreshKey}
        open={eventOpen}
        onOpenChange={setEventOpen}
        item={null}
        defaultDate={defaultDate}
        userId={user?.id || ""}
        onSaved={handleSaved}
        defaultEventType={defaultEventType}
      />

      {/* Category Dialog - identical to PreferencesView */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-sm">Nova Categoria</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={catName} onChange={(e) => { setCatName(e.target.value); setCatNameError(""); }}
                  className="mt-1 text-sm rounded-lg" placeholder="Ex: Alimentação" />
                {catNameError && <p className="text-[11px] text-destructive mt-1">{catNameError}</p>}
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
              <div className="mt-1"><ColorPaletteGrid selected={catColor} onSelect={setCatColor} /></div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Usar em</Label>
              <div className="flex items-center justify-between"><Label className="font-normal text-xs">Receitas</Label><Switch checked={catIsRevenue} onCheckedChange={setCatIsRevenue} /></div>
              <div className="flex items-center justify-between"><Label className="font-normal text-xs">Despesas</Label><Switch checked={catIsExpense} onCheckedChange={setCatIsExpense} /></div>
              <div className="flex items-center justify-between"><Label className="font-normal text-xs">Projetos</Label><Switch checked={catIsProject} onCheckedChange={setCatIsProject} /></div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border/20">
              <Button size="sm" onClick={saveCat} disabled={!catName.trim()} className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white">Salvar</Button>
              <Button variant="ghost" size="sm" onClick={() => setCatDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cost Center Dialog - identical to PreferencesView */}
      <Dialog open={ccDialogOpen} onOpenChange={setCcDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-sm">Novo Centro de Custo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={ccName} onChange={(e) => { setCcName(e.target.value); setCcNameError(""); }}
                  className="mt-1 text-sm rounded-lg" placeholder="Ex: TI, Marketing..." />
                {ccNameError && <p className="text-[11px] text-destructive mt-1">{ccNameError}</p>}
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input value={ccDesc} onChange={(e) => setCcDesc(e.target.value)}
                  className="mt-1 text-sm rounded-lg" placeholder="Opcional" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Cor</Label>
              <div className="mt-1"><ColorPaletteGrid selected={ccColor} onSelect={setCcColor} /></div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border/20">
              <Button size="sm" onClick={saveCc} disabled={!ccName.trim()} className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white">Salvar</Button>
              <Button variant="ghost" size="sm" onClick={() => setCcDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
