import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, Line, Legend, ComposedChart, AreaChart, Area,
} from "recharts";
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, addDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, Wallet, Clock,
  BarChart3, Building2,
  CalendarCheck, CalendarDays, CalendarRange, Scale, PieChart as PieChartIcon,
  ArrowRightLeft, RefreshCw, Target, FileDown, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useDateFormat } from "@/contexts/DateFormatContext";
import { useCurrencyConversion } from "@/hooks/useCurrencyConversion";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };

type PeriodKey = "today" | "3days" | "month" | "year" | "custom";

function getPeriodRange(key: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  switch (key) {
    case "today": return { start: now, end: now };
    case "3days": return { start: now, end: addDays(now, 2) };
    case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "year": return { start: startOfYear(now), end: endOfYear(now) };
    default: return { start: startOfYear(now), end: endOfYear(now) };
  }
}

// --- Câmbio history helpers ---
interface CambioHistoryEntry {
  date: string;
  from: string;
  amount: number;
  to: string;
  result: number;
}

function getCambioHistory(): CambioHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem("cambioHistory") || "[]");
  } catch { return []; }
}
function saveCambioHistory(h: CambioHistoryEntry[]) {
  localStorage.setItem("cambioHistory", JSON.stringify(h.slice(0, 20)));
}
function getCambioMeta(): number {
  try { return Number(localStorage.getItem("cambioMeta")) || 0; } catch { return 0; }
}

