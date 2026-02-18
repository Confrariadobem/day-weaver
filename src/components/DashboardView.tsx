import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, Legend, ComposedChart, AreaChart, Area,
} from "recharts";
import { format, startOfYear, endOfYear, eachMonthOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, Wallet, CheckCircle2, FolderKanban,
  BarChart3, PiggyBank, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };

export default function DashboardView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Tables<"financial_entries">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const year = new Date().getFullYear();

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

  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({ start: startOfYear(new Date(year, 0)), end: endOfYear(new Date(year, 0)) });
    let accumulated = 0;
    return months.map((month) => {
      const monthEntries = entries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === year;
      });
      const revenue = monthEntries.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const expense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      accumulated += revenue - expense;
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), receita: revenue, despesa: expense, saldo: revenue - expense, acumulado: accumulated };
    });
  }, [entries, year]);

  const categoryBreakdown = useMemo(() => {
    const yearEntries = entries.filter((e) => new Date(e.entry_date).getFullYear() === year && e.type === "expense");
    const map = new Map<string, number>();
    yearEntries.forEach((e) => {
      const cat = categories.find((c) => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      map.set(name, (map.get(name) || 0) + Number(e.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [entries, categories, year]);

  const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

  const totalRevenue = monthlyData.reduce((s, m) => s + m.receita, 0);
  const totalExpense = monthlyData.reduce((s, m) => s + m.despesa, 0);
  const totalBalance = totalRevenue - totalExpense;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.is_completed).length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const totalCash = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalInvestments = investments.reduce((s: number, i: any) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
  const totalPatrimony = totalCash + totalInvestments;

  // Monthly bullet chart data (current month)
  const monthlyBullet = useMemo(() => {
    const now = new Date();
    const monthEntries = entries.filter(e => {
      const d = new Date(e.entry_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const rev = monthEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
    const exp = monthEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const balance = rev - exp;
    const maxVal = Math.max(rev, exp, 1);
    return { rev, exp, balance, maxVal };
  }, [entries]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Bullet Chart - monthly cash flow */}
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-3" style={{ width: 180, height: 40 }}>
            <div className="flex-1 relative h-full flex flex-col justify-center gap-0.5">
              <div className="relative h-3 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-[hsl(var(--success))]"
                  style={{ width: `${Math.min(100, (monthlyBullet.rev / monthlyBullet.maxVal) * 100)}%` }}
                />
                <div
                  className="absolute top-0 h-full w-[2px] bg-destructive"
                  style={{ left: `${Math.min(100, (monthlyBullet.exp / monthlyBullet.maxVal) * 100)}%` }}
                />
              </div>
              <span className={cn(
                "text-[11px] font-bold tabular-nums",
                monthlyBullet.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
              )}>
                {brl(monthlyBullet.balance)}
              </span>
            </div>
          </div>
        </div>

        {/* KPI Cards - Patrimônio pattern */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Patrimônio
              </p>
              <p className="text-lg font-bold text-foreground">{brl(totalPatrimony)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Receitas {year}
              </p>
              <p className="text-lg font-bold text-[hsl(var(--success))]">{brl(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Despesas {year}
              </p>
              <p className="text-lg font-bold text-destructive">{brl(totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo do Ano</p>
              <p className={cn("text-lg font-bold", totalBalance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {brl(totalBalance)}
              </p>
              <div className={cn("flex items-center gap-1 text-[10px]", totalBalance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {totalBalance >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {totalRevenue > 0 ? ((totalBalance / totalRevenue) * 100).toFixed(1) : "0"}% margem
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FolderKanban className="h-3 w-3" /> Projetos Ativos
              </p>
              <p className="text-lg font-bold text-foreground">{activeProjects}</p>
              <p className="text-[10px] text-muted-foreground">{projects.length} total</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Tarefas
              </p>
              <p className="text-lg font-bold text-foreground">{completedTasks}/{totalTasks}</p>
              <p className="text-[10px] text-muted-foreground">{totalTasks - completedTasks} pendentes</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <PiggyBank className="h-3 w-3" /> Investimentos
              </p>
              <p className="text-lg font-bold text-foreground">{brl(totalInvestments)}</p>
              <p className="text-[10px] text-muted-foreground">{investments.length} ativo(s)</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Caixa
              </p>
              <p className={cn("text-lg font-bold", totalCash >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {brl(totalCash)}
              </p>
              <p className="text-[10px] text-muted-foreground">{accounts.length} conta(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Revenue vs Expense */}
          <Card className="bg-card md:col-span-2">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" /> Receita × Despesa — {year}
              </p>
              <ResponsiveContainer width="100%" height={220}>
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

          {/* Saldo evolution */}
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

          {/* Category pie */}
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
