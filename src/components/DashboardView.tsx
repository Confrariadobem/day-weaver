import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  TrendingUp, TrendingDown, Wallet, PiggyBank,
  BarChart3, Building2,
  CalendarCheck, CalendarDays, CalendarX, Scale, PieChart as PieChartIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Tables } from "@/integrations/supabase/types";
const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };

type PeriodKey = "today" | "3days" | "month" | "custom" | "year";

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

export default function DashboardView() {
  const { user } = useAuth();
  const { formatCurrency: brl } = useCurrency();
  const [entries, setEntries] = useState<Tables<"financial_entries">[]>([]);
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

  const handlePeriodChange = (key: PeriodKey) => {
    setPeriodKey(key);
    if (key !== "custom") setCustomRange(getPeriodRange(key));
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
    fetch();
  }, [user]);

  // Clear old localStorage keys
  useEffect(() => {
    localStorage.removeItem("dashboard-period-year");
  }, []);

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
  const totalCash = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalInvestments = investments.reduce((s: number, i: any) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
  const totalPatrimony = totalCash + totalInvestments;

  const periodButtons: { key: PeriodKey; label: string; icon: typeof CalendarCheck }[] = [
    { key: "today", label: "Hoje", icon: CalendarCheck },
    { key: "3days", label: "3 Dias", icon: CalendarDays },
    { key: "month", label: "Mês", icon: CalendarCheck },
    { key: "custom", label: "Intervalo", icon: CalendarX },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 pt-3 space-y-4">
        {/* Period filter - rectangular buttons */}
        <div className="flex flex-row gap-2 overflow-x-auto pb-1">
          {periodButtons.map(({ key, label, icon: Icon }) => (
            <Popover key={key}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => { if (key !== "custom") handlePeriodChange(key); else setPeriodKey("custom"); }}
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
                </PopoverContent>
              )}
            </Popover>
          ))}
        </div>

        {/* KPI Cards - 3 columns, 260px, no Info buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card" style={{ minWidth: 260 }}>
            <CardContent className="p-3 min-h-[80px] flex flex-col justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="size-6 mr-1 text-muted-foreground" /> Receita
              </p>
              <p className="text-2xl md:text-3xl font-semibold text-[hsl(var(--success))] mt-2 overflow-hidden truncate">{brl(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card" style={{ minWidth: 260 }}>
            <CardContent className="p-3 min-h-[80px] flex flex-col justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="size-6 mr-1 text-muted-foreground" /> Despesa
              </p>
              <p className="text-2xl md:text-3xl font-semibold text-destructive mt-2 overflow-hidden truncate">{brl(totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card" style={{ minWidth: 260 }}>
            <CardContent className="p-3 min-h-[80px] flex flex-col justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <PiggyBank className="size-6 mr-1 text-muted-foreground" /> Investimentos
              </p>
              <p className="text-2xl md:text-3xl font-semibold text-foreground mt-2 overflow-hidden truncate">{brl(totalInvestments)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card" style={{ minWidth: 260 }}>
            <CardContent className="p-3 min-h-[80px] flex flex-col justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Wallet className="size-6 mr-1 text-muted-foreground" /> Caixa
              </p>
              <p className={cn("text-2xl md:text-3xl font-semibold mt-2 overflow-hidden truncate", totalCash >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {brl(totalCash)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card" style={{ minWidth: 260 }}>
            <CardContent className="p-3 min-h-[80px] flex flex-col justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Building2 className="size-6 mr-1 text-muted-foreground" strokeWidth={1.5} /> Patrimônio
              </p>
              <p className="text-2xl md:text-3xl font-semibold text-foreground mt-2 overflow-hidden truncate">{brl(totalPatrimony)}</p>
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
      </div>
    </ScrollArea>
  );
}