export default function DashboardView() {
  const { user } = useAuth();
  const { formatCurrency: brl, currency } = useCurrency();
  const { rates, loading: ratesLoading, convert, refetch } = useCurrencyConversion();
  const { dateFormat, formatDate, parseDate, placeholder: datePlaceholder } = useDateFormat();
  const [entries, setEntries] = useState<Tables<"financial_entries">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showConversion, setShowConversion] = useState(() => {
    try { return localStorage.getItem("dashboard-show-cambio") === "true"; } catch { return false; }
  });

  const [periodKey, setPeriodKey] = useState<PeriodKey>("year");
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date }>(getPeriodRange("year"));
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");

  // Câmbio state
  const [cambioFrom, setCambioFrom] = useState("");
  const [cambioTo, setCambioTo] = useState("");
  const [cambioAmount, setCambioAmount] = useState("");
  const [cambioResult, setCambioResult] = useState<number | null>(null);
  const [cambioHistory, setCambioHistory] = useState<CambioHistoryEntry[]>(getCambioHistory);
  const [cambioMeta, setCambioMeta] = useState(getCambioMeta);
  const [cambioMetaInput, setCambioMetaInput] = useState(String(getCambioMeta() || ""));

  const consolidatedRef = useRef<HTMLDivElement>(null);

  const period = useMemo(() => {
    if (periodKey === "custom") return customRange;
    return getPeriodRange(periodKey);
  }, [periodKey, customRange]);

  const handlePeriodChange = (key: PeriodKey) => {
    setPeriodKey(key);
    if (key !== "custom") setCustomRange(getPeriodRange(key));
  };

  const handleCustomFrom = (d: Date | undefined) => {
    setCustomFrom(d);
    if (d) { setCustomRange(prev => ({ ...prev, start: d })); setFromText(formatDate(d)); }
  };
  const handleCustomTo = (d: Date | undefined) => {
    setCustomTo(d);
    if (d) { setCustomRange(prev => ({ ...prev, end: d })); setToText(formatDate(d)); }
  };

  const handleClearInterval = () => {
    setCustomFrom(undefined); setCustomTo(undefined);
    setFromText(""); setToText("");
    handlePeriodChange("year");
    setIntervalOpen(false);
  };

  const normalizeAndParse = (raw: string): Date | null => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 8) {
      let formatted: string;
      if (dateFormat === "YYYY/MM/DD") {
        formatted = `${digits.slice(0,4)}/${digits.slice(4,6)}/${digits.slice(6,8)}`;
      } else {
        formatted = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,8)}`;
      }
      return parseDate(formatted);
    }
    return parseDate(raw);
  };

  const handleFromBlur = () => {
    const d = normalizeAndParse(fromText);
    if (d) { handleCustomFrom(d); setFromText(formatDate(d)); }
  };
  const handleToBlur = () => {
    const d = normalizeAndParse(toText);
    if (d) { handleCustomTo(d); setToText(formatDate(d)); }
  };

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [eRes, cRes, iRes, aRes] = await Promise.all([
        supabase.from("financial_entries").select("*").eq("user_id", user.id),
        supabase.from("categories").select("*").eq("user_id", user.id),
        supabase.from("investments").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("financial_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
      ]);
      if (eRes.data) setEntries(eRes.data);
      if (cRes.data) setCategories(cRes.data);
      if (iRes.data) setInvestments(iRes.data);
      if (aRes.data) setAccounts(aRes.data);
    };
    fetchData();
    const handler = () => fetchData();
    window.addEventListener("lovable:data-changed", handler);
    return () => window.removeEventListener("lovable:data-changed", handler);
  }, [user]);

  useEffect(() => { localStorage.removeItem("dashboard-period-year"); }, []);

  const filteredEntries = useMemo(() => {
    const s = new Date(period.start); s.setHours(0, 0, 0, 0);
    const e = new Date(period.end); e.setHours(23, 59, 59, 999);
    return entries.filter(entry => {
      const d = new Date(entry.entry_date);
      return isWithinInterval(d, { start: s, end: e });
    });
  }, [entries, period]);

  // --- Grupo 1: Saldo Consolidado calculations ---
  const consolidated = useMemo(() => {
    const totalCash = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
    const totalInvestments = investments.reduce((s: number, i: any) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
    const saldoAtual = totalCash + totalInvestments;

    const now = new Date();
    const aReceber = entries
      .filter(e => e.type === "revenue" && !e.is_paid && new Date(e.entry_date) >= now)
      .reduce((s, e) => s + Number(e.amount), 0);
    const aPagar = entries
      .filter(e => e.type === "expense" && !e.is_paid && new Date(e.entry_date) >= now)
      .reduce((s, e) => s + Number(e.amount), 0);
    const projetado = saldoAtual + aReceber - aPagar;

    return { saldoAtual, aReceber, aPagar, projetado, totalCash, totalInvestments };
  }, [entries, accounts, investments]);

  // Toast alert when projetado < 0
  useEffect(() => {
    if (consolidated.projetado < 0) {
      toast({
        title: "⚠️ Cuidado!",
        description: `Seu saldo projetado está negativo: ${brl(consolidated.projetado)}`,
        variant: "destructive",
      });
    }
  }, [consolidated.projetado]);

  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({ start: period.start, end: period.end });
    let accumulated = 0;
    return months.map((month) => {
      const monthEntries = filteredEntries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
      });
      const revenue = monthEntries.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const expense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      accumulated += revenue - expense;
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), receita: revenue, despesa: expense, saldo: revenue - expense, acumulado: accumulated };
    });
  }, [filteredEntries, period]);

  const categoryBreakdown = useMemo(() => {
    const yearEntries = filteredEntries.filter((e) => e.type === "expense");
    const map = new Map<string, number>();
    yearEntries.forEach((e) => {
      const cat = categories.find((c) => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      map.set(name, (map.get(name) || 0) + Number(e.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredEntries, categories]);

  const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

  const totalRevenue = filteredEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = filteredEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);

  // --- Câmbio handlers ---
  const handleCambioUpdate = useCallback(() => {
    const amt = Number(cambioAmount);
    if (!amt || !cambioFrom || !cambioTo || cambioFrom === cambioTo) return;
    
    // Simple conversion using rates
    let result = amt;
    if (cambioFrom !== currency) {
      // Convert to base currency first
      const fromRate = rates[cambioFrom as "USD" | "EUR" | "BTC"];
      if (fromRate) result = amt * fromRate;
    }
    if (cambioTo !== currency) {
      const toRate = rates[cambioTo as "USD" | "EUR" | "BTC"];
      if (toRate) result = result / toRate;
    }

    setCambioResult(result);
    const entry: CambioHistoryEntry = {
      date: format(new Date(), "dd/MM/yyyy HH:mm"),
      from: cambioFrom,
      amount: amt,
      to: cambioTo,
      result,
    };
    const newHistory = [entry, ...cambioHistory].slice(0, 20);
    setCambioHistory(newHistory);
    saveCambioHistory(newHistory);
  }, [cambioAmount, cambioFrom, cambioTo, rates, currency, cambioHistory]);

  const handleSaveMeta = () => {
    const val = Number(cambioMetaInput);
    setCambioMeta(val);
    localStorage.setItem("cambioMeta", String(val));
    toast({ title: "Meta salva!", description: `Meta de câmbio: ${val}` });
  };

  const handleClearHistory = () => {
    setCambioHistory([]);
    localStorage.removeItem("cambioHistory");
  };

  const handleToggleConversion = () => {
    const next = !showConversion;
    setShowConversion(next);
    localStorage.setItem("dashboard-show-cambio", String(next));
  };

  const otherCurrencies = (["BRL", "BTC", "EUR", "USD"] as const).filter(c => c !== currency).sort();
  const allCurrencies = ["BRL", "USD", "EUR", "BTC"];

  const fmtOther = (v: number, cur: string) => {
    if (cur === "BTC") return `₿ ${v.toFixed(8)}`;
    if (cur === "USD") return `US$ ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (cur === "EUR") return `€ ${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtRate = (cur: string, rate: number) => {
    if (cur === "BTC") return `1 ${currency} = ${(1 / rate).toFixed(8)} BTC`;
    return `1 ${currency} = ${(1 / rate).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${cur}`;
  };

  // --- Grupo 4: PDF Export ---
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: html2canvas } = await import("html2canvas");
    const el = consolidatedRef.current;
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: null });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm" });
      const pdfW = pdf.internal.pageSize.getWidth() - 20;
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, pdfW, pdfH);
      pdf.setFontSize(8);
      pdf.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 10, pdf.internal.pageSize.getHeight() - 5);
      pdf.save(`dashboard-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: "PDF exportado!", description: "Arquivo salvo com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Falha ao gerar PDF.", variant: "destructive" });
    }
  };

  const periodButtons: { key: PeriodKey; label: string; icon: typeof CalendarCheck }[] = [
    { key: "today", label: "Hoje", icon: CalendarCheck },
    { key: "3days", label: "3 Dias", icon: CalendarDays },
    { key: "month", label: "Mês", icon: CalendarCheck },
    { key: "year", label: "Ano", icon: CalendarRange },
    { key: "custom", label: "Intervalo", icon: CalendarRange },
  ];

  // Meta progress
  const metaProgress = cambioMeta > 0 ? Math.min(100, (consolidated.saldoAtual / cambioMeta) * 100) : 0;

  return (
    <ScrollArea className="h-full">
      <div ref={consolidatedRef} className="p-4 pt-3 max-w-full overflow-hidden space-y-4">
        {/* Period filter buttons + Export PDF */}
        <div className="flex flex-row gap-2 overflow-x-auto pb-1 items-center">
          {periodButtons.map(({ key, label, icon: Icon }) => (
            <Popover key={key} open={key === "custom" ? intervalOpen : undefined} onOpenChange={key === "custom" ? setIntervalOpen : undefined}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => {
                    if (key !== "custom") {
                      handlePeriodChange(key);
                      setIntervalOpen(false);
                    } else {
                      setPeriodKey("custom");
                      setIntervalOpen(true);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 shrink-0",
                    periodKey === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/80 hover:bg-primary/5"
                  )}
                >
                  <Icon className="size-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              </PopoverTrigger>
              {key === "custom" && (
                <PopoverContent className="w-72 bg-background border rounded-lg shadow-lg p-3 space-y-3" align="start">
                  <Calendar
                    mode="range"
                    locale={ptBR}
                    showOutsideDays={false}
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={(range) => {
                      handleCustomFrom(range?.from);
                      handleCustomTo(range?.to);
                    }}
                    className="pointer-events-auto"
                  />
                  <div className="space-y-2 border-t border-border/30 pt-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-8 shrink-0">De:</span>
                      <Input
                        value={fromText}
                        onChange={(e) => setFromText(e.target.value)}
                        onBlur={handleFromBlur}
                        placeholder={datePlaceholder}
                        className={cn("h-10 text-sm rounded-md border-border", !fromText && "placeholder:text-muted-foreground/40")}
                        style={{ width: 130 }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-8 shrink-0">Até:</span>
                      <Input
                        value={toText}
                        onChange={(e) => setToText(e.target.value)}
                        onBlur={handleToBlur}
                        placeholder={datePlaceholder}
                        className={cn("h-10 text-sm rounded-md border-border", !toText && "placeholder:text-muted-foreground/40")}
                        style={{ width: 130 }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleClearInterval}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors duration-200"
                      style={{ minWidth: 80, height: 32 }}
                    >
                      Limpar
                    </button>
                  </div>
                </PopoverContent>
              )}
            </Popover>
          ))}

          {/* Export PDF button */}
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-all duration-200 shrink-0 ml-auto"
          >
            <FileDown className="size-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>
        </div>

        {/* GRUPO 1: Saldo Consolidado – unified card */}
        <Card className={cn(
          "bg-card transition-all duration-300",
          consolidated.projetado < 0 && "border-destructive/50 bg-destructive/5"
        )}>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Saldo Atual */}
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                  <Wallet className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Atual</p>
                  <p className={cn("text-lg font-bold truncate mt-0.5", consolidated.saldoAtual >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                    {brl(consolidated.saldoAtual)}
                  </p>
                </div>
              </div>

              {/* A Receber */}
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[hsl(var(--success))]/10 p-2 shrink-0">
                  <TrendingUp className="size-5 text-[hsl(var(--success))]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">A Receber</p>
                  <p className="text-lg font-bold text-[hsl(var(--success))] truncate mt-0.5">
                    {brl(consolidated.aReceber)}
                  </p>
                </div>
              </div>

              {/* A Pagar */}
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-destructive/10 p-2 shrink-0">
                  <TrendingDown className="size-5 text-destructive" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">A Pagar</p>
                  <p className="text-lg font-bold text-destructive truncate mt-0.5">
                    {brl(consolidated.aPagar)}
                  </p>
                </div>
              </div>

              {/* Projetado */}
              <div className="flex items-start gap-3">
                <div className={cn("rounded-lg p-2 shrink-0", consolidated.projetado >= 0 ? "bg-primary/10" : "bg-destructive/10")}>
                  <Clock className={cn("size-5", consolidated.projetado >= 0 ? "text-primary" : "text-destructive")} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Projetado</p>
                  <p className={cn("text-lg font-bold truncate mt-0.5", consolidated.projetado >= 0 ? "text-foreground" : "text-destructive")}>
                    {brl(consolidated.projetado)}
                  </p>
                  {consolidated.projetado < 0 && (
                    <span className="text-[10px] font-semibold text-destructive animate-pulse">Cuidado!</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GRUPO 2: Câmbio card – enhanced */}
        <Card className="bg-card">
          <CardContent className="p-4 space-y-3">
            <p className="text-[0.9rem] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <ArrowRightLeft className="size-5 mr-1 text-muted-foreground" /> Câmbio
              <Switch
                checked={showConversion}
                onCheckedChange={handleToggleConversion}
                className="ml-auto"
              />
            </p>

            {showConversion && (
              <div className="space-y-4 animate-in fade-in duration-300">
                {/* Quick patrimony conversion */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {otherCurrencies.map(cur => {
                    const val = cur === "BRL"
                      ? consolidated.saldoAtual
                      : convert(consolidated.saldoAtual, cur as "USD" | "EUR" | "BTC");
                    const rate = cur === "BRL" ? 1 : rates[cur as "USD" | "EUR" | "BTC"];
                    return (
                      <div key={cur} className="space-y-0">
                        <p className="text-[0.8rem] text-foreground">
                          {cur}: ≈ {fmtOther(val, cur)}
                        </p>
                        <p className="text-[0.7rem] text-muted-foreground">
                          ({cur === "BRL" ? "moeda base" : fmtRate(cur, rate)})
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Converter manual */}
                <div className="border-t border-border/30 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Converter</p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">De</label>
                      <select
                        value={cambioFrom}
                        onChange={(e) => setCambioFrom(e.target.value)}
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="">--</option>
                        {allCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Valor</label>
                      <Input
                        type="number"
                        value={cambioAmount}
                        onChange={(e) => setCambioAmount(e.target.value)}
                        className="h-9 w-28"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Para</label>
                      <select
                        value={cambioTo}
                        onChange={(e) => setCambioTo(e.target.value)}
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="">--</option>
                        {allCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCambioUpdate}
                      className="h-9 gap-1"
                      disabled={ratesLoading}
                    >
                      <RefreshCw className={cn("size-3.5", ratesLoading && "animate-spin")} />
                      Atualizar
                    </Button>
                  </div>
                  {cambioResult !== null && (
                    <p className="text-sm font-semibold text-foreground">
                      = {fmtOther(cambioResult, cambioTo)}
                    </p>
                  )}
                </div>

                {/* Meta de câmbio */}
                <div className="border-t border-border/30 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Target className="size-3.5" /> Meta
                  </p>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      value={cambioMetaInput}
                      onChange={(e) => setCambioMetaInput(e.target.value)}
                      className="h-8 w-32 text-sm"
                      placeholder="Ex: 100000"
                    />
                    <Button size="sm" variant="outline" onClick={handleSaveMeta} className="h-8 text-xs">
                      Salvar meta
                    </Button>
                  </div>
                  {cambioMeta > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{brl(consolidated.saldoAtual)}</span>
                        <span>{brl(cambioMeta)}</span>
                      </div>
                      <Progress value={metaProgress} className="h-2" />
                      <p className="text-[10px] text-muted-foreground text-right">{metaProgress.toFixed(1)}%</p>
                    </div>
                  )}
                </div>

                {/* Histórico */}
                {cambioHistory.length > 0 && (
                  <div className="border-t border-border/30 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">Histórico</p>
                      <button onClick={handleClearHistory} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5">
                        <Trash2 className="size-3" /> Limpar
                      </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/30">
                            <th className="text-left py-1 font-medium">Data</th>
                            <th className="text-left py-1 font-medium">Origem</th>
                            <th className="text-right py-1 font-medium">Valor</th>
                            <th className="text-left py-1 font-medium">Destino</th>
                            <th className="text-right py-1 font-medium">Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cambioHistory.slice(0, 5).map((h, i) => (
                            <tr key={i} className="border-b border-border/10">
                              <td className="py-1 text-muted-foreground">{h.date}</td>
                              <td className="py-1">{h.from}</td>
                              <td className="py-1 text-right tabular-nums">{h.amount.toLocaleString()}</td>
                              <td className="py-1">{h.to}</td>
                              <td className="py-1 text-right tabular-nums font-medium">{fmtOther(h.result, h.to)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="bg-card md:col-span-2">
            <CardContent className="p-3">
              <p className="text-xl md:text-2xl font-semibold mb-3 flex items-center gap-1.5">
                <BarChart3 className="size-7 mr-2 text-muted-foreground" /> Receita × Despesa
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={monthlyData} barGap={0}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                  <Legend wrapperStyle={{ fontSize: 14, fontWeight: 500 }} />
                  <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xl md:text-2xl font-semibold mb-3 flex items-center gap-1.5">
                <Scale size={28} className="text-muted-foreground mr-2" /> Saldo Mensal
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                  <Area type="monotone" dataKey="saldo" stroke="hsl(217, 91%, 60%)" fill="url(#saldoGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xl md:text-2xl font-semibold mb-3 flex items-center gap-1.5">
                <PieChartIcon className="size-7 mr-2 text-muted-foreground" /> Despesas por Categoria
              </p>
              {categoryBreakdown.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <RechartsPieChart>
                      <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} strokeWidth={1}>
                        {categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1">
                    {categoryBreakdown.slice(0, 6).map((c, i) => {
                      const pct = totalExpense > 0 ? ((c.value / totalExpense) * 100).toFixed(1) : "0";
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground flex-1 truncate">{c.name}</span>
                          <span className="font-medium text-foreground">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
