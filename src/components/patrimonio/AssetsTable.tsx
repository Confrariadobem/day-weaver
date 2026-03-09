import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDateFormat } from "@/contexts/DateFormatContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Pencil, Trash2, Save, Eye, EyeOff, X,
  CalendarDays, ArrowUpDown, Home, Car, Gem,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export type AssetType = "imovel" | "veiculo" | "joia_outro";

const ASSET_TYPE_CONFIG: Record<AssetType, { label: string; icon: React.ReactNode; singularLabel: string }> = {
  imovel: { label: "Imóveis", icon: <Home className="h-4 w-4" />, singularLabel: "Imóvel" },
  veiculo: { label: "Veículos", icon: <Car className="h-4 w-4" />, singularLabel: "Veículo" },
  joia_outro: { label: "Joias/Outros", icon: <Gem className="h-4 w-4" />, singularLabel: "Bem" },
};

type SortField = "name" | "current_value" | "purchase_date";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "inactive";

interface Asset {
  id: string;
  user_id: string;
  asset_type: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  current_value: number;
  purchase_value: number | null;
  purchase_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AssetsTableProps {
  assetType: AssetType;
  totalValue: number;
  onTotalChange: () => void;
}

export default function AssetsTable({ assetType, onTotalChange }: AssetsTableProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { formatDate } = useDateFormat();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [fName, setFName] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fCurrentValue, setFCurrentValue] = useState("");
  const [fPurchaseValue, setFPurchaseValue] = useState("");
  const [fPurchaseDate, setFPurchaseDate] = useState<Date | undefined>();
  const [fPhotoUrl, setFPhotoUrl] = useState("");

  const config = ASSET_TYPE_CONFIG[assetType];

  const fetchAssets = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("patrimony_assets" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("asset_type", assetType);
    if (data) setAssets(data as any);
    setLoading(false);
  }, [user, assetType]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Listen for data changes
  useEffect(() => {
    const handler = () => fetchAssets();
    window.addEventListener("lovable:data-changed", handler);
    return () => window.removeEventListener("lovable:data-changed", handler);
  }, [fetchAssets]);

  const filtered = useMemo(() => {
    let result = assets;
    if (statusFilter === "active") result = result.filter(a => a.is_active);
    else if (statusFilter === "inactive") result = result.filter(a => !a.is_active);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || (a.description || "").toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name, "pt-BR");
      else if (sortField === "current_value") cmp = a.current_value - b.current_value;
      else if (sortField === "purchase_date") cmp = (a.purchase_date || "").localeCompare(b.purchase_date || "");
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [assets, statusFilter, searchQuery, sortField, sortDir]);

