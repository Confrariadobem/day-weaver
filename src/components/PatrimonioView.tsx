import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Wallet, TrendingUp, TrendingDown, Landmark, CreditCard, PiggyBank,
  BarChart3, AlertTriangle, Lock, ArrowUpRight, ArrowDownRight,
  Banknote, WalletCards, Bitcoin, Star, Save, Trash2, Eye, EyeOff,
  ExternalLink,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

type ProfileFilter = "pessoal" | "profissional" | "tudo";
type AccountType = "bank_account" | "credit_card" | "investment" | "wallet" | "cash" | "crypto";

const ALLOC_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4", "#ef4444", "#84cc16"];

const ACCOUNT_ICONS: Record<string, React.ReactNode> = {
  bank_account: <Landmark className="h-5 w-5" />,
  credit_card: <CreditCard className="h-5 w-5" />,
  investment: <PiggyBank className="h-5 w-5" />,
  wallet: <WalletCards className="h-5 w-5" />,
  cash: <Banknote className="h-5 w-5" />,
  crypto: <Bitcoin className="h-5 w-5" />,
};

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank_account: "Conta Bancária",
  credit_card: "Cartão de Crédito",
  investment: "Investimento",
  wallet: "Carteira Digital",
  cash: "Dinheiro",
  crypto: "Criptoativos",
};

interface PatrimonioViewProps {
  onNavigateToFluxo?: (acc: { id: string; name: string }) => void;
}

