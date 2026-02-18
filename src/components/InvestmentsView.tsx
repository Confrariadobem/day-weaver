import { useState, useMemo, useEffect, useCallback } from "react";
import { useInvestments, useInvestment, useAddInvestment, type Investment } from "@/hooks/useInvestments";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, TrendingUp, TrendingDown, ArrowLeft, Trash2, Save, Search,
  PieChart as PieChartIcon, Wallet, Calendar, BarChart3, AlertTriangle,
  Edit, PiggyBank, Building2, Bitcoin, Coins, Eye, EyeOff, BadgeDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from "recharts";
import EventEditDialog from "@/components/calendar/EventEditDialog";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const INVESTMENT_TYPES = [
  { value: "stock", label: "Ações", icon: <TrendingUp className="h-5 w-5" /> },
  { value: "crypto", label: "Criptoativos", icon: <Bitcoin className="h-5 w-5" /> },
  { value: "etf", label: "ETFs", icon: <BarChart3 className="h-5 w-5" /> },
  { value: "fii", label: "FIIs", icon: <Building2 className="h-5 w-5" /> },
  { value: "other", label: "Outros", icon: <Coins className="h-5 w-5" /> },
  { value: "fixed_income", label: "Renda Fixa", icon: <PiggyBank className="h-5 w-5" /> },
];

const TYPE_COLORS: Record<string, string> = {
  stock: "#3b82f6", fii: "#22c55e", crypto: "#f59e0b",
  fixed_income: "#8b5cf6", etf: "#06b6d4", other: "#6b7280",
};

const getTypeLabel = (type: string) => INVESTMENT_TYPES.find(t => t.value === type)?.label || type;
const getTypeIcon = (type: string) => INVESTMENT_TYPES.find(t => t.value === type)?.icon || <Coins className="h-5 w-5" />;

