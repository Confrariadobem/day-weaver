import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, Legend, ComposedChart,
} from "recharts";
import { format, startOfYear, endOfYear, eachMonthOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, Wallet, CheckCircle2, FolderKanban, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const tooltipStyle = {
  background: "hsl(0 0% 10%)",
  border: "1px solid hsl(0 0% 20%)",
  borderRadius: 8,
  fontSize: 12,
};

const brlFormatter = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function DashboardView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Tables<"financial_entries">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [eRes, tRes, pRes, cRes] = await Promise.all([
        supabase.from("financial_entries").select("*").eq("user_id", user.id),
        supabase.from("tasks").select("*").eq("user_id", user.id),
        supabase.from("projects").select("*").eq("user_id", user.id),
        supabase.from("categories").select("*").eq("user_id", user.id),
      ]);
      if (eRes.data) setEntries(eRes.data);
      if (tRes.data) setTasks(tRes.data);
      if (pRes.data) setProjects(pRes.data);
      if (cRes.data) setCategories(cRes.data);
    };
    fetch();
  }, [user]);

  // Monthly financial data
  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: startOfYear(new Date(year, 0)),
      end: endOfYear(new Date(year, 0)),
    });
    let accumulated = 0;
    return months.map((month) => {
      const monthEntries = entries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === year;
      });
      const revenue = monthEntries.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const expense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      const balance = revenue - expense;
      accumulated += balance;
      return {
        month: format(month, "MMM", { locale: ptBR }).toUpperCase(),
        receita: revenue,
        despesa: expense,
        saldo: balance,
        acumulado: accumulated,
      };
    });
  }, [entries, year]);

  // Category breakdown for pie chart
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

  // Task stats by project
  const projectStats = useMemo(() => {
    return projects.map((p) => {
      const pTasks = tasks.filter((t) => t.project_id === p.id);
      const done = pTasks.filter((t) => t.is_completed).length;
      return { name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, total: pTasks.length, done, pending: pTasks.length - done };
    }).filter((p) => p.total > 0);
  }, [projects, tasks]);

  // Summary stats
  const totalRevenue = monthlyData.reduce((s, m) => s + m.receita, 0);
  const totalExpense = monthlyData.reduce((s, m) => s + m.despesa, 0);
  const totalBalance = totalRevenue - totalExpense;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.is_completed).length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const pendingTasks = totalTasks - completedTasks;

  return (
    <div className="h-full overflow-auto p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold">Dashboard</h1>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground">Receita Total</p>
              <p className="text-sm font-bold text-success">R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground">Despesa Total</p>
              <p className="text-sm font-bold text-destructive">R$ {totalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo</p>
              <p className={cn("text-sm font-bold", totalBalance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                R$ {totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground">Tarefas</p>
              <p className="text-sm font-bold">{completedTasks}/{totalTasks}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FolderKanban className="h-5 w-5 text-warning" />
            <div>
              <p className="text-[10px] text-muted-foreground">Projetos Ativos</p>
              <p className="text-sm font-bold">{activeProjects}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Stacked Bar + Trend Line (inspired by reference image) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Análise de Saldo — Receita × Despesa + Saldo Acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData} barGap={0}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={brlFormatter} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="receita" name="Receita" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesa" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="acumulado" name="Saldo Acumulado" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: "#f59e0b" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {categoryBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {categoryBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={tooltipStyle} formatter={brlFormatter} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tasks by Project - horizontal bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tarefas por Projeto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {projectStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectStats} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <RechartsTooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="done" name="Concluídas" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pending" name="Pendentes" stackId="a" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem projetos com tarefas</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
