import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, Line, Legend, ComposedChart, AreaChart, Area,
} from "recharts";
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, TrendingDown, Wallet, CheckCircle2, FolderKanban,
  BarChart3, PiggyBank, ArrowUpRight, ArrowDownRight,
  CalendarCheck, CalendarDays, CalendarX, Building, Banknote, Scale, PieChart as PieChartIcon, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };

type PeriodKey = "today" | "3days" | "week" | "month" | "year" | "custom";

function getPeriodRange(key: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  switch (key) {
    case "today": return { start: now, end: now };
    case "3days": return { start: now, end: addDays(now, 2) };
    case "week": return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
    case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "year": return { start: startOfYear(now), end: endOfYear(now) };
    default: return { start: startOfYear(now), end: endOfYear(now) };
  }
}

const KPI_DESCRIPTIONS: Record<string, string> = {
  patrimonio: "Total de caixa + investimentos ativos. Fórmula: Σ current_balance + Σ (current_price × quantity)",
  receitas: "Soma de todos os lançamentos do tipo receita no período. Fórmula: Σ amount (type = revenue)",
  despesas: "Soma de todos os lançamentos do tipo despesa no período. Fórmula: Σ amount (type = expense)",
  saldo: "Diferença entre receitas e despesas no período. Fórmula: Receitas − Despesas",
  projetos: "Quantidade de projetos com status ativo. Fórmula: count(status = active)",
  tarefas: "Progresso de tarefas concluídas vs total. Fórmula: concluídas / total",
  investimentos: "Valor de mercado dos investimentos ativos. Fórmula: Σ (current_price × quantity)",
  caixa: "Soma dos saldos de todas as contas ativas. Fórmula: Σ current_balance",
};