export default function InvestmentsView() {
  const { user } = useAuth();
  const { investments, loading } = useInvestments();
  const { addInvestment, updateInvestment, deleteInvestment } = useAddInvestment();
  const cryptoPrices = useCryptoPrices();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Financial entries for investments
  const [investmentEntries, setInvestmentEntries] = useState<any[]>([]);
  const [showPaidEntries, setShowPaidEntries] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [entrySortField, setEntrySortField] = useState<string>("entry_date");

  const handleEntryEdit = (entry: any) => {
    // Open aporte dialog for editing - placeholder for future
    setAporteDialogOpen(true);
  };

  // Form state
  const [formStep, setFormStep] = useState(0);
  const [fType, setFType] = useState("stock");
  const [fName, setFName] = useState("");
  const [fTicker, setFTicker] = useState("");
  const [fQuantity, setFQuantity] = useState("");
  const [fPurchasePrice, setFPurchasePrice] = useState("");
  const [fCurrentPrice, setFCurrentPrice] = useState("");
  const [fPurchaseDate, setFPurchaseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [fNextDividend, setFNextDividend] = useState("");
  const [fDividendAmount, setFDividendAmount] = useState("");
  const [fNotes, setFNotes] = useState("");

  // FAB for adding aporte via Central de Lançamentos
  const [aporteDialogOpen, setAporteDialogOpen] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    const [entRes, catRes] = await Promise.all([
      supabase.from("financial_entries").select("*").eq("user_id", user.id).eq("type", "investment").order("entry_date", { ascending: false }),
      supabase.from("categories").select("*").eq("user_id", user.id),
    ]);
    // Also get entries linked to investments
    const { data: linkedEntries } = await supabase.from("financial_entries").select("*").eq("user_id", user.id).not("investment_id", "is", null).order("entry_date", { ascending: false });
    const allEntries = [...(entRes.data || [])];
    if (linkedEntries) {
      linkedEntries.forEach(le => {
        if (!allEntries.find(e => e.id === le.id)) allEntries.push(le);
      });
    }
    setInvestmentEntries(allEntries);
    if (catRes.data) setCategories(catRes.data);
  }, [user]);

  useEffect(() => {
    fetchEntries();
    const handleDataChanged = () => fetchEntries();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => window.removeEventListener("lovable:data-changed", handleDataChanged);
  }, [fetchEntries]);

  const resetForm = () => {
    setFormStep(0); setFType("stock"); setFName(""); setFTicker("");
    setFQuantity(""); setFPurchasePrice(""); setFCurrentPrice("");
    setFPurchaseDate(format(new Date(), "yyyy-MM-dd"));
    setFNextDividend(""); setFDividendAmount(""); setFNotes("");
    setEditingInv(null);
  };

  const openNew = () => { resetForm(); setFormOpen(true); };
  const openEdit = (inv: Investment) => {
    setEditingInv(inv);
    setFType(inv.type); setFName(inv.name); setFTicker(inv.ticker || "");
    setFQuantity(String(inv.quantity || 0)); setFPurchasePrice(String(inv.purchase_price || 0));
    setFCurrentPrice(String(inv.current_price || 0));
    setFPurchaseDate(inv.purchase_date || format(new Date(), "yyyy-MM-dd"));
    setFNextDividend(inv.next_dividend_date || "");
    setFDividendAmount(String(inv.dividend_amount || 0));
    setFNotes(inv.notes || "");
    setFormStep(1);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim()) return;
    const data = {
      name: fName.trim(), ticker: fTicker || undefined, type: fType,
      quantity: parseFloat(fQuantity) || 0,
      purchase_price: parseFloat(fPurchasePrice) || 0,
      current_price: parseFloat(fCurrentPrice) || 0,
      purchase_date: fPurchaseDate || undefined,
      next_dividend_date: fNextDividend || undefined,
      dividend_amount: parseFloat(fDividendAmount) || 0,
      notes: fNotes || undefined,
    };
    if (editingInv) {
      await updateInvestment(editingInv.id, data as any);
    } else {
      await addInvestment(data);
    }
    resetForm(); setFormOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteInvestment(id);
    if (selectedId === id) setSelectedId(null);
    setDeleteConfirm(null);
  };

  // ─── Dashboard metrics ───
  const metrics = useMemo(() => {
    const active = investments.filter(i => i.is_active);
    const totalInvested = active.reduce((s, i) => s + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);
    const totalCurrent = active.reduce((s, i) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
    const profitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

    const allocationMap: Record<string, number> = {};
    active.forEach(i => {
      const val = (Number(i.current_price) || 0) * (Number(i.quantity) || 0);
      allocationMap[i.type] = (allocationMap[i.type] || 0) + val;
    });
    const allocation = Object.entries(allocationMap).map(([type, value]) => ({
      name: getTypeLabel(type), value, color: TYPE_COLORS[type] || "#6b7280",
    }));

    const top3 = [...active]
      .sort((a, b) => ((Number(b.current_price) || 0) * (Number(b.quantity) || 0)) - ((Number(a.current_price) || 0) * (Number(a.quantity) || 0)))
      .slice(0, 3);

    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    const upcomingDividends = active.filter(i => {
      if (!i.next_dividend_date) return false;
      const d = new Date(i.next_dividend_date);
      return d >= now && d <= weekEnd;
    });

    const alerts = active.filter(i => {
      const pp = Number(i.purchase_price) || 0;
      const cp = Number(i.current_price) || 0;
      return pp > 0 && ((cp - pp) / pp) < -0.05;
    });

    return { totalInvested, totalCurrent, profitPct, allocation, top3, upcomingDividends, alerts };
  }, [investments]);

  // Filtered investments
  const filteredInvestments = useMemo(() => {
    let list = investments;
    if (filterType !== "all") list = list.filter(i => i.type === filterType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.ticker || "").toLowerCase().includes(q));
    }
    return list;
  }, [investments, filterType, searchQuery]);

  // Filtered entries for the list
  const filteredEntries = useMemo(() => {
    let entries = investmentEntries;
    if (filterType !== "all") {
      const invIds = investments.filter(i => i.type === filterType).map(i => i.id);
      entries = entries.filter(e => e.investment_id && invIds.includes(e.investment_id));
    }
    return entries;
  }, [investmentEntries, filterType, investments]);

  const pendingEntries = filteredEntries.filter(e => !e.is_paid);
  const paidEntries = filteredEntries.filter(e => e.is_paid);

  // Bullet chart: invested vs current
  const investBullet = useMemo(() => {
    const invested = metrics.totalInvested;
    const current = metrics.totalCurrent;
    const profit = current - invested;
    const maxVal = Math.max(invested, current, 1);
    return { invested, current, profit, maxVal };
  }, [metrics]);

  // ─── Detail view ───
  if (selectedId) {
    return <InvestmentDetail
      id={selectedId}
      onBack={() => setSelectedId(null)}
      onEdit={(inv) => openEdit(inv)}
      onDelete={(id) => setDeleteConfirm(id)}
      userId={user?.id || ""}
    />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Type filter buttons + Bullet Chart */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border/30 overflow-x-auto">
        {INVESTMENT_TYPES.map(t => (
          <Button key={t.value} size="sm"
            variant={filterType === t.value ? "default" : "ghost"}
            className={cn("h-7 text-xs px-3 rounded-full gap-1.5", filterType !== t.value && "text-muted-foreground")}
            onClick={() => setFilterType(t.value)}
          >
            {t.icon} {t.label}
          </Button>
        ))}
        <Button size="sm"
          variant={filterType === "all" ? "default" : "ghost"}
          className={cn("h-7 text-xs px-3 rounded-full gap-1.5", filterType !== "all" && "text-muted-foreground")}
          onClick={() => setFilterType("all")}
        >Todos</Button>
        <div className="ml-auto flex items-center gap-3">
          {/* Bullet Chart - invested vs current */}
          <div className="flex items-center gap-3" style={{ width: 180, height: 40 }}>
            <div className="flex-1 relative h-full flex flex-col justify-center gap-0.5">
              <div className="relative h-3 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-[hsl(var(--success))]"
                  style={{ width: `${Math.min(100, (investBullet.current / investBullet.maxVal) * 100)}%` }}
                />
                <div
                  className="absolute top-0 h-full w-[2px] bg-primary"
                  style={{ left: `${Math.min(100, (investBullet.invested / investBullet.maxVal) * 100)}%` }}
                />
              </div>
              <span className={cn(
                "text-[11px] font-bold tabular-nums",
                investBullet.profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
              )}>
                {investBullet.profit >= 0 ? "+" : ""}{brl(investBullet.profit)}
              </span>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar ativo..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-8 text-xs w-40" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="p-4 border-b border-border/30 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Patrimônio Total
              </p>
              <p className="text-lg font-bold text-foreground">{brl(metrics.totalCurrent)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Investido</p>
              <p className="text-lg font-bold text-foreground">{brl(metrics.totalInvested)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rentabilidade</p>
              <p className={cn("text-lg font-bold", metrics.profitPct >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {metrics.profitPct >= 0 ? "+" : ""}{metrics.profitPct.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ativos</p>
              <p className="text-lg font-bold text-foreground">{investments.filter(i => i.is_active).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Crypto multi-currency display */}
        {(() => {
          const cryptoInvestments = investments.filter(i => i.type === "crypto" && i.is_active);
          if (cryptoInvestments.length === 0 && filterType !== "crypto") return null;
          const totalCryptoBrl = cryptoInvestments.reduce((s, i) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
          return (
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Bitcoin className="h-3.5 w-3.5 text-warning" /> Criptoativos — Multi-moeda
                </p>
                {cryptoPrices.loading ? (
                  <p className="text-xs text-muted-foreground">Carregando cotações...</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-accent/50 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase">BRL</p>
                        <p className="text-sm font-bold">{brl(totalCryptoBrl)}</p>
                      </div>
                      <div className="rounded-lg bg-accent/50 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase">USD</p>
                        <p className="text-sm font-bold">$ {cryptoPrices.convertToUsd(totalCryptoBrl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div className="rounded-lg bg-accent/50 p-2">
                        <p className="text-[10px] text-muted-foreground uppercase">BTC</p>
                        <p className="text-sm font-bold">₿ {cryptoPrices.convertToBtc(totalCryptoBrl).toFixed(6)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>BTC: $ {cryptoPrices.btcUsd.toLocaleString("en-US")} | R$ {cryptoPrices.btcBrl.toLocaleString("pt-BR")}</span>
                      <span>USD/BRL: {cryptoPrices.usdBrl.toFixed(2)}</span>
                      {cryptoPrices.lastUpdated && <span className="ml-auto">Atualizado: {cryptoPrices.lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Secondary row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <PieChartIcon className="h-3.5 w-3.5 text-primary" /> Alocação
              </p>
              {metrics.allocation.length > 0 ? (
                <div className="flex items-center gap-3">
                  <ResponsiveContainer width={80} height={80}>
                    <PieChart>
                      <Pie data={metrics.allocation} dataKey="value" cx="50%" cy="50%" outerRadius={35} innerRadius={18} strokeWidth={1}>
                        {metrics.allocation.map((a, i) => <Cell key={i} fill={a.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1">
                    {metrics.allocation.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="text-muted-foreground">{a.name}</span>
                        <span className="font-medium text-foreground ml-auto">{brl(a.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground">Nenhum ativo</p>}
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" /> Top 3 Ativos
              </p>
              <div className="space-y-2">
                {metrics.top3.map((inv, i) => {
                  const profit = Number(inv.purchase_price) > 0
                    ? ((Number(inv.current_price) - Number(inv.purchase_price)) / Number(inv.purchase_price)) * 100
                    : 0;
                  return (
                    <div key={inv.id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-medium truncate flex-1">{inv.ticker || inv.name}</span>
                      <span className={cn("font-medium", profit >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                        {profit >= 0 ? "+" : ""}{profit.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
                {metrics.top3.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Alertas
              </p>
              <div className="space-y-1.5">
                {metrics.upcomingDividends.map(inv => (
                  <div key={`div-${inv.id}`} className="text-[10px] text-[hsl(var(--success))] flex items-center gap-1">
                    <TrendingUp className="h-2.5 w-2.5" /> Dividendo: {inv.ticker || inv.name} - {brl(Number(inv.dividend_amount))}
                  </div>
                ))}
                {metrics.alerts.map(inv => {
                  const drop = ((Number(inv.current_price) - Number(inv.purchase_price)) / Number(inv.purchase_price)) * 100;
                  return (
                    <div key={`alert-${inv.id}`} className="text-[10px] text-destructive flex items-center gap-1">
                      <TrendingDown className="h-2.5 w-2.5" /> {inv.ticker || inv.name} caiu {Math.abs(drop).toFixed(1)}%
                    </div>
                  );
                })}
                {metrics.upcomingDividends.length === 0 && metrics.alerts.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum alerta</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Entries list + Investment cards */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* ── Financial entries list (like Finanças module) ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <BadgeDollarSign className="h-4 w-4 text-primary" /> Lançamentos de Investimentos
              </p>
              <span className="text-[10px] text-muted-foreground">
                {filteredEntries.length} lançamento{filteredEntries.length !== 1 ? "s" : ""}
              </span>
            </div>
            {pendingEntries.length === 0 && paidEntries.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <BadgeDollarSign className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Nenhum lançamento de investimento encontrado.</p>
                <p className="text-[10px] mt-1">Use a Central de Lançamentos para registrar aportes.</p>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden border border-border/20">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground/60 uppercase tracking-wider border-b border-border/20 bg-muted/30">
                      <th className="text-left py-2 px-2">Data</th>
                      <th className="text-left py-2 px-2">Título</th>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-left py-2 px-2">Categoria</th>
                      <th className="text-right py-2 px-2">Valor</th>
                      <th className="text-center py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingEntries.map(e => {
                      const cat = categories.find(c => c.id === e.category_id);
                      const isOverdue = !e.is_paid && new Date(e.entry_date) < new Date();
                      const inv = investments.find(i => i.id === e.investment_id);
                      return (
                        <tr key={e.id}
                          className={cn(
                            "border-b border-border/10 transition-colors hover:bg-accent/30",
                            isOverdue && "bg-destructive/5"
                          )}
                        >
                          <td className="py-2 px-2 text-xs">{format(new Date(e.entry_date), "dd/MM/yy")}</td>
                          <td className="py-2 px-2 text-xs font-medium truncate max-w-[200px]">
                            {e.title}
                            {inv && <span className="text-[10px] text-muted-foreground ml-1">({inv.ticker || inv.name})</span>}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {e.type === "investment" ? "Aporte" : e.type === "revenue" ? "Receita" : "Despesa"}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{cat?.name || "—"}</td>
                          <td className={cn("py-2 px-2 text-xs text-right font-medium",
                            e.type === "revenue" ? "text-[hsl(var(--success))]" : "text-destructive"
                          )}>
                            {e.type === "revenue" ? "+" : "-"}{brl(Number(e.amount))}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                              isOverdue ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                            )}>
                              {isOverdue ? "Atrasado" : "Pendente"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Paid entries section */}
                {paidEntries.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowPaidEntries(!showPaidEntries)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                    >
                      {showPaidEntries ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {paidEntries.length} lançamento{paidEntries.length !== 1 ? "s" : ""} baixado{paidEntries.length !== 1 ? "s" : ""}
                    </button>
                    {showPaidEntries && (
                      <table className="w-full text-sm mt-1">
                        <tbody>
                          {paidEntries.map(e => {
                            const cat = categories.find(c => c.id === e.category_id);
                            const inv = investments.find(i => i.id === e.investment_id);
                            return (
                              <tr key={e.id} className="border-b border-border/10 opacity-60">
                                <td className="py-2 px-2 text-xs">{format(new Date(e.entry_date), "dd/MM/yy")}</td>
                                <td className="py-2 px-2 text-xs font-medium truncate max-w-[200px]">
                                  {e.title}
                                  {inv && <span className="text-[10px] text-muted-foreground ml-1">({inv.ticker || inv.name})</span>}
                                </td>
                                <td className="py-2 px-2 text-xs text-muted-foreground">
                                  {e.type === "investment" ? "Aporte" : e.type === "revenue" ? "Receita" : "Despesa"}
                                </td>
                                <td className="py-2 px-2 text-xs text-muted-foreground">{cat?.name || "—"}</td>
                                <td className={cn("py-2 px-2 text-xs text-right font-medium",
                                  e.type === "revenue" ? "text-[hsl(var(--success))]" : "text-destructive"
                                )}>
                                  {e.type === "revenue" ? "+" : "-"}{brl(Number(e.amount))}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">Pago</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Investment Cards Grid */}
          <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredInvestments.map(inv => {
              const totalInvested = (Number(inv.purchase_price) || 0) * (Number(inv.quantity) || 0);
              const totalCurrent = (Number(inv.current_price) || 0) * (Number(inv.quantity) || 0);
              const profitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
              const isPositive = profitPct >= 0;

              return (
                <Card key={inv.id} onClick={() => setSelectedId(inv.id)} className="cursor-pointer transition-all hover:shadow-md group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-primary shrink-0">{getTypeIcon(inv.type)}</span>
                          <h4 className="text-sm font-semibold truncate">{inv.name}</h4>
                        </div>
                        {inv.ticker && <p className="text-[10px] text-muted-foreground mt-0.5">{inv.ticker}</p>}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: TYPE_COLORS[inv.type], color: TYPE_COLORS[inv.type] }}>
                        {getTypeLabel(inv.type)}
                      </Badge>
                    </div>

                    <div className="space-y-1.5 mt-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Qtd</span>
                        <span className="font-medium">{Number(inv.quantity)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Preço Médio</span>
                        <span className="font-medium">{brl(Number(inv.purchase_price))}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Valor Atual</span>
                        <span className="font-medium">{brl(Number(inv.current_price))}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
                      <span className="text-xs font-semibold">{brl(totalCurrent)}</span>
                      <div className={cn("flex items-center gap-1 text-xs font-medium", isPositive ? "text-[hsl(var(--success))]" : "text-destructive")}>
                        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {isPositive ? "+" : ""}{profitPct.toFixed(2)}%
                      </div>
                    </div>

                    {inv.type === "crypto" && !cryptoPrices.loading && (
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span>$ {cryptoPrices.convertToUsd(totalCurrent).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                        <span>₿ {cryptoPrices.convertToBtc(totalCurrent).toFixed(6)}</span>
                      </div>
                    )}

                    {inv.purchase_date && (
                      <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" /> {format(new Date(inv.purchase_date), "dd/MM/yyyy")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {filteredInvestments.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum investimento encontrado</p>
              <p className="text-xs mt-1">Use o botão + para adicionar seu primeiro ativo.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Add/Edit Investment Dialog - Wizard */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingInv ? "Editar Investimento" : "Novo Investimento"}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {formStep === 0 ? "Selecione o tipo do ativo" : "Preencha os dados do investimento"}
            </DialogDescription>
          </DialogHeader>

          {formStep === 0 && !editingInv ? (
            <div className="grid grid-cols-2 gap-2">
              {INVESTMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setFType(t.value); setFormStep(1); }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-md",
                    fType === t.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="text-primary">{t.icon}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-primary">{getTypeIcon(fType)}</span>
                <Badge variant="outline" style={{ borderColor: TYPE_COLORS[fType], color: TYPE_COLORS[fType] }}>
                  {getTypeLabel(fType)}
                </Badge>
                {!editingInv && (
                  <button onClick={() => setFormStep(0)} className="text-xs text-primary hover:underline ml-auto">Alterar tipo</button>
                )}
              </div>

              <div>
                <Label className="text-sm">Nome do Ativo</Label>
                <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ex: Petrobras, Bitcoin..." />
              </div>
              <div>
                <Label className="text-sm">Ticker (opcional)</Label>
                <Input value={fTicker} onChange={(e) => setFTicker(e.target.value.toUpperCase())} placeholder="Ex: PETR4, BTC" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Quantidade</Label>
                  <Input type="number" step="any" value={fQuantity} onChange={(e) => setFQuantity(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-sm">Preço de Compra</Label>
                  <Input type="number" step="0.01" value={fPurchasePrice} onChange={(e) => setFPurchasePrice(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Preço Atual</Label>
                  <Input type="number" step="0.01" value={fCurrentPrice} onChange={(e) => setFCurrentPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-sm">Data de Compra</Label>
                  <Input type="date" value={fPurchaseDate} onChange={(e) => setFPurchaseDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Próx. Dividendo</Label>
                  <Input type="date" value={fNextDividend} onChange={(e) => setFNextDividend(e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Valor Dividendo</Label>
                  <Input type="number" step="0.01" value={fDividendAmount} onChange={(e) => setFDividendAmount(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Observações</Label>
                <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Opcional" rows={2} className="resize-none" />
              </div>
            </div>
          )}

          {formStep === 1 && (
            <div className="flex items-center gap-2 pt-3 border-t border-border/20">
              {editingInv && (
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setDeleteConfirm(editingInv.id); setFormOpen(false); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={() => { setFormOpen(false); resetForm(); }}>Cancelar</Button>
                <Button size="sm" onClick={handleSave} className="gap-1.5" disabled={!fName.trim()}>
                  <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 pt-3 border-t border-border/20">
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Excluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Investment Detail View ───
function InvestmentDetail({ id, onBack, onEdit, onDelete, userId }: {
  id: string; onBack: () => void; onEdit: (inv: Investment) => void;
  onDelete: (id: string) => void; userId: string;
}) {
  const { investment, entries, loading } = useInvestment(id);
  const [aporteOpen, setAporteOpen] = useState(false);

  if (loading || !investment) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const totalInvested = (Number(investment.purchase_price) || 0) * (Number(investment.quantity) || 0);
  const totalCurrent = (Number(investment.current_price) || 0) * (Number(investment.quantity) || 0);
  const profitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
  const profitValue = totalCurrent - totalInvested;
  const isPositive = profitPct >= 0;

  const chartData = entries
    .filter(e => e.type === "investment" || e.type === "expense" || e.type === "revenue")
    .map(e => ({
      date: format(new Date(e.entry_date), "dd/MM"),
      value: Number(e.amount),
    }))
    .reverse();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border/30">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-primary">{getTypeIcon(investment.type)}</span>
              <h2 className="text-lg font-bold truncate">{investment.name}</h2>
              {investment.ticker && <Badge variant="outline" className="text-xs">{investment.ticker}</Badge>}
            </div>
            <Badge variant="outline" className="text-[10px] mt-1" style={{ borderColor: TYPE_COLORS[investment.type], color: TYPE_COLORS[investment.type] }}>
              {getTypeLabel(investment.type)}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onEdit(investment)} className="gap-1.5">
              <Edit className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAporteOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Aporte
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg bg-accent p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Valor Atual</p>
            <p className="text-base font-bold">{brl(totalCurrent)}</p>
          </div>
          <div className="rounded-lg bg-accent p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Investido</p>
            <p className="text-base font-bold">{brl(totalInvested)}</p>
          </div>
          <div className="rounded-lg bg-accent p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Lucro/Prejuízo</p>
            <p className={cn("text-base font-bold", isPositive ? "text-[hsl(var(--success))]" : "text-destructive")}>
              {isPositive ? "+" : ""}{brl(profitValue)}
            </p>
          </div>
          <div className="rounded-lg bg-accent p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Rentabilidade</p>
            <div className={cn("flex items-center justify-center gap-1 text-base font-bold", isPositive ? "text-[hsl(var(--success))]" : "text-destructive")}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {isPositive ? "+" : ""}{profitPct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {chartData.length > 1 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-2">Histórico de Movimentações</p>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {investment.next_dividend_date && Number(investment.dividend_amount) > 0 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Próximos Dividendos
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{format(new Date(investment.next_dividend_date), "dd/MM/yyyy")}</span>
                  <span className="font-medium text-[hsl(var(--success))]">{brl(Number(investment.dividend_amount))}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-primary" /> Histórico de Aportes/Retiradas
              </p>
              {entries.length > 0 ? (
                <div className="space-y-2">
                  {entries.map(e => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-2 bg-accent/30 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{e.title}</p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(e.entry_date), "dd/MM/yyyy")}</p>
                      </div>
                      <span className={cn("font-medium", e.type === "revenue" ? "text-[hsl(var(--success))]" : "text-destructive")}>
                        {e.type === "revenue" ? "+" : "-"}{brl(Number(e.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
              )}
            </CardContent>
          </Card>

          {investment.notes && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-1">Observações</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{investment.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><span className="font-medium">{Number(investment.quantity)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Preço Médio</span><span className="font-medium">{brl(Number(investment.purchase_price))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Preço Atual</span><span className="font-medium">{brl(Number(investment.current_price))}</span></div>
              {investment.purchase_date && (
                <div className="flex justify-between"><span className="text-muted-foreground">Data de Compra</span><span className="font-medium">{format(new Date(investment.purchase_date), "dd/MM/yyyy")}</span></div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <EventEditDialog
        open={aporteOpen}
        onOpenChange={setAporteOpen}
        item={null}
        defaultDate={new Date()}
        userId={userId}
        onSaved={() => {}}
        defaultEventType="investment"
      />
    </div>
  );
}
