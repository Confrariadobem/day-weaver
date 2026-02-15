import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, ArrowUpDown, TrendingUp, TrendingDown, Wallet, Trash2, Pencil,
  Printer, FileDown, Repeat, Landmark, CreditCard, PiggyBank, WalletCards,
  Banknote, Bitcoin, ChevronDown, ChevronUp, Check, CalendarDays, Filter,
  CircleDollarSign, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addMonths, addWeeks, addDays, startOfYear, endOfYear, eachMonthOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Line, Legend, Cell, PieChart, Pie,
} from "recharts";
import type { Tables as DBTables } from "@/integrations/supabase/types";

type PeriodFilter = "daily" | "3days" | "weekly" | "monthly" | "yearly" | "custom";
type SortField = "title" | "amount" | "entry_date" | "type" | "category" | "is_paid";
type SortDir = "asc" | "desc";
type RecurrenceType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
type ViewTab = "previsao" | "doar" | "relatorios" | "contas";
type AccountType = "bank_account" | "credit_card" | "investment" | "wallet" | "cash" | "crypto";
type CashFlowFilter = "all" | "payable" | "receivable" | "overdue" | "paid" | "pending";

interface FinancialAccount {
  id: string;
  user_id: string;
  name: string;
  type: string;
  initial_balance: number;
  current_balance: number;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  color: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const ACCOUNT_TYPE_LABELS: Record<AccountType, { label: string; icon: React.ReactNode }> = {
  bank_account: { label: "Conta Bancária", icon: <Landmark className="h-4 w-4" /> },
  credit_card: { label: "Cartão de Crédito", icon: <CreditCard className="h-4 w-4" /> },
  investment: { label: "Investimento", icon: <PiggyBank className="h-4 w-4" /> },
  wallet: { label: "Carteira Digital", icon: <WalletCards className="h-4 w-4" /> },
  cash: { label: "Dinheiro", icon: <Banknote className="h-4 w-4" /> },
  crypto: { label: "Criptoativos", icon: <Bitcoin className="h-4 w-4" /> },
};

const PAYMENT_METHODS = [
  "Débito", "Crédito", "PIX", "Boleto", "Transferência", "Dinheiro", "Crypto",
];

const PERIOD_OPTIONS: { key: PeriodFilter; label: string }[] = [
  { key: "daily", label: "Dia" },
  { key: "3days", label: "3 Dias" },
  { key: "weekly", label: "Semana" },
  { key: "monthly", label: "Mês" },
  { key: "yearly", label: "Ano" },
  { key: "custom", label: "Personalizado" },
];

const tooltipStyle = {
  background: "hsl(0 0% 10%)",
  border: "1px solid hsl(0 0% 20%)",
  borderRadius: 8,
  fontSize: 12,
};

const CHART_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function FinancesView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<DBTables<"projects">[]>([]);
  const [categories, setCategories] = useState<DBTables<"categories">[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("monthly");
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("previsao");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [recurrenceEditDialog, setRecurrenceEditDialog] = useState<{ entry: any; mode: "single" | "all" | null }>({ entry: null, mode: null });
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [doarYear, setDoarYear] = useState(new Date().getFullYear());
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [revenueCollapsed, setRevenueCollapsed] = useState(false);
  const [expenseCollapsed, setExpenseCollapsed] = useState(false);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [cashFlowFilter, setCashFlowFilter] = useState<CashFlowFilter>("all");
  const [hidePaid, setHidePaid] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"revenue" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [installments, setInstallments] = useState("1");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("none");
  const [recurrenceCount, setRecurrenceCount] = useState("12");
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isPaid, setIsPaid] = useState(false);

  // Account form state
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("bank_account");
  const [accBalance, setAccBalance] = useState("0");
  const [accLimit, setAccLimit] = useState("");
  const [accClosing, setAccClosing] = useState("");
  const [accDue, setAccDue] = useState("");
  const [accColor, setAccColor] = useState("#3b82f6");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [entRes, projRes, catRes, accRes] = await Promise.all([
      supabase.from("financial_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", user.id),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("financial_accounts").select("*").eq("user_id", user.id).order("name"),
    ]);
    if (entRes.data) setEntries(entRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (accRes.data) setAccounts(accRes.data as FinancialAccount[]);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setTitle(""); setAmount(""); setInstallments("1"); setCategoryId(""); setProjectId("");
    setEntryDate(format(new Date(), "yyyy-MM-dd")); setType("expense");
    setRecurrence("none"); setRecurrenceCount("12"); setEditingEntry(null);
    setAccountId(""); setPaymentMethod(""); setIsPaid(false);
  };

  const resetAccForm = () => {
    setAccName(""); setAccType("bank_account"); setAccBalance("0");
    setAccLimit(""); setAccClosing(""); setAccDue(""); setAccColor("#3b82f6");
    setEditingAccount(null);
  };

  const handleRowClick = (entry: any) => {
    const now = Date.now();
    if (lastClickRef.current?.id === entry.id && now - lastClickRef.current.time < 400) {
      // Double click detected
      if (entry.installment_group && entry.total_installments > 1) {
        setRecurrenceEditDialog({ entry, mode: null });
      } else {
        openEditDialog(entry);
      }
      lastClickRef.current = null;
    } else {
      lastClickRef.current = { id: entry.id, time: now };
    }
  };

