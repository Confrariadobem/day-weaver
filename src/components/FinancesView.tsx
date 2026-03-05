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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, TrendingUp, TrendingDown, Wallet, Trash2, Save,
  Printer, FileDown, FileUp, Repeat, Landmark, CreditCard, PiggyBank, WalletCards,
  Banknote, Bitcoin, ChevronDown, ChevronUp, Check, CalendarDays,
  CircleDollarSign, AlertTriangle, Search, Eye, EyeOff, ChevronsUpDown,
  Filter, BarChart3, Copy, FolderKanban, ListChecks, DollarSign, Pencil, X, CalendarRange,
} from "lucide-react";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addMonths, addWeeks, addDays, startOfYear, endOfYear, eachMonthOfInterval, differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Line, Legend, Cell, PieChart, Pie, Area, AreaChart, ReferenceLine,
} from "recharts";
import type { Tables as DBTables } from "@/integrations/supabase/types";

type PeriodFilter = "daily" | "3days" | "weekly" | "monthly" | "yearly" | "custom";
type SortField = "title" | "amount" | "entry_date" | "type" | "category" | "is_paid" | "balance" | "counterpart" | "cost_center" | "payment_date";
type SortDir = "asc" | "desc";
type RecurrenceType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
type RecurrenceDateMode = "same_date" | "first_business_day";
type ViewTab = "indicadores" | "previsao" | "doar" | "centrocusto";
type AccountType = "bank_account" | "credit_card" | "investment" | "wallet" | "cash" | "crypto";
type CashFlowFilter = "all" | "payable" | "receivable" | "overdue" | "paid";
type CurrencyType = "BRL" | "USDT";

interface FinancialAccount {
  id: string; user_id: string; name: string; type: string;
  initial_balance: number; current_balance: number;
  credit_limit: number | null; closing_day: number | null;
  due_day: number | null; color: string | null;
  is_active: boolean | null; created_at: string; updated_at: string;
  currency?: string;
}

// Currency formatting now uses useCurrency context
import { useCurrency } from "@/contexts/CurrencyContext";

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

