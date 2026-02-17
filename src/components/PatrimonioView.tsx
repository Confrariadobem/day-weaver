import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Wallet, TrendingUp, TrendingDown, Landmark, CreditCard, PiggyBank,
  BarChart3, AlertTriangle, Lock, ArrowUpRight, ArrowDownRight,
  Banknote, WalletCards, Bitcoin,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

type ProfileFilter = "pessoal" | "profissional" | "tudo";

const ALLOC_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4", "#ef4444", "#84cc16"];

const ACCOUNT_ICONS: Record<string, React.ReactNode> = {
  bank_account: <Landmark className="h-4 w-4" />,
  credit_card: <CreditCard className="h-4 w-4" />,
  investment: <PiggyBank className="h-4 w-4" />,
  wallet: <WalletCards className="h-4 w-4" />,
  cash: <Banknote className="h-4 w-4" />,
  crypto: <Bitcoin className="h-4 w-4" />,
};

export default function PatrimonioView() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("pessoal");
  const [hasUpgrade] = useState(true); // User has full access

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [accRes, entRes, invRes, projRes] = await Promise.all([
      supabase.from("financial_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id).eq("is_active", true),
      supabase.from("projects").select("*").eq("user_id", user.id),
    ]);
    if (accRes.data) setAccounts(accRes.data);
    if (entRes.data) setEntries(entRes.data);
    if (invRes.data) setInvestments(invRes.data);
    if (projRes.data) setProjects(projRes.data);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("patrimonio-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_accounts", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchData]);

  // Aggregated metrics
  const metrics = useMemo(() => {
    // Cash: sum of active account balances
    const totalCash = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);

    // Investments: current value
    const totalInvestments = investments.reduce((s, i) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
    const totalInvested = investments.reduce((s, i) => s + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);

    // Projects: budget sum
    const totalProjectBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);

    // Total patrimony
    const totalPatrimony = totalCash + totalInvestments;

    // Allocation data for pie
    const allocation = [
      { name: "Caixa", value: Math.max(0, totalCash), color: ALLOC_COLORS[0] },
    ];

    // Group investments by type
    const invByType: Record<string, number> = {};
    investments.forEach(i => {
      const val = (Number(i.current_price) || 0) * (Number(i.quantity) || 0);
      const label = i.type === "stock" ? "Ações" : i.type === "fii" ? "FIIs" : i.type === "crypto" ? "Cripto" : i.type === "fixed_income" ? "Renda Fixa" : "Outros";
      invByType[label] = (invByType[label] || 0) + val;
    });
    let colorIdx = 1;
    Object.entries(invByType).forEach(([name, value]) => {
      allocation.push({ name, value, color: ALLOC_COLORS[colorIdx % ALLOC_COLORS.length] });
      colorIdx++;
    });

    if (totalProjectBudget > 0) {
      allocation.push({ name: "Projetos", value: totalProjectBudget, color: ALLOC_COLORS[colorIdx % ALLOC_COLORS.length] });
    }

    // Investment profitability
    const invProfitPct = totalInvested > 0 ? ((totalInvestments - totalInvested) / totalInvested) * 100 : 0;

    // Alerts
    const alerts: string[] = [];
    const upcomingExpenses = entries.filter(e => {
      if (e.is_paid || e.type !== "expense") return false;
      const d = new Date(e.entry_date);
      const now = new Date();
      const next7 = new Date(); next7.setDate(next7.getDate() + 7);
      return d >= now && d <= next7;
    });
    const upcomingTotal = upcomingExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    if (upcomingTotal > totalCash * 0.5 && totalCash > 0) {
      alerts.push(`Caixa baixo: R$ ${upcomingTotal.toFixed(0)} em vencimentos próximos vs ${brl(totalCash)} disponível`);
    }

    // Evolution: last 6 months patrimony estimate
    const now = new Date();
    const months = eachMonthOfInterval({ start: subMonths(startOfMonth(now), 5), end: endOfMonth(now) });
    const evolution = months.map(m => {
      const monthEnd = endOfMonth(m);
      // Simple estimate: cash balance + investment values (snapshot approach)
      const monthEntries = entries.filter(e => new Date(e.entry_date) <= monthEnd);
      const rev = monthEntries.filter(e => e.type === "revenue").reduce((s: number, e: any) => s + Number(e.amount), 0);
      const exp = monthEntries.filter(e => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);
      return {
        month: format(m, "MMM", { locale: ptBR }),
        value: rev - exp + totalInvestments,
      };
    });

    return {
      totalCash, totalInvestments, totalInvested, totalProjectBudget,
      totalPatrimony, allocation, invProfitPct, alerts, evolution,
      accountCount: accounts.length, investmentCount: investments.length,
    };
  }, [accounts, entries, investments, projects]);

  const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Profile filter */}
        <div className="flex items-center gap-2">
          <Button
            variant={profileFilter === "pessoal" ? "default" : "outline"}
            size="sm"
            onClick={() => setProfileFilter("pessoal")}
            className="h-8 text-xs"
          >
            Pessoal
          </Button>
          <Button
            variant={profileFilter === "profissional" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (!hasUpgrade) return;
              setProfileFilter("profissional");
            }}
            className={cn("h-8 text-xs", !hasUpgrade && "opacity-50")}
            disabled={!hasUpgrade}
          >
            <Lock className="h-3 w-3 mr-1" /> Profissional
          </Button>
          <Button
            variant={profileFilter === "tudo" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (!hasUpgrade) return;
              setProfileFilter("tudo");
            }}
            className={cn("h-8 text-xs", !hasUpgrade && "opacity-50")}
            disabled={!hasUpgrade}
          >
            <Lock className="h-3 w-3 mr-1" /> Tudo
          </Button>
        </div>

        {!hasUpgrade && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-3 flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Visão Profissional</p>
                <p className="text-xs text-muted-foreground">Faça upgrade para separar finanças pessoais e profissionais e ter uma visão consolidada.</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 ml-auto h-7 text-xs">
                Em breve
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patrimônio Total</p>
              <p className="text-lg font-bold text-foreground">{brl(metrics.totalPatrimony)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Caixa
              </p>
              <p className="text-lg font-bold text-foreground">{brl(metrics.totalCash)}</p>
              <p className="text-[10px] text-muted-foreground">{metrics.accountCount} conta(s)</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Investimentos
              </p>
              <p className="text-lg font-bold text-foreground">{brl(metrics.totalInvestments)}</p>
              <div className={cn("flex items-center gap-1 text-[10px]", metrics.invProfitPct >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {metrics.invProfitPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {metrics.invProfitPct >= 0 ? "+" : ""}{metrics.invProfitPct.toFixed(2)}%
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projetos (Orçamento)</p>
              <p className="text-lg font-bold text-foreground">{brl(metrics.totalProjectBudget)}</p>
              <p className="text-[10px] text-muted-foreground">{projects.length} projeto(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Patrimony evolution */}
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" /> Evolução do Patrimônio
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={metrics.evolution}>
                  <defs>
                    <linearGradient id="patrimonioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(0 0% 40%)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                  <Area type="monotone" dataKey="value" stroke="hsl(217, 91%, 60%)" fill="url(#patrimonioGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Allocation pie */}
          <Card className="bg-card">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                <PiggyBank className="h-3.5 w-3.5 text-primary" /> Alocação do Patrimônio
              </p>
              {metrics.allocation.filter(a => a.value > 0).length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={metrics.allocation.filter(a => a.value > 0)}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        innerRadius={30}
                        strokeWidth={1}
                      >
                        {metrics.allocation.filter(a => a.value > 0).map((a, i) => (
                          <Cell key={i} fill={a.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1">
                    {metrics.allocation.filter(a => a.value > 0).map((a, i) => {
                      const pct = metrics.totalPatrimony > 0 ? ((a.value / metrics.totalPatrimony) * 100).toFixed(1) : "0";
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                          <span className="text-muted-foreground flex-1">{a.name}</span>
                          <span className="font-medium text-foreground">{pct}%</span>
                          <span className="text-muted-foreground">{brl(a.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Nenhum dado de patrimônio ainda</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Accounts overview */}
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5 text-primary" /> Contas e Saldos
            </p>
            {accounts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map(acc => (
                  <div key={acc.id} className="flex items-center gap-3 rounded-lg border border-border/30 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      {ACCOUNT_ICONS[acc.type] || <Wallet className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{acc.name}</p>
                      <p className={cn("text-sm font-bold", Number(acc.current_balance) >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                        {brl(Number(acc.current_balance))}
                      </p>
                    </div>
                    {acc.credit_limit && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        Limite: {brl(Number(acc.credit_limit))}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conta cadastrada. Adicione contas no módulo Finanças.</p>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        {metrics.alerts.length > 0 && (
          <Card className="bg-card border-warning/30">
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Alertas
              </p>
              <div className="space-y-1.5">
                {metrics.alerts.map((alert, i) => (
                  <p key={i} className="text-xs text-warning flex items-center gap-1.5">
                    ⚠️ {alert}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
