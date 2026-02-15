import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus, TrendingUp, TrendingDown, Wallet, Trash2, Save,
  Printer, FileDown, Repeat, Landmark, CreditCard, PiggyBank, WalletCards,
  Banknote, Bitcoin, ChevronDown, ChevronUp, Check, CalendarDays,
  CircleDollarSign, AlertTriangle, Search,
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
type SortField = "title" | "amount" | "entry_date" | "type" | "category" | "is_paid" | "balance";
type SortDir = "asc" | "desc";
type RecurrenceType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
type RecurrenceDateMode = "same_date" | "first_business_day";
type ViewTab = "previsao" | "doar" | "relatorios" | "contas";
type AccountType = "bank_account" | "credit_card" | "investment" | "wallet" | "cash" | "crypto";
type CashFlowFilter = "all" | "payable" | "receivable" | "overdue" | "paid" | "pending";
type DoarViewMode = "categories" | "expenses_revenues" | "entries";

interface FinancialAccount {
  id: string; user_id: string; name: string; type: string;
  initial_balance: number; current_balance: number;
  credit_limit: number | null; closing_day: number | null;
  due_day: number | null; color: string | null;
  is_active: boolean | null; created_at: string; updated_at: string;
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

const PAYMENT_METHODS = ["Débito", "Crédito", "PIX", "Boleto", "Transferência", "Dinheiro", "Crypto"];

const PERIOD_OPTIONS: { key: PeriodFilter; label: string }[] = [
  { key: "daily", label: "Dia" },
  { key: "3days", label: "3 Dias" },
  { key: "weekly", label: "Semana" },
  { key: "monthly", label: "Mês" },
  { key: "yearly", label: "Ano" },
  { key: "custom", label: "Personalizado" },
];

const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };
const CHART_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

// Helper: is business day (Mon-Fri)
const isBusinessDay = (d: Date) => { const day = d.getDay(); return day !== 0 && day !== 6; };
const getNextBusinessDay = (d: Date) => {
  const result = new Date(d);
  while (!isBusinessDay(result)) result.setDate(result.getDate() + 1);
  return result;
};