export default function PatrimonioView({ onNavigateToFluxo }: PatrimonioViewProps) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("pessoal");
  const [hasUpgrade] = useState(true);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  // Account edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("bank_account");
  const [accBalance, setAccBalance] = useState("0");
  const [accLimit, setAccLimit] = useState("");
  const [accClosing, setAccClosing] = useState("");
  const [accDue, setAccDue] = useState("");
  const [accIsActive, setAccIsActive] = useState(true);

  const [inactiveAccounts, setInactiveAccounts] = useState<any[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [accRes, inactiveRes, entRes, invRes, projRes] = await Promise.all([
      supabase.from("financial_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
      supabase.from("financial_accounts").select("*").eq("user_id", user.id).eq("is_active", false),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id).eq("is_active", true),
      supabase.from("projects").select("*").eq("user_id", user.id),
    ]);
    if (accRes.data) setAccounts(accRes.data);
    if (inactiveRes.data) setInactiveAccounts(inactiveRes.data);
    if (entRes.data) setEntries(entRes.data);
    if (invRes.data) setInvestments(invRes.data);
    if (projRes.data) setProjects(projRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    const handleDataChanged = () => fetchData();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => window.removeEventListener("lovable:data-changed", handleDataChanged);
  }, [fetchData]);

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

  // Account double-click to edit
  const handleAccountClick = (acc: any) => {
    const now = Date.now();
    if (lastClickRef.current?.id === acc.id && now - lastClickRef.current.time < 400) {
      openAccountEdit(acc);
      lastClickRef.current = null;
    } else {
      lastClickRef.current = { id: acc.id, time: now };
    }
  };

  const openAccountEdit = (acc: any) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccType(acc.type as AccountType);
    setAccBalance(String(acc.current_balance));
    setAccLimit(acc.credit_limit ? String(acc.credit_limit) : "");
    setAccClosing(acc.closing_day ? String(acc.closing_day) : "");
    setAccDue(acc.due_day ? String(acc.due_day) : "");
    setAccIsActive(acc.is_active !== false);
    setEditDialogOpen(true);
  };

  const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const saveAccount = async () => {
    if (!accName.trim() || !user) return;
    const bal = parseNum(accBalance);
    const data: any = {
      name: accName, type: accType,
      current_balance: bal,
      credit_limit: accLimit ? parseNum(accLimit) : null,
      closing_day: accClosing ? parseInt(accClosing) : null,
      due_day: accDue ? parseInt(accDue) : null,
      is_active: accIsActive,
    };
    if (editingAccount) {
      await supabase.from("financial_accounts").update(data).eq("id", editingAccount.id);
    }
    setEditDialogOpen(false);
    setEditingAccount(null);
    fetchData();
  };

  const toggleDefault = async (acc: any) => {
    await supabase.from("financial_accounts").update({ is_default: false } as any).eq("user_id", user!.id);
    await supabase.from("financial_accounts").update({ is_default: !acc.is_default } as any).eq("id", acc.id);
    fetchData();
  };

  const reactivateAccount = async (accId: string) => {
    await supabase.from("financial_accounts").update({ is_active: true }).eq("id", accId);
    fetchData();
  };

  const deactivateAccount = async (accId: string) => {
    await supabase.from("financial_accounts").update({ is_active: false }).eq("id", accId);
    fetchData();
  };

  // Monthly movements per account
  const monthlyMovements = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const result: Record<string, number> = {};
    entries.forEach(e => {
      if (!e.account_id) return;
      const d = new Date(e.entry_date + "T12:00:00");
      if (d < monthStart || d > monthEnd) return;
      const sign = e.type === "revenue" ? 1 : -1;
      result[e.account_id] = (result[e.account_id] || 0) + sign * Number(e.amount);
    });
    return result;
  }, [entries]);

  // Sorted accounts: favorites first (alphabetical), then non-favorites (alphabetical)
  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [accounts]);

  const sortedInactive = useMemo(() => {
    return [...inactiveAccounts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [inactiveAccounts]);

  // Weekly bullet chart data
  const weeklyBullet = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { locale: ptBR });
    const weekEnd = endOfWeek(now, { locale: ptBR });
    const weekEntries = entries.filter(e => {
      const d = new Date(e.entry_date + "T12:00:00");
      return d >= weekStart && d <= weekEnd;
    });
    const rev = weekEntries.filter(e => e.type === "revenue").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const exp = weekEntries.filter(e => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const balance = rev - exp;
    const maxVal = Math.max(rev, exp, 1);
    return { rev, exp, balance, maxVal };
  }, [entries]);

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
      <div className="p-4 max-w-full overflow-hidden space-y-4">
        {/* Profile filter (balance indicator moved to sticky header in Dashboard) */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <Button
            variant={profileFilter === "pessoal" ? "default" : "ghost"}
            size="sm"
            onClick={() => setProfileFilter("pessoal")}
            className={cn("h-7 text-xs px-3 rounded-full shrink-0", profileFilter !== "pessoal" && "text-muted-foreground")}
          >
            Pessoal
          </Button>
          <Button
            variant={profileFilter === "profissional" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              if (!hasUpgrade) return;
              setProfileFilter("profissional");
            }}
            className={cn("h-7 text-xs px-3 rounded-full gap-1.5 shrink-0", profileFilter !== "profissional" && "text-muted-foreground", !hasUpgrade && "opacity-50")}
            disabled={!hasUpgrade}
          >
            <Lock className="h-3 w-3" /> Profissional
          </Button>
          <Button
            variant={profileFilter === "tudo" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              if (!hasUpgrade) return;
              setProfileFilter("tudo");
            }}
            className={cn("h-7 text-xs px-3 rounded-full gap-1.5 shrink-0", profileFilter !== "tudo" && "text-muted-foreground", !hasUpgrade && "opacity-50")}
            disabled={!hasUpgrade}
          >
            <Lock className="h-3 w-3" /> Tudo
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={metrics.allocation.filter(a => a.value > 0)}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        innerRadius={36}
                        paddingAngle={4}
                        cornerRadius={6}
                        stroke="none"
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
              <Landmark className="h-3.5 w-3.5 text-primary" /> Carteiras e Saldos
            </p>
            {sortedAccounts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sortedAccounts.map(acc => {
                  const movement = monthlyMovements[acc.id] || 0;
                  const creditAvailable = acc.type === "credit_card" && acc.credit_limit
                    ? Number(acc.credit_limit) + Number(acc.current_balance)
                    : null;
                  return (
                    <div key={acc.id} className="relative rounded-lg border border-border/30 p-3 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => handleAccountClick(acc)}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleDefault(acc); }}
                        className="absolute top-2 right-2 p-0.5 rounded transition-colors group/star"
                        title="Favoritar como padrão"
                      >
                        <Star className={cn("h-5 w-5 transition-colors", acc.is_default ? "fill-warning text-warning" : "text-[#6b7280] group-hover/star:text-[#3b82f6]")} />
                      </button>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center text-[#6b7280]">
                          {ACCOUNT_ICONS[acc.type] || <Wallet className="h-5 w-5" />}
                        </div>
                        <p className="text-sm font-semibold text-foreground truncate pr-6">{acc.name}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[0.9rem] text-[#6b7280]">
                          Saldo Inicial: {brl(Number(acc.initial_balance))}
                        </p>
                        <p className={cn("text-[0.9rem]", movement >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>
                          Movimentos: {movement >= 0 ? "+" : ""}{brl(movement)}
                        </p>
                        <p className={cn("text-[0.9rem] font-bold", Number(acc.current_balance) >= 0 ? "text-foreground" : "text-destructive")}>
                          Saldo Atual: {brl(Number(acc.current_balance))}
                        </p>
                        {creditAvailable !== null && (
                          <p className={cn("text-[0.9rem]", creditAvailable >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>
                            Limite disponível: {brl(creditAvailable)}
                          </p>
                        )}
                      </div>
                      {onNavigateToFluxo && (
                        <div className="mt-2 pt-2 border-t border-border/20 flex items-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); onNavigateToFluxo({ id: acc.id, name: acc.name }); }}
                            className="text-[0.9rem] text-[#6b7280] border border-[#d1d5db] rounded-md px-3 py-1 hover:text-primary hover:border-primary transition-colors ml-auto"
                          >
                            Ver Fluxo
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma carteira cadastrada. Adicione carteiras na Central de Lançamentos.</p>
            )}

            {/* Link para carteiras inativas */}
            {inactiveAccounts.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowInactive(!showInactive)}
                  className="flex items-center gap-1.5 text-[0.9rem] text-[#9ca3af] opacity-70 hover:underline hover:opacity-100 transition-opacity group/inactive"
                >
                  {showInactive
                    ? <EyeOff className="h-5 w-5 text-[#9ca3af] group-hover/inactive:text-[#3b82f6] transition-colors" />
                    : <Eye className="h-5 w-5 text-[#9ca3af] group-hover/inactive:text-[#3b82f6] transition-colors" />
                  }
                  Inativas ({inactiveAccounts.length})
                </button>

                {showInactive && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-2 animate-in slide-in-from-top-2 duration-200">
                    {sortedInactive.map(acc => {
                      const movement = monthlyMovements[acc.id] || 0;
                      return (
                        <div key={acc.id} className="relative rounded-lg border border-border/30 p-3 bg-[#f3f4f6] dark:bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => { openAccountEdit(acc); }}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex h-8 w-8 items-center justify-center text-[#6b7280] opacity-60">
                              {ACCOUNT_ICONS[acc.type] || <Wallet className="h-5 w-5" />}
                            </div>
                            <p className="text-sm font-semibold text-foreground truncate flex-1 opacity-60">{acc.name}</p>
                          </div>
                          <div className="space-y-0.5 opacity-60">
                            <p className="text-[0.9rem] text-[#6b7280]">
                              Saldo Inicial: {brl(Number(acc.initial_balance))}
                            </p>
                            <p className={cn("text-[0.9rem]", movement >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>
                              Movimentos: {movement >= 0 ? "+" : ""}{brl(movement)}
                            </p>
                            <p className={cn("text-[0.9rem] font-bold", Number(acc.current_balance) >= 0 ? "text-foreground" : "text-destructive")}>
                              Saldo Atual: {brl(Number(acc.current_balance))}
                            </p>
                          </div>
                          {onNavigateToFluxo && (
                            <div className="flex items-center mt-2 opacity-60">
                              <button
                                onClick={(e) => { e.stopPropagation(); onNavigateToFluxo({ id: acc.id, name: acc.name }); }}
                                className="text-[0.9rem] text-[#6b7280] border border-[#d1d5db] rounded-md px-3 py-1 hover:text-primary hover:border-primary transition-colors ml-auto"
                              >
                                Ver Fluxo
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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

      {/* Account Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar Carteira</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Nome</Label>
              <Input value={accName} onChange={(e) => setAccName(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Tipo</Label>
              <Select value={accType} onValueChange={(v) => setAccType(v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(ACCOUNT_TYPE_LABELS) as [AccountType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Saldo Atual</Label>
              <Input value={accBalance} onChange={(e) => setAccBalance(e.target.value)} />
            </div>
            {accType === "credit_card" && (
              <>
                <div><Label className="text-sm">Limite</Label><Input value={accLimit} onChange={(e) => setAccLimit(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-sm">Dia Fechamento</Label><Input type="number" value={accClosing} onChange={(e) => setAccClosing(e.target.value)} /></div>
                  <div><Label className="text-sm">Dia Vencimento</Label><Input type="number" value={accDue} onChange={(e) => setAccDue(e.target.value)} /></div>
                </div>
              </>
            )}
            <div className="flex items-center justify-between pt-1">
              <Label className="text-sm text-muted-foreground">Ativa</Label>
              <Switch checked={accIsActive} onCheckedChange={setAccIsActive} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t border-border/20">
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveAccount} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
