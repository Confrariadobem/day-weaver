import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useModulePreferences } from "@/hooks/useModulePreferences";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, TrendingUp, TrendingDown, Wallet, Trash2, Save,
  Printer, FileDown, FileUp, Repeat, Landmark, CreditCard, PiggyBank, WalletCards,
  Banknote, Bitcoin, ChevronDown, ChevronUp, Check, CalendarDays,
  CircleDollarSign, AlertTriangle, Search, Eye, EyeOff, ChevronsUpDown,
  Filter, BarChart3, Copy, FolderKanban, ListChecks,
} from "lucide-react";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addMonths, addWeeks, addDays, startOfYear, endOfYear, eachMonthOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Line, Legend, Cell, PieChart, Pie, Area, AreaChart, ReferenceLine,
} from "recharts";
import type { Tables as DBTables } from "@/integrations/supabase/types";

type PeriodFilter = "daily" | "3days" | "weekly" | "monthly" | "yearly" | "custom";
type SortField = "title" | "amount" | "entry_date" | "type" | "category" | "is_paid" | "balance" | "counterpart" | "cost_center";
type SortDir = "asc" | "desc";
type RecurrenceType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
type RecurrenceDateMode = "same_date" | "first_business_day";
type ViewTab = "indicadores" | "previsao" | "doar";
type AccountType = "bank_account" | "credit_card" | "investment" | "wallet" | "cash" | "crypto";
type CashFlowFilter = "all" | "payable" | "receivable" | "overdue" | "paid";

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

const tooltipStyle = { background: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 20%)", borderRadius: 8, fontSize: 12 };
const CHART_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const isBusinessDay = (d: Date) => { const day = d.getDay(); return day !== 0 && day !== 6; };
const getNextBusinessDay = (d: Date) => {
  const result = new Date(d);
  while (!isBusinessDay(result)) result.setDate(result.getDate() + 1);
  return result;
};