export default function FinancesView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<DBTables<"projects">[]>([]);
  const [categories, setCategories] = useState<DBTables<"categories">[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [period] = useState<PeriodFilter>("custom");
  const [doarPeriod] = useState<PeriodFilter>("yearly");
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("previsao");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [doarCustomStart, setDoarCustomStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [doarCustomEnd, setDoarCustomEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const [recurrenceEditDialog, setRecurrenceEditDialog] = useState<{ entry: any; mode: "single" | "all" | null }>({ entry: null, mode: null });
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [doarYear, setDoarYear] = useState(new Date().getFullYear());
  const [revenueCollapsed, setRevenueCollapsed] = useState(false);
  const [expenseCollapsed, setExpenseCollapsed] = useState(false);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [cashFlowFilter, setCashFlowFilter] = useState<CashFlowFilter>("all");
  const [hidePaid] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [doarSearchQuery, setDoarSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [doarViewMode, setDoarViewMode] = useState<DoarViewMode>("categories");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [deleteEntryConfirm, setDeleteEntryConfirm] = useState<string | null>(null);

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
  const [recurrenceDateMode, setRecurrenceDateMode] = useState<RecurrenceDateMode>("same_date");
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
  const [accIsActive, setAccIsActive] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const lastAccClickRef = useRef<{ id: string; time: number } | null>(null);

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
    setRecurrence("none"); setRecurrenceCount("12"); setRecurrenceDateMode("same_date");
    setEditingEntry(null); setAccountId(""); setPaymentMethod(""); setIsPaid(false);
  };

  const resetAccForm = () => {
    setAccName(""); setAccType("bank_account"); setAccBalance("0");
    setAccLimit(""); setAccClosing(""); setAccDue("");
    setAccIsActive(true); setEditingAccount(null);
  };

  const handleRowClick = (entry: any) => {
    const now = Date.now();
    if (lastClickRef.current?.id === entry.id && now - lastClickRef.current.time < 400) {
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

  const getNextDate = (base: Date, rec: RecurrenceType, i: number, dateMode: RecurrenceDateMode): Date => {
    let d: Date;
    switch (rec) {
      case "daily": d = addDays(base, i); break;
      case "weekly": d = addWeeks(base, i); break;
      case "biweekly": d = addWeeks(base, i * 2); break;
      case "monthly": d = addMonths(base, i); break;
      case "yearly": d = addMonths(base, i * 12); break;
      default: d = new Date(base); break;
    }
    if (dateMode === "first_business_day" && rec === "monthly") {
      d.setDate(1);
      d = getNextBusinessDay(d);
    }
    return d;
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
        const allGroup = entries.filter(
          (e) => e.installment_group === editingEntry.installment_group &&
            e.installment_number >= editingEntry.installment_number
        );
        for (const e of allGroup) {
          await supabase.from("financial_entries").update({
            ...updateData,
            title: allGroup.length > 1 ? `${title} (${e.installment_number}/${editingEntry.total_installments})` : title,
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
          entry_date: format(getNextDate(baseDate, recurrence, i, recurrenceDateMode), "yyyy-MM-dd"),
          installment_group: group, installment_number: i + 1, total_installments: count,
          account_id: accountId || null, payment_method: paymentMethod || null,
          is_paid: i === 0 ? isPaid : false,
        }));
        await supabase.from("financial_entries").insert(entriesToInsert);
        const calEvents = Array.from({ length: count }, (_, i) => ({
          user_id: user.id, title: `💰 ${title}`,
          start_time: getNextDate(baseDate, recurrence, i, recurrenceDateMode).toISOString(),
          all_day: true, color: type === "revenue" ? "#22c55e" : "#ef4444",
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
      is_paid: newPaid, payment_date: newPaid ? format(new Date(), "yyyy-MM-dd") : null,
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

  const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const saveAccount = async () => {
    if (!accName.trim() || !user) return;
    const bal = parseNum(accBalance);
    const data = {
      user_id: user.id, name: accName, type: accType,
      initial_balance: bal,
      current_balance: editingAccount ? editingAccount.current_balance : bal,
      credit_limit: accLimit ? parseNum(accLimit) : null,
      closing_day: accClosing ? parseInt(accClosing) : null,
      due_day: accDue ? parseInt(accDue) : null,
      is_active: accIsActive,
    };
    if (editingAccount) {
      await supabase.from("financial_accounts").update(data).eq("id", editingAccount.id);
    } else {
      await supabase.from("financial_accounts").insert(data);
    }
    resetAccForm(); setAccountDialogOpen(false); fetchData();
  };

  const deleteAccount = async (id: string) => {
    await supabase.from("financial_accounts").delete().eq("id", id);
    fetchData();
  };

  const now = new Date();

  const getPeriodRange = (p: PeriodFilter, cs: string, ce: string) => {
    switch (p) {
      case "daily": return { start: startOfDay(now), end: endOfDay(now) };
      case "3days": return { start: startOfDay(now), end: endOfDay(addDays(now, 2)) };
      case "weekly": return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
      case "monthly": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "yearly": return { start: startOfYear(now), end: endOfYear(now) };
      case "custom": return { start: new Date(cs), end: new Date(ce) };
    }
  };

  const periodRange = useMemo(() => getPeriodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const doarPeriodRange = useMemo(() => getPeriodRange(doarPeriod, doarCustomStart, doarCustomEnd), [doarPeriod, doarCustomStart, doarCustomEnd]);

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const query = searchQuery.toLowerCase().trim();
    return entries
      .filter((e) => {
        const d = new Date(e.entry_date);
        if (d < periodRange.start || d > periodRange.end) return false;
        if (cashFlowFilter === "payable") return e.type === "expense" && !e.is_paid;
        if (cashFlowFilter === "receivable") return e.type === "revenue" && !e.is_paid;
        if (cashFlowFilter === "overdue") { const ed = new Date(e.entry_date); ed.setHours(0, 0, 0, 0); return !e.is_paid && ed < today; }
        if (cashFlowFilter === "paid") return e.is_paid;
        if (cashFlowFilter === "pending") return !e.is_paid;
        if (hidePaid && e.is_paid) return false;
        return true;
      })
      .filter((e) => {
        if (!query) return true;
        const cat = categories.find(c => c.id === e.category_id)?.name || "";
        return e.title.toLowerCase().includes(query) || cat.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        let aVal: any, bVal: any;
        if (sortField === "category") {
          aVal = categories.find(c => c.id === a.category_id)?.name || "";
          bVal = categories.find(c => c.id === b.category_id)?.name || "";
        } else if (sortField === "is_paid") {
          aVal = a.is_paid ? 1 : 0; bVal = b.is_paid ? 1 : 0;
        } else if (sortField === "balance") {
          return 0; // balance is computed after sort
        } else {
          aVal = a[sortField]; bVal = b[sortField];
        }
        if (aVal == null || bVal == null) return 0;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [entries, periodRange, sortField, sortDir, categories, cashFlowFilter, hidePaid, searchQuery]);

  const totalRevenue = filtered.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = filtered.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const balance = totalRevenue - totalExpense;

  const runningBalances = useMemo(() => {
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
    if (a.type === "credit_card") return s;
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

  // Sort categories alphabetically, "Outros" last
  const sortedFinCategories = useMemo(() => {
    const fin = categories.filter((c) => c.is_revenue || c.is_expense);
    return [...fin].sort((a, b) => {
      const aIsOutros = a.name.toLowerCase().includes("outro");
      const bIsOutros = b.name.toLowerCase().includes("outro");
      if (aIsOutros && !bIsOutros) return 1;
      if (!aIsOutros && bIsOutros) return -1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [categories]);

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

    const getEntriesForCatMonth = (catId: string, month: Date, type: string) =>
      getMonthEntries(month).filter(e => e.type === type && e.category_id === catId);

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
        entries: months.map(m => getEntriesForCatMonth(cat.id, m, "revenue")),
      }));

    const uncatRev = months.map(m => {
      const mEntries = getMonthEntries(m).filter(e => e.type === "revenue" && !e.category_id);
      return mEntries.reduce((s, e) => s + Number(e.amount), 0);
    });
    if (uncatRev.some(v => v > 0)) {
      revRows.push({
        id: "uncat-rev", name: "Outras Receitas", color: "#6b7280", months: uncatRev,
        entries: months.map(m => getMonthEntries(m).filter(e => e.type === "revenue" && !e.category_id)),
      });
    }

    const expRows = expenseCategories
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map(cat => ({
        id: cat.id, name: cat.name, color: cat.color,
        months: months.map(m => {
          const mEntries = getMonthEntries(m).filter(e => e.type === "expense" && e.category_id === cat.id);
          return mEntries.reduce((s, e) => s + Number(e.amount), 0);
        }),
        entries: months.map(m => getEntriesForCatMonth(cat.id, m, "expense")),
      }));

    const uncatExp = months.map(m => {
      const mEntries = getMonthEntries(m).filter(e => e.type === "expense" && !e.category_id);
      return mEntries.reduce((s, e) => s + Number(e.amount), 0);
    });
    if (uncatExp.some(v => v > 0)) {
      expRows.push({
        id: "uncat-exp", name: "Outras Despesas", color: "#6b7280", months: uncatExp,
        entries: months.map(m => getMonthEntries(m).filter(e => e.type === "expense" && !e.category_id)),
      });
    }

    const monthTotalsRev = months.map((_, i) => revRows.reduce((s, r) => s + r.months[i], 0));
    const monthTotalsExp = months.map((_, i) => expRows.reduce((s, r) => s + r.months[i], 0));
    const monthBalance = months.map((_, i) => monthTotalsRev[i] - monthTotalsExp[i]);

    let acc = carryOver;
    const accumulated = monthBalance.map(b => { acc += b; return acc; });

    return {
      months: months.map(m => format(m, "MMM", { locale: ptBR }).toUpperCase()),
      revRows, expRows, monthTotalsRev, monthTotalsExp, monthBalance, accumulated, carryOver,
    };
  }, [entries, categories, doarYear]);

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
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), receita: rev, despesa: exp, saldo: rev - exp, acumulado: accumulated };
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
        @media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
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

  const toggleCatExpand = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  // Period selector component shared between tabs
  const PeriodSelector = ({ value, onChange, customS, customE, onCustomS, onCustomE }: {
    value: PeriodFilter; onChange: (v: PeriodFilter) => void;
    customS: string; customE: string; onCustomS: (v: string) => void; onCustomE: (v: string) => void;
  }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PERIOD_OPTIONS.map(p => (
        <Button key={p.key} size="sm" variant={value === p.key ? "default" : "ghost"}
          className={cn("h-7 text-xs px-2.5 rounded-full", value !== p.key && "text-muted-foreground hover:text-foreground")}
          onClick={() => onChange(p.key)}
        >{p.label}</Button>
      ))}
      {value === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" value={customS} onChange={(e) => onCustomS(e.target.value)} className="h-7 text-xs w-32" />
          <span className="text-xs text-muted-foreground">a</span>
          <Input type="date" value={customE} onChange={(e) => onCustomE(e.target.value)} className="h-7 text-xs w-32" />
        </div>
      )}
    </div>
  );

  // Entry dialog content (shared)
  const renderEntryDialog = () => (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editingEntry ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
            <Input type="text" inputMode="decimal" placeholder="0,00" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              className="pl-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
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
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          {!editingEntry && recurrence === "none" && (
            <Input type="number" placeholder="Parcelas" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
          )}
        </div>
        {!editingEntry && (
          <div className="rounded-lg border border-border/30 p-3 space-y-2">
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
            {recurrence === "monthly" && (
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground mb-1">Repetir na:</Label>
                <Select value={recurrenceDateMode} onValueChange={(v) => setRecurrenceDateMode(v as RecurrenceDateMode)}>
                  <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same_date">Mesma data</SelectItem>
                    <SelectItem value="first_business_day">Primeiro dia útil do mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Categoria (opcional)" /></SelectTrigger>
          <SelectContent>
            {sortedFinCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger><SelectValue placeholder="Projeto (opcional)" /></SelectTrigger>
          <SelectContent>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Pagamento {isPaid && <span className="text-destructive">*</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className={cn("text-xs", isPaid && !accountId && "border-destructive")}><SelectValue placeholder={isPaid ? "Conta (obrigatório)" : "Conta (opcional)"} /></SelectTrigger>
              <SelectContent>
                {accounts.filter(a => a.is_active).map(a => (
                  <SelectItem key={a.id} value={a.id}>{ACCOUNT_TYPE_LABELS[a.type as AccountType]?.icon} {a.name}</SelectItem>
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
      </div>
      {/* Standardized footer */}
      <div className="flex items-center gap-2 pt-4 border-t border-border/20">
        {editingEntry && (
          <Button variant="destructive" size="sm" className="gap-1.5"
            onClick={() => setDeleteEntryConfirm(editingEntry.id)}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
          <Button size="sm" onClick={createOrUpdateEntry} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
        </div>
      </div>
    </DialogContent>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Receitas</p>
              <p className="text-base font-bold text-success">{brl(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Despesas</p>
              <p className="text-base font-bold text-destructive">{brl(totalExpense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className={cn("text-base font-bold", balance >= 0 ? "text-success" : "text-destructive")}>{brl(balance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Landmark className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Caixa Disponível</p>
              <p className={cn("text-base font-bold", totalAvailable >= 0 ? "text-success" : "text-destructive")}>{brl(totalAvailable)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="previsao" className="text-sm">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="doar" className="text-sm">DOAR</TabsTrigger>
            <TabsTrigger value="relatorios" className="text-sm">Relatórios</TabsTrigger>
            <TabsTrigger value="contas" className="text-sm">Carteira</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">

        {/* ============ FLUXO DE CAIXA ============ */}
        {viewTab === "previsao" && (
          <>
            {/* Custom date filter only */}
            <div className="mb-2 flex items-center gap-1.5">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 text-xs w-32" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
            </div>

            {/* Search bar */}
            <div className="mb-2">
              <Input
                placeholder="Pesquisar lançamentos por título ou categoria..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-sm bg-transparent border-0 border-b border-border/30 rounded-none focus-visible:ring-0 focus-visible:border-primary/40 placeholder:text-muted-foreground/40"
              />
            </div>

            {/* Quick filters + bulk actions */}
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                {([
                  { key: "all" as CashFlowFilter, label: "Todos" },
                  { key: "payable" as CashFlowFilter, label: "A Pagar" },
                  { key: "receivable" as CashFlowFilter, label: "A Receber" },
                  { key: "overdue" as CashFlowFilter, label: "Atrasados" },
                  { key: "pending" as CashFlowFilter, label: "Pendentes" },
                  { key: "paid" as CashFlowFilter, label: "Pagas" },
                ]).map(f => (
                  <Button key={f.key} size="sm"
                    variant={cashFlowFilter === f.key ? "default" : "ghost"}
                    className={cn("h-7 text-xs px-2.5 gap-1 rounded-full", cashFlowFilter !== f.key && "text-muted-foreground hover:text-foreground")}
                    onClick={() => setCashFlowFilter(f.key)}
                  >{f.label}</Button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">{selectedIds.size} selecionados</span>
                    <Button size="sm" variant="ghost"
                      className="h-7 px-2.5 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                      onClick={async () => {
                        for (const id of selectedIds) {
                          await supabase.from("financial_entries").delete().eq("id", id);
                        }
                        setSelectedIds(new Set());
                        fetchData();
                      }}
                    ><Trash2 className="h-3 w-3" /> Excluir</Button>
                    <Button size="sm" variant="ghost"
                      className="h-7 px-2.5 text-xs gap-1 text-muted-foreground rounded-full"
                      onClick={() => {
                        const selected = filtered.filter(e => selectedIds.has(e.id));
                        const header = "Data,Título,Tipo,Categoria,Valor,Status\n";
                        const rows = selected.map(e => {
                          const cat = categories.find(c => c.id === e.category_id)?.name || "";
                          return `${e.entry_date},"${e.title}",${e.type === "revenue" ? "Receita" : "Despesa"},"${cat}",${e.amount},${e.is_paid ? "Pago" : "Pendente"}`;
                        }).join("\n");
                        const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `lancamentos_selecionados.csv`; a.click();
                        URL.revokeObjectURL(url);
                      }}
                    ><Printer className="h-3 w-3" /> Relatório</Button>
                  </>
                )}
                <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 text-xs rounded-full px-3"><Plus className="mr-1 h-3.5 w-3.5" /> Lançamento</Button>
                  </DialogTrigger>
                  {renderEntryDialog()}
                </Dialog>
              </div>
            </div>

            {/* Table - no Action column */}
            <div className="rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground/60 uppercase tracking-wider border-b border-border/20">
                    <th className="text-left py-2 px-2 w-8">
                      <Checkbox
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onCheckedChange={(c) => {
                          if (c) setSelectedIds(new Set(filtered.map(e => e.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="h-3.5 w-3.5"
                      />
                    </th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("entry_date")}>Data <SortIcon field="entry_date" /></th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("title")}>Título <SortIcon field="title" /></th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("category")}>Categoria <SortIcon field="category" /></th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("type")}>Tipo <SortIcon field="type" /></th>
                    <th className="text-right py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("amount")}>Valor <SortIcon field="amount" /></th>
                    <th className="text-right py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("balance")}>Saldo <SortIcon field="balance" /></th>
                    <th className="text-center py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("is_paid")}>Status <SortIcon field="is_paid" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-muted-foreground/40 py-12">Sem lançamentos neste período</td></tr>
                  )}
                  {filtered.map((e, idx) => {
                    const cat = categories.find(c => c.id === e.category_id);
                    const runningBal = runningBalances.balanceMap.get(e.id) ?? 0;
                    const isBreakEven = runningBalances.breakEvenId === e.id;
                    const isOverdue = !e.is_paid && new Date(e.entry_date) < new Date();
                    const isSelected = selectedIds.has(e.id);
                    return (
                      <tr key={e.id}
                        className={cn(
                          "group cursor-pointer transition-colors hover:bg-muted/20",
                          idx > 0 && "border-t border-border/10",
                          isBreakEven && "bg-primary/5",
                          e.is_paid && "opacity-50",
                          isOverdue && !isBreakEven && "bg-destructive/3",
                          isSelected && "bg-primary/5"
                        )}
                        onClick={() => handleRowClick(e)}
                      >
                        <td className="py-2.5 px-2">
                          <Checkbox checked={isSelected}
                            onCheckedChange={(c) => {
                              const next = new Set(selectedIds);
                              if (c) next.add(e.id); else next.delete(e.id);
                              setSelectedIds(next);
                            }}
                            onClick={(ev) => ev.stopPropagation()} className="h-3.5 w-3.5" />
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground">{format(new Date(e.entry_date), "dd/MM/yy")}</td>
                        <td className={cn("py-2.5 px-2", e.is_paid && "line-through text-muted-foreground")}>{e.title}</td>
                        <td className="py-2.5 px-2 text-muted-foreground/60">{cat?.name || "—"}</td>
                        <td className="py-2.5 px-2">
                          <span className={cn("text-xs font-medium", e.type === "revenue" ? "text-success" : "text-destructive")}>
                            {e.type === "revenue" ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td className={cn("py-2.5 px-2 text-right font-medium tabular-nums", e.type === "revenue" ? "text-success" : "text-destructive")}>
                          {brl(Number(e.amount))}
                        </td>
                        <td className={cn("py-2.5 px-2 text-right font-semibold tabular-nums", runningBal >= 0 ? "text-success" : "text-destructive")}>
                          {brl(runningBal)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {e.is_paid ? (
                            <span className="inline-flex items-center gap-1 text-xs text-success/60">
                              <Check className="h-2.5 w-2.5" /> Pago
                            </span>
                          ) : isOverdue ? (
                            <button onClick={(ev) => { ev.stopPropagation(); openEditDialog(e); setIsPaid(true); }}
                              className="inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors">
                              <AlertTriangle className="h-2.5 w-2.5" /> Atrasado
                            </button>
                          ) : (
                            <button onClick={(ev) => { ev.stopPropagation(); openEditDialog(e); setIsPaid(true); }}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-success transition-colors">
                              <CircleDollarSign className="h-2.5 w-2.5" /> Baixa
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

          // Filter DOAR entries by search
          const dQuery = doarSearchQuery.toLowerCase().trim();
          const filterDoarRow = (row: { name: string }) => !dQuery || row.name.toLowerCase().includes(dQuery);

          const filteredRevRows = dreData.revRows.filter(filterDoarRow);
          const filteredExpRows = dreData.expRows.filter(filterDoarRow);

          const renderCategoryEntries = (row: typeof dreData.revRows[0]) => {
            if (!expandedCats.has(row.id)) return null;
            // Group entries by title - show one row per unique title with values in month columns
            const allEntries = row.entries.flat();
            if (allEntries.length === 0) return null;
            const grouped = new Map<string, { title: string; monthAmounts: number[] }>();
            allEntries.forEach(e => {
              const key = e.title.replace(/\s*\(\d+\/\d+\)$/, ""); // strip installment suffix
              if (!grouped.has(key)) {
                grouped.set(key, { title: key, monthAmounts: new Array(12).fill(0) });
              }
              const mi = new Date(e.entry_date).getMonth();
              grouped.get(key)!.monthAmounts[mi] += Number(e.amount);
            });
            return Array.from(grouped.values()).map(g => (
              <tr key={g.title} className="bg-muted/10 text-xs">
                <td className="p-1.5 border-b border-border/50 pl-10 text-muted-foreground" colSpan={2}>{g.title}</td>
                {g.monthAmounts.map((v, mi) => (
                  <td key={mi} className="text-right p-1.5 border-b border-border/50 text-muted-foreground">
                    {v > 0 ? brl(v) : ""}
                  </td>
                ))}
                <td className="text-right p-1.5 border-b border-border/50 text-muted-foreground font-medium">
                  {brl(g.monthAmounts.reduce((s, v) => s + v, 0))}
                </td>
              </tr>
            ));
          };

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Select value={String(doarYear)} onValueChange={(v) => setDoarYear(Number(v))}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Pesquisar categorias..."
                  value={doarSearchQuery} onChange={(e) => setDoarSearchQuery(e.target.value)}
                  className="h-8 w-48 text-xs bg-transparent border-0 border-b border-border/30 rounded-none focus-visible:ring-0 focus-visible:border-primary/40 placeholder:text-muted-foreground/40" />
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={handlePrintDOAR} title="Imprimir">
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div id="doar-print-area" className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
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

                  {/* Revenue header */}
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
                    {revenueCollapsed && <td className="text-right p-2 border-b border-border font-bold text-success">{brl(totalRevYear)}</td>}
                    {!revenueCollapsed && <td className="p-2 border-b border-border" />}
                  </tr>
                  {!revenueCollapsed && filteredRevRows.map(row => {
                    const rowTotal = row.months.reduce((s, v) => s + v, 0);
                    const pct = totalRevYear > 0 ? ((rowTotal / totalRevYear) * 100).toFixed(1) : "0.0";
                    const isExpanded = expandedCats.has(row.id);
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleCatExpand(row.id)}>
                          <td className="p-2 border-b border-border pl-6">
                            <span className="inline-flex items-center gap-1">
                              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              {row.name}
                            </span>
                          </td>
                          <td className="text-right p-2 border-b border-border text-muted-foreground">{pct}%</td>
                          {row.months.map((v, i) => (
                            <td key={i} className={cn("text-right p-2 border-b border-border", v > 0 ? "text-success" : "text-muted-foreground")}>
                              {v > 0 ? brl(v) : "—"}
                            </td>
                          ))}
                          <td className="text-right p-2 border-b border-border font-medium text-success">{brl(rowTotal)}</td>
                        </tr>
                        {renderCategoryEntries(row)}
                      </React.Fragment>
                    );
                  })}
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

                  {/* Expense header */}
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
                    {expenseCollapsed && <td className="text-right p-2 border-b border-border font-bold text-destructive">{brl(totalExpYear)}</td>}
                    {!expenseCollapsed && <td className="p-2 border-b border-border" />}
                  </tr>
                  {!expenseCollapsed && filteredExpRows.map(row => {
                    const rowTotal = row.months.reduce((s, v) => s + v, 0);
                    const pct = totalExpYear > 0 ? ((rowTotal / totalExpYear) * 100).toFixed(1) : "0.0";
                    const isExpanded = expandedCats.has(row.id);
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleCatExpand(row.id)}>
                          <td className="p-2 border-b border-border pl-6">
                            <span className="inline-flex items-center gap-1">
                              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              {row.name}
                            </span>
                          </td>
                          <td className="text-right p-2 border-b border-border text-muted-foreground">{pct}%</td>
                          {row.months.map((v, i) => (
                            <td key={i} className={cn("text-right p-2 border-b border-border", v > 0 ? "text-destructive" : "text-muted-foreground")}>
                              {v > 0 ? brl(v) : "—"}
                            </td>
                          ))}
                          <td className="text-right p-2 border-b border-border font-medium text-destructive">{brl(rowTotal)}</td>
                        </tr>
                        {renderCategoryEntries(row)}
                      </React.Fragment>
                    );
                  })}
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
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...new Set(entries.map(e => new Date(e.entry_date).getFullYear())), doarYear].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => b - a).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
        {viewTab === "contas" && (() => {
          const accQuery = searchQuery.toLowerCase().trim();
          const activeAccounts = accounts.filter(a => a.is_active !== false && (!accQuery || a.name.toLowerCase().includes(accQuery) || (ACCOUNT_TYPE_LABELS[a.type as AccountType]?.label || "").toLowerCase().includes(accQuery)));
          const inactiveAccounts = accounts.filter(a => a.is_active === false && (!accQuery || a.name.toLowerCase().includes(accQuery)));

          const openAccEdit = (acc: FinancialAccount) => {
            setEditingAccount(acc);
            setAccName(acc.name); setAccType(acc.type as AccountType);
            setAccBalance(String(acc.initial_balance));
            setAccLimit(acc.credit_limit ? String(acc.credit_limit) : "");
            setAccClosing(acc.closing_day ? String(acc.closing_day) : "");
            setAccDue(acc.due_day ? String(acc.due_day) : "");
            setAccIsActive(acc.is_active !== false);
            setAccountDialogOpen(true);
          };

          const handleAccClick = (acc: FinancialAccount) => {
            const now = Date.now();
            if (lastAccClickRef.current?.id === acc.id && now - lastAccClickRef.current.time < 400) {
              openAccEdit(acc);
              lastAccClickRef.current = null;
            } else {
              lastAccClickRef.current = { id: acc.id, time: now };
            }
          };

          const renderAccountCard = (acc: FinancialAccount) => {
            const typeInfo = ACCOUNT_TYPE_LABELS[acc.type as AccountType];
            const isCredit = acc.type === "credit_card";
            const usedPercent = isCredit && acc.credit_limit ? ((acc.credit_limit - acc.current_balance) / acc.credit_limit) * 100 : 0;
            return (
              <Card key={acc.id}
                className={cn("cursor-pointer hover:shadow-md transition-all duration-200 select-none", acc.is_active === false && "opacity-50")}
                onClick={() => handleAccClick(acc)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">{typeInfo?.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">{typeInfo?.label}</p>
                    </div>
                  </div>
                  <p className={cn("text-lg font-bold", acc.current_balance >= 0 ? "text-success" : "text-destructive")}>
                    {brl(acc.current_balance)}
                  </p>
                  {isCredit && acc.credit_limit && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", usedPercent > 80 ? "bg-destructive" : usedPercent > 50 ? "bg-warning" : "bg-primary")}
                          style={{ width: `${Math.min(usedPercent, 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Limite: {brl(acc.credit_limit)}</span>
                        <span>{usedPercent.toFixed(0)}%</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          };

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold shrink-0">Carteira</h2>
              <Input placeholder="Pesquisar carteiras..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 max-w-xs bg-transparent border-0 border-b border-border/30 rounded-none focus-visible:ring-0 focus-visible:border-primary/40 placeholder:text-muted-foreground/40" />
              <Dialog open={accountDialogOpen} onOpenChange={(o) => { setAccountDialogOpen(o); if (!o) resetAccForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9 gap-1.5 shrink-0"><Plus className="h-4 w-4" /> Nova Carteira</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{editingAccount ? "Editar Carteira" : "Nova Carteira"}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Nome da carteira" value={accName} onChange={(e) => setAccName(e.target.value)} />
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
                    <div className="flex items-center justify-between">
                      <Label>Carteira Ativa</Label>
                      <Switch checked={accIsActive} onCheckedChange={setAccIsActive} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t border-border/20">
                    {editingAccount && (
                      <Button variant="destructive" size="sm" className="gap-1.5"
                        onClick={() => setDeleteConfirmId(editingAccount.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <Button variant="outline" size="sm" onClick={() => { setAccountDialogOpen(false); resetAccForm(); }}>Cancelar</Button>
                      <Button size="sm" onClick={saveAccount} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {activeAccounts.map(renderAccountCard)}
              {activeAccounts.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Wallet className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma carteira ativa cadastrada</p>
                </div>
              )}
            </div>

            {inactiveAccounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Carteiras Inativas</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {inactiveAccounts.map(renderAccountCard)}
                </div>
              </div>
            )}

            {/* Delete confirmation dialog */}
            <Dialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Confirmar exclusão</DialogTitle>
                  <DialogDescription>Tem certeza que deseja excluir esta carteira? Esta ação não pode ser desfeita.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 pt-4 border-t border-border/20">
                  <div className="flex gap-2 ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
                    <Button variant="destructive" size="sm" onClick={async () => {
                      if (deleteConfirmId) {
                        await deleteAccount(deleteConfirmId);
                        setDeleteConfirmId(null);
                        setAccountDialogOpen(false);
                        resetAccForm();
                      }
                    }}>Excluir</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          );
        })()}
      </div>

      {/* Delete entry confirmation */}
      <Dialog open={!!deleteEntryConfirm} onOpenChange={(o) => { if (!o) setDeleteEntryConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 pt-4 border-t border-border/20">
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setDeleteEntryConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={async () => {
                if (deleteEntryConfirm) {
                  await deleteEntry(deleteEntryConfirm);
                  setDeleteEntryConfirm(null);
                  setDialogOpen(false);
                  resetForm();
                }
              }}>Excluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recurrence edit dialog */}
      <Dialog open={!!recurrenceEditDialog.entry && !recurrenceEditDialog.mode} onOpenChange={(o) => { if (!o) setRecurrenceEditDialog({ entry: null, mode: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar lançamento recorrente</DialogTitle>
            <DialogDescription>Este lançamento faz parte de uma série. O que deseja alterar?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="outline" onClick={() => {
              setRecurrenceEditDialog(prev => ({ ...prev, mode: "single" }));
              openEditDialog(recurrenceEditDialog.entry);
            }}>Apenas este lançamento</Button>
            <Button onClick={() => {
              setRecurrenceEditDialog(prev => ({ ...prev, mode: "all" }));
              openEditDialog(recurrenceEditDialog.entry);
            }}>Este e todos os seguintes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