  const openEditDialog = (entry: any) => {
    setEditingEntry(entry);
    setTitle(entry.title.replace(/\s*\(\d+\/\d+\)$/, ""));
    setAmount(String(entry.amount));
    setType(entry.type as "revenue" | "expense");
    setCategoryId(entry.category_id || "");
    setProjectId(entry.project_id || "");
    setEntryDate(entry.entry_date);
    setAccountId(entry.account_id || "");
    setPaymentMethod(entry.payment_method || "");
    setIsPaid(entry.is_paid || false);
    setInstallments("1");
    setRecurrence("none");
    setDialogOpen(true);
  };

  const getNextDate = (base: Date, rec: RecurrenceType, i: number): Date => {
    switch (rec) {
      case "daily": return addDays(base, i);
      case "weekly": return addWeeks(base, i);
      case "biweekly": return addWeeks(base, i * 2);
      case "monthly": return addMonths(base, i);
      case "yearly": return addMonths(base, i * 12);
      default: return base;
    }
  };

  const createOrUpdateEntry = async () => {
    if (!title.trim() || !amount || !user) return;
    if (isPaid && (!accountId || !paymentMethod)) return;

    if (editingEntry) {
      const updateData: any = {
        title, amount: parseFloat(amount), type,
        category_id: categoryId || null, project_id: projectId || null,
        entry_date: entryDate, account_id: accountId || null,
        payment_method: paymentMethod || null, is_paid: isPaid,
        payment_date: isPaid ? format(new Date(), "yyyy-MM-dd") : null,
      };

      if (recurrenceEditDialog.mode === "all" && editingEntry.installment_group) {
        // Update all future entries in the group
        const allGroup = entries.filter(
          (e) => e.installment_group === editingEntry.installment_group &&
            e.installment_number >= editingEntry.installment_number
        );
        for (const e of allGroup) {
          await supabase.from("financial_entries").update({
            ...updateData,
            title: allGroup.length > 1
              ? `${title} (${e.installment_number}/${editingEntry.total_installments})`
              : title,
            entry_date: e.entry_date,
          }).eq("id", e.id);
        }
      } else {
        await supabase.from("financial_entries").update(updateData).eq("id", editingEntry.id);
      }
    } else {
      const baseAmount = parseFloat(amount);
      const baseDate = new Date(entryDate);

      if (recurrence !== "none") {
        const count = Math.max(1, parseInt(recurrenceCount) || 12);
        const group = crypto.randomUUID();
        const entriesToInsert = Array.from({ length: count }, (_, i) => ({
          user_id: user.id,
          title: `${title} (${i + 1}/${count})`,
          amount: baseAmount, type,
          category_id: categoryId || null, project_id: projectId || null,
          entry_date: format(getNextDate(baseDate, recurrence, i), "yyyy-MM-dd"),
          installment_group: group, installment_number: i + 1, total_installments: count,
          account_id: accountId || null, payment_method: paymentMethod || null,
          is_paid: i === 0 ? isPaid : false,
        }));
        await supabase.from("financial_entries").insert(entriesToInsert);
        // Calendar events
        const calEvents = Array.from({ length: count }, (_, i) => ({
          user_id: user.id,
          title: `💰 ${title}`,
          start_time: getNextDate(baseDate, recurrence, i).toISOString(),
          all_day: true,
          color: type === "revenue" ? "#22c55e" : "#ef4444",
          description: `Lançamento financeiro: ${brl(baseAmount)} (${type === "revenue" ? "Receita" : "Despesa"})`,
        }));
        await supabase.from("calendar_events").insert(calEvents);
      } else {
        const numInst = Math.max(1, parseInt(installments) || 1);
        const instGroup = numInst > 1 ? crypto.randomUUID() : null;
        const entriesToInsert = Array.from({ length: numInst }, (_, i) => ({
          user_id: user.id,
          title: numInst > 1 ? `${title} (${i + 1}/${numInst})` : title,
          amount: baseAmount / numInst, type,
          category_id: categoryId || null, project_id: projectId || null,
          entry_date: format(addMonths(baseDate, i), "yyyy-MM-dd"),
          installment_group: instGroup, installment_number: i + 1, total_installments: numInst,
          account_id: accountId || null, payment_method: paymentMethod || null,
          is_paid: i === 0 ? isPaid : false,
        }));
        await supabase.from("financial_entries").insert(entriesToInsert);
      }
    }

    // Update account balance if paid
    if (isPaid && accountId) {
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        const delta = type === "revenue" ? parseFloat(amount) : -parseFloat(amount);
        await supabase.from("financial_accounts").update({
          current_balance: account.current_balance + delta,
        }).eq("id", accountId);
      }
    }