export default function FinancesView({ onTabChange, walletFilter, onClearWalletFilter, onNavigateToPatrimonio }: { onTabChange?: (tab: string) => void; walletFilter?: { id: string; name: string } | null; onClearWalletFilter?: () => void; onNavigateToPatrimonio?: () => void }) {
  const { user } = useAuth();
  const { formatCurrency: brl } = useCurrency();
  const fmtCurrency = (v: number, _cur?: CurrencyType) => brl(v);
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<DBTables<"projects">[]>([]);
  const [categories, setCategories] = useState<DBTables<"categories">[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("previsao");
  const { visibleTabs } = useModulePreferences("finances");
  
  useEffect(() => { onTabChange?.(viewTab); }, [viewTab, onTabChange]);

  // Unified period filter (replaces year selector everywhere)
  const [periodStart, setPeriodStart] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfYear(new Date()), "yyyy-MM-dd"));
  const [customPeriodEnabled, setCustomPeriodEnabled] = useState(false);
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const [recurrenceEditDialog, setRecurrenceEditDialog] = useState<{ entry: any; mode: "single" | "all" | null }>({ entry: null, mode: null });
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
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
  const [doarShowPaid, setDoarShowPaid] = useState(false); // false=all, true=paid only
  const [doarHideCarryOver, setDoarHideCarryOver] = useState(false);
  const [ccReportSearch, setCcReportSearch] = useState("");
  const [ccReportFilterIds, setCcReportFilterIds] = useState<Set<string>>(new Set()); // empty = all

  // Form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyType>("BRL");
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
  const [description, setDescription] = useState("");
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [desconto, setDesconto] = useState("");
  const [realPaymentDate, setRealPaymentDate] = useState("");
  const [previsaoFilterDate, setPrevisaoFilterDate] = useState<Date | undefined>(undefined);
  const [fluxoDateFrom, setFluxoDateFrom] = useState("");
  const [fluxoDateTo, setFluxoDateTo] = useState("");
  const [colFilterStatus, setColFilterStatus] = useState<string>("all");
  const [colFilterCounterpart, setColFilterCounterpart] = useState<string>("");

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
    setSplitEnabled(false); setSplitLines([]); setCurrency("BRL"); setDescription("");
    setJuros(""); setMulta(""); setDesconto(""); setRealPaymentDate("");
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
    setRealPaymentDate(entry.payment_date || "");
    setCounterpart(entry.counterpart || "");
    setIsFixed(entry.is_fixed || false);
    setInstallments("1");
    setRecurrence("none");
    setCurrency((entry.currency as CurrencyType) || "BRL");
    setDescription(entry.description || "");
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
        currency: currency,
        description: description || null,
      };
      if (recurrenceEditDialog.mode === "all" && editingEntry.installment_group) {
        // Update ALL future items with ALL fields
        const allGroup = entries.filter(
          (e) => e.installment_group === editingEntry.installment_group &&
            e.installment_number >= editingEntry.installment_number
        );
        for (const e of allGroup) {
          await supabase.from("financial_entries").update({
            ...updateData,
            title: allGroup.length > 1 ? `${title} (${e.installment_number}/${editingEntry.total_installments})` : title,
            entry_date: e.entry_date, // keep each item's own date
            is_paid: e.is_paid, // keep each item's own paid status
            payment_date: e.payment_date, // keep each item's own payment date
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
            title: title,
            amount: baseAmount, type,
            category_id: categoryId || null, project_id: projectId || null,
            cost_center_id: costCenterId || null,
            entry_date: format(getNextDate(baseDate, recurrence, i, recurrenceDateMode), "yyyy-MM-dd"),
            recurrence_type: recurrence,
            installment_group: group, installment_number: i + 1, total_installments: count,
            account_id: splitEnabled ? null : (accountId || null),
            payment_method: splitEnabled ? null : (paymentMethod || null),
            is_paid: i === 0 ? isPaid : false,
            counterpart: counterpart || null, is_fixed: isFixed,
            has_split: splitEnabled && splitLines.length > 0,
            currency: currency,
            description: description || null,
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
            currency: currency,
            description: description || null,
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
  const periodYear = new Date(periodStart).getFullYear();

  // Parse DD/MM/YYYY to Date
  const parseDMY = (s: string): Date | null => {
    const clean = s.replace(/[^0-9]/g, "");
    if (clean.length < 8) return null;
    const d = parseInt(clean.slice(0, 2));
    const m = parseInt(clean.slice(2, 4)) - 1;
    const y = parseInt(clean.slice(4, 8));
    if (isNaN(d) || isNaN(m) || isNaN(y) || d < 1 || d > 31 || m < 0 || m > 11 || y < 1900) return null;
    return new Date(y, m, d);
  };

  const normalizeDateInput = (val: string): string => {
    const digits = val.replace(/[^0-9]/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);
  };

  // Highlight helper for search matches
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return <>{text.slice(0, idx)}<strong className="text-foreground">{text.slice(idx, idx + query.length)}</strong>{text.slice(idx + query.length)}</>;
  };

  // Fluxo de caixa: filter logic - expanded search
  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const query = searchQuery.toLowerCase().trim();
    
    return entries
      .filter((e) => {
        // Wallet filter from Patrimônio
        if (walletFilter && e.account_id !== walletFilter.id) return false;
        if (customPeriodEnabled) {
          const d = parseEntryDate(e.entry_date);
          const start = parseEntryDate(customStart);
          const end = parseEntryDate(customEnd);
          if (d < start || d > end) return false;
        }
        // Apply date range filter (new Dashboard-style)
        const fromDate = parseDMY(fluxoDateFrom);
        const toDate = parseDMY(fluxoDateTo);
        if (fromDate || toDate) {
          const d = parseEntryDate(e.entry_date);
          if (fromDate && d < fromDate) return false;
          if (toDate) { const endD = new Date(toDate); endD.setHours(23,59,59,999); if (d > endD) return false; }
        }
        // Filter by cash flow type
        if (cashFlowFilter === "paid") return e.is_paid;
        if (cashFlowFilter === "payable") return !e.is_paid;
        if (cashFlowFilter === "receivable") return e.is_paid;
        if (cashFlowFilter === "overdue") { const ed = parseEntryDate(e.entry_date); return !e.is_paid && ed < today; }
        // "all" filter: show everything
        return true;
      })
      .filter((e) => {
        // Column filters
        if (colFilterStatus === "paid" && !e.is_paid) return false;
        if (colFilterStatus === "pending" && e.is_paid) return false;
        if (colFilterStatus === "overdue") {
          const ed = parseEntryDate(e.entry_date);
          if (e.is_paid || ed >= today) return false;
        }
        if (colFilterCounterpart && !(e.counterpart || "").toLowerCase().includes(colFilterCounterpart.toLowerCase())) return false;
        return true;
      })
      .filter((e) => {
        if (!query) return true;
        const cat = categories.find(c => c.id === e.category_id)?.name || "";
        const cc = costCenters.find((c: any) => c.id === e.cost_center_id)?.name || "";
        const proj = projects.find(p => p.id === e.project_id)?.name || "";
        const acc = accounts.find(a => a.id === e.account_id)?.name || "";
        const cp = e.counterpart || "";
        const amt = String(e.amount);
        const pm = e.payment_method || "";
        const desc = e.description || "";
        const dateStr = e.entry_date ? format(parseEntryDate(e.entry_date), "dd/MM/yyyy") : "";
        const statusLabel = e.is_paid ? "pago baixado" : "pendente";
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isOverdue = !e.is_paid && parseEntryDate(e.entry_date) < today;
        const overdueLabel = isOverdue ? "atrasado vencido" : "";
        const haystack = [e.title, cat, cc, proj, acc, cp, amt, pm, desc, dateStr, statusLabel, overdueLabel]
          .join(" ").toLowerCase();
        // Simple fuzzy: all query words must appear somewhere
        const words = query.split(/\s+/).filter(Boolean);
        return words.every(w => haystack.includes(w));
      })
      .sort((a, b) => {
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
          aVal = a.entry_date; bVal = b.entry_date;
        } else if (sortField === "payment_date") {
          aVal = a.payment_date || ""; bVal = b.payment_date || "";
        } else {
          aVal = a[sortField]; bVal = b[sortField];
        }
        if (aVal == null || bVal == null) return 0;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [entries, sortField, sortDir, categories, costCenters, projects, accounts, cashFlowFilter, searchQuery, customPeriodEnabled, customStart, customEnd, fluxoDateFrom, fluxoDateTo, colFilterStatus, colFilterCounterpart, walletFilter]);

  // KPI totals based on current filter
  const kpiData = useMemo(() => {
    const totalRevenue = filtered.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
    const totalExpense = filtered.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const balance = totalRevenue - totalExpense;
    return { totalRevenue, totalExpense, balance };
  }, [filtered]);

  const totalAvailable = accounts.reduce((s, a) => {
    if (a.type === "credit_card") return s;
    return s + a.current_balance;
  }, 0);

  const runningBalances = useMemo(() => {
    if (cashFlowFilter === "paid") {
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

  // Entries filtered by unified period
  const periodFilteredEntries = useMemo(() => {
    const pStart = parseEntryDate(periodStart);
    const pEnd = parseEntryDate(periodEnd);
    return entries.filter(e => {
      const d = parseEntryDate(e.entry_date);
      return d >= pStart && d <= pEnd;
    });
  }, [entries, periodStart, periodEnd]);

  // DRE / DOAR data
  const dreData = useMemo(() => {
    const pStart = new Date(periodStart);
    const pEnd = new Date(periodEnd);
    const yr = pStart.getFullYear();
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    // Include categories that have entries even if is_revenue/is_expense flags aren't set
    const catIdsWithRevEntries = new Set(entries.filter(e => e.type === "revenue" && e.category_id).map(e => e.category_id));
    const catIdsWithExpEntries = new Set(entries.filter(e => e.type === "expense" && e.category_id).map(e => e.category_id));
    const revenueCategories = categories.filter(c => c.is_revenue || catIdsWithRevEntries.has(c.id));
    const expenseCategories = categories.filter(c => c.is_expense || catIdsWithExpEntries.has(c.id));

    const getMonthEntries = (month: Date) => {
      let src = doarShowPaid ? entries.filter(e => e.is_paid) : entries;
      return src.filter(e => {
        const d = new Date(e.entry_date);
        if (d.getMonth() !== month.getMonth() || d.getFullYear() !== yr) return false;
        const ed = parseEntryDate(e.entry_date);
        return ed >= parseEntryDate(periodStart) && ed <= parseEntryDate(periodEnd);
      });
    };

    const getEntriesForCatMonth = (catId: string, month: Date, type: string) =>
      getMonthEntries(month).filter(e => e.type === type && e.category_id === catId);

    const prevYearEntries = entries.filter(e => {
      if (doarShowPaid && !e.is_paid) return false;
      return new Date(e.entry_date).getFullYear() < yr;
    });
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

    let acc = doarHideCarryOver ? 0 : carryOver;
    const accumulated = monthBalance.map(b => { acc += b; return acc; });

    return {
      months: months.map(m => format(m, "MMM", { locale: ptBR }).toUpperCase()),
      revRows, expRows, monthTotalsRev, monthTotalsExp, monthBalance, accumulated, carryOver,
    };
  }, [entries, categories, periodStart, periodEnd, doarShowPaid, doarHideCarryOver]);

  // Indicator chart data
  const reportChartData = useMemo(() => {
    const yr = periodYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    let accumulated = 0;
    return months.map(month => {
      const mEntries = periodFilteredEntries.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      const rev = mEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const exp = mEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      accumulated += rev - exp;
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), receita: rev, despesa: exp, saldo: rev - exp, acumulado: accumulated };
    });
  }, [periodFilteredEntries, periodYear]);

  const categoryPieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    periodFilteredEntries.filter(e => e.type === "expense").forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      const color = cat?.color || "#6b7280";
      const prev = map.get(name) || { name, value: 0, color };
      prev.value += Number(e.amount);
      map.set(name, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [periodFilteredEntries, categories]);

  const revenuePieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    periodFilteredEntries.filter(e => e.type === "revenue").forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || "Sem Categoria";
      const color = cat?.color || "#6b7280";
      const prev = map.get(name) || { name, value: 0, color };
      prev.value += Number(e.amount);
      map.set(name, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [periodFilteredEntries, categories]);

  const monthlyTrendData = useMemo(() => {
    const yr = periodYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    return months.map(month => {
      const mEntries = periodFilteredEntries.filter(e => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      const paid = mEntries.filter(e => e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
      const pending = mEntries.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
      return { month: format(month, "MMM", { locale: ptBR }).toUpperCase(), pago: paid, pendente: pending };
    });
  }, [periodFilteredEntries, periodYear]);

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

  const costCenterData = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; expense: number; color: string }>();
    periodFilteredEntries.filter(e => e.cost_center_id).forEach(e => {
      const cc = costCenters.find((c: any) => c.id === e.cost_center_id);
      if (!cc) return;
      const prev = map.get(cc.id) || { name: cc.name, revenue: 0, expense: 0, color: cc.color || "#6b7280" };
      if (e.type === "revenue") prev.revenue += Number(e.amount);
      else prev.expense += Number(e.amount);
      map.set(cc.id, prev);
    });
    return Array.from(map.values()).sort((a, b) => (b.revenue + b.expense) - (a.revenue + a.expense));
  }, [periodFilteredEntries, costCenters]);

  const projectFinData = useMemo(() => {
    const map = new Map<string, { name: string; budget: number; revenue: number; expense: number }>();
    periodFilteredEntries.filter(e => e.project_id).forEach(e => {
      const proj = projects.find(p => p.id === e.project_id);
      if (!proj) return;
      const prev = map.get(proj.id) || { name: proj.name, budget: Number(proj.budget || 0), revenue: 0, expense: 0 };
      if (e.type === "revenue") prev.revenue += Number(e.amount);
      else prev.expense += Number(e.amount);
      map.set(proj.id, prev);
    });
    return Array.from(map.values()).sort((a, b) => (b.revenue + b.expense) - (a.revenue + a.expense));
  }, [periodFilteredEntries, projects]);

  // Centro de custo report data
  const ccReportData = useMemo(() => {
    const yr = periodYear;
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    const activeCCs = ccReportFilterIds.size > 0
      ? costCenters.filter((cc: any) => ccReportFilterIds.has(cc.id))
      : costCenters;

    return activeCCs.map((cc: any) => {
      const ccEntries = periodFilteredEntries.filter(e => e.cost_center_id === cc.id);
      // Group by category
      const catMap = new Map<string, { name: string; type: string; months: number[]; entries: any[][] }>();
      ccEntries.forEach(e => {
        const cat = categories.find(c => c.id === e.category_id);
        const catName = cat?.name || "Sem Categoria";
        const key = `${e.type}-${catName}`;
        if (!catMap.has(key)) {
          catMap.set(key, { name: catName, type: e.type, months: new Array(12).fill(0), entries: months.map(() => []) });
        }
        const mi = new Date(e.entry_date).getMonth();
        catMap.get(key)!.months[mi] += Number(e.amount);
        catMap.get(key)!.entries[mi].push(e);
      });

      const revRows = Array.from(catMap.values()).filter(r => r.type === "revenue").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      const expRows = Array.from(catMap.values()).filter(r => r.type === "expense").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      const monthTotalsRev = months.map((_, i) => revRows.reduce((s, r) => s + r.months[i], 0));
      const monthTotalsExp = months.map((_, i) => expRows.reduce((s, r) => s + r.months[i], 0));
      const monthBalance = months.map((_, i) => monthTotalsRev[i] - monthTotalsExp[i]);

      return {
        id: cc.id, name: cc.name, color: cc.color,
        revRows, expRows, monthTotalsRev, monthTotalsExp, monthBalance,
      };
    }).filter(cc => {
      if (!ccReportSearch) return true;
      return cc.name.toLowerCase().includes(ccReportSearch.toLowerCase());
    });
  }, [periodFilteredEntries, costCenters, categories, periodYear, ccReportFilterIds, ccReportSearch]);

  const handlePrint = () => {
    const style = document.createElement("style");
    style.id = "fluxo-print-style";
    style.textContent = `
      @media print {
        @page { size: landscape; margin: 1cm; }
        body * { visibility: hidden !important; }
        .print-fluxo-area, .print-fluxo-area * { visibility: visible !important; }
        .print-fluxo-area { position: absolute; left: 0; top: 0; width: 100%; }
        .print-fluxo-area nav, .print-fluxo-area button, .print-fluxo-area .no-print { display: none !important; }
        .print-fluxo-area table thead { background: #f3f4f6 !important; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
        .print-fluxo-area table { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById("fluxo-print-style")?.remove(), 500);
  };

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
      <html><head><title>DOAR</title>
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

  // Batch copy handler - includes all fields
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
      description: e.description || null,
      currency: e.currency || "BRL",
    }));
    await supabase.from("financial_entries").insert(copies);
    setSelectedIds(new Set());
    fetchData();
  };

  // Period filter component (shared)
  const renderPeriodFilter = () => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Período</span>
      <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="h-7 text-xs w-32" />
      <span className="text-xs text-muted-foreground">a</span>
      <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="h-7 text-xs w-32" />
    </div>
  );

  // Entry dialog content (shared)
  const renderEntryDialog = () => (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editingEntry ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        {/* Identificação */}
        <div className="rounded-lg border border-border/30 p-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Título</Label>
            <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        {/* Classificação */}
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

        {/* Tipo, Valor, Contraparte */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
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
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Valor</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{currency === "USDT" ? "$" : "R$"}</span>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="pl-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
            </div>
            <div className="w-20">
              <Label className="text-xs text-muted-foreground">Moeda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyType)}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">R$ BRL</SelectItem>
                  <SelectItem value="USDT">$ USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contraparte (Recebedor / Pagador)</Label>
            <CounterpartAutocomplete value={counterpart} onChange={setCounterpart} entries={entries} />
          </div>
        </div>

        {/* Datas */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Data Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !entryDate && "text-muted-foreground")}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {entryDate ? format(parseEntryDate(entryDate), "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={entryDate ? parseEntryDate(entryDate) : undefined}
                    onSelect={(d) => { if (d) setEntryDate(format(d, "yyyy-MM-dd")); }}
                    className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data Pagamento Real</Label>
              <Input type="date" value={realPaymentDate} onChange={(e) => setRealPaymentDate(e.target.value)} />
            </div>
          </div>
          {editingEntry && (editingEntry.recurrence_type || (editingEntry.installment_group && editingEntry.total_installments > 1)) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
              <Repeat className="h-3.5 w-3.5" />
              {editingEntry.installment_group && editingEntry.total_installments > 1 && !editingEntry.recurrence_type && (
                <span>Parcela {editingEntry.installment_number}/{editingEntry.total_installments}</span>
              )}
              {editingEntry.recurrence_type && (
                <span>Recorrência: {
                  ({ daily: "Diária", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal",
                    quarterly: "Trimestral", semiannual: "Semestral", yearly: "Anual" } as any)[editingEntry.recurrence_type] || editingEntry.recurrence_type
                }</span>
              )}
            </div>
          )}
        </div>

        {/* Juros, Multa, Desconto */}
        <div className="rounded-lg border border-border/30 p-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Juros</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={juros}
                onChange={(e) => setJuros(e.target.value.replace(/[^0-9.,]/g, ""))} className="text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Multa</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={multa}
                onChange={(e) => setMulta(e.target.value.replace(/[^0-9.,]/g, ""))} className="text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Desconto</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={desconto}
                onChange={(e) => setDesconto(e.target.value.replace(/[^0-9.,]/g, ""))} className="text-xs" />
            </div>
          </div>
        </div>

        {/* Toggles & Payment */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Switch checked={isFixed} onCheckedChange={setIsFixed} />
              <Label className="text-xs whitespace-nowrap">Conta fixa</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={splitEnabled} onCheckedChange={(c) => { setSplitEnabled(c); if (!c) setSplitLines([]); }} />
              <Label className="text-xs whitespace-nowrap">Múltiplas carteiras</Label>
            </div>
          </div>

          {!splitEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Carteira</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Conta (opcional)" /></SelectTrigger>
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
                <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {splitEnabled && (
            <div className="space-y-2 pt-2 border-t border-border/20">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Distribuição ({splitLines.length} fontes)</span>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={addSplitLine}>
                  <Plus className="h-3 w-3" /> Fonte
                </Button>
              </div>
              {totalAmountNum > 0 && (
                <div className="space-y-1">
                  <Progress value={splitPct} className="h-1.5" />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Distribuído: {brl(splitTotal)}</span>
                    <span>Restante: {brl(splitRemaining)}</span>
                  </div>
                </div>
              )}
              {splitLines.map((line) => (
                <div key={line.id} className="flex items-center gap-1.5">
                  <Select value={line.accountId} onValueChange={(v) => updateSplitLine(line.id, "accountId", v)}>
                    <SelectTrigger className="text-xs flex-1"><SelectValue placeholder="Conta" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => a.is_active).map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={line.paymentMethod} onValueChange={(v) => updateSplitLine(line.id, "paymentMethod", v)}>
                    <SelectTrigger className="text-xs w-24"><SelectValue placeholder="Forma" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="text" inputMode="decimal" placeholder="Valor" value={line.amount}
                    onChange={(e) => updateSplitLine(line.id, "amount", e.target.value)} className="text-xs w-24" />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive" onClick={() => removeSplitLine(line.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Recorrente vs Parcelado */}
          {!editingEntry && (
            <div className="pt-2 border-t border-border/20 space-y-2">
              <div className="flex items-center gap-3">
                <Button size="sm" variant={recurrence !== "none" ? "default" : "outline"}
                  className="h-7 text-xs rounded-full gap-1"
                  onClick={() => { if (recurrence !== "none") { setRecurrence("none"); } else { setRecurrence("monthly"); setRecurrenceCount("120"); setInstallments("1"); } }}>
                  <Repeat className="h-3 w-3" /> Recorrente
                </Button>
                <Button size="sm" variant={recurrence === "none" && parseInt(installments) > 1 ? "default" : "outline"}
                  className="h-7 text-xs rounded-full gap-1"
                  onClick={() => { setRecurrence("none"); setInstallments(parseInt(installments) > 1 ? "1" : "12"); }}>
                  <CalendarDays className="h-3 w-3" /> Parcelado
                </Button>
              </div>
              {recurrence !== "none" && (
                <div className="space-y-2">
                  <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceType)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diária</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="biweekly">Quinzenal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="quarterly">Trimestral</SelectItem>
                      <SelectItem value="semiannual">Semestral</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                  {(recurrence === "monthly" || recurrence === "yearly") && (
                    <Select value={recurrenceDateMode} onValueChange={(v) => setRecurrenceDateMode(v as RecurrenceDateMode)}>
                      <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="same_date">Mesma data</SelectItem>
                        <SelectItem value="first_business_day">Primeiro dia útil do mês</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[10px] text-muted-foreground">Recorrência indeterminada (sem fim)</p>
                </div>
              )}
              {parseInt(installments) > 1 && recurrence === "none" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Quantidade de parcelas</Label>
                  <Input type="number" min="2" value={installments} onChange={(e) => setInstallments(e.target.value)} className="text-xs w-32" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center gap-2 pt-4 border-t border-border/20">
        {editingEntry && (
          <Button variant="destructive" size="sm" className="gap-1.5"
            onClick={() => setDeleteEntryConfirm(editingEntry.id)}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
          {!isPaid && (
            <Button size="sm" variant="secondary" className="gap-1.5"
              onClick={() => setIsPaid(true)}>
              <Check className="h-3.5 w-3.5" /> Marcar paga
            </Button>
          )}
          <Button size="sm" onClick={createOrUpdateEntry} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> {isPaid ? "Salvar e Baixar" : "Salvar"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );

  // Fluxo Intervalo state
  const [fluxoIntervalOpen, setFluxoIntervalOpen] = useState(false);
  const [fluxoCustomFrom, setFluxoCustomFrom] = useState<Date | undefined>(undefined);
  const [fluxoCustomTo, setFluxoCustomTo] = useState<Date | undefined>(undefined);

  const handleFluxoIntervalSelect = (range: any) => {
    if (range?.from) {
      setFluxoCustomFrom(range.from);
      setFluxoDateFrom(format(range.from, "dd/MM/yyyy"));
    }
    if (range?.to) {
      setFluxoCustomTo(range.to);
      setFluxoDateTo(format(range.to, "dd/MM/yyyy"));
    }
  };

  const handleClearFluxoInterval = () => {
    setFluxoCustomFrom(undefined);
    setFluxoCustomTo(undefined);
    setFluxoDateFrom("");
    setFluxoDateTo("");
    setFluxoIntervalOpen(false);
  };

  // Shared Intervalo state for DOAR / Centro de Custo (updates periodStart/periodEnd)
  const [sharedIntervalOpen, setSharedIntervalOpen] = useState(false);
  const [sharedCustomFrom, setSharedCustomFrom] = useState<Date | undefined>(undefined);
  const [sharedCustomTo, setSharedCustomTo] = useState<Date | undefined>(undefined);
  const [sharedDateFrom, setSharedDateFrom] = useState("");
  const [sharedDateTo, setSharedDateTo] = useState("");

  const handleSharedIntervalSelect = (range: any) => {
    if (range?.from) {
      setSharedCustomFrom(range.from);
      setSharedDateFrom(format(range.from, "dd/MM/yyyy"));
      setPeriodStart(format(range.from, "yyyy-MM-dd"));
    }
    if (range?.to) {
      setSharedCustomTo(range.to);
      setSharedDateTo(format(range.to, "dd/MM/yyyy"));
      setPeriodEnd(format(range.to, "yyyy-MM-dd"));
    }
  };

  const handleClearSharedInterval = () => {
    setSharedCustomFrom(undefined);
    setSharedCustomTo(undefined);
    setSharedDateFrom("");
    setSharedDateTo("");
    setPeriodStart(format(startOfYear(new Date()), "yyyy-MM-dd"));
    setPeriodEnd(format(endOfYear(new Date()), "yyyy-MM-dd"));
    setSharedIntervalOpen(false);
  };

  // Toolbar renderer (context-sensitive, right of tabs)
  const renderToolbar = () => {
    const isPrevisao = viewTab === "previsao";
    const isDoar = viewTab === "doar";
    const isIndicadores = viewTab === "indicadores";
    const isCentro = viewTab === "centrocusto";

    // Shared Intervalo popover renderer (for DOAR / Centro de Custo)
    const renderSharedInterval = () => (
      <Popover open={sharedIntervalOpen} onOpenChange={setSharedIntervalOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={() => setSharedIntervalOpen(true)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-1 transition-all duration-200 shrink-0",
              (sharedDateFrom || sharedDateTo)
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:border-primary/80 hover:bg-primary/5"
            )}
          >
            <CalendarRange className="size-4" />
            <span className="text-xs font-medium">Intervalo</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 bg-background border rounded-lg shadow-lg p-3 space-y-3" align="start">
          <Calendar mode="range" locale={ptBR} showOutsideDays={false}
            selected={{ from: sharedCustomFrom, to: sharedCustomTo }}
            onSelect={handleSharedIntervalSelect}
            className="pointer-events-auto" />
          <div className="space-y-2 border-t border-border/30 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold w-8 shrink-0">De:</span>
              <Input value={sharedDateFrom}
                onChange={(e) => setSharedDateFrom(normalizeDateInput(e.target.value))}
                onBlur={() => { const d = parseDMY(sharedDateFrom); if (d) { setSharedCustomFrom(d); setSharedDateFrom(format(d, "dd/MM/yyyy")); setPeriodStart(format(d, "yyyy-MM-dd")); } }}
                placeholder="DD/MM/AAAA" className="h-8 text-xs rounded-md border-border" style={{ width: 150 }} maxLength={10} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold w-8 shrink-0">Até:</span>
              <Input value={sharedDateTo}
                onChange={(e) => setSharedDateTo(normalizeDateInput(e.target.value))}
                onBlur={() => { const d = parseDMY(sharedDateTo); if (d) { setSharedCustomTo(d); setSharedDateTo(format(d, "dd/MM/yyyy")); setPeriodEnd(format(d, "yyyy-MM-dd")); } }}
                placeholder="DD/MM/AAAA" className="h-8 text-xs rounded-md border-border" style={{ width: 150 }} maxLength={10} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleClearSharedInterval}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors duration-200"
              style={{ minWidth: 80, height: 32 }}>Limpar</button>
          </div>
        </PopoverContent>
      </Popover>
    );

    return (
      <div className="flex items-center gap-3">
        {isIndicadores && renderPeriodFilter()}

        {isPrevisao && (
          <>
            <div className="relative" style={{ width: 400 }}>
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar título, categoria, contraparte, valor..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-8 pr-7 text-xs rounded-lg" />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-[#9ca3af] hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Popover open={fluxoIntervalOpen} onOpenChange={setFluxoIntervalOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => setFluxoIntervalOpen(true)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-1 transition-all duration-200 shrink-0",
                    (fluxoDateFrom || fluxoDateTo)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/80 hover:bg-primary/5"
                  )}
                >
                  <CalendarRange className="size-4" />
                  <span className="text-xs font-medium">Intervalo</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 bg-background border rounded-lg shadow-lg p-3 space-y-3" align="start">
                <Calendar mode="range" locale={ptBR} showOutsideDays={false}
                  selected={{ from: fluxoCustomFrom, to: fluxoCustomTo }}
                  onSelect={handleFluxoIntervalSelect}
                  className="pointer-events-auto" />
                <div className="space-y-2 border-t border-border/30 pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-8 shrink-0">De:</span>
                    <Input value={fluxoDateFrom}
                      onChange={(e) => setFluxoDateFrom(normalizeDateInput(e.target.value))}
                      onBlur={() => { const d = parseDMY(fluxoDateFrom); if (d) { setFluxoCustomFrom(d); setFluxoDateFrom(format(d, "dd/MM/yyyy")); } }}
                      placeholder="DD/MM/AAAA" className="h-8 text-xs rounded-md border-border" style={{ width: 150 }} maxLength={10} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-8 shrink-0">Até:</span>
                    <Input value={fluxoDateTo}
                      onChange={(e) => setFluxoDateTo(normalizeDateInput(e.target.value))}
                      onBlur={() => { const d = parseDMY(fluxoDateTo); if (d) { setFluxoCustomTo(d); setFluxoDateTo(format(d, "dd/MM/yyyy")); } }}
                      placeholder="DD/MM/AAAA" className="h-8 text-xs rounded-md border-border" style={{ width: 150 }} maxLength={10} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleClearFluxoInterval}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors duration-200"
                    style={{ minWidth: 80, height: 32 }}>Limpar</button>
                </div>
              </PopoverContent>
            </Popover>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={() => {
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
                      return { user_id: user.id, entry_date: cols[0] || format(new Date(), "yyyy-MM-dd"),
                        title: cols[1] || "Importado", type: cols[2]?.toLowerCase().includes("receita") ? "revenue" as const : "expense" as const,
                        amount: parseFloat(cols[cols.length - 1]) || 0, is_paid: false };
                    }).filter(r => r.amount > 0);
                    if (rows.length > 0) { await supabase.from("financial_entries").insert(rows); fetchData(); }
                  };
                  input.click();
                }} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                  <FileDown className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Importar CSV</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={handleExportCSV} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                  <FileUp className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Exportar CSV</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={handlePrint} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                  <Printer className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Imprimir</TooltipContent>
            </Tooltip>
          </>
        )}

        {(isDoar || isCentro) && (
          <>
            <div className="relative" style={{ width: 300 }}>
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder={isDoar ? "Pesquisar categorias..." : "Pesquisar centros..."} 
                value={isDoar ? doarSearchQuery : ccReportSearch} 
                onChange={(e) => isDoar ? setDoarSearchQuery(e.target.value) : setCcReportSearch(e.target.value)}
                className="h-7 pl-8 pr-7 text-xs rounded-lg" />
              {(isDoar ? doarSearchQuery : ccReportSearch) && (
                <button onClick={() => isDoar ? setDoarSearchQuery("") : setCcReportSearch("")} className="absolute right-2 top-2 text-[#9ca3af] hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {renderSharedInterval()}
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={isDoar ? handlePrintDOAR : handlePrint} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                  <Printer className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Imprimir</TooltipContent>
            </Tooltip>
            {isDoar && (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button onClick={cycleDoarExpand} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                    <ChevronsUpDown className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Expandir/Recolher (Nível {doarExpandLevel}/3)</TooltipContent>
              </Tooltip>
            )}
          </>
        )}

        {isIndicadores && (
          <>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={handleExportCSV} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                  <FileUp className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Exportar CSV</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={handlePrint} className="text-[#6b7280] hover:text-[#3b82f6] transition-colors">
                  <Printer className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Imprimir</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 print-fluxo-area">
      {/* Tab buttons + Toolbar on same line */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          {([
            { key: "indicadores" as ViewTab, label: "Indicadores", icon: <BarChart3 className="h-3 w-3" /> },
            { key: "previsao" as ViewTab, label: "Fluxo de Caixa", icon: <CircleDollarSign className="h-3 w-3" /> },
            { key: "doar" as ViewTab, label: "DOAR", icon: <Landmark className="h-3 w-3" /> },
            { key: "centrocusto" as ViewTab, label: "Centro de Custo", icon: <FolderKanban className="h-3 w-3" /> },
          ]).filter(tab => tab.key === "centrocusto" || visibleTabs.includes(tab.key)).map(tab => (
            <Button key={tab.key} size="sm"
              variant={viewTab === tab.key ? "default" : "ghost"}
              className={cn("h-7 text-xs px-3 rounded-full gap-1.5", viewTab !== tab.key && "text-muted-foreground")}
              onClick={() => setViewTab(tab.key)}
            >
              {tab.icon} {tab.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          {renderToolbar()}
        </div>
      </div>

      {/* Wallet filter banner - below toolbar */}
      {viewTab === "previsao" && walletFilter && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          <span className="text-xs font-medium text-primary">CARTEIRA: {walletFilter.name}</span>
          <span className="text-xs text-muted-foreground">• Mês atual</span>
          <button onClick={onClearWalletFilter} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">Limpar filtro</button>
          <button onClick={onNavigateToPatrimonio} className="text-xs text-primary hover:text-primary/80 underline transition-colors">Retornar carteira</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> Contas a Receber
            </p>
            <p className="text-lg font-bold text-[#10b981]">{brl(kpiData.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="h-4 w-4" /> Contas a Pagar
            </p>
            <p className="text-lg font-bold text-[#ef4444]">{brl(kpiData.totalExpense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Wallet className="h-4 w-4" /> Saldo
            </p>
            <p className={cn("text-lg font-bold", kpiData.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(kpiData.balance)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Landmark className="h-4 w-4" /> Caixa Disponível
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

            {/* Batch actions */}
            {selectedIds.size > 0 && (
              <div className="mb-3 flex items-center gap-1.5">
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
                ><Check className="h-3 w-3" /> Baixar</Button>
                <Button size="sm" variant="ghost"
                  className="h-7 px-2.5 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10 rounded-full"
                  onClick={handleBatchCopy}
                ><Copy className="h-3 w-3" /> Duplicar</Button>
                <Button size="sm" variant="ghost"
                  className="h-7 px-2.5 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                  onClick={async () => {
                    const ids = Array.from(selectedIds);
                    await supabase.from("financial_entries").delete().in("id", ids);
                    setSelectedIds(new Set());
                    fetchData();
                  }}
                ><Trash2 className="h-3 w-3" /> Excluir</Button>
              </div>
            )}

            {/* Entry edit dialog */}
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              {renderEntryDialog()}
            </Dialog>

            {/* Table */}
            <div className="rounded-lg overflow-auto max-h-[calc(100vh-320px)] border border-border/30">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card border-b border-border">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 px-2 w-8">
                      <Checkbox
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onCheckedChange={(c) => {
                          if (c) setSelectedIds(new Set(filtered.map(e => e.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="h-3.5 w-3.5"
                      />
                    </th>
                    <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("entry_date")}>
                      Vencimento <SortIcon field="entry_date" />
                    </th>
                    <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("category")}>
                      Categoria <SortIcon field="category" />
                    </th>
                    <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("title")}>
                      Título <SortIcon field="title" />
                    </th>
                    <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("counterpart")}>
                      Contraparte <SortIcon field="counterpart" />
                    </th>
                    <th className="text-right py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                      Valor <SortIcon field="amount" />
                    </th>
                    <th className="text-center py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("type")}>
                      Tipo <SortIcon field="type" />
                    </th>
                    <th className="text-center py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("is_paid")}>
                      Status <SortIcon field="is_paid" />
                    </th>
                    <th className="w-14 py-2.5 px-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="text-center text-muted-foreground/40 py-12">
                      Sem lançamentos no período
                    </td></tr>
                  )}
                  {filtered.map((e, idx) => {
                    const today = new Date(); today.setHours(0,0,0,0);
                    const entDate = parseEntryDate(e.entry_date);
                    const isOverdue = !e.is_paid && entDate < today;
                    const overdueDays = isOverdue ? differenceInDays(today, entDate) : 0;
                    const isRecurrent = !!e.recurrence_type;
                    const isInstallment = !isRecurrent && e.installment_group && e.total_installments > 1;
                    const recLabel = isRecurrent
                      ? ({ daily: "Diária", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal",
                           quarterly: "Trimestral", semiannual: "Semestral", yearly: "Anual" } as any)[e.recurrence_type] || "Recorrente"
                      : null;

                    const getStatusText = () => {
                      if (e.is_paid && e.type === "revenue") return "Recebido";
                      if (e.is_paid && e.type === "expense") return "Pago";
                      if (e.payment_date && e.is_paid) return "Baixado";
                      if (isOverdue) return "Atrasado";
                      return "Pendente";
                    };
                    const statusText = getStatusText();
                    const statusColor = statusText === "Pago" || statusText === "Recebido" || statusText === "Baixado"
                      ? "text-[hsl(var(--success))]"
                      : statusText === "Atrasado" ? "text-destructive"
                      : "text-amber-500";

                    return (
                      <tr key={e.id}
                        className={cn(
                          "group transition-colors hover:bg-primary/5",
                          idx > 0 && "border-t border-border/10",
                          isOverdue && e.type === "expense" && "bg-destructive/10",
                          isOverdue && e.type === "revenue" && "bg-[hsl(var(--success)/0.08)]",
                          e.is_paid && "opacity-60",
                        )}
                        onDoubleClick={() => {
                          if ((e.installment_group && e.total_installments > 1) || e.recurrence_type) {
                            setRecurrenceEditDialog({ entry: e, mode: null });
                          } else {
                            openEditDialog(e);
                          }
                        }}
                      >
                        <td className="py-2.5 px-2">
                          <Checkbox
                            checked={selectedIds.has(e.id)}
                            onCheckedChange={(c) => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (c) next.add(e.id); else next.delete(e.id);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground text-xs">{format(entDate, "dd/MM/yy")}</td>
                        <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">
                          {categories.find(c => c.id === e.category_id)?.name || "—"}
                        </td>
                        <td className={cn("py-2.5 px-3 text-muted-foreground font-bold", e.is_paid && "line-through")}>
                          <span className="inline-flex items-center gap-1.5">
                            {highlightMatch(e.title, searchQuery)}
                            {isRecurrent && (
                              <Tooltip delayDuration={200}>
                                <TooltipTrigger>
                                  <Repeat className="h-[0.6rem] w-[0.6rem] opacity-60" />
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">{recLabel}</TooltipContent>
                              </Tooltip>
                            )}
                            {isInstallment && (
                              <span className="text-[10px] text-muted-foreground/60">{e.installment_number}/{e.total_installments}</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">{e.counterpart || "—"}</td>
                        <td className={cn("py-2.5 px-3 text-right font-semibold tabular-nums",
                          e.type === "revenue" ? "text-[hsl(var(--success))]" : "text-destructive")}>
                          {fmtCurrency(Number(e.amount), (e.currency as CurrencyType) || "BRL")}
                        </td>
                        <td className={cn("py-2.5 px-3 text-center",
                          e.type === "revenue" ? "text-[hsl(var(--success))]" : "text-destructive")}>
                          {e.type === "expense" ? "Despesa" : "Receita"}
                        </td>
                        <td className={cn("py-2.5 px-3 text-center font-normal", statusColor)}>
                          {statusText}
                        </td>
                        <td className="py-2.5 px-1 w-14">
                          <div className="hidden group-hover:flex items-center gap-0.5 justify-center">
                            <button onClick={(ev) => { ev.stopPropagation(); openEditDialog(e); }}
                              className="text-[hsl(var(--success))] hover:text-primary transition-colors">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={async (ev) => {
                              ev.stopPropagation();
                              if (!user) return;
                              await supabase.from("financial_entries").insert({
                                user_id: user.id, title: e.title, amount: Number(e.amount), type: e.type,
                                category_id: e.category_id || null, project_id: e.project_id || null,
                                cost_center_id: e.cost_center_id || null, entry_date: e.entry_date,
                                account_id: e.account_id || null, payment_method: e.payment_method || null,
                                is_paid: false, counterpart: e.counterpart || null, is_fixed: e.is_fixed || false,
                                description: e.description || null, currency: e.currency || "BRL",
                              });
                              fetchData();
                            }} className="text-primary hover:text-primary/80 transition-colors">
                              <Copy className="h-4 w-4" />
                            </button>
                            <button onClick={(ev) => { ev.stopPropagation(); setDeleteEntryConfirm(e.id); }}
                              className="text-destructive hover:text-destructive/80 transition-colors">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
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

          const dQuery = doarSearchQuery.toLowerCase().trim();
          const filterDoarRow = (row: { name: string; months: number[] }) => {
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
            const rowTotal = row.months.reduce((s, v) => s + v, 0);
            // Sort alphabetically
            return Array.from(grouped.values())
              .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
              .map(g => {
                const entryTotal = g.monthAmounts.reduce((s, v) => s + v, 0);
                const pctOfCat = rowTotal > 0 ? ((entryTotal / rowTotal) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={g.title} className="entry-row bg-muted/10 text-xs">
                    <td className="p-1.5 border-b border-border/50 pl-10 text-muted-foreground">{g.title}</td>
                    <td className="text-right p-1.5 border-b border-border/50 text-muted-foreground/60">{pctOfCat}%</td>
                    {g.monthAmounts.map((v, mi) => (
                      <td key={mi} className="text-right p-1.5 border-b border-border/50 text-muted-foreground">
                        {v > 0 ? brl(v) : ""}
                      </td>
                    ))}
                    <td className="text-right p-1.5 border-b border-border/50 text-muted-foreground font-medium">
                      {brl(entryTotal)}
                    </td>
                  </tr>
                );
              });
          };

          return (
          <div className="space-y-4">
            {/* DOAR quick filters only - toolbar moved to shared bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <Button size="sm"
                  variant={doarShowPaid ? "default" : "ghost"}
                  className={cn("h-7 text-xs px-2.5 gap-1 rounded-full", !doarShowPaid && "text-muted-foreground hover:text-foreground")}
                  onClick={() => setDoarShowPaid(!doarShowPaid)}
                >
                  {doarShowPaid ? "Real (Baixados)" : "Previsto (Todos)"}
                </Button>
                <div className="flex items-center gap-1.5">
                  <Checkbox checked={!doarHideCarryOver} onCheckedChange={(c) => setDoarHideCarryOver(!c)} id="carry-over" className="h-3.5 w-3.5" />
                  <Label htmlFor="carry-over" className="text-xs text-muted-foreground whitespace-nowrap">Saldo anterior</Label>
                </div>
              </div>
            </div>

            <div id="doar-print-area" className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="bg-primary/10">
                    <th colSpan={15} className="text-center p-3 border-b border-border font-bold text-sm text-primary tracking-wide">
                      DOAR – {doarShowPaid ? "REALIZADO" : "PREVISTO"} — {format(new Date(periodStart), "dd/MM/yyyy")} a {format(new Date(periodEnd), "dd/MM/yyyy")}
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
                  {!doarHideCarryOver && dreData.carryOver !== 0 && (
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
                  {(() => {
                    const totalResult = dreData.monthBalance.reduce((s, v) => s + v, 0);
                    const resultPctRev = totalRevYear > 0 ? ((totalResult / totalRevYear) * 100).toFixed(1) : "0.0";
                    return (
                      <tr className="result-row bg-primary/5 font-bold">
                        <td className="p-2 border-b border-border text-primary">RESULTADO DO MÊS</td>
                        <td className="text-right p-2 border-b border-border text-primary">{resultPctRev}%</td>
                        {dreData.monthBalance.map((v, i) => (
                          <td key={i} className={cn("text-right p-2 border-b border-border font-bold", v >= 0 ? "text-success" : "text-destructive")}>
                            {brl(v)}
                          </td>
                        ))}
                        <td className={cn("text-right p-2 border-b border-border font-bold",
                          totalResult >= 0 ? "text-success" : "text-destructive"
                        )}>{brl(totalResult)}</td>
                      </tr>
                    );
                  })()}

                  {/* Accumulated */}
                  {(() => {
                    const lastAcc = dreData.accumulated[11] || 0;
                    const accPctRev = totalRevYear > 0 ? ((lastAcc / totalRevYear) * 100).toFixed(1) : "0.0";
                    return (
                      <tr className="accum-row bg-muted font-bold">
                        <td className="p-2 border-b border-border">SALDO ACUMULADO</td>
                        <td className="text-right p-2 border-b border-border text-muted-foreground">{accPctRev}%</td>
                        {dreData.accumulated.map((v, i) => (
                          <td key={i} className={cn("text-right p-2 border-b border-border font-bold", v >= 0 ? "text-success" : "text-destructive")}>
                            {brl(v)}
                          </td>
                        ))}
                        <td className={cn("text-right p-2 border-b border-border font-bold",
                          lastAcc >= 0 ? "text-success" : "text-destructive"
                        )}>{brl(lastAcc)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
          );
        })()}

        {/* ============ CENTRO DE CUSTO REPORT ============ */}
        {viewTab === "centrocusto" && (
          <div className="space-y-4">

            {ccReportData.length === 0 && (
              <div className="text-center text-muted-foreground/40 py-12">Sem dados de centros de custo no período</div>
            )}

            {ccReportData.map(cc => {
              const totalRev = cc.monthTotalsRev.reduce((s, v) => s + v, 0);
              const totalExp = cc.monthTotalsExp.reduce((s, v) => s + v, 0);
              const months = dreData.months;
              return (
                <div key={cc.id} className="rounded-lg border border-border overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="bg-primary/10">
                        <th colSpan={15} className="text-left p-3 border-b border-border font-bold text-sm text-primary tracking-wide">
                          <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cc.color || "#6b7280" }} />
                            {cc.name}
                          </span>
                        </th>
                      </tr>
                      <tr className="bg-muted">
                        <th className="text-left p-2 border-b border-border font-bold min-w-[140px]">Descrição</th>
                        <th className="text-right p-2 border-b border-border font-bold min-w-[50px]">%</th>
                        {months.map(m => (
                          <th key={m} className="text-right p-2 border-b border-border font-bold min-w-[80px]">{m}</th>
                        ))}
                        <th className="text-right p-2 border-b border-border font-bold min-w-[90px]">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Revenue */}
                      {cc.revRows.length > 0 && (
                        <>
                          <tr className="bg-success/10">
                            <td colSpan={15} className="p-2 border-b border-border font-bold text-success text-xs">RECEITAS</td>
                          </tr>
                          {cc.revRows.map(row => {
                            const rowTotal = row.months.reduce((s, v) => s + v, 0);
                            const pct = totalRev > 0 ? ((rowTotal / totalRev) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={row.name} className="hover:bg-muted/30">
                                <td className="p-2 border-b border-border pl-6">{row.name}</td>
                                <td className="text-right p-2 border-b border-border text-muted-foreground">{pct}%</td>
                                {row.months.map((v, i) => (
                                  <td key={i} className={cn("text-right p-2 border-b border-border", v > 0 ? "text-success" : "text-muted-foreground")}>
                                    {v > 0 ? brl(v) : "—"}
                                  </td>
                                ))}
                                <td className="text-right p-2 border-b border-border font-medium text-success">{brl(rowTotal)}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-success/5 font-bold">
                            <td className="p-2 border-b border-border text-success">Total Receitas</td>
                            <td className="text-right p-2 border-b border-border text-success">100%</td>
                            {cc.monthTotalsRev.map((v, i) => (
                              <td key={i} className="text-right p-2 border-b border-border text-success">{brl(v)}</td>
                            ))}
                            <td className="text-right p-2 border-b border-border text-success">{brl(totalRev)}</td>
                          </tr>
                        </>
                      )}
                      {/* Expense */}
                      {cc.expRows.length > 0 && (
                        <>
                          <tr className="bg-destructive/10">
                            <td colSpan={15} className="p-2 border-b border-border font-bold text-destructive text-xs">DESPESAS</td>
                          </tr>
                          {cc.expRows.map(row => {
                            const rowTotal = row.months.reduce((s, v) => s + v, 0);
                            const pct = totalExp > 0 ? ((rowTotal / totalExp) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={row.name} className="hover:bg-muted/30">
                                <td className="p-2 border-b border-border pl-6">{row.name}</td>
                                <td className="text-right p-2 border-b border-border text-muted-foreground">{pct}%</td>
                                {row.months.map((v, i) => (
                                  <td key={i} className={cn("text-right p-2 border-b border-border", v > 0 ? "text-destructive" : "text-muted-foreground")}>
                                    {v > 0 ? brl(v) : "—"}
                                  </td>
                                ))}
                                <td className="text-right p-2 border-b border-border font-medium text-destructive">{brl(rowTotal)}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-destructive/5 font-bold">
                            <td className="p-2 border-b border-border text-destructive">Total Despesas</td>
                            <td className="text-right p-2 border-b border-border text-destructive">100%</td>
                            {cc.monthTotalsExp.map((v, i) => (
                              <td key={i} className="text-right p-2 border-b border-border text-destructive">{brl(v)}</td>
                            ))}
                            <td className="text-right p-2 border-b border-border text-destructive">{brl(totalExp)}</td>
                          </tr>
                        </>
                      )}
                      {/* Balance */}
                      {(() => {
                        const ccResult = totalRev - totalExp;
                        const ccResultPct = (totalRev + totalExp) > 0 ? ((ccResult / Math.max(totalRev, totalExp, 1)) * 100).toFixed(1) : "0.0";
                        return (
                          <tr className="bg-primary/5 font-bold">
                            <td className="p-2 border-b border-border text-primary">RESULTADO</td>
                            <td className="text-right p-2 border-b border-border text-primary">{ccResultPct}%</td>
                            {cc.monthBalance.map((v, i) => (
                              <td key={i} className={cn("text-right p-2 border-b border-border font-bold", v >= 0 ? "text-success" : "text-destructive")}>
                                {brl(v)}
                              </td>
                            ))}
                            <td className={cn("text-right p-2 border-b border-border font-bold",
                              ccResult >= 0 ? "text-success" : "text-destructive"
                            )}>{brl(ccResult)}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* ============ INDICADORES ============ */}
        {viewTab === "indicadores" && (
          <div className="space-y-4" ref={reportRef}>

            {/* Summary cards */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo — {periodYear}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg bg-success/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Receitas</p>
                    <p className="text-lg font-bold text-success">{brl(periodFilteredEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0))}</p>
                    <p className="text-[10px] text-muted-foreground">{periodFilteredEntries.filter(e => e.type === "revenue").length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Despesas</p>
                    <p className="text-lg font-bold text-destructive">{brl(periodFilteredEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0))}</p>
                    <p className="text-[10px] text-muted-foreground">{periodFilteredEntries.filter(e => e.type === "expense").length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Resultado</p>
                    {(() => {
                      const rev = periodFilteredEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
                      const exp = periodFilteredEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
                      const result = rev - exp;
                      return <p className={cn("text-lg font-bold", result >= 0 ? "text-success" : "text-destructive")}>{brl(result)}</p>;
                    })()}
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
              <CardHeader className="pb-2"><CardTitle className="text-sm">Receita × Despesa Mensal — {periodYear}</CardTitle></CardHeader>
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
              <CardHeader className="pb-2"><CardTitle className="text-sm">Saldo Mensal — {periodYear}</CardTitle></CardHeader>
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
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pago × Pendente — {periodYear}</CardTitle></CardHeader>
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
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5 text-primary" /> Indicadores por Centro de Custo</CardTitle></CardHeader>
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
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5 text-primary" /> Indicadores por Projeto</CardTitle></CardHeader>
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