  const totalFiltered = useMemo(() => filtered.reduce((s, a) => s + a.current_value, 0), [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(a => a.id)));
  };

  const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const openNew = () => {
    setEditingAsset(null);
    setFName(""); setFDescription(""); setFCurrentValue(""); setFPurchaseValue("");
    setFPurchaseDate(undefined); setFPhotoUrl("");
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setFName(asset.name);
    setFDescription(asset.description || "");
    setFCurrentValue(String(asset.current_value));
    setFPurchaseValue(asset.purchase_value ? String(asset.purchase_value) : "");
    setFPurchaseDate(asset.purchase_date ? new Date(asset.purchase_date + "T12:00:00") : undefined);
    setFPhotoUrl(asset.photo_url || "");
    setModalOpen(true);
  };

  const saveAsset = async () => {
    if (!fName.trim() || !user) return;
    const data: any = {
      name: fName.trim(),
      description: fDescription || null,
      current_value: parseNum(fCurrentValue),
      purchase_value: fPurchaseValue ? parseNum(fPurchaseValue) : null,
      purchase_date: fPurchaseDate ? format(fPurchaseDate, "yyyy-MM-dd") : null,
      photo_url: fPhotoUrl || null,
      asset_type: assetType,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (editingAsset) {
      await supabase.from("patrimony_assets" as any).update(data).eq("id", editingAsset.id);
      toast({ title: "Bem atualizado" });
    } else {
      await supabase.from("patrimony_assets" as any).insert(data);
      toast({ title: "Bem cadastrado" });
    }
    setModalOpen(false);
    fetchAssets();
    onTotalChange();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const deleteAsset = async (id: string) => {
    await supabase.from("patrimony_assets" as any).delete().eq("id", id);
    toast({ title: "Bem excluído" });
    fetchAssets();
    onTotalChange();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("patrimony_assets" as any).update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
    fetchAssets();
    onTotalChange();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  // Batch actions
  const batchToggleActive = async (active: boolean) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    for (const id of ids) {
      await supabase.from("patrimony_assets" as any).update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", id);
    }
    setSelectedIds(new Set());
    fetchAssets();
    onTotalChange();
    toast({ title: `${ids.length} ben(s) ${active ? "ativado(s)" : "inativado(s)"}` });
  };

  const batchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    for (const id of ids) {
      await supabase.from("patrimony_assets" as any).delete().eq("id", id);
    }
    setSelectedIds(new Set());
    fetchAssets();
    onTotalChange();
    toast({ title: `${ids.length} ben(s) excluído(s)` });
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="py-2.5 px-2 cursor-pointer hover:text-primary transition-colors select-none"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn("h-3 w-3", sortField === field ? "text-primary" : "text-muted-foreground/40")} />
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative" style={{ width: isMobile ? 200 : 400 }}>
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-8 pr-8 text-xs rounded-lg"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => batchToggleActive(true)}>
                <Eye className="h-3 w-3" /> Ativar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => batchToggleActive(false)}>
                <EyeOff className="h-3 w-3" /> Inativar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={batchDelete}>
                <Trash2 className="h-3 w-3" /> Excluir ({selectedIds.size})
              </Button>
            </>
          )}
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openNew}>
            <Plus className="h-3 w-3" /> Novo {config.singularLabel}
          </Button>
        </div>
      </div>

      {/* Total */}
      <div className="text-xs text-muted-foreground">
        {filtered.length} ben(s) — Total: <span className="font-bold text-foreground">{brl(totalFiltered)}</span>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-auto border border-border/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="text-xs text-muted-foreground uppercase tracking-wider">
              <th className="py-2.5 px-2 w-8">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
              </th>
              <SortHeader field="name">Nome</SortHeader>
              <SortHeader field="current_value">Valor Atual</SortHeader>
              <SortHeader field="purchase_date">Data Compra</SortHeader>
              <th className="py-2.5 px-2">Status</th>
              <th className="py-2.5 px-2 w-24">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                  {loading ? "Carregando..." : "Nenhum bem cadastrado."}
                </td>
              </tr>
            ) : (
              filtered.map(asset => (
                <tr
                  key={asset.id}
                  className={cn(
                    "group transition-colors hover:bg-primary/5 border-t border-border/10",
                    !asset.is_active && "opacity-50"
                  )}
                >
                  <td className="py-2 px-2">
                    <Checkbox
                      checked={selectedIds.has(asset.id)}
                      onCheckedChange={() => toggleSelect(asset.id)}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      {asset.photo_url ? (
                        <img src={asset.photo_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted/30 flex items-center justify-center shrink-0 text-muted-foreground">
                          {config.icon}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{asset.name}</p>
                        {asset.description && (
                          <p className="text-[10px] text-muted-foreground truncate">{asset.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-sm font-bold text-foreground">{brl(asset.current_value)}</span>
                    {asset.purchase_value && asset.purchase_value > 0 && (
                      <p className={cn("text-[10px]",
                        asset.current_value >= asset.purchase_value ? "text-[hsl(var(--success))]" : "text-destructive"
                      )}>
                        {asset.current_value >= asset.purchase_value ? "+" : ""}
                        {brl(asset.current_value - asset.purchase_value)}
                      </p>
                    )}
                  </td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">
                    {asset.purchase_date ? formatDate(asset.purchase_date) : "—"}
                  </td>
                  <td className="py-2 px-2">
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      asset.is_active
                        ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {asset.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(asset)} className="p-1 hover:text-primary transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => toggleActive(asset.id, !asset.is_active)} className="p-1 hover:text-primary transition-colors">
                        {asset.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => deleteAsset(asset.id)} className="p-1 hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingAsset ? `Editar ${config.singularLabel}` : `Novo ${config.singularLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Nome *</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder={`Nome do ${config.singularLabel.toLowerCase()}`} />
            </div>
            <div>
              <Label className="text-sm">Descrição</Label>
              <Textarea value={fDescription} onChange={(e) => setFDescription(e.target.value)} placeholder="Detalhes..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Valor Atual (R$) *</Label>
                <Input value={fCurrentValue} onChange={(e) => setFCurrentValue(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-sm">Valor Compra (R$)</Label>
                <Input value={fPurchaseValue} onChange={(e) => setFPurchaseValue(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Data de Compra</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-sm", !fPurchaseDate && "text-muted-foreground")}>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    {fPurchaseDate ? format(fPurchaseDate, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fPurchaseDate} onSelect={setFPurchaseDate} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-sm">URL da Foto</Label>
              <Input value={fPhotoUrl} onChange={(e) => setFPhotoUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t border-border/20">
            {editingAsset && (
              <Button variant="outline" size="sm" className="text-destructive mr-auto" onClick={() => { deleteAsset(editingAsset.id); setModalOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveAsset} className="gap-1.5" disabled={!fName.trim()}>
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