// Counterpart autocomplete component
function CounterpartAutocomplete({ value, onChange, entries }: { value: string; onChange: (v: string) => void; entries: any[] }) {
  const [showSugg, setShowSugg] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sugRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const cpMap = new Map<string, number>();
    entries.forEach((e: any) => {
      if (e.counterpart) {
        cpMap.set(e.counterpart, (cpMap.get(e.counterpart) || 0) + 1);
      }
    });
    return Array.from(cpMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const filtered = useMemo(() => {
    if (!value.trim() || value.length < 2) return [];
    const q = value.toLowerCase();
    return suggestions.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q).slice(0, 6);
  }, [value, suggestions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sugRef.current && !sugRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSugg(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSugg(true); }}
        onFocus={() => setShowSugg(true)}
        placeholder="Nome da contraparte"
        autoComplete="off"
      />
      {showSugg && filtered.length > 0 && (
        <div ref={sugRef} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.map((s, i) => (
            <button
              key={i}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 text-left"
              onClick={() => { onChange(s.name); setShowSugg(false); }}
            >
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">×{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinancesView({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<DBTables<"projects">[]>([]);
  const [categories, setCategories] = useState<DBTables<"categories">[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("previsao");
  const { visibleTabs } = useModulePreferences("finances");
  
  useEffect(() => { onTabChange?.(viewTab); }, [viewTab, onTabChange]);
  const [customPeriodEnabled, setCustomPeriodEnabled] = useState(false);
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [doarCustomPeriodEnabled, setDoarCustomPeriodEnabled] = useState(false);
  const [doarCustomStart, setDoarCustomStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [doarCustomEnd, setDoarCustomEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const [indicCustomPeriodEnabled, setIndicCustomPeriodEnabled] = useState(false);
  const [indicCustomStart, setIndicCustomStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [indicCustomEnd, setIndicCustomEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const [recurrenceEditDialog, setRecurrenceEditDialog] = useState<{ entry: any; mode: "single" | "all" | null }>({ entry: null, mode: null });
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [doarYear, setDoarYear] = useState(new Date().getFullYear());
  const [revenueCollapsed, setRevenueCollapsed] = useState(false);
  const [expenseCollapsed, setExpenseCollapsed] = useState(false);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [cashFlowFilter, setCashFlowFilter] = useState<CashFlowFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [doarSearchQuery, setDoarSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
  const [counterpart, setCounterpart] = useState("");
  const [isFixed, setIsFixed] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [costCenterId, setCostCenterId] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitLines, setSplitLines] = useState<{ id: string; accountId: string; paymentMethod: string; amount: string }[]>([]);

  const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
  const splitTotal = splitLines.reduce((s, l) => s + parseNum(l.amount), 0);
  const totalAmountNum = parseNum(amount);
  const splitRemaining = totalAmountNum - splitTotal;
  const splitPct = totalAmountNum > 0 ? (splitTotal / totalAmountNum) * 100 : 0;
  const addSplitLine = () => setSplitLines(prev => [...prev, { id: crypto.randomUUID(), accountId: "", paymentMethod: "", amount: splitRemaining > 0 ? splitRemaining.toFixed(2).replace(".", ",") : "" }]);
  const updateSplitLine = (id: string, field: string, value: string) => setSplitLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  const removeSplitLine = (id: string) => setSplitLines(prev => prev.filter(l => l.id !== id));

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
    const [entRes, projRes, catRes, accRes, ccRes] = await Promise.all([
      supabase.from("financial_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", user.id),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("financial_accounts").select("*").eq("user_id", user.id).order("name"),
      supabase.from("cost_centers" as any).select("*").eq("user_id", user.id).eq("is_active", true).order("name"),
    ]);
    if (entRes.data) setEntries(entRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (accRes.data) setAccounts(accRes.data as FinancialAccount[]);
    if (ccRes.data) setCostCenters(ccRes.data as any[]);
  }, [user]);

  useEffect(() => {
    fetchData();
    const handleDataChanged = () => fetchData();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => window.removeEventListener("lovable:data-changed", handleDataChanged);
  }, [fetchData]);

  const resetForm = () => {
    setTitle(""); setAmount(""); setInstallments("1"); setCategoryId(""); setProjectId("");
    setEntryDate(format(new Date(), "yyyy-MM-dd")); setType("expense");
    setRecurrence("none"); setRecurrenceCount("12"); setRecurrenceDateMode("same_date");
    setEditingEntry(null); setAccountId(""); setPaymentMethod(""); setIsPaid(false);
    setCounterpart(""); setIsFixed(false); setAllDay(true); setCostCenterId("");
    setSplitEnabled(false); setSplitLines([]);
  };

  const resetAccForm = () => {
    setAccName(""); setAccType("bank_account"); setAccBalance("0");
    setAccLimit(""); setAccClosing(""); setAccDue("");
    setAccIsActive(true); setEditingAccount(null);
  };

  const handleRowClick = (entry: any) => {
    const now = Date.now();
    if (lastClickRef.current?.id === entry.id && now - lastClickRef.current.time < 400) {
      if ((entry.installment_group && entry.total_installments > 1) || entry.recurrence_type) {
        setRecurrenceEditDialog({ entry, mode: null });
      } else {
        openEditDialog(entry);
      }
      lastClickRef.current = null;
    } else {
      lastClickRef.current = { id: entry.id, time: now };
    }
  };

  const openEditDialog = async (entry: any) => {
    setEditingEntry(entry);
    setTitle(entry.title.replace(/\s*\(\d+\/\d+\)$/, ""));
    setAmount(String(entry.amount));
    setType(entry.type as "revenue" | "expense");
    setCategoryId(entry.category_id || "");
    setCostCenterId(entry.cost_center_id || "");
    setProjectId(entry.project_id || "");
    setEntryDate(entry.entry_date);
    setAccountId(entry.account_id || "");
    setPaymentMethod(entry.payment_method || "");
    setIsPaid(entry.is_paid || false);
    setCounterpart(entry.counterpart || "");
    setIsFixed(entry.is_fixed || false);
    setInstallments("1");
    setRecurrence("none");
    // Load existing splits
    if (entry.has_split) {
      const { data: splits } = await supabase.from("payment_splits" as any).select("*").eq("entry_id", entry.id);
      if (splits && splits.length > 0) {
        setSplitEnabled(true);
        setSplitLines((splits as any[]).map((s: any) => ({
          id: s.id, accountId: s.account_id || "", paymentMethod: s.payment_method || "",
          amount: String(s.amount),
        })));
      } else {
        setSplitEnabled(false); setSplitLines([]);
      }
    } else {
      setSplitEnabled(false); setSplitLines([]);
    }
    setDialogOpen(true);
  };

  const getNextDate = (base: Date, rec: RecurrenceType, i: number, dateMode: RecurrenceDateMode): Date => {
    let d: Date;
    switch (rec) {
      case "daily": d = addDays(base, i); break;
      case "weekly": d = addWeeks(base, i); break;
      case "biweekly": d = addWeeks(base, i * 2); break;
      case "monthly": d = addMonths(base, i); break;
      case "quarterly": d = addMonths(base, i * 3); break;
      case "semiannual": d = addMonths(base, i * 6); break;
      case "yearly": d = addMonths(base, i * 12); break;
      default: d = new Date(base); break;
    }
    if (dateMode === "first_business_day" && (rec === "monthly" || rec === "yearly")) {
      d.setDate(1);
      d = getNextBusinessDay(d);
    }
    return d;
  };

  const createOrUpdateEntry = async () => {
    if (!title.trim() || !amount || !user) return;
    if (isPaid && !splitEnabled && (!accountId || !paymentMethod)) return;

    if (editingEntry) {
      const updateData: any = {
        title, amount: parseFloat(amount), type,
        category_id: categoryId || null, project_id: projectId || null,
        cost_center_id: costCenterId || null,
        entry_date: entryDate,
        account_id: splitEnabled ? null : (accountId || null),
        payment_method: splitEnabled ? null : (paymentMethod || null),
        is_paid: isPaid,
        payment_date: isPaid ? format(new Date(), "yyyy-MM-dd") : null,
        counterpart: counterpart || null, is_fixed: isFixed,
        has_split: splitEnabled && splitLines.length > 0,
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
      // Update splits for edited entry
      if (editingEntry && !recurrenceEditDialog.mode) {
        await supabase.from("payment_splits" as any).delete().eq("entry_id", editingEntry.id);
        if (splitEnabled && splitLines.length > 0) {
          const splits = splitLines.map(l => ({
            entry_id: editingEntry.id, user_id: user.id,
            account_id: l.accountId || null, payment_method: l.paymentMethod || null,
            amount: parseNum(l.amount),
          }));
          await supabase.from("payment_splits" as any).insert(splits);
        }
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
            cost_center_id: costCenterId || null,
            entry_date: format(getNextDate(baseDate, recurrence, i, recurrenceDateMode), "yyyy-MM-dd"),
            installment_group: group, installment_number: i + 1, total_installments: count,
            account_id: splitEnabled ? null : (accountId || null),
            payment_method: splitEnabled ? null : (paymentMethod || null),
            is_paid: i === 0 ? isPaid : false,
            counterpart: counterpart || null, is_fixed: isFixed,
            has_split: splitEnabled && splitLines.length > 0,
          }));
        const { data: inserted } = await supabase.from("financial_entries").insert(entriesToInsert).select("id");
        if (splitEnabled && splitLines.length > 0 && inserted?.[0]) {
          const splits = splitLines.map(l => ({
            entry_id: inserted[0].id, user_id: user.id,
            account_id: l.accountId || null, payment_method: l.paymentMethod || null,
            amount: parseNum(l.amount),
          }));
          await supabase.from("payment_splits" as any).insert(splits);
        }
      } else {
        const numInst = Math.max(1, parseInt(installments) || 1);
        const instGroup = numInst > 1 ? crypto.randomUUID() : null;
          const entriesToInsert = Array.from({ length: numInst }, (_, i) => ({
            user_id: user.id,
            title: numInst > 1 ? `${title} (${i + 1}/${numInst})` : title,
            amount: baseAmount / numInst, type,
            category_id: categoryId || null, project_id: projectId || null,
            cost_center_id: costCenterId || null,
            entry_date: format(addMonths(baseDate, i), "yyyy-MM-dd"),
            installment_group: instGroup, installment_number: i + 1, total_installments: numInst,
            account_id: splitEnabled ? null : (accountId || null),
            payment_method: splitEnabled ? null : (paymentMethod || null),
            is_paid: i === 0 ? isPaid : false,
            counterpart: counterpart || null, is_fixed: isFixed,
            has_split: splitEnabled && splitLines.length > 0,
          }));
        const { data: inserted } = await supabase.from("financial_entries").insert(entriesToInsert).select("id");
        if (splitEnabled && splitLines.length > 0 && inserted?.[0]) {
          const splits = splitLines.map(l => ({
            entry_id: inserted[0].id, user_id: user.id,
            account_id: l.accountId || null, payment_method: l.paymentMethod || null,
            amount: parseNum(l.amount),
          }));
          await supabase.from("payment_splits" as any).insert(splits);
        }
      }
    }

    if (isPaid && !splitEnabled && accountId) {
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        const delta = type === "revenue" ? parseFloat(amount) : -parseFloat(amount);
        await supabase.from("financial_accounts").update({
          current_balance: account.current_balance + delta,
        }).eq("id", accountId);
      }
    }

    // Update balances for split payments
    if (isPaid && splitEnabled && splitLines.length > 0) {
      for (const line of splitLines) {
        if (line.accountId) {
          const amt = parseNum(line.amount);
          const account = accounts.find(a => a.id === line.accountId);
          if (account && amt > 0) {
            const delta = type === "revenue" ? amt : -amt;
            await supabase.from("financial_accounts").update({
              current_balance: account.current_balance + delta,
            }).eq("id", line.accountId);
          }
        }
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
    setDeleteEntryConfirm(null);
    fetchData();
  };

  // Helper to parse date-only strings without timezone issues
  const parseEntryDate = (d: string) => new Date(d + "T12:00:00");

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

  // Fluxo de caixa: filter logic
  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const query = searchQuery.toLowerCase().trim();
    
    return entries
      .filter((e) => {
        // Apply custom period filter only if enabled
        if (customPeriodEnabled) {
          const d = parseEntryDate(e.entry_date);
          const start = parseEntryDate(customStart);
          const end = parseEntryDate(customEnd);
          if (d < start || d > end) return false;
        }
        // Filter by cash flow type
        if (cashFlowFilter === "paid") return e.is_paid;
        if (cashFlowFilter === "payable") return e.type === "expense" && !e.is_paid;
        if (cashFlowFilter === "receivable") return e.type === "revenue" && !e.is_paid;
        if (cashFlowFilter === "overdue") { const ed = parseEntryDate(e.entry_date); return !e.is_paid && ed < today; }
        // "all" filter: show unpaid only
        return !e.is_paid;
      })
      .filter((e) => {
        if (!query) return true;
        const cat = categories.find(c => c.id === e.category_id)?.name || "";
        return e.title.toLowerCase().includes(query) || cat.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        // For non-paid views, overdue items always at top
        if (cashFlowFilter !== "paid") {
          const aOverdue = !a.is_paid && parseEntryDate(a.entry_date) < today;
          const bOverdue = !b.is_paid && parseEntryDate(b.entry_date) < today;
          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;
        }
        
        // Then sort by selected field
        let aVal: any, bVal: any;
        if (sortField === "category") {
          aVal = categories.find(c => c.id === a.category_id)?.name || "";
          bVal = categories.find(c => c.id === b.category_id)?.name || "";
        } else if (sortField === "counterpart") {
          aVal = a.counterpart || "";
          bVal = b.counterpart || "";
        } else if (sortField === "cost_center") {
          aVal = costCenters.find((cc: any) => cc.id === a.cost_center_id)?.name || "";
          bVal = costCenters.find((cc: any) => cc.id === b.cost_center_id)?.name || "";
        } else if (sortField === "is_paid") {
          aVal = a.is_paid ? 1 : 0; bVal = b.is_paid ? 1 : 0;
        } else if (sortField === "balance") {
          // Sort by running balance order (entry_date)
          aVal = a.entry_date; bVal = b.entry_date;
        } else {
          aVal = a[sortField]; bVal = b[sortField];
        }
        if (aVal == null || bVal == null) return 0;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [entries, sortField, sortDir, categories, costCenters, cashFlowFilter, searchQuery, customPeriodEnabled, customStart, customEnd]);

  // KPI totals based on current filter
  const kpiData = useMemo(() => {
    const source = cashFlowFilter === "paid" ? filtered : filtered;
    const totalRevenue = source.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
    const totalExpense = source.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const balance = totalRevenue - totalExpense;
    return { totalRevenue, totalExpense, balance };
  }, [filtered, cashFlowFilter]);

  const totalAvailable = accounts.reduce((s, a) => {
    if (a.type === "credit_card") return s;
    return s + a.current_balance;
  }, 0);

  const runningBalances = useMemo(() => {
    if (cashFlowFilter === "paid") {
      // For paid items, no running balance needed
      const balanceMap = new Map<string, number>();
      return { balanceMap, breakEvenId: null };
    }
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
  }, [filtered, cashFlowFilter]);

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

  // DRE / DOAR data - now with optional period filtering
  const dreData = useMemo(() => {
    const yr = doarYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    const revenueCategories = categories.filter(c => c.is_revenue);
    const expenseCategories = categories.filter(c => c.is_expense);

    const getMonthEntries = (month: Date) => {
      let monthEntries = entries.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      // Apply DOAR custom period filter if enabled
      if (doarCustomPeriodEnabled) {
        const pStart = parseEntryDate(doarCustomStart);
        const pEnd = parseEntryDate(doarCustomEnd);
        monthEntries = monthEntries.filter(e => {
          const d = parseEntryDate(e.entry_date);
          return d >= pStart && d <= pEnd;
        });
      }
      return monthEntries;
    };

    const getEntriesForCatMonth = (catId: string, month: Date, type: string) =>
      getMonthEntries(month).filter(e => e.type === type && e.category_id === catId);

    const prevYearEntries = entries.filter(e => new Date(e.entry_date).getFullYear() < yr);
    const carryOver = prevYearEntries.reduce((s, e) =>
      s + (e.type === "revenue" ? Number(e.amount) : -Number(e.amount)), 0);

    // Include ALL revenue/expense categories (even if no data yet)
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
  }, [entries, categories, doarYear, doarCustomPeriodEnabled, doarCustomStart, doarCustomEnd]);

  // Indicator chart data - with optional period filtering
  const indicatorEntries = useMemo(() => {
    if (!indicCustomPeriodEnabled) return entries;
    const pStart = parseEntryDate(indicCustomStart);
    const pEnd = parseEntryDate(indicCustomEnd);
    return entries.filter(e => {
      const d = parseEntryDate(e.entry_date);
      return d >= pStart && d <= pEnd;
    });
  }, [entries, indicCustomPeriodEnabled, indicCustomStart, indicCustomEnd]);

  const reportChartData = useMemo(() => {
    const yr = doarYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    let accumulated = 0;
    return months.map(month => {
      const src = indicCustomPeriodEnabled ? indicatorEntries : entries;
      const mEntries = src.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      const rev = mEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const exp = mEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      accumulated += rev - exp;
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), receita: rev, despesa: exp, saldo: rev - exp, acumulado: accumulated };
    });
  }, [entries, indicatorEntries, doarYear, indicCustomPeriodEnabled]);

  const categoryPieData = useMemo(() => {
    const yr = doarYear;
    const src = indicCustomPeriodEnabled ? indicatorEntries : entries;
    const yearEntries = src.filter(e => new Date(e.entry_date).getFullYear() === yr);
    const map = new Map<string, { name: string; value: number; color: string }>();
    yearEntries.filter(e => e.type === "expense").forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      const color = cat?.color || "#6b7280";
      const prev = map.get(name) || { name, value: 0, color };
      prev.value += Number(e.amount);
      map.set(name, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [entries, indicatorEntries, categories, doarYear, indicCustomPeriodEnabled]);

  const revenuePieData = useMemo(() => {
    const yr = doarYear;
    const src = indicCustomPeriodEnabled ? indicatorEntries : entries;
    const yearEntries = src.filter(e => new Date(e.entry_date).getFullYear() === yr);
    const map = new Map<string, { name: string; value: number; color: string }>();
    yearEntries.filter(e => e.type === "revenue").forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      const color = cat?.color || "#6b7280";
      const prev = map.get(name) || { name, value: 0, color };
      prev.value += Number(e.amount);
      map.set(name, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [entries, indicatorEntries, categories, doarYear, indicCustomPeriodEnabled]);

  // Monthly trend data for area chart
  const monthlyTrendData = useMemo(() => {
    const yr = doarYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    return months.map(month => {
      const src = indicCustomPeriodEnabled ? indicatorEntries : entries;
      const mEntries = src.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      const paid = mEntries.filter(e => e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
      const pending = mEntries.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), pago: paid, pendente: pending };
    });
  }, [entries, indicatorEntries, doarYear, indicCustomPeriodEnabled]);

  // Account balance data for horizontal bar chart
  const accountBalanceData = useMemo(() => {
    return accounts
      .filter(a => a.is_active)
      .map(a => ({
        name: a.name,
        balance: a.current_balance,
        type: a.type,
        color: a.color || CHART_COLORS[0],
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [accounts]);

  // Cost center breakdown
  const costCenterData = useMemo(() => {
    const yr = doarYear;
    const src = indicCustomPeriodEnabled ? indicatorEntries : entries;
    const yearEntries = src.filter(e => new Date(e.entry_date).getFullYear() === yr && e.cost_center_id);
    const map = new Map<string, { name: string; revenue: number; expense: number; color: string }>();
    yearEntries.forEach(e => {
      const cc = costCenters.find((c: any) => c.id === e.cost_center_id);
      if (!cc) return;
      const prev = map.get(cc.id) || { name: cc.name, revenue: 0, expense: 0, color: cc.color || "#6b7280" };
      if (e.type === "revenue") prev.revenue += Number(e.amount);
      else prev.expense += Number(e.amount);
      map.set(cc.id, prev);
    });
    return Array.from(map.values()).sort((a, b) => (b.revenue + b.expense) - (a.revenue + a.expense));
  }, [entries, indicatorEntries, costCenters, doarYear, indicCustomPeriodEnabled]);

  // Project financial data
  const projectFinData = useMemo(() => {
    const yr = doarYear;
    const src = indicCustomPeriodEnabled ? indicatorEntries : entries;
    const yearEntries = src.filter(e => new Date(e.entry_date).getFullYear() === yr && e.project_id);
    const map = new Map<string, { name: string; budget: number; revenue: number; expense: number }>();
    yearEntries.forEach(e => {
      const proj = projects.find(p => p.id === e.project_id);
      if (!proj) return;
      const prev = map.get(proj.id) || { name: proj.name, budget: Number(proj.budget || 0), revenue: 0, expense: 0 };
      if (e.type === "revenue") prev.revenue += Number(e.amount);
      else prev.expense += Number(e.amount);
      map.set(proj.id, prev);
    });
    return Array.from(map.values()).sort((a, b) => (b.revenue + b.expense) - (a.revenue + a.expense));
  }, [entries, indicatorEntries, projects, doarYear, indicCustomPeriodEnabled]);

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const allItems = filtered;
    const header = "Data,Título,Tipo,Categoria,Projeto,Conta,Pago,Forma Pgto,Valor\n";
    const rows = allItems.map(e => {
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
        .section-header { font-weight: bold; text-align: left; }
        .section-header-rev { background: #dcfce7 !important; color: #16a34a; }
        .section-header-exp { background: #fee2e2 !important; color: #dc2626; }
        .total-row { font-weight: bold; }
        .total-row-rev { background: #f0fdf4 !important; }
        .total-row-exp { background: #fef2f2 !important; }
        .result-row { background: #eff6ff !important; }
        .accum-row { background: #f3f4f6 !important; }
        .carry-row { background: #faf5ff !important; }
        .text-green { color: #16a34a; } .text-red { color: #dc2626; } .text-blue { color: #2563eb; }
        .cat-row { background: #fafafa !important; }
        .entry-row { background: #f9fafb !important; color: #6b7280; }
        .no-expand .expand-icon { display: none !important; }
      </style></head><body class="no-expand">
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

  const [doarExpandLevel, setDoarExpandLevel] = useState(2);

  const cycleDoarExpand = () => {
    const nextLevel = doarExpandLevel >= 3 ? 1 : doarExpandLevel + 1;
    setDoarExpandLevel(nextLevel);
    if (nextLevel === 1) {
      setRevenueCollapsed(true);
      setExpenseCollapsed(true);
      setExpandedCats(new Set());
    } else if (nextLevel === 2) {
      setRevenueCollapsed(false);
      setExpenseCollapsed(false);
      setExpandedCats(new Set());
    } else {
      setRevenueCollapsed(false);
      setExpenseCollapsed(false);
      const allIds = [...dreData.revRows, ...dreData.expRows].map(r => r.id);
      setExpandedCats(new Set(allIds));
    }
  };

  // Batch copy handler
  const handleBatchCopy = async () => {
    if (!user || selectedIds.size === 0) return;
    const toCopy = entries.filter(e => selectedIds.has(e.id));
    const copies = toCopy.map(e => ({
      user_id: user.id,
      title: e.title,
      amount: Number(e.amount),
      type: e.type,
      category_id: e.category_id || null,
      project_id: e.project_id || null,
      cost_center_id: e.cost_center_id || null,
      entry_date: e.entry_date,
      account_id: e.account_id || null,
      payment_method: e.payment_method || null,
      is_paid: false,
      counterpart: e.counterpart || null,
      is_fixed: e.is_fixed || false,
    }));
    await supabase.from("financial_entries").insert(copies);
    setSelectedIds(new Set());
    fetchData();
  };

  // Entry dialog content (shared)
  const renderEntryDialog = () => (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editingEntry ? "Editar fluxo de caixa" : "Novo lançamento"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {/* Identification group */}
        <div className="rounded-lg border border-border/30 p-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contraparte (Recebedor / Pagador)</Label>
            <CounterpartAutocomplete
              value={counterpart}
              onChange={setCounterpart}
              entries={entries}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="pl-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "revenue" | "expense")}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">🟢 Receita</SelectItem>
                  <SelectItem value="expense">🔴 Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!editingEntry && recurrence === "none" && (
              <div className="w-[90px]">
                <Label className="text-xs text-muted-foreground">Qtde. / Parcelas</Label>
                <Input type="number" placeholder="1" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} className="text-xs" />
              </div>
            )}
          </div>
        </div>

        {/* Dates & Scheduling group */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Vencimento</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5 pt-4">
              <Checkbox checked={allDay} onCheckedChange={(c) => setAllDay(!!c)} id="allday-fin" />
              <Label htmlFor="allday-fin" className="text-sm whitespace-nowrap">Dia inteiro</Label>
            </div>
          </div>
          {!editingEntry && (
            <>
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
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="semiannual">Semestral</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
                {recurrence !== "none" && (
                  <Input type="number" placeholder="Quantidade" min="1" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} className="text-xs" />
                )}
              </div>
              {(recurrence === "monthly" || recurrence === "yearly") && (
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
            </>
          )}
        </div>

        {/* Classification group */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "__clear__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Categoria (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__clear__"><span className="text-muted-foreground italic">Nenhum</span></SelectItem>
                {sortedFinCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Centro de Custo</Label>
            <Select value={costCenterId} onValueChange={(v) => setCostCenterId(v === "__clear__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Centro de custo (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__clear__"><span className="text-muted-foreground italic">Nenhum</span></SelectItem>
                {costCenters.map((cc: any) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cc.color }} />
                      {cc.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Projeto</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v === "__clear__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Projeto (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__clear__"><span className="text-muted-foreground italic">Nenhum</span></SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Payment group */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Pagamento {isPaid && <span className="text-destructive">*</span>}
          </div>
          {!splitEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Carteira</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className={cn("text-xs", isPaid && !accountId && "border-destructive")}><SelectValue placeholder={isPaid ? "Conta (obrigatório)" : "Conta (opcional)"} /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.is_active).map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-1.5">
                          {ACCOUNT_TYPE_LABELS[a.type as AccountType]?.icon}
                          {a.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Forma Pgto</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className={cn("text-xs", isPaid && !paymentMethod && "border-destructive")}><SelectValue placeholder={isPaid ? "Forma Pgto (obrigatório)" : "Forma Pgto"} /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={isFixed} onCheckedChange={(c) => setIsFixed(!!c)} id="is-fixed" />
              <label htmlFor="is-fixed" className="text-xs cursor-pointer">Conta fixa</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={splitEnabled} onCheckedChange={(c) => {
                const val = !!c;
                setSplitEnabled(val);
                if (val && splitLines.length === 0) addSplitLine();
              }} id="split-edit" />
              <label htmlFor="split-edit" className="text-xs cursor-pointer">Múltiplas carteiras</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={isPaid} onCheckedChange={(c) => setIsPaid(!!c)} id="is-paid" />
              <label htmlFor="is-paid" className="text-xs cursor-pointer">Baixar conta</label>
            </div>
          </div>
          {/* Split Lines */}
          {splitEnabled && (
            <div className="space-y-2 rounded-md border border-border/30 p-2.5 bg-muted/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <WalletCards className="h-3.5 w-3.5" /> Fontes de pagamento
                </span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addSplitLine}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {splitLines.map((line, idx) => (
                <div key={line.id} className="space-y-1.5 rounded border border-border/20 p-2 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-medium">Fonte {idx + 1}</span>
                    <button onClick={() => removeSplitLine(line.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Select value={line.accountId} onValueChange={(v) => updateSplitLine(line.id, "accountId", v)}>
                      <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Carteira" /></SelectTrigger>
                      <SelectContent>
                        {accounts.filter(a => a.is_active).map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={line.paymentMethod} onValueChange={(v) => updateSplitLine(line.id, "paymentMethod", v)}>
                      <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Forma" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={line.amount}
                    onChange={(e) => updateSplitLine(line.id, "amount", e.target.value.replace(/[^0-9.,]/g, ""))}
                    className="text-xs h-8" />
                </div>
              ))}
              {totalAmountNum > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">{splitPct.toFixed(0)}% alocado</span>
                    <span className={cn("font-medium",
                      splitRemaining > 0.01 ? "text-warning" : splitRemaining < -0.01 ? "text-destructive" : "text-[hsl(var(--success))]"
                    )}>
                      {splitRemaining > 0.01 ? `Faltam R$ ${splitRemaining.toFixed(2)}` :
                       splitRemaining < -0.01 ? `Excede R$ ${Math.abs(splitRemaining).toFixed(2)}` :
                       "✓ 100% alocado"}
                    </span>
                  </div>
                  <Progress value={Math.min(100, splitPct)} className="h-1.5" />
                </div>
              )}
            </div>
          )}
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
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
      {/* Tab buttons - Patrimônio pattern */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {([
          { key: "indicadores" as ViewTab, label: "Indicadores", icon: <BarChart3 className="h-3 w-3" /> },
          { key: "previsao" as ViewTab, label: "Fluxo de Caixa", icon: <CircleDollarSign className="h-3 w-3" /> },
          { key: "doar" as ViewTab, label: "DOAR", icon: <Landmark className="h-3 w-3" /> },
        ]).filter(tab => visibleTabs.includes(tab.key)).map(tab => (
          <Button key={tab.key} size="sm"
            variant={viewTab === tab.key ? "default" : "ghost"}
            className={cn("h-7 text-xs px-3 rounded-full gap-1.5", viewTab !== tab.key && "text-muted-foreground")}
            onClick={() => setViewTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Receitas
            </p>
            <p className="text-lg font-bold text-[hsl(var(--success))]">{brl(kpiData.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Despesas
            </p>
            <p className="text-lg font-bold text-destructive">{brl(kpiData.totalExpense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Saldo
            </p>
            <p className={cn("text-lg font-bold", kpiData.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(kpiData.balance)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Landmark className="h-3 w-3" /> Caixa Disponível
            </p>
            <p className={cn("text-lg font-bold", totalAvailable >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(totalAvailable)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      <div>

        {/* ============ FLUXO DE CAIXA ============ */}
        {viewTab === "previsao" && (
          <>
            {/* Quick filters + search + bulk actions */}
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                {([
                  { key: "payable" as CashFlowFilter, label: "A Pagar" },
                  { key: "receivable" as CashFlowFilter, label: "A Receber" },
                  { key: "paid" as CashFlowFilter, label: "Baixados" },
                ]).map(f => (
                  <Button key={f.key} size="sm"
                    variant={cashFlowFilter === f.key ? "default" : "ghost"}
                    className={cn("h-7 text-xs px-2.5 gap-1 rounded-full",
                      cashFlowFilter !== f.key && "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setCashFlowFilter(prev => prev === f.key ? "all" : f.key)}
                  >{f.label}</Button>
                ))}

                {/* Custom period toggle */}
                <Button size="sm"
                  variant={customPeriodEnabled ? "default" : "ghost"}
                  className={cn("h-7 text-xs px-2.5 gap-1 rounded-full", !customPeriodEnabled && "text-muted-foreground hover:text-foreground")}
                  onClick={() => setCustomPeriodEnabled(!customPeriodEnabled)}
                >
                  <Filter className="h-3 w-3" /> Período
                </Button>
              </div>

              {customPeriodEnabled && (
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 text-xs w-32" />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
                </div>
              )}

              <div className="flex items-center gap-1.5 ml-auto">
                {/* Search field */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar lançamentos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 pl-8 text-xs w-44"
                  />
                </div>

                {selectedIds.size > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">{selectedIds.size} selecionados</span>
                    <Button size="sm" variant="ghost"
                      className="h-7 px-2.5 text-xs gap-1 text-[hsl(var(--success))] hover:text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.1)] rounded-full"
                      onClick={async () => {
                        const ids = Array.from(selectedIds);
                        await supabase.from("financial_entries").update({
                          is_paid: true, payment_date: format(new Date(), "yyyy-MM-dd"),
                        }).in("id", ids);
                        setSelectedIds(new Set());
                        fetchData();
                      }}
                    ><Check className="h-3 w-3" /> Baixar contas</Button>
                    <Button size="sm" variant="ghost"
                      className="h-7 px-2.5 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10 rounded-full"
                      onClick={handleBatchCopy}
                    ><Copy className="h-3 w-3" /> Copiar</Button>
                    <Button size="sm" variant="ghost"
                      className="h-7 px-2.5 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                      onClick={async () => {
                        const ids = Array.from(selectedIds);
                        await supabase.from("financial_entries").delete().in("id", ids);
                        setSelectedIds(new Set());
                        fetchData();
                      }}
                    ><Trash2 className="h-3 w-3" /> Excluir</Button>
                  </>
                )}
                {/* Import/Export/Print */}
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file"; input.accept = ".csv";
                        input.onchange = async (ev: any) => {
                          const file = ev.target.files?.[0];
                          if (!file || !user) return;
                          const text = await file.text();
                          const lines = text.split("\n").filter(Boolean);
                          if (lines.length < 2) return;
                          const rows = lines.slice(1).map(line => {
                            const cols = line.split(",").map(c => c.replace(/"/g, "").trim());
                            return {
                              user_id: user.id, entry_date: cols[0] || format(new Date(), "yyyy-MM-dd"),
                              title: cols[1] || "Importado", type: cols[2]?.toLowerCase().includes("receita") ? "revenue" as const : "expense" as const,
                              amount: parseFloat(cols[cols.length - 1]) || 0, is_paid: false,
                            };
                          }).filter(r => r.amount > 0);
                          if (rows.length > 0) {
                            await supabase.from("financial_entries").insert(rows);
                            fetchData();
                          }
                        };
                        input.click();
                      }}
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Importar CSV</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={handleExportCSV}
                    >
                      <FileUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exportar CSV</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={handlePrint}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Imprimir</TooltipContent>
                </Tooltip>

                <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                  {renderEntryDialog()}
                </Dialog>
              </div>
            </div>

            {/* Table */}
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
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("counterpart")}>Contraparte <SortIcon field="counterpart" /></th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("category")}>Categoria <SortIcon field="category" /></th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("cost_center")}>C. Custo <SortIcon field="cost_center" /></th>
                    <th className="text-left py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("type")}>Tipo <SortIcon field="type" /></th>
                    <th className="text-right py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("amount")}>Valor <SortIcon field="amount" /></th>
                    {cashFlowFilter !== "paid" && (
                      <th className="text-right py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("balance")}>Saldo <SortIcon field="balance" /></th>
                    )}
                    <th className="text-center py-2 px-2 cursor-pointer select-none" onClick={() => toggleSort("is_paid")}>Status <SortIcon field="is_paid" /></th>
                    <th className="text-center py-2 px-2">Fixa</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} className="text-center text-muted-foreground/40 py-12">
                      {cashFlowFilter === "paid" ? "Sem lançamentos baixados" : "Sem lançamentos pendentes"}
                    </td></tr>
                  )}
                  {filtered.map((e, idx) => {
                    const cat = categories.find(c => c.id === e.category_id);
                    const runningBal = runningBalances.balanceMap.get(e.id) ?? 0;
                    const isBreakEven = runningBalances.breakEvenId === e.id;
                    const isOverdue = !e.is_paid && parseEntryDate(e.entry_date) < new Date();
                    const isSelected = selectedIds.has(e.id);
                    const isPaidItem = cashFlowFilter === "paid";
                    return (
                      <tr key={e.id}
                        className={cn(
                          "group cursor-pointer transition-colors hover:bg-muted/20",
                          idx > 0 && "border-t border-border/10",
                          !isPaidItem && isBreakEven && "bg-primary/5",
                          !isPaidItem && isOverdue && !isBreakEven && e.type === "expense" && "bg-destructive/15",
                          !isPaidItem && isOverdue && !isBreakEven && e.type === "revenue" && "bg-[hsl(var(--success)/0.12)]",
                          isPaidItem && "opacity-60",
                          isSelected && "bg-primary/10"
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
                        <td className="py-2.5 px-2 text-muted-foreground">{format(parseEntryDate(e.entry_date), "dd/MM/yy")}</td>
                        <td className={cn("py-2.5 px-2", isPaidItem && "line-through text-muted-foreground")}>
                          <span>{e.title}</span>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground/60 truncate max-w-[120px]">{e.counterpart || "—"}</td>
                        <td className="py-2.5 px-2 text-muted-foreground/60">{cat?.name || "—"}</td>
                        <td className="py-2.5 px-2 text-muted-foreground/60 text-xs truncate max-w-[100px]">{costCenters.find((cc: any) => cc.id === e.cost_center_id)?.name || "—"}</td>
                        <td className="py-2.5 px-2">
                          <span className={cn("text-xs font-medium", e.type === "revenue" ? "text-success" : "text-destructive")}>
                            {e.type === "revenue" ? "Receita" : "Despesa"}
                          </span>
                        </td>
                        <td className={cn("py-2.5 px-2 text-right font-medium tabular-nums", e.type === "revenue" ? "text-success" : "text-destructive")}>
                          {brl(Number(e.amount))}
                        </td>
                        {cashFlowFilter !== "paid" && (
                          <td className={cn("py-2.5 px-2 text-right font-semibold tabular-nums", runningBal >= 0 ? "text-success" : "text-destructive")}>
                            {brl(runningBal)}
                          </td>
                        )}
                        <td className="py-2.5 px-2 text-center">
                          {isPaidItem ? (
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
                        <td className="py-2.5 px-2 text-center">
                          {(e.is_fixed || e.total_installments === 0) && (
                            <span className="text-[10px] text-muted-foreground/60 font-medium">✓</span>
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

          const dQuery = doarSearchQuery.toLowerCase().trim();
          const filterDoarRow = (row: { name: string; months: number[] }) => {
            // Show all categories, even without data (they'll show "—")
            return !dQuery || row.name.toLowerCase().includes(dQuery);
          };
          const filteredRevRows = dreData.revRows.filter(filterDoarRow);
          const filteredExpRows = dreData.expRows.filter(filterDoarRow);

          const renderCategoryEntries = (row: typeof dreData.revRows[0]) => {
            if (!expandedCats.has(row.id)) return null;
            const allEntries = row.entries.flat();
            if (allEntries.length === 0) return null;
            const grouped = new Map<string, { title: string; monthAmounts: number[] }>();
            allEntries.forEach(e => {
              const key = e.title.replace(/\s*\(\d+\/\d+\)$/, "");
              if (!grouped.has(key)) {
                grouped.set(key, { title: key, monthAmounts: new Array(12).fill(0) });
              }
              const mi = new Date(e.entry_date).getMonth();
              grouped.get(key)!.monthAmounts[mi] += Number(e.amount);
            });
            return Array.from(grouped.values()).map(g => (
              <tr key={g.title} className="entry-row bg-muted/10 text-xs">
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
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <Select value={String(doarYear)} onValueChange={(v) => setDoarYear(Number(v))}>
                  <SelectTrigger className="h-7 w-24 text-xs rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm"
                  variant={doarCustomPeriodEnabled ? "default" : "ghost"}
                  className={cn("h-7 text-xs px-2.5 gap-1 rounded-full", !doarCustomPeriodEnabled && "text-muted-foreground hover:text-foreground")}
                  onClick={() => setDoarCustomPeriodEnabled(!doarCustomPeriodEnabled)}
                >
                  <Filter className="h-3 w-3" /> Período
                </Button>
              </div>
              {doarCustomPeriodEnabled && (
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={doarCustomStart} onChange={(e) => setDoarCustomStart(e.target.value)} className="h-7 text-xs w-32" />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input type="date" value={doarCustomEnd} onChange={(e) => setDoarCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
                </div>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Pesquisar categorias..."
                    value={doarSearchQuery} onChange={(e) => setDoarSearchQuery(e.target.value)}
                    className="h-7 pl-8 text-xs w-44" />
                </div>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={cycleDoarExpand} title={`Nível ${doarExpandLevel}/3`}>
                      <ChevronsUpDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Expandir/Recolher</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handlePrintDOAR}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Imprimir</TooltipContent>
                </Tooltip>
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
                    <tr className="carry-row bg-primary/5">
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
                  <tr className="section-header section-header-rev bg-success/10 cursor-pointer select-none" onClick={() => setRevenueCollapsed(!revenueCollapsed)}>
                    <td colSpan={2} className="p-2 border-b border-border font-bold text-success">
                      <span className="inline-flex items-center gap-1">
                        <span className="expand-icon">
                          {revenueCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                        </span>
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
                        <tr className="cat-row hover:bg-muted/30 cursor-pointer" onClick={() => toggleCatExpand(row.id)}>
                          <td className="p-2 border-b border-border pl-6">
                            <span className="inline-flex items-center gap-1">
                              <span className="expand-icon">
                                {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              </span>
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
                    <tr className="total-row total-row-rev bg-success/5 font-bold">
                      <td className="p-2 border-b-2 border-border text-success">TOTAL RECEITAS</td>
                      <td className="text-right p-2 border-b-2 border-border text-success">100%</td>
                      {dreData.monthTotalsRev.map((v, i) => (
                        <td key={i} className="text-right p-2 border-b-2 border-border text-success">{brl(v)}</td>
                      ))}
                      <td className="text-right p-2 border-b-2 border-border text-success">{brl(totalRevYear)}</td>
                    </tr>
                  )}

                  {/* Expense header */}
                  <tr className="section-header section-header-exp bg-destructive/10 cursor-pointer select-none" onClick={() => setExpenseCollapsed(!expenseCollapsed)}>
                    <td colSpan={2} className="p-2 border-b border-border font-bold text-destructive">
                      <span className="inline-flex items-center gap-1">
                        <span className="expand-icon">
                          {expenseCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                        </span>
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
                        <tr className="cat-row hover:bg-muted/30 cursor-pointer" onClick={() => toggleCatExpand(row.id)}>
                          <td className="p-2 border-b border-border pl-6">
                            <span className="inline-flex items-center gap-1">
                              <span className="expand-icon">
                                {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              </span>
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
                    <tr className="total-row total-row-exp bg-destructive/5 font-bold">
                      <td className="p-2 border-b-2 border-border text-destructive">TOTAL DESPESAS</td>
                      <td className="text-right p-2 border-b-2 border-border text-destructive">100%</td>
                      {dreData.monthTotalsExp.map((v, i) => (
                        <td key={i} className="text-right p-2 border-b-2 border-border text-destructive">{brl(v)}</td>
                      ))}
                      <td className="text-right p-2 border-b-2 border-border text-destructive">{brl(totalExpYear)}</td>
                    </tr>
                  )}

                  {/* Balance per month */}
                  <tr className="result-row bg-primary/5 font-bold">
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
                  <tr className="accum-row bg-muted font-bold">
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

        {/* ============ INDICADORES ============ */}
        {viewTab === "indicadores" && (
          <div className="space-y-4" ref={reportRef}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <Select value={String(doarYear)} onValueChange={(v) => setDoarYear(Number(v))}>
                  <SelectTrigger className="h-7 w-24 text-xs rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...new Set(entries.map(e => new Date(e.entry_date).getFullYear())), doarYear].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => b - a).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm"
                  variant={indicCustomPeriodEnabled ? "default" : "ghost"}
                  className={cn("h-7 text-xs px-2.5 gap-1 rounded-full", !indicCustomPeriodEnabled && "text-muted-foreground hover:text-foreground")}
                  onClick={() => setIndicCustomPeriodEnabled(!indicCustomPeriodEnabled)}
                >
                  <Filter className="h-3 w-3" /> Período
                </Button>
              </div>
              {indicCustomPeriodEnabled && (
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={indicCustomStart} onChange={(e) => setIndicCustomStart(e.target.value)} className="h-7 text-xs w-32" />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input type="date" value={indicCustomEnd} onChange={(e) => setIndicCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
                </div>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleExportCSV}>
                      <FileUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exportar CSV</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handlePrint}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Imprimir</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Summary cards */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo Anual — {doarYear}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg bg-success/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Receitas</p>
                    <p className="text-lg font-bold text-success">{brl(dreData.monthTotalsRev.reduce((s, v) => s + v, 0))}</p>
                    <p className="text-[10px] text-muted-foreground">{(indicCustomPeriodEnabled ? indicatorEntries : entries).filter(e => e.type === "revenue" && new Date(e.entry_date).getFullYear() === doarYear).length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Despesas</p>
                    <p className="text-lg font-bold text-destructive">{brl(dreData.monthTotalsExp.reduce((s, v) => s + v, 0))}</p>
                    <p className="text-[10px] text-muted-foreground">{(indicCustomPeriodEnabled ? indicatorEntries : entries).filter(e => e.type === "expense" && new Date(e.entry_date).getFullYear() === doarYear).length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Resultado do Ano</p>
                    <p className={cn("text-lg font-bold", (dreData.accumulated[11] || 0) >= 0 ? "text-success" : "text-destructive")}>
                      {brl(dreData.accumulated[11] || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Balance - Horizontal Bar Chart */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-primary" /> Recursos por Conta</CardTitle></CardHeader>
              <CardContent>
                {accountBalanceData.length > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={accountBalanceData} layout="vertical" barSize={18}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => brl(v)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                        <Bar dataKey="balance" name="Saldo" radius={[0, 4, 4, 0]}>
                          {accountBalanceData.map((d, i) => (
                            <Cell key={d.name} fill={d.balance >= 0 ? "#22c55e" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-xs text-muted-foreground text-center py-8">Sem contas cadastradas</p>}
              </CardContent>
            </Card>

            {/* Revenue vs Expense chart */}
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

            {/* Monthly balance trend */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Saldo Mensal — {doarYear}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={reportChartData}>
                      <defs>
                        {(() => {
                          const vals = reportChartData.map(d => d.saldo);
                          const maxV = Math.max(...vals, 0);
                          const minV = Math.min(...vals, 0);
                          const range = maxV - minV || 1;
                          const zeroOffset = maxV / range;
                          return (
                            <linearGradient id="saldoGradFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(217 91% 30%)" stopOpacity={0.6} />
                              <stop offset={`${Math.max(0, zeroOffset * 100 - 5)}%`} stopColor="hsl(217 91% 55%)" stopOpacity={0.15} />
                              <stop offset={`${zeroOffset * 100}%`} stopColor="hsl(var(--muted))" stopOpacity={0.05} />
                              <stop offset={`${Math.min(100, zeroOffset * 100 + 5)}%`} stopColor="hsl(0 72% 51%)" stopOpacity={0.15} />
                              <stop offset="100%" stopColor="hsl(0 72% 35%)" stopOpacity={0.6} />
                            </linearGradient>
                          );
                        })()}
                        {(() => {
                          const vals = reportChartData.map(d => d.saldo);
                          const maxV = Math.max(...vals, 0);
                          const minV = Math.min(...vals, 0);
                          const range = maxV - minV || 1;
                          const zeroOffset = maxV / range;
                          return (
                            <linearGradient id="saldoGradStroke" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(217 91% 40%)" />
                              <stop offset={`${zeroOffset * 100}%`} stopColor="hsl(var(--muted-foreground))" />
                              <stop offset="100%" stopColor="hsl(0 72% 45%)" />
                            </linearGradient>
                          );
                        })()}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Area type="monotone" dataKey="saldo" name="Saldo" stroke="url(#saldoGradStroke)" strokeWidth={2}
                        fill="url(#saldoGradFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Paid vs Pending trend */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pago × Pendente — {doarYear}</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrendData} barGap={0}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="pago" name="Pago" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pendente" name="Pendente" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Cost Center Breakdown */}
            {costCenterData.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5 text-primary" /> Indicadores por Centro de Custo — {doarYear}</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={costCenterData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="revenue" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Project Financial Breakdown */}
            {projectFinData.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5 text-primary" /> Indicadores por Projeto — {doarYear}</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projectFinData} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="budget" name="Orçamento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="revenue" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pie charts */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Categorias — Despesas</CardTitle></CardHeader>
                <CardContent>
                  {categoryPieData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="h-[200px] w-[200px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={categoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                              outerRadius={80} innerRadius={48} paddingAngle={4} cornerRadius={6}
                              stroke="none">
                              {categoryPieData.map((d, i) => <Cell key={d.name} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {categoryPieData.map((d, i) => {
                          const total = categoryPieData.reduce((s, x) => s + x.value, 0);
                          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
                          return (
                            <div key={d.name} className="flex items-center gap-2 text-xs">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-muted-foreground truncate flex-1">{d.name}</span>
                              <span className="font-medium">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Categorias — Receitas</CardTitle></CardHeader>
                <CardContent>
                  {revenuePieData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="h-[200px] w-[200px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={revenuePieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                              outerRadius={80} innerRadius={48} paddingAngle={4} cornerRadius={6}
                              stroke="none">
                              {revenuePieData.map((d, i) => <Cell key={d.name} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {revenuePieData.map((d, i) => {
                          const total = revenuePieData.reduce((s, x) => s + x.value, 0);
                          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
                          return (
                            <div key={d.name} className="flex items-center gap-2 text-xs">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-muted-foreground truncate flex-1">{d.name}</span>
                              <span className="font-medium">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
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
    </ScrollArea>
  );
}