export default function DashboardView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Tables<"financial_entries">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [periodKey, setPeriodKey] = useState<PeriodKey>("year");
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date }>(getPeriodRange("year"));
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [inputFrom, setInputFrom] = useState("");
  const [inputTo, setInputTo] = useState("");

  const period = useMemo(() => {
    if (periodKey === "custom") return customRange;
    return getPeriodRange(periodKey);
  }, [periodKey, customRange]);

  const handlePeriodChange = (val: string) => {
    const key = val as PeriodKey;
    setPeriodKey(key);
    if (key !== "custom") {
      const r = getPeriodRange(key);
      setCustomRange(r);
    }
  };

  const handleCustomFrom = (d: Date | undefined) => {
    setCustomFrom(d);
    if (d) {
      setCustomRange(prev => ({ ...prev, start: d }));
      setInputFrom(format(d, "dd/MM/yyyy"));
    }
  };
  const handleCustomTo = (d: Date | undefined) => {
    setCustomTo(d);
    if (d) {
      setCustomRange(prev => ({ ...prev, end: d }));
      setInputTo(format(d, "dd/MM/yyyy"));
    }
  };

  const parseDate = (str: string): Date | null => {
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  };

  const handleInputFrom = (v: string) => {
    // auto-insert slashes
    let raw = v.replace(/\D/g, "").slice(0, 8);
    if (raw.length > 4) raw = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4);
    else if (raw.length > 2) raw = raw.slice(0, 2) + "/" + raw.slice(2);
    setInputFrom(raw);
    const d = parseDate(raw);
    if (d) { setCustomFrom(d); setCustomRange(prev => ({ ...prev, start: d })); }
  };

  const handleInputTo = (v: string) => {
    let raw = v.replace(/\D/g, "").slice(0, 8);
    if (raw.length > 4) raw = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4);
    else if (raw.length > 2) raw = raw.slice(0, 2) + "/" + raw.slice(2);
    setInputTo(raw);
    const d = parseDate(raw);
    if (d) { setCustomTo(d); setCustomRange(prev => ({ ...prev, end: d })); }
  };

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [eRes, tRes, pRes, cRes, iRes, aRes] = await Promise.all([
        supabase.from("financial_entries").select("*").eq("user_id", user.id),
        supabase.from("tasks").select("*").eq("user_id", user.id),
        supabase.from("projects").select("*").eq("user_id", user.id),
        supabase.from("categories").select("*").eq("user_id", user.id),
        supabase.from("investments").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("financial_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
      ]);
      if (eRes.data) setEntries(eRes.data);
      if (tRes.data) setTasks(tRes.data);
      if (pRes.data) setProjects(pRes.data);
      if (cRes.data) setCategories(cRes.data);
      if (iRes.data) setInvestments(iRes.data);
      if (aRes.data) setAccounts(aRes.data);
    };
    fetch();
  }, [user]);

  // Filtered entries based on period
  const filteredEntries = useMemo(() => {
    const s = new Date(period.start); s.setHours(0, 0, 0, 0);
    const e = new Date(period.end); e.setHours(23, 59, 59, 999);
    return entries.filter(entry => {
      const d = new Date(entry.entry_date);
      return isWithinInterval(d, { start: s, end: e });
    });
  }, [entries, period]);

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
  const totalBalance = totalRevenue - totalExpense;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.is_completed).length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const totalCash = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalInvestments = investments.reduce((s: number, i: any) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
  const totalPatrimony = totalCash + totalInvestments;

  const periodLabel = periodKey === "year" ? String(new Date().getFullYear()) : "";

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
         {/* Period filter - Xiaomi Mi Calendar style */}
        <div className="flex flex-row gap-3 overflow-x-auto pb-1">
          {([
            { key: "today" as PeriodKey, label: "Hoje", icon: CalendarCheck },
            { key: "3days" as PeriodKey, label: "3 dias", icon: CalendarDays },
            { key: "month" as PeriodKey, label: "Mês", icon: CalendarCheck },
            { key: "custom" as PeriodKey, label: "Outros", icon: CalendarX },
          ]).map(({ key, label, icon: Icon }) => (
            <Popover key={key}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => { if (key !== "custom") handlePeriodChange(key); else setPeriodKey("custom"); }}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg w-24 px-3 py-3 transition-colors shrink-0",
                    periodKey === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-accent"
                  )}
                >
                  <Icon className="size-6 mb-1" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              </PopoverTrigger>
              {key === "custom" && periodKey === "custom" && (
                <PopoverContent className="w-72 bg-background border rounded-lg shadow-lg p-3 space-y-2" align="start">
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
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground shrink-0">De:</label>
                    <Input value={inputFrom} onChange={e => handleInputFrom(e.target.value)} placeholder="dd/MM/yyyy" className="h-8 text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground shrink-0">Até:</label>
                    <Input value={inputTo} onChange={e => handleInputTo(e.target.value)} placeholder="dd/MM/yyyy" className="h-8 text-sm" />
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => {
                      if (customFrom) setCustomRange(prev => ({ ...prev, start: customFrom }));
                      if (customTo) setCustomRange(prev => ({ ...prev, end: customTo }));
                    }}
                  >
                    Aplicar
                  </Button>
                </PopoverContent>
              )}
            </Popover>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Banknote size={28} className="text-muted-foreground mr-2" /> Patrimônio
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.patrimonio}</PopoverContent>
                </Popover>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-foreground mt-2 overflow-hidden truncate">{brl(totalPatrimony)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="size-7 mr-2 text-muted-foreground" /> Receitas {periodLabel}
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.receitas}</PopoverContent>
                </Popover>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-[hsl(var(--success))] mt-2 overflow-hidden truncate">{brl(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <TrendingDown className="size-7 mr-2 text-muted-foreground" /> Despesas {periodLabel}
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.despesas}</PopoverContent>
                </Popover>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-destructive mt-2 overflow-hidden truncate">{brl(totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Banknote size={28} className="text-muted-foreground mr-2" /> Saldo do Período</p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.saldo}</PopoverContent>
                </Popover>
              </div>
              <p className={cn(
                "font-semibold text-2xl md:text-3xl mt-2 overflow-hidden truncate",
                totalBalance >= 0 ? "text-[hsl(142,71%,45%)]" : "text-[hsl(0,84%,60%)]"
              )}>
                {brl(totalBalance)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <FolderKanban className="size-7 mr-2 text-muted-foreground" /> Projetos Ativos
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.projetos}</PopoverContent>
                </Popover>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-foreground mt-2">{activeProjects}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="size-7 mr-2 text-muted-foreground" /> Tarefas
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.tarefas}</PopoverContent>
                </Popover>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-foreground mt-2">{completedTasks}/{totalTasks}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <PiggyBank className="size-7 mr-2 text-muted-foreground" /> Investimentos
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.investimentos}</PopoverContent>
                </Popover>
              </div>
              <p className="text-2xl md:text-3xl font-semibold text-foreground mt-2">{brl(totalInvestments)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Wallet className="size-7 mr-2 text-muted-foreground" /> Caixa
                </p>
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6"><Info size={16} /></Button></PopoverTrigger>
                  <PopoverContent className="text-sm w-64">{KPI_DESCRIPTIONS.caixa}</PopoverContent>
                </Popover>
              </div>
              <p className={cn("text-2xl md:text-3xl font-semibold mt-2", totalCash >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {brl(totalCash)}
              </p>
            </CardContent>
          </Card>
        </div>

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

        <hr className="my-8 border-muted" />

        <div className="mt-6 space-y-4">
          {periodKey === "today" && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Hoje</h3>
              {filteredEntries.length > 0 ? (
                filteredEntries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-lg bg-muted mb-1">
                    <span className="text-sm truncate flex-1">{e.title}</span>
                    <span className="text-sm font-medium ml-2">{brl(Number(e.amount))}</span>
                    <Button variant="outline" size="sm" className="ml-2 h-7 text-xs">Baixar</Button>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground">Sem itens nesse período</p>
              )}
            </div>
          )}
          {periodKey === "3days" && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Próximos 3 dias</h3>
              {filteredEntries.length > 0 ? (
                filteredEntries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-lg bg-muted mb-1">
                    <span className="text-sm truncate flex-1">{e.title}</span>
                    <span className="text-sm font-medium ml-2">{brl(Number(e.amount))}</span>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground">Sem itens nesse período</p>
              )}
              <div className="mt-4 p-4 border border-dashed border-muted-foreground/30 rounded-lg text-center text-muted-foreground text-sm">
                Mini-gráfico aqui
              </div>
            </div>
          )}
          {periodKey === "month" && (
            <div className="p-4 border border-dashed border-muted-foreground/30 rounded-lg text-center text-muted-foreground text-sm">
              Gráficos completos do mês aqui
            </div>
          )}
          {periodKey === "custom" && (
            <div className="p-4 border border-dashed border-muted-foreground/30 rounded-lg text-center text-muted-foreground text-sm">
              Custom range aqui
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