    resetForm();
    setDialogOpen(false);
    setRecurrenceEditDialog({ entry: null, mode: null });
    fetchData();
  };

  const togglePaid = async (entry: any) => {
    const newPaid = !entry.is_paid;
    await supabase.from("financial_entries").update({
      is_paid: newPaid,
      payment_date: newPaid ? format(new Date(), "yyyy-MM-dd") : null,
    }).eq("id", entry.id);

    if (entry.account_id) {
      const account = accounts.find(a => a.id === entry.account_id);
      if (account) {
        const delta = entry.type === "revenue"
          ? (newPaid ? Number(entry.amount) : -Number(entry.amount))
          : (newPaid ? -Number(entry.amount) : Number(entry.amount));
        await supabase.from("financial_accounts").update({
          current_balance: account.current_balance + delta,
        }).eq("id", entry.account_id);
      }
    }
    fetchData();
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("financial_entries").delete().eq("id", id);
    fetchData();
  };

  const saveAccount = async () => {
    if (!accName.trim() || !user) return;
    const data = {
      user_id: user.id, name: accName, type: accType,
      initial_balance: parseFloat(accBalance) || 0,
      current_balance: editingAccount ? editingAccount.current_balance : (parseFloat(accBalance) || 0),
      credit_limit: accLimit ? parseFloat(accLimit) : null,
      closing_day: accClosing ? parseInt(accClosing) : null,
      due_day: accDue ? parseInt(accDue) : null,
      color: accColor,
    };
    if (editingAccount) {
      await supabase.from("financial_accounts").update(data).eq("id", editingAccount.id);
    } else {
      await supabase.from("financial_accounts").insert(data);
    }
    resetAccForm();
    setAccountDialogOpen(false);
    fetchData();
  };

  const deleteAccount = async (id: string) => {
    await supabase.from("financial_accounts").delete().eq("id", id);
    fetchData();
  };

  const now = new Date();
  const periodRange = useMemo(() => {
    switch (period) {
      case "daily": return { start: startOfDay(now), end: endOfDay(now) };
      case "3days": return { start: startOfDay(now), end: endOfDay(addDays(now, 2)) };
      case "weekly": return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
      case "monthly": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "yearly": return { start: startOfYear(now), end: endOfYear(now) };
      case "custom": return { start: new Date(customStart), end: new Date(customEnd) };
    }
  }, [period, customStart, customEnd]);

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return entries
      .filter((e) => {
        const d = new Date(e.entry_date);
        if (d < periodRange.start || d > periodRange.end) return false;
        if (cashFlowFilter === "payable") return e.type === "expense" && !e.is_paid;
        if (cashFlowFilter === "receivable") return e.type === "revenue" && !e.is_paid;
        if (cashFlowFilter === "overdue") {
          const entryDate = new Date(e.entry_date);
          entryDate.setHours(0, 0, 0, 0);
          return !e.is_paid && entryDate < today;
        }
        if (cashFlowFilter === "paid") return e.is_paid;
        if (cashFlowFilter === "pending") return !e.is_paid;
        // "all" filter: respect hidePaid toggle
        if (hidePaid && e.is_paid) return false;
        return true;
      })
      .sort((a, b) => {
        let aVal: any, bVal: any;
        if (sortField === "category") {
          aVal = categories.find(c => c.id === a.category_id)?.name || "";
          bVal = categories.find(c => c.id === b.category_id)?.name || "";
        } else if (sortField === "is_paid") {
          aVal = a.is_paid ? 1 : 0;
          bVal = b.is_paid ? 1 : 0;
        } else {
          aVal = a[sortField]; bVal = b[sortField];
        }
        if (aVal == null || bVal == null) return 0;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [entries, periodRange, sortField, sortDir, categories, cashFlowFilter, hidePaid]);

  const totalRevenue = filtered.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = filtered.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const balance = totalRevenue - totalExpense;

  // Running balance for cash flow forecast
  const runningBalances = useMemo(() => {
    // Sort by date ascending for running balance
    const sorted = [...filtered].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    let running = 0;
    const balanceMap = new Map<string, number>();
    let breakEvenId: string | null = null;
    for (const e of sorted) {
      const prev = running;
      running += e.type === "revenue" ? Number(e.amount) : -Number(e.amount);
      balanceMap.set(e.id, running);
      if (breakEvenId === null && ((prev < 0 && running >= 0) || (prev >= 0 && running < 0))) {
        breakEvenId = e.id;
      }
    }
    return { balanceMap, breakEvenId };
  }, [filtered]);

  const totalAvailable = accounts.reduce((s, a) => {
    if (a.type === "credit_card") return s; // don't count credit cards in available
    return s + a.current_balance;
  }, 0);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="ml-1 inline-flex flex-col leading-none">
      <ChevronUp className={cn("h-2.5 w-2.5", sortField === field && sortDir === "asc" ? "text-foreground" : "text-muted-foreground/40")} />
      <ChevronDown className={cn("h-2.5 w-2.5 -mt-0.5", sortField === field && sortDir === "desc" ? "text-foreground" : "text-muted-foreground/40")} />
    </span>
  );

  const finCategories = categories.filter((c) => c.is_revenue || c.is_expense);

  // DRE / DOAR data
  const dreData = useMemo(() => {
    const yr = doarYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    const revenueCategories = categories.filter(c => c.is_revenue);
    const expenseCategories = categories.filter(c => c.is_expense);

    const getMonthEntries = (month: Date) =>
      entries.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });

    // Previous year carry-over
    const prevYearEntries = entries.filter(e => new Date(e.entry_date).getFullYear() < yr);
    const carryOver = prevYearEntries.reduce((s, e) =>
      s + (e.type === "revenue" ? Number(e.amount) : -Number(e.amount)), 0);

    const revRows = revenueCategories
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map(cat => ({
        id: cat.id, name: cat.name, color: cat.color,
        months: months.map(m => {
          const mEntries = getMonthEntries(m).filter(e => e.type === "revenue" && e.category_id === cat.id);
          return mEntries.reduce((s, e) => s + Number(e.amount), 0);
        }),
      }));

    // Uncategorized revenue - always last
    const uncatRev = months.map(m => {
      const mEntries = getMonthEntries(m).filter(e => e.type === "revenue" && !e.category_id);
      return mEntries.reduce((s, e) => s + Number(e.amount), 0);
    });
    if (uncatRev.some(v => v > 0)) {
      revRows.push({ id: "uncat-rev", name: "Outras Receitas", color: "#6b7280", months: uncatRev });
    }

    const expRows = expenseCategories
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map(cat => ({
        id: cat.id, name: cat.name, color: cat.color,
        months: months.map(m => {
          const mEntries = getMonthEntries(m).filter(e => e.type === "expense" && e.category_id === cat.id);
          return mEntries.reduce((s, e) => s + Number(e.amount), 0);
        }),
      }));

    const uncatExp = months.map(m => {
      const mEntries = getMonthEntries(m).filter(e => e.type === "expense" && !e.category_id);
      return mEntries.reduce((s, e) => s + Number(e.amount), 0);
    });
    if (uncatExp.some(v => v > 0)) {
      expRows.push({ id: "uncat-exp", name: "Outras Despesas", color: "#6b7280", months: uncatExp });
    }

    const monthTotalsRev = months.map((_, i) => revRows.reduce((s, r) => s + r.months[i], 0));
    const monthTotalsExp = months.map((_, i) => expRows.reduce((s, r) => s + r.months[i], 0));
    const monthBalance = months.map((_, i) => monthTotalsRev[i] - monthTotalsExp[i]);

    // Accumulated with carry-over
    let acc = carryOver;
    const accumulated = monthBalance.map(b => { acc += b; return acc; });

    return {
      months: months.map(m => format(m, "MMM", { locale: ptBR }).toUpperCase()),
      revRows, expRows,
      monthTotalsRev, monthTotalsExp, monthBalance, accumulated,
      carryOver,
    };
  }, [entries, categories, doarYear]);

  // Reports data
  const reportChartData = useMemo(() => {
    const yr = doarYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    let accumulated = 0;
    return months.map(month => {
      const mEntries = entries.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      const rev = mEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const exp = mEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      accumulated += rev - exp;
      return {
        month: format(month, "MMM", { locale: ptBR }).toUpperCase(),
        receita: rev, despesa: exp, saldo: rev - exp, acumulado: accumulated,
      };
    });
  }, [entries, doarYear]);

  const categoryPieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    filtered.filter(e => e.type === "expense").forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      const color = cat?.color || "#6b7280";
      const prev = map.get(name) || { name, value: 0, color };
      prev.value += Number(e.amount);
      map.set(name, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filtered, categories]);

  const revenuePieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    filtered.filter(e => e.type === "revenue").forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      const color = cat?.color || "#6b7280";
      const prev = map.get(name) || { name, value: 0, color };
      prev.value += Number(e.amount);
      map.set(name, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filtered, categories]);

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const header = "Data,Título,Tipo,Categoria,Projeto,Conta,Pago,Forma Pgto,Valor\n";
    const rows = filtered.map(e => {
      const cat = categories.find(c => c.id === e.category_id)?.name || "";
      const proj = projects.find(p => p.id === e.project_id)?.name || "";
      const acc = accounts.find(a => a.id === e.account_id)?.name || "";
      return `${e.entry_date},"${e.title}",${e.type === "revenue" ? "Receita" : "Despesa"},"${cat}","${proj}","${acc}",${e.is_paid ? "Sim" : "Não"},"${e.payment_method || ""}",${e.amount}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financeiro_${format(now, "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintDOAR = () => {
    const printContent = document.getElementById("doar-print-area");
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>DOAR ${doarYear}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial, sans-serif; font-size: 9px; }
        @page { size: A4 landscape; margin: 10mm; }
        @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: right; }
        th { background: #f3f4f6; font-weight: bold; }
        td:first-child, th:first-child { text-align: left; }
        .section-header { background: #e5e7eb; font-weight: bold; text-align: left; }
        .total-row { background: #f9fafb; font-weight: bold; }
        .text-green { color: #16a34a; } .text-red { color: #dc2626; } .text-blue { color: #2563eb; }
      </style></head><body>
      ${printContent.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground">Receitas</p>
              <p className="text-sm font-bold text-success">{brl(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground">Despesas</p>
              <p className="text-sm font-bold text-destructive">{brl(totalExpense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo</p>
              <p className={cn("text-sm font-bold", balance >= 0 ? "text-success" : "text-destructive")}>{brl(balance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Landmark className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Caixa Disponível</p>
              <p className={cn("text-sm font-bold", totalAvailable >= 0 ? "text-success" : "text-destructive")}>{brl(totalAvailable)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Period filter */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="previsao" className="text-xs">Previsão de Caixa</TabsTrigger>
            <TabsTrigger value="doar" className="text-xs">DOAR</TabsTrigger>
            <TabsTrigger value="relatorios" className="text-xs">Relatórios</TabsTrigger>
            <TabsTrigger value="contas" className="text-xs">Carteira</TabsTrigger>
          </TabsList>
        </Tabs>

        {(viewTab === "previsao" || viewTab === "relatorios") && (
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(p => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === "custom" && (
              <div className="flex items-center gap-1">
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-32 text-xs" />
                <span className="text-xs text-muted-foreground">a</span>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-32 text-xs" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">

        {/* ============ LANÇAMENTOS ============ */}
        {viewTab === "previsao" && (
          <>
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              {/* Cash flow filters */}
              <div className="flex items-center gap-1">
                <Button size="sm" variant={cashFlowFilter === "all" ? "default" : "outline"} className="h-7 text-[11px] px-2.5" onClick={() => setCashFlowFilter("all")}>
                  Todos
                </Button>
                <Button size="sm" variant={cashFlowFilter === "payable" ? "default" : "outline"} className="h-7 text-[11px] px-2.5 gap-1" onClick={() => setCashFlowFilter("payable")}>
                  <ArrowDownCircle className="h-3 w-3" /> Contas a Pagar
                </Button>
                <Button size="sm" variant={cashFlowFilter === "receivable" ? "default" : "outline"} className="h-7 text-[11px] px-2.5 gap-1" onClick={() => setCashFlowFilter("receivable")}>
                  <ArrowUpCircle className="h-3 w-3" /> Contas a Receber
                </Button>
                <Button size="sm" variant={cashFlowFilter === "overdue" ? "destructive" : "outline"} className="h-7 text-[11px] px-2.5 gap-1" onClick={() => setCashFlowFilter("overdue")}>
                  <AlertTriangle className="h-3 w-3" /> Atrasados
                </Button>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <Checkbox checked={hidePaid} onCheckedChange={(c) => setHidePaid(!!c)} className="h-3.5 w-3.5" />
                  Ocultar pagos
                </label>
                <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 text-[11px]"><Plus className="mr-1 h-3 w-3" /> Lançamento</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{editingEntry ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={amount}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.,]/g, "");
                              setAmount(v);
                            }}
                            className="pl-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <Select value={type} onValueChange={(v) => setType(v as "revenue" | "expense")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="revenue">🟢 Receita</SelectItem>
                            <SelectItem value="expense">🔴 Despesa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="pl-10" />
                        </div>
                        {!editingEntry && recurrence === "none" && (
                          <Input type="number" placeholder="Parcelas" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
                        )}
                      </div>

                      {/* Recurrence */}
                      {!editingEntry && (
                        <div className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Repeat className="h-3.5 w-3.5" /> Recorrência
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceType)}>
                              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                <SelectItem value="daily">Diária</SelectItem>
                                <SelectItem value="weekly">Semanal</SelectItem>
                                <SelectItem value="biweekly">Quinzenal</SelectItem>
                                <SelectItem value="monthly">Mensal</SelectItem>
                                <SelectItem value="yearly">Anual</SelectItem>
                              </SelectContent>
                            </Select>
                            {recurrence !== "none" && (
                              <Input type="number" placeholder="Qtd. ocorrências" min="1" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} className="text-xs" />
                            )}
                          </div>
                        </div>
                      )}

                      <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger><SelectValue placeholder="Categoria (opcional)" /></SelectTrigger>
                        <SelectContent>
                          {finCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger><SelectValue placeholder="Projeto (opcional)" /></SelectTrigger>
                        <SelectContent>
                          {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      {/* Payment info - moved below project */}
                      <div className="rounded-lg border border-border p-3 space-y-2">
                         <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                           <Wallet className="h-3.5 w-3.5" /> Pagamento {isPaid && <span className="text-destructive">*</span>}
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                           <Select value={accountId} onValueChange={setAccountId}>
                             <SelectTrigger className={cn("text-xs", isPaid && !accountId && "border-destructive")}><SelectValue placeholder={isPaid ? "Conta (obrigatório)" : "Conta (opcional)"} /></SelectTrigger>
                            <SelectContent>
                              {accounts.filter(a => a.is_active).map(a => (
                                <SelectItem key={a.id} value={a.id}>
                                  {ACCOUNT_TYPE_LABELS[a.type as AccountType]?.icon} {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                           <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                             <SelectTrigger className={cn("text-xs", isPaid && !paymentMethod && "border-destructive")}><SelectValue placeholder={isPaid ? "Forma Pgto (obrigatório)" : "Forma Pgto"} /></SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isPaid} onCheckedChange={(c) => setIsPaid(!!c)} id="is-paid" />
                          <label htmlFor="is-paid" className="text-xs cursor-pointer">Marcar como pago</label>
                        </div>
                      </div>

                      <Button onClick={createOrUpdateEntry} className="w-full">{editingEntry ? "Salvar Alterações" : "Salvar"}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Cash Flow Forecast Table */}
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("entry_date")}>Data <SortIcon field="entry_date" /></TableHead>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("title")}>Título <SortIcon field="title" /></TableHead>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("category")}>Categoria <SortIcon field="category" /></TableHead>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("type")}>Tipo <SortIcon field="type" /></TableHead>
                    <TableHead className="cursor-pointer text-right text-xs" onClick={() => toggleSort("amount")}>Valor <SortIcon field="amount" /></TableHead>
                    <TableHead className="text-xs w-[110px] text-right font-bold">Saldo</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="w-16 text-xs text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">Sem lançamentos neste período</TableCell></TableRow>
                  )}
                  {filtered.map((e) => {
                    const cat = categories.find(c => c.id === e.category_id);
                    const runningBal = runningBalances.balanceMap.get(e.id) ?? 0;
                    const isBreakEven = runningBalances.breakEvenId === e.id;
                    const isOverdue = !e.is_paid && new Date(e.entry_date) < new Date();
                    return (
                      <TableRow
                        key={e.id}
                        className={cn(
                          "group cursor-pointer transition-colors",
                          isBreakEven && "bg-primary/10 dark:bg-primary/15",
                          e.is_paid && "opacity-60",
                          isOverdue && !isBreakEven && "bg-destructive/5"
                        )}
                        onClick={() => handleRowClick(e)}
                      >
                        <TableCell className="text-xs">{format(new Date(e.entry_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className={cn("text-xs", e.is_paid && "line-through text-muted-foreground")}>{e.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{cat?.name || "—"}</TableCell>
                        <TableCell>
                          <span className={cn("rounded px-2 py-0.5 text-[10px] font-medium",
                            e.type === "revenue" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                          )}>
                            {e.type === "revenue" ? "Receita" : "Despesa"}
                          </span>
                        </TableCell>
                        <TableCell className={cn("text-right text-xs font-medium tabular-nums",
                          e.type === "revenue" ? "text-success" : "text-destructive"
                        )}>{brl(Number(e.amount))}</TableCell>
                        <TableCell className={cn("text-right text-xs font-bold tabular-nums", runningBal >= 0 ? "text-primary" : "text-destructive")}>
                          {brl(runningBal)}
                        </TableCell>
                        <TableCell className="text-center">
                          {e.is_paid ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                              <Check className="h-2.5 w-2.5" /> Pago
                            </span>
                          ) : isOverdue ? (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); openEditDialog(e); setIsPaid(true); }}
                              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" /> Atrasado
                            </button>
                          ) : (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); openEditDialog(e); setIsPaid(true); }}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-success/10 hover:text-success hover:border-success/30 transition-colors"
                            >
                              <CircleDollarSign className="h-2.5 w-2.5" /> Dar baixa
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(ev) => { ev.stopPropagation(); openEditDialog(e); }} className="rounded p-1 hover:bg-muted"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                            <button onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.id); }} className="rounded p-1 hover:bg-destructive/10"><Trash2 className="h-3 w-3 text-destructive" /></button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* ============ DOAR ============ */}
        {viewTab === "doar" && (() => {
          const totalRevYear = dreData.monthTotalsRev.reduce((s, v) => s + v, 0);
          const totalExpYear = dreData.monthTotalsExp.reduce((s, v) => s + v, 0);
          const availableYears = [...new Set(entries.map(e => new Date(e.entry_date).getFullYear()))].sort((a, b) => b - a);
          if (!availableYears.includes(doarYear)) availableYears.push(doarYear);
          availableYears.sort((a, b) => b - a);

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Select value={String(doarYear)} onValueChange={(v) => setDoarYear(Number(v))}>
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={handlePrintDOAR} title="Imprimir DOAR em A4 Horizontal">
                <Printer className="h-4 w-4" />
              </Button>
            </div>

            <div id="doar-print-area" className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Title row */}
                  <tr className="bg-primary/10">
                    <th colSpan={15} className="text-center p-3 border-b border-border font-bold text-sm text-primary tracking-wide">
                      DOAR – DEMONSTRATIVO DE ORIGEM E APLICAÇÃO DE RECURSOS
                    </th>
                  </tr>
                  <tr className="bg-muted">
                    <th className="text-left p-2 border-b border-border font-bold min-w-[140px]">Descrição</th>
                    <th className="text-right p-2 border-b border-border font-bold min-w-[50px]">%</th>
                    {dreData.months.map(m => (
                      <th key={m} className="text-right p-2 border-b border-border font-bold min-w-[80px]">{m}</th>
                    ))}
                    <th className="text-right p-2 border-b border-border font-bold min-w-[90px] bg-muted">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Carry-over */}
                  {dreData.carryOver !== 0 && (
                    <tr className="bg-primary/5">
                      <td className="p-2 border-b border-border font-bold text-primary">📦 Saldo Anterior</td>
                      <td className="text-right p-2 border-b border-border text-muted-foreground">—</td>
                      {dreData.months.map((m, i) => (
                        <td key={m} className="text-right p-2 border-b border-border">
                          {i === 0 ? <span className={dreData.carryOver >= 0 ? "text-success" : "text-destructive"}>{brl(dreData.carryOver)}</span> : ""}
                        </td>
                      ))}
                      <td className={cn("text-right p-2 border-b border-border font-bold", dreData.carryOver >= 0 ? "text-success" : "text-destructive")}>
                        {brl(dreData.carryOver)}
                      </td>
                    </tr>
                  )}

                  {/* Revenue header - collapsible */}
                  <tr className="bg-success/10 cursor-pointer select-none" onClick={() => setRevenueCollapsed(!revenueCollapsed)}>
                    <td colSpan={2} className="p-2 border-b border-border font-bold text-success">
                      <span className="inline-flex items-center gap-1">
                        {revenueCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                        RECEITAS
                      </span>
                    </td>
                    {dreData.monthTotalsRev.map((v, i) => (
                      <td key={i} className="text-right p-2 border-b border-border font-bold text-success">{revenueCollapsed ? brl(v) : ""}</td>
                    ))}
                    {revenueCollapsed && (
                      <td className="text-right p-2 border-b border-border font-bold text-success">{brl(totalRevYear)}</td>
                    )}
                    {!revenueCollapsed && <td className="p-2 border-b border-border" />}
                  </tr>
                  {!revenueCollapsed && dreData.revRows.map(row => {
                    const rowTotal = row.months.reduce((s, v) => s + v, 0);
                    const pct = totalRevYear > 0 ? ((rowTotal / totalRevYear) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className="p-2 border-b border-border pl-6">{row.name}</td>
                        <td className="text-right p-2 border-b border-border text-muted-foreground">{pct}%</td>
                        {row.months.map((v, i) => (
                          <td key={i} className={cn("text-right p-2 border-b border-border", v > 0 ? "text-success" : "text-muted-foreground")}>
                            {v > 0 ? brl(v) : "—"}
                          </td>
                        ))}
                        <td className="text-right p-2 border-b border-border font-medium text-success">
                          {brl(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Revenue total */}
                  {!revenueCollapsed && (
                    <tr className="bg-success/5 font-bold">
                      <td className="p-2 border-b-2 border-border text-success">TOTAL RECEITAS</td>
                      <td className="text-right p-2 border-b-2 border-border text-success">100%</td>
                      {dreData.monthTotalsRev.map((v, i) => (
                        <td key={i} className="text-right p-2 border-b-2 border-border text-success">{brl(v)}</td>
                      ))}
                      <td className="text-right p-2 border-b-2 border-border text-success">{brl(totalRevYear)}</td>
                    </tr>
                  )}

                  {/* Expense header - collapsible */}
                  <tr className="bg-destructive/10 cursor-pointer select-none" onClick={() => setExpenseCollapsed(!expenseCollapsed)}>
                    <td colSpan={2} className="p-2 border-b border-border font-bold text-destructive">
                      <span className="inline-flex items-center gap-1">
                        {expenseCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                        DESPESAS
                      </span>
                    </td>
                    {dreData.monthTotalsExp.map((v, i) => (
                      <td key={i} className="text-right p-2 border-b border-border font-bold text-destructive">{expenseCollapsed ? brl(v) : ""}</td>
                    ))}
                    {expenseCollapsed && (
                      <td className="text-right p-2 border-b border-border font-bold text-destructive">{brl(totalExpYear)}</td>
                    )}
                    {!expenseCollapsed && <td className="p-2 border-b border-border" />}
                  </tr>
                  {!expenseCollapsed && dreData.expRows.map(row => {
                    const rowTotal = row.months.reduce((s, v) => s + v, 0);
                    const pct = totalExpYear > 0 ? ((rowTotal / totalExpYear) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className="p-2 border-b border-border pl-6">{row.name}</td>
                        <td className="text-right p-2 border-b border-border text-muted-foreground">{pct}%</td>
                        {row.months.map((v, i) => (
                          <td key={i} className={cn("text-right p-2 border-b border-border", v > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {v > 0 ? brl(v) : "—"}
                          </td>
                        ))}
                        <td className="text-right p-2 border-b border-border font-medium text-destructive">
                          {brl(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Expense total */}
                  {!expenseCollapsed && (
                    <tr className="bg-destructive/5 font-bold">
                      <td className="p-2 border-b-2 border-border text-destructive">TOTAL DESPESAS</td>
                      <td className="text-right p-2 border-b-2 border-border text-destructive">100%</td>
                      {dreData.monthTotalsExp.map((v, i) => (
                        <td key={i} className="text-right p-2 border-b-2 border-border text-destructive">{brl(v)}</td>
                      ))}
                      <td className="text-right p-2 border-b-2 border-border text-destructive">{brl(totalExpYear)}</td>
                    </tr>
                  )}

                  {/* Balance per month */}
                  <tr className="bg-primary/5 font-bold">
                    <td className="p-2 border-b border-border text-primary">RESULTADO DO MÊS</td>
                    <td className="p-2 border-b border-border">—</td>
                    {dreData.monthBalance.map((v, i) => (
                      <td key={i} className={cn("text-right p-2 border-b border-border font-bold", v >= 0 ? "text-success" : "text-destructive")}>
                        {brl(v)}
                      </td>
                    ))}
                    <td className={cn("text-right p-2 border-b border-border font-bold",
                      dreData.monthBalance.reduce((s, v) => s + v, 0) >= 0 ? "text-success" : "text-destructive"
                    )}>{brl(dreData.monthBalance.reduce((s, v) => s + v, 0))}</td>
                  </tr>

                  {/* Accumulated */}
                  <tr className="bg-muted font-bold">
                    <td className="p-2 border-b border-border">SALDO ACUMULADO</td>
                    <td className="p-2 border-b border-border">—</td>
                    {dreData.accumulated.map((v, i) => (
                      <td key={i} className={cn("text-right p-2 border-b border-border font-bold", v >= 0 ? "text-success" : "text-destructive")}>
                        {brl(v)}
                      </td>
                    ))}
                    <td className={cn("text-right p-2 border-b border-border font-bold",
                      (dreData.accumulated[11] || 0) >= 0 ? "text-success" : "text-destructive"
                    )}>{brl(dreData.accumulated[11] || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          );
        })()}

        {/* ============ RELATÓRIOS ============ */}
        {viewTab === "relatorios" && (
          <div className="space-y-4" ref={reportRef}>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePrint}>
                <Printer className="mr-1 h-3 w-3" /> Imprimir
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportCSV}>
                <FileDown className="mr-1 h-3 w-3" /> Exportar CSV
              </Button>
              <div className="ml-auto">
                <Select value={String(doarYear)} onValueChange={(v) => setDoarYear(Number(v))}>
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set(entries.map(e => new Date(e.entry_date).getFullYear())), doarYear].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => b - a).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Monthly chart */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Receita × Despesa Mensal — {doarYear}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={reportChartData} barGap={0}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Period summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo do Período ({format(periodRange.start, "dd/MM/yyyy")} — {format(periodRange.end, "dd/MM/yyyy")})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg bg-success/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Receitas</p>
                    <p className="text-lg font-bold text-success">{brl(totalRevenue)}</p>
                    <p className="text-[10px] text-muted-foreground">{filtered.filter(e => e.type === "revenue").length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Despesas</p>
                    <p className="text-lg font-bold text-destructive">{brl(totalExpense)}</p>
                    <p className="text-[10px] text-muted-foreground">{filtered.filter(e => e.type === "expense").length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Saldo Período</p>
                    <p className={cn("text-lg font-bold", balance >= 0 ? "text-success" : "text-destructive")}>{brl(balance)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Category charts side by side */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Categorias — Despesas</CardTitle></CardHeader>
                <CardContent>
                  {categoryPieData.length > 0 ? (
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                            {categoryPieData.map((d, i) => <Cell key={d.name} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Categorias — Receitas</CardTitle></CardHeader>
                <CardContent>
                  {revenuePieData.length > 0 ? (
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={revenuePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                            {revenuePieData.map((d, i) => <Cell key={d.name} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ============ CARTEIRA ============ */}
        {viewTab === "contas" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Carteira</h2>
                <p className="text-xs text-muted-foreground">Gerencie suas contas bancárias, cartões, investimentos e criptoativos</p>
              </div>
              <Dialog open={accountDialogOpen} onOpenChange={(o) => { setAccountDialogOpen(o); if (!o) resetAccForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9 gap-1.5"><Plus className="h-4 w-4" /> Nova Conta</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta"}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Nome da conta" value={accName} onChange={(e) => setAccName(e.target.value)} />
                    <Select value={accType} onValueChange={(v) => setAccType(v as AccountType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(ACCOUNT_TYPE_LABELS) as [AccountType, { label: string }][]).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                      <Input type="text" inputMode="decimal" placeholder="0,00" value={accBalance} onChange={(e) => setAccBalance(e.target.value.replace(/[^0-9.,]/g, ""))} className="pl-9" />
                    </div>
                    {accType === "credit_card" && (
                      <>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                          <Input type="text" inputMode="decimal" placeholder="Limite" value={accLimit} onChange={(e) => setAccLimit(e.target.value.replace(/[^0-9.,]/g, ""))} className="pl-9" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="number" placeholder="Dia Fechamento" min="1" max="31" value={accClosing} onChange={(e) => setAccClosing(e.target.value)} />
                          <Input type="number" placeholder="Dia Vencimento" min="1" max="31" value={accDue} onChange={(e) => setAccDue(e.target.value)} />
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-xs">Cor:</label>
                      <input type="color" value={accColor} onChange={(e) => setAccColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border-0" />
                    </div>
                    <Button onClick={saveAccount} className="w-full">Salvar</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Saldo Total Card */}
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Patrimônio Total</p>
                    <p className={cn("text-2xl font-bold mt-1", totalAvailable >= 0 ? "text-success" : "text-destructive")}>{brl(totalAvailable)}</p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Wallet className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <div className="mt-4 flex gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Contas ativas</span>
                    <span className="ml-1 font-bold">{accounts.filter(a => a.is_active).length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cartões</span>
                    <span className="ml-1 font-bold">{accounts.filter(a => a.type === "credit_card").length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map(acc => {
                const typeInfo = ACCOUNT_TYPE_LABELS[acc.type as AccountType];
                const isCredit = acc.type === "credit_card";
                const usedPercent = isCredit && acc.credit_limit ? ((acc.credit_limit - acc.current_balance) / acc.credit_limit) * 100 : 0;
                return (
                  <Card key={acc.id} className="group hover:shadow-md transition-all duration-200 border-l-4" style={{ borderLeftColor: acc.color || "hsl(var(--primary))" }}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl shadow-sm" style={{ background: `${acc.color}15`, border: `1px solid ${acc.color}30` }}>
                            <span style={{ color: acc.color || undefined }}>{typeInfo?.icon}</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold leading-tight">{acc.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{typeInfo?.label}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => {
                            setEditingAccount(acc);
                            setAccName(acc.name); setAccType(acc.type as AccountType);
                            setAccBalance(String(acc.initial_balance));
                            setAccLimit(acc.credit_limit ? String(acc.credit_limit) : "");
                            setAccClosing(acc.closing_day ? String(acc.closing_day) : "");
                            setAccDue(acc.due_day ? String(acc.due_day) : "");
                            setAccColor(acc.color || "#3b82f6");
                            setAccountDialogOpen(true);
                          }} className="rounded-lg p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                          <button onClick={() => deleteAccount(acc.id)} className="rounded-lg p-1.5 hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo atual</p>
                          <p className={cn("text-xl font-bold mt-0.5", acc.current_balance >= 0 ? "text-success" : "text-destructive")}>
                            {brl(acc.current_balance)}
                          </p>
                        </div>

                        {isCredit && acc.credit_limit && (
                          <div className="space-y-2 pt-2 border-t border-border">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Limite total</span>
                              <span className="font-medium">{brl(acc.credit_limit)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Disponível</span>
                              <span className="font-bold text-primary">{brl(acc.current_balance)}</span>
                            </div>
                            {/* Usage bar */}
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", usedPercent > 80 ? "bg-destructive" : usedPercent > 50 ? "bg-warning" : "bg-primary")}
                                style={{ width: `${Math.min(usedPercent, 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground text-right">{usedPercent.toFixed(0)}% utilizado</p>
                            {acc.closing_day && acc.due_day && (
                              <div className="flex gap-3 text-[10px] text-muted-foreground pt-1">
                                <span>📅 Fecha dia {acc.closing_day}</span>
                                <span>💳 Vence dia {acc.due_day}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {accounts.length === 0 && (
                <div className="col-span-full text-center py-16">
                  <Wallet className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Nenhuma conta cadastrada</p>
                  <p className="text-xs text-muted-foreground mt-1">Adicione suas contas bancárias, cartões, investimentos e criptoativos.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Recurrence edit dialog */}
      <Dialog open={!!recurrenceEditDialog.entry && !recurrenceEditDialog.mode} onOpenChange={(o) => { if (!o) setRecurrenceEditDialog({ entry: null, mode: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar lançamento recorrente</DialogTitle>
            <DialogDescription>Este lançamento faz parte de uma série. O que deseja alterar?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button variant="outline" onClick={() => {
              setRecurrenceEditDialog(prev => ({ ...prev, mode: "single" }));
              openEditDialog(recurrenceEditDialog.entry);
            }}>Apenas este lançamento</Button>
            <Button onClick={() => {
              setRecurrenceEditDialog(prev => ({ ...prev, mode: "all" }));
              openEditDialog(recurrenceEditDialog.entry);
            }}>Este e todos os seguintes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
