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
  Plus, Search, Pencil, Trash2, Save, X, Copy,
  CalendarDays, CalendarRange, ArrowUpDown,
} from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export type InvestmentTypeFilter = "stock" | "crypto" | "etf" | "fixed_income" | "other" | "fii";

type SortField = "trade_date" | "ticker" | "quantity" | "unit_price" | "total_value" | "profit_loss" | "profit_pct";
type SortDir = "asc" | "desc";
type TradeTypeFilter = "all" | "buy" | "sell";

interface Trade {
  id: string;
  user_id: string;
  investment_type: string;
  trade_date: string;
  ticker: string;
  asset_name: string | null;
  trade_type: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  fee: number | null;
  broker: string | null;
  profit_loss: number | null;
  profit_pct: number | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TradesTableProps {
  investmentType: InvestmentTypeFilter;
}

export default function TradesTable({ investmentType }: TradesTableProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { formatDate } = useDateFormat();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tradeTypeFilter, setTradeTypeFilter] = useState<TradeTypeFilter>("all");
  const [sortField, setSortField] = useState<SortField>("trade_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Date filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [fTradeDate, setFTradeDate] = useState<Date | undefined>(new Date());
  const [fTicker, setFTicker] = useState("");
  const [fAssetName, setFAssetName] = useState("");
  const [fTradeType, setFTradeType] = useState<"buy" | "sell">("buy");
  const [fQuantity, setFQuantity] = useState("");
  const [fUnitPrice, setFUnitPrice] = useState("");
  const [fFee, setFFee] = useState("");
  const [fBroker, setFBroker] = useState("");
  const [fProfitLoss, setFProfitLoss] = useState("");
  const [fProfitPct, setFProfitPct] = useState("");
  const [fStatus, setFStatus] = useState<"realizado" | "pendente">("realizado");
  const [fNotes, setFNotes] = useState("");

  const fetchTrades = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("investment_trades" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("investment_type", investmentType);
    if (data) setTrades(data as any);
    setLoading(false);
  }, [user, investmentType]);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);
  useEffect(() => {
    const handler = () => fetchTrades();
    window.addEventListener("lovable:data-changed", handler);
    return () => window.removeEventListener("lovable:data-changed", handler);
  }, [fetchTrades]);

  const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const parseDMY = (s: string): Date | null => {
    const parts = s.split("/");
    if (parts.length !== 3) return null;
    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return isNaN(d.getTime()) ? null : d;
  };

  const normalizeDateInput = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const handleIntervalSelect = (range: any) => {
    if (range?.from) { setCustomFrom(range.from); setDateFrom(format(range.from, "dd/MM/yyyy")); }
    if (range?.to) { setCustomTo(range.to); setDateTo(format(range.to, "dd/MM/yyyy")); }
  };

  const handleClearInterval = () => {
    setDateFrom(""); setDateTo("");
    setCustomFrom(undefined); setCustomTo(undefined);
    setIntervalOpen(false);
  };

  const filtered = useMemo(() => {
    let result = [...trades];
    if (tradeTypeFilter !== "all") result = result.filter(t => t.trade_type === tradeTypeFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.ticker.toLowerCase().includes(q) ||
        (t.asset_name || "").toLowerCase().includes(q) ||
        (t.broker || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q)
      );
    }
    // Date filter
    if (dateFrom) {
      const d = parseDMY(dateFrom);
      if (d) result = result.filter(t => new Date(t.trade_date + "T12:00:00") >= d);
    }
    if (dateTo) {
      const d = parseDMY(dateTo);
      if (d) result = result.filter(t => new Date(t.trade_date + "T12:00:00") <= d);
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "trade_date": cmp = a.trade_date.localeCompare(b.trade_date); break;
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "quantity": cmp = a.quantity - b.quantity; break;
        case "unit_price": cmp = a.unit_price - b.unit_price; break;
        case "total_value": cmp = a.total_value - b.total_value; break;
        case "profit_loss": cmp = (a.profit_loss || 0) - (b.profit_loss || 0); break;
        case "profit_pct": cmp = (a.profit_pct || 0) - (b.profit_pct || 0); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [trades, tradeTypeFilter, searchQuery, dateFrom, dateTo, sortField, sortDir]);

  const totalProfitLoss = useMemo(() => filtered.reduce((s, t) => s + (t.profit_loss || 0), 0), [filtered]);
  const totalValue = useMemo(() => filtered.reduce((s, t) => s + (t.total_value || 0), 0), [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(t => t.id)));
  };

  const openNew = () => {
    setEditingTrade(null);
    setFTradeDate(new Date()); setFTicker(""); setFAssetName(""); setFTradeType("buy");
    setFQuantity(""); setFUnitPrice(""); setFFee(""); setFBroker("");
    setFProfitLoss(""); setFProfitPct(""); setFStatus("realizado"); setFNotes("");
    setModalOpen(true);
  };

  const openEdit = (trade: Trade) => {
    setEditingTrade(trade);
    setFTradeDate(new Date(trade.trade_date + "T12:00:00"));
    setFTicker(trade.ticker);
    setFAssetName(trade.asset_name || "");
    setFTradeType(trade.trade_type as "buy" | "sell");
    setFQuantity(String(trade.quantity));
    setFUnitPrice(String(trade.unit_price));
    setFFee(trade.fee ? String(trade.fee) : "");
    setFBroker(trade.broker || "");
    setFProfitLoss(trade.profit_loss ? String(trade.profit_loss) : "");
    setFProfitPct(trade.profit_pct ? String(trade.profit_pct) : "");
    setFStatus((trade.status || "realizado") as "realizado" | "pendente");
    setFNotes(trade.notes || "");
    setModalOpen(true);
  };

  const duplicateTrade = (trade: Trade) => {
    setEditingTrade(null);
    setFTradeDate(new Date());
    setFTicker(trade.ticker);
    setFAssetName(trade.asset_name || "");
    setFTradeType(trade.trade_type as "buy" | "sell");
    setFQuantity(String(trade.quantity));
    setFUnitPrice(String(trade.unit_price));
    setFFee(trade.fee ? String(trade.fee) : "");
    setFBroker(trade.broker || "");
    setFProfitLoss(""); setFProfitPct("");
    setFStatus("realizado"); setFNotes("");
    setModalOpen(true);
  };

  const saveTrade = async () => {
    if (!fTicker.trim() || !user) return;
    const data: any = {
      ticker: fTicker.trim().toUpperCase(),
      asset_name: fAssetName || null,
      trade_date: fTradeDate ? format(fTradeDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      trade_type: fTradeType,
      quantity: parseNum(fQuantity),
      unit_price: parseNum(fUnitPrice),
      fee: fFee ? parseNum(fFee) : 0,
      broker: fBroker || null,
      profit_loss: fProfitLoss ? parseNum(fProfitLoss) : 0,
      profit_pct: fProfitPct ? parseNum(fProfitPct) : 0,
      status: fStatus,
      notes: fNotes || null,
      investment_type: investmentType,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (editingTrade) {
      await supabase.from("investment_trades" as any).update(data).eq("id", editingTrade.id);
      toast({ title: "Trade atualizado" });
    } else {
      await supabase.from("investment_trades" as any).insert(data);
      toast({ title: "Trade registrado" });
    }
    setModalOpen(false);
    fetchTrades();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const deleteTrade = async (id: string) => {
    await supabase.from("investment_trades" as any).delete().eq("id", id);
    toast({ title: "Trade excluído" });
    fetchTrades();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const batchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    for (const id of ids) {
      await supabase.from("investment_trades" as any).delete().eq("id", id);
    }
    setSelectedIds(new Set());
    fetchTrades();
    toast({ title: `${ids.length} trade(s) excluído(s)` });
  };

  const SortHeader = ({ field, children, className: cls }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th className={cn("py-2.5 px-2 cursor-pointer hover:text-primary transition-colors select-none", cls)} onClick={() => toggleSort(field)}>
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
        <div className="relative" style={{ width: isMobile ? 180 : 300 }}>
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar ticker, ativo, corretora..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-8 pr-8 text-xs rounded-lg" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={tradeTypeFilter} onValueChange={(v) => setTradeTypeFilter(v as TradeTypeFilter)}>
          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="buy">Compra</SelectItem>
            <SelectItem value="sell">Venda</SelectItem>
          </SelectContent>
        </Select>

        {/* Intervalo */}
        <Popover open={intervalOpen} onOpenChange={setIntervalOpen}>
          <PopoverTrigger asChild>
            <button className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1 transition-all duration-200 shrink-0",
              (dateFrom || dateTo) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/80 hover:bg-primary/5"
            )}>
              <CalendarRange className="size-3.5" />
              <span className="text-xs font-medium">Período</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 bg-background border rounded-lg shadow-lg p-3 space-y-3" align="start">
            <Calendar mode="range" locale={ptBR} showOutsideDays={false}
              selected={{ from: customFrom, to: customTo }}
              onSelect={handleIntervalSelect}
              className="pointer-events-auto" />
            <div className="space-y-2 border-t border-border/30 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-8 shrink-0">De:</span>
                <Input value={dateFrom} onChange={(e) => setDateFrom(normalizeDateInput(e.target.value))}
                  onBlur={() => { const d = parseDMY(dateFrom); if (d) { setCustomFrom(d); setDateFrom(format(d, "dd/MM/yyyy")); } }}
                  placeholder="DD/MM/YYYY" className="h-10 text-sm" style={{ width: 130 }} maxLength={10} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-8 shrink-0">Até:</span>
                <Input value={dateTo} onChange={(e) => setDateTo(normalizeDateInput(e.target.value))}
                  onBlur={() => { const d = parseDMY(dateTo); if (d) { setCustomTo(d); setDateTo(format(d, "dd/MM/yyyy")); } }}
                  placeholder="DD/MM/YYYY" className="h-10 text-sm" style={{ width: 130 }} maxLength={10} />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleClearInterval}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors duration-200"
                style={{ minWidth: 80, height: 32 }}>Limpar</button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={batchDelete}>
              <Trash2 className="h-3 w-3" /> Excluir ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openNew}>
            <Plus className="h-3 w-3" /> Novo Trade
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-auto border border-border/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="text-xs text-muted-foreground uppercase tracking-wider">
              <th className="py-2.5 px-2 w-8">
                <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={toggleAll} />
              </th>
              <SortHeader field="trade_date">Data</SortHeader>
              <SortHeader field="ticker">Ativo</SortHeader>
              <th className="py-2.5 px-2">Tipo</th>
              <SortHeader field="quantity">Qtd</SortHeader>
              <SortHeader field="unit_price">Preço Unit.</SortHeader>
              <SortHeader field="total_value">Total</SortHeader>
              <th className="py-2.5 px-2">Taxa</th>
              <th className="py-2.5 px-2">Corretora</th>
              <SortHeader field="profit_loss">Lucro/Prejuízo</SortHeader>
              <SortHeader field="profit_pct">%</SortHeader>
              <th className="py-2.5 px-2">Status</th>
              <th className="py-2.5 px-2">Notas</th>
              <th className="py-2.5 px-2 w-24">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={14} className="text-center py-8 text-xs text-muted-foreground">
                  {loading ? "Carregando..." : "Nenhum trade registrado."}
                </td>
              </tr>
            ) : (
              filtered.map(trade => (
                <tr key={trade.id} className="group transition-colors hover:bg-primary/5 border-t border-border/10">
                  <td className="py-2 px-2">
                    <Checkbox checked={selectedIds.has(trade.id)} onCheckedChange={() => toggleSelect(trade.id)} />
                  </td>
                  <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(trade.trade_date)}
                  </td>
                  <td className="py-2 px-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{trade.ticker}</p>
                      {trade.asset_name && <p className="text-[10px] text-muted-foreground truncate">{trade.asset_name}</p>}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      trade.trade_type === "buy"
                        ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                        : "bg-destructive/10 text-destructive"
                    )}>
                      {trade.trade_type === "buy" ? "Compra" : "Venda"}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs tabular-nums">{trade.quantity}</td>
                  <td className="py-2 px-2 text-xs tabular-nums">{brl(trade.unit_price)}</td>
                  <td className="py-2 px-2 text-sm font-bold text-foreground tabular-nums">{brl(trade.total_value)}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground tabular-nums">{trade.fee ? brl(trade.fee) : "—"}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground truncate max-w-[100px]">{trade.broker || "—"}</td>
                  <td className="py-2 px-2">
                    <span className={cn(
                      "text-sm font-bold tabular-nums",
                      (trade.profit_loss || 0) >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                    )}>
                      {(trade.profit_loss || 0) >= 0 ? "+" : ""}{brl(trade.profit_loss || 0)}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <span className={cn(
                      "text-xs font-medium tabular-nums",
                      (trade.profit_pct || 0) >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
                    )}>
                      {(trade.profit_pct || 0) >= 0 ? "+" : ""}{(trade.profit_pct || 0).toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      trade.status === "realizado"
                        ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                        : "bg-warning/10 text-warning"
                    )}>
                      {trade.status === "realizado" ? "Realizado" : "Pendente"}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-[10px] text-muted-foreground truncate max-w-[80px]">{trade.notes || "—"}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(trade)} className="p-1 hover:text-primary transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => duplicateTrade(trade)} className="p-1 hover:text-muted-foreground transition-colors">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteTrade(trade.id)} className="p-1 hover:text-destructive transition-colors">
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

      {/* Footer totals */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-2 py-2 rounded-lg bg-muted/20 border border-border/20 text-xs">
          <span className="text-muted-foreground">{filtered.length} trade(s) — Volume: <span className="font-bold text-foreground">{brl(totalValue)}</span></span>
          <span className={cn("font-bold", totalProfitLoss >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
            Resultado: {totalProfitLoss >= 0 ? "+" : ""}{brl(totalProfitLoss)}
          </span>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTrade ? "Editar Trade" : "Novo Trade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Ticker *</Label>
                <Input value={fTicker} onChange={(e) => setFTicker(e.target.value.toUpperCase())} placeholder="Ex: PETR4, BTC" />
              </div>
              <div>
                <Label className="text-sm">Nome do Ativo</Label>
                <Input value={fAssetName} onChange={(e) => setFAssetName(e.target.value)} placeholder="Petrobras PN" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Tipo Operação *</Label>
                <Select value={fTradeType} onValueChange={(v) => setFTradeType(v as "buy" | "sell")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Compra</SelectItem>
                    <SelectItem value="sell">Venda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Data Operação</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9 text-sm", !fTradeDate && "text-muted-foreground")}>
                      <CalendarDays className="h-4 w-4 mr-2" />
                      {fTradeDate ? format(fTradeDate, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fTradeDate} onSelect={setFTradeDate} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Quantidade *</Label>
                <Input value={fQuantity} onChange={(e) => setFQuantity(e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label className="text-sm">Preço Unitário (R$) *</Label>
                <Input value={fUnitPrice} onChange={(e) => setFUnitPrice(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Taxa/Corretagem (R$)</Label>
                <Input value={fFee} onChange={(e) => setFFee(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-sm">Corretora/Exchange</Label>
                <Input value={fBroker} onChange={(e) => setFBroker(e.target.value)} placeholder="Ex: XP, Binance" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Lucro/Prejuízo (R$)</Label>
                <Input value={fProfitLoss} onChange={(e) => setFProfitLoss(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-sm">% Ganho</Label>
                <Input value={fProfitPct} onChange={(e) => setFProfitPct(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Status</Label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v as "realizado" | "pendente")}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Notas</Label>
              <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Observações do trade..." rows={2} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t border-border/20">
            {editingTrade && (
              <Button variant="outline" size="sm" className="text-destructive mr-auto" onClick={() => { deleteTrade(editingTrade.id); setModalOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveTrade} className="gap-1.5" disabled={!fTicker.trim()}>
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
