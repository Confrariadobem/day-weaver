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
  PieChart, Pie, Cell, Line, Legend, ComposedChart, AreaChart, Area,
} from "recharts";
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, Wallet, CheckCircle2, FolderKanban,
  BarChart3, PiggyBank, ArrowUpRight, ArrowDownRight, CalendarIcon,
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
    if (d) setCustomRange(prev => ({ ...prev, start: d }));
  };
  const handleCustomTo = (d: Date | undefined) => {
    setCustomTo(d);
    if (d) setCustomRange(prev => ({ ...prev, end: d }));
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
        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Período</span>
          <Select value={periodKey} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="3days">Próximos 3 dias</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mês</SelectItem>
              <SelectItem value="year">Ano atual</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {periodKey === "custom" && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {customFrom ? format(customFrom, "dd/MM/yy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={handleCustomFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {customTo ? format(customTo, "dd/MM/yy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={handleCustomTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Patrimônio
              </p>
              <p className="text-lg md:text-xl font-bold text-foreground">{brl(totalPatrimony)}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{KPI_DESCRIPTIONS.patrimonio}</p>
            </CardContent>
          </Card>
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Receitas {periodLabel}
              </p>
              <p className="text-lg md:text-xl font-bold text-[hsl(var(--success))]">{brl(totalRevenue)}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{KPI_DESCRIPTIONS.receitas}</p>
            </CardContent>
          </Card>
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Despesas {periodLabel}
              </p>
              <p className="text-lg md:text-xl font-bold text-destructive">{brl(totalExpense)}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{KPI_DESCRIPTIONS.despesas}</p>
            </CardContent>
          </Card>
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo do Período</p>
              <p className={cn(
                "font-bold text-[28px] md:text-[32px] leading-tight",
                totalBalance >= 0 ? "text-[hsl(142,71%,45%)]" : "text-[hsl(0,84%,60%)]"
              )}>
                {brl(totalBalance)}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{KPI_DESCRIPTIONS.saldo}</p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FolderKanban className="h-3 w-3" /> Projetos Ativos
              </p>
              <p className="text-lg md:text-xl font-bold text-foreground">{activeProjects}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{KPI_DESCRIPTIONS.projetos}</p>
            </CardContent>
          </Card>
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Tarefas
              </p>
              <p className="text-lg md:text-xl font-bold text-foreground">{completedTasks}/{totalTasks}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{KPI_DESCRIPTIONS.tarefas}</p>
            </CardContent>
          </Card>
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <PiggyBank className="h-3 w-3" /> Investimentos
              </p>
              <p className="text-lg md:text-xl font-bold text-foreground">{brl(totalInvestments)}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{KPI_DESCRIPTIONS.investimentos}</p>
            </CardContent>
          </Card>
          <Card className="bg-card h-24">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Caixa
              </p>
              <p className={cn("text-lg md:text-xl font-bold", totalCash >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {brl(totalCash)}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{KPI_DESCRIPTIONS.caixa}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="bg-card md:col-span-2">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" /> Receita × Despesa
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={monthlyData} barGap={0}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Saldo Mensal
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
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <PiggyBank className="h-3.5 w-3.5 text-primary" /> Despesas por Categoria
              </p>
              {categoryBreakdown.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} strokeWidth={1}>
                        {categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                    </PieChart>
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
