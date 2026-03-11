import React, { useState, useEffect, useRef, useMemo } from "react";
import SimpleDatePicker from "@/components/shared/SimpleDatePicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trash2, Save, Calendar, Clock, Bell, Tag, Hash, Star, Wallet, Repeat, Cake, CalendarDays, TrendingUp, FolderKanban, CircleDollarSign, Building2, Plus, X, SplitSquareVertical, Receipt, Home, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface CalendarItem {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  all_day?: boolean | null;
  color?: string | null;
  description?: string | null;
  task_id?: string | null;
  recurrence_rule?: string | null;
  user_id: string;
  is_completed?: boolean | null;
  is_task?: boolean;
  is_holiday?: boolean;
  is_finance?: boolean;
  is_project?: boolean;
  is_birthday?: boolean;
  is_favorite?: boolean;
  is_investment?: boolean;
  is_cashflow?: boolean;
}

interface EventEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CalendarItem | null;
  defaultDate?: Date;
  userId: string;
  onSaved: () => void;
  defaultEventType?: EventType;
}

type EventType = "birthday" | "event" | "cashflow" | "investment" | "carteira" | "patrimonio" | "programa" | "project" | "centro_custo" | "categoria";

const EVENT_TYPE_ICONS: Record<EventType, React.ReactNode> = {
  birthday: <Cake className="h-3.5 w-3.5" />,
  carteira: <Wallet className="h-3.5 w-3.5" />,
  cashflow: <CircleDollarSign className="h-3.5 w-3.5" />,
  categoria: <Tag className="h-3.5 w-3.5" />,
  centro_custo: <Tag className="h-3.5 w-3.5" />,
  event: <CalendarDays className="h-3.5 w-3.5" />,
  investment: <TrendingUp className="h-3.5 w-3.5" />,
  patrimonio: <Home className="h-3.5 w-3.5" />,
  programa: <FolderKanban className="h-3.5 w-3.5" />,
  project: <FolderKanban className="h-3.5 w-3.5" />,
};

const EVENT_TYPES_UNSORTED: { value: EventType; label: string; color: string }[] = [
  { value: "birthday", label: "Aniversário", color: "#ec4899" },
  { value: "carteira", label: "Carteira", color: "#8b5cf6" },
  { value: "categoria", label: "Categoria", color: "#06b6d4" },
  { value: "cashflow", label: "Fluxo de Caixa", color: "#22c55e" },
  { value: "centro_custo", label: "Programa", color: "#06b6d4" },
  { value: "event", label: "Evento", color: "#3b82f6" },
  { value: "investment", label: "Investimento", color: "#d4a017" },
  { value: "patrimonio", label: "Patrimônio", color: "#f97316" },
  { value: "programa", label: "Programa", color: "#06b6d4" },
  { value: "project", label: "Projeto", color: "#eab308" },
];
const EVENT_TYPES = [...EVENT_TYPES_UNSORTED].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

type RecurrenceDateMode = "same_date" | "first_business_day";

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Sem recorrência" },
  { value: "FREQ=DAILY", label: "Diário" },
  { value: "FREQ=WEEKLY", label: "Semanal" },
  { value: "FREQ=BIWEEKLY", label: "Quinzenal" },
  { value: "FREQ=MONTHLY", label: "Mensal" },
  { value: "FREQ=QUARTERLY", label: "Trimestral" },
  { value: "FREQ=SEMIANNUAL", label: "Semestral" },
  { value: "FREQ=YEARLY", label: "Anual" },
];

const REMINDER_OPTIONS = [
  { value: "none", label: "Sem lembrete" },
  { value: "0", label: "No horário" },
  { value: "5", label: "5 minutos antes" },
  { value: "15", label: "15 minutos antes" },
  { value: "30", label: "30 minutos antes" },
  { value: "60", label: "1 hora antes" },
  { value: "1440", label: "1 dia antes" },
  { value: "10080", label: "1 semana antes" },
];

const PAYMENT_METHODS_FALLBACK = ["Boleto", "Crédito", "Crypto", "Débito", "Dinheiro", "PIX", "Transferência"];

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

const INVESTMENT_TYPES_OPTIONS = [
  { value: "stock", label: "Ações" },
  { value: "crypto", label: "Criptoativos" },
  { value: "etf", label: "ETFs" },
  { value: "fii", label: "FIIs" },
  { value: "fixed_income", label: "Renda Fixa" },
  { value: "other", label: "Outros" },
].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

const ACCOUNT_TYPES = [
  { value: "bank_account", label: "Conta Bancária" },
  { value: "cash", label: "Dinheiro" },
  { value: "credit_card", label: "Cartão de Crédito" },
  { value: "crypto", label: "Criptoativos" },
  { value: "investment", label: "Investimento" },
  { value: "wallet", label: "Carteira Digital" },
].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

const PATRIMONIO_TYPES = [
  { value: "imovel", label: "Imóvel" },
  { value: "veiculo", label: "Veículo" },
  { value: "terreno", label: "Terreno" },
  { value: "outro", label: "Outro" },
].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

interface SplitLine {
  id: string;
  accountId: string;
  paymentMethod: string;
  amount: string;
}

const CC_COLORS = ["#ef4444", "#f97316", "#fbbf24", "#84cc16", "#10b981", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#d946ef", "#ec4899", "#6b7280"];

// Counterpart autocomplete input component
function CounterpartInput({ value, onChange, counterpartSuggestions }: { value: string; onChange: (v: string) => void; counterpartSuggestions: { name: string; count: number }[] }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sugRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim() || value.length < 2) return [];
    const q = value.toLowerCase();
    return counterpartSuggestions
      .filter(c => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q)
      .slice(0, 6);
  }, [value, counterpartSuggestions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sugRef.current && !sugRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
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
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        placeholder="Nome da contraparte"
        autoComplete="off"
      />
      {showSuggestions && filtered.length > 0 && (
        <div ref={sugRef} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.map((s, i) => (
            <button
              key={i}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 text-left"
              onClick={() => { onChange(s.name); setShowSuggestions(false); }}
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

/** Clearable Select wrapper - allows user to clear value */
const ClearableSelect = React.forwardRef<HTMLDivElement, {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}>(({ value, onValueChange, placeholder, children }, ref) => {
  return (
    <div className="relative" ref={ref}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__clear__">
            <span className="text-muted-foreground italic">Nenhum</span>
          </SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
});
ClearableSelect.displayName = "ClearableSelect";

export default function EventEditDialog({ open, onOpenChange, item, defaultDate, userId, onSaved, defaultEventType }: EventEditDialogProps) {
  const [eventType, setEventType] = useState<EventType>("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(true);
  const [color, setColor] = useState("#3b82f6");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState("12");
  const [recurrenceIndeterminate, setRecurrenceIndeterminate] = useState(true);
  const [recurrenceDateMode, setRecurrenceDateMode] = useState<RecurrenceDateMode>("same_date");
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [reminder, setReminder] = useState("none");
  const [priority, setPriority] = useState("medium");
  const [billAmount, setBillAmount] = useState("");
  const [cashflowDirection, setCashflowDirection] = useState<"expense" | "revenue">("expense");
  const [investmentType, setInvestmentType] = useState("stock");

  // Delete recurring confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Primary group fields
  const [categoryId, setCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [programId, setProgramId] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Cashflow extra fields
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [isFixed, setIsFixed] = useState(false);
  const [counterpart, setCounterpart] = useState("");
  const [installments, setInstallments] = useState("1");
  const [accounts, setAccounts] = useState<any[]>([]);

  // Split payment
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitLine[]>([]);

  // Carteira: new account creation
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("bank_account");
  const [newAccCurrency, setNewAccCurrency] = useState("BRL");
  const [newAccBalance, setNewAccBalance] = useState("");

  // Patrimônio: real estate, cars, etc.
  const [patrimonioName, setPatrimonioName] = useState("");
  const [patrimonioType, setPatrimonioType] = useState("imovel");
  const [patrimonioValue, setPatrimonioValue] = useState("");
  const [patrimonioDesc, setPatrimonioDesc] = useState("");

  // Centro de Custo creation
  const [ccName, setCcName] = useState("");
  const [ccDesc, setCcDesc] = useState("");
  const [ccColor, setCcColor] = useState("#3b82f6");

  // Categoria creation
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatColor, setNewCatColor] = useState("#A7C7E7");
  const [newCatIcon, setNewCatIcon] = useState("briefcase");
  const [newCatBudget, setNewCatBudget] = useState("");
  const [newCatIsRevenue, setNewCatIsRevenue] = useState(false);
  const [newCatIsExpense, setNewCatIsExpense] = useState(true);
  const [newCatIsProject, setNewCatIsProject] = useState(false);
  const [catNameError, setCatNameError] = useState("");

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [allTitles, setAllTitles] = useState<{ title: string; count: number }[]>([]);
  const [counterpartSuggestions, setCounterpartSuggestions] = useState<{ name: string; count: number }[]>([]);
  const [dynamicPaymentMethods, setDynamicPaymentMethods] = useState<string[]>([]);

  // Fetch categories, projects, accounts, cost centers, and past titles
  useEffect(() => {
    if (!userId || !open) return;
    const fetchAll = async () => {
      const [catRes, projRes, accRes, evtRes, taskRes, finRes, ccRes, pmRes] = await Promise.all([
        supabase.from("categories").select("*").eq("user_id", userId).order("name"),
        supabase.from("projects").select("*").eq("user_id", userId).order("name"),
        supabase.from("financial_accounts").select("*").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("calendar_events").select("title").eq("user_id", userId),
        supabase.from("tasks").select("title").eq("user_id", userId),
        supabase.from("financial_entries").select("title, counterpart").eq("user_id", userId),
        supabase.from("cost_centers" as any).select("*").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("payment_methods" as any).select("*").eq("user_id", userId).eq("is_active", true).order("name"),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (projRes.data) setProjects(projRes.data);
      if (accRes.data) setAccounts(accRes.data);
      if (ccRes.data) setCostCenters(ccRes.data as any[]);
      if (pmRes.data && (pmRes.data as any[]).length > 0) {
        setDynamicPaymentMethods((pmRes.data as any[]).map((pm: any) => pm.name));
      } else {
        setDynamicPaymentMethods(PAYMENT_METHODS_FALLBACK);
      }

      const titleMap = new Map<string, number>();
      const addTitles = (data: { title: string }[] | null) => {
        data?.forEach(d => {
          const t = d.title.replace(/\s*\(\d+\/\d+\)$/, "").trim();
          if (t) titleMap.set(t, (titleMap.get(t) || 0) + 1);
        });
      };
      addTitles(evtRes.data);
      addTitles(taskRes.data);
      addTitles(finRes.data);
      const sorted = Array.from(titleMap.entries())
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count);
      setAllTitles(sorted);

      const cpMap = new Map<string, number>();
      (finRes.data as any[])?.forEach((e: any) => {
        if (e.counterpart) {
          cpMap.set(e.counterpart, (cpMap.get(e.counterpart) || 0) + 1);
        }
      });
      setCounterpartSuggestions(
        Array.from(cpMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      );
    };
    fetchAll();
  }, [userId, open]);

  // Only reset form when dialog OPENS
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    if (item) {
      setTitle(item.title);
      const d = new Date(item.start_time);
      setStartDate(format(d, "yyyy-MM-dd"));
      setEndDate(format(d, "yyyy-MM-dd"));
      setStartTime(format(d, "HH:mm"));
      if (item.end_time) {
        setEndTime(format(new Date(item.end_time), "HH:mm"));
        setEndDate(format(new Date(item.end_time), "yyyy-MM-dd"));
      }
      setAllDay(item.all_day ?? true);
      setDescription(item.description || "");
      setColor(item.color || "#3b82f6");
      setRecurrence(item.recurrence_rule || "none");
      setRecurrenceCount("12");
      setRecurrenceIndeterminate(true);
      setRecurrenceDateMode("same_date");
      const desc = item.description || "";
      setIsFavorite(desc.includes("[favorito:true]") || !!item.is_favorite);
      // Parse metadata from description
      const valMatch = desc.match(/\[valor:([\d.,]+)\]/);
      if (valMatch) setBillAmount(valMatch[1]); else setBillAmount("");
      const dirMatch = desc.match(/\[direcao:(\w+)\]/);
      if (dirMatch) setCashflowDirection(dirMatch[1] as "expense" | "revenue"); else setCashflowDirection("expense");
      const invMatch = desc.match(/\[invtype:(\w+)\]/);
      if (invMatch) setInvestmentType(invMatch[1]); else setInvestmentType("stock");
      const prioMatch = desc.match(/\[prioridade:(\w+)\]/);
      if (prioMatch) setPriority(prioMatch[1]); else setPriority("medium");
      // Parse patrimonio metadata
      const patriTypeMatch = desc.match(/\[patri_type:(\w+)\]/);
      if (patriTypeMatch) setPatrimonioType(patriTypeMatch[1]); else setPatrimonioType("imovel");
      const patriValueMatch = desc.match(/\[patri_value:([\d.,]+)\]/);
      if (patriValueMatch) setPatrimonioValue(patriValueMatch[1]); else setPatrimonioValue("");
      // Reset other fields to defaults for edit
      setCategoryId(""); setCostCenterId(""); setProjectId(""); setProgramId("");
      setAccountId(""); setPaymentMethod(""); setIsPaid(false); setIsFixed(false);
      setCounterpart(""); setInstallments("1");
      setSplitEnabled(false); setSplitLines([]);
      if (desc.includes("[tipo:birthday]")) setEventType("birthday");
      else if (desc.includes("[tipo:cashflow]") || desc.includes("[tipo:bill]") || desc.includes("[tipo:receivable]")) setEventType("cashflow");
      else if (desc.includes("[tipo:investment]")) setEventType("investment");
      else if (desc.includes("[tipo:project]")) setEventType("project");
      else if (desc.includes("[tipo:patrimonio]")) { setEventType("patrimonio"); setPatrimonioName(item.title); }
      else if (item.is_task) setEventType("project");
      else setEventType("event");
      setReminder("none");
    } else {
      const d = defaultDate || new Date();
      setTitle("");
      setDescription("");
      setIsFavorite(false);
      setStartDate(format(d, "yyyy-MM-dd"));
      setEndDate(format(d, "yyyy-MM-dd"));
      setStartTime("09:00");
      setEndTime("10:00");
      setAllDay(true);
      setColor("#3b82f6");
      setRecurrence("none");
      setRecurrenceCount("12");
      setRecurrenceIndeterminate(true);
      setRecurrenceDateMode("same_date");
      setWeeklyDays([]);
      setEventType(defaultEventType || "event");
      setReminder("none");
      setPriority("medium");
      setBillAmount("");
      setCashflowDirection("expense");
      setInvestmentType("stock");
      setCategoryId("");
      setCostCenterId("");
      setProjectId("");
      setProgramId("");
      setAccountId("");
      setPaymentMethod("");
      setIsPaid(false);
      setIsFixed(false);
      setCounterpart("");
      setInstallments("1");
      setSplitEnabled(false);
      setSplitLines([]);
      setNewAccName("");
      setNewAccType("bank_account");
      setNewAccCurrency("BRL");
      setNewAccBalance("");
      setPatrimonioName("");
      setPatrimonioType("imovel");
      setPatrimonioValue("");
      setPatrimonioDesc("");
      setCcName("");
      setCcDesc("");
      setCcColor("#3b82f6");
      setNewCatName("");
      setNewCatDesc("");
      setNewCatColor("#A7C7E7");
      setNewCatIcon("briefcase");
      setNewCatBudget("");
      setNewCatIsRevenue(false);
      setNewCatIsExpense(true);
      setNewCatIsProject(false);
      setCatNameError("");
    }
  }, [item, defaultDate, open, defaultEventType]);

  const filteredSuggestions = useMemo(() => {
    if (!title.trim() || title.length < 2) return [];
    const q = title.toLowerCase();
    return allTitles
      .filter(t => t.title.toLowerCase().includes(q) && t.title.toLowerCase() !== q)
      .slice(0, 6);
  }, [title, allTitles]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          titleInputRef.current && !titleInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const cleanDescription = (desc: string) => {
    return desc.replace(/\[tipo:\w+\]/g, "").replace(/\[lembrete:\w+\]/g, "").replace(/\[prioridade:\w+\]/g, "").replace(/\[valor:[\d.,]+\]/g, "").replace(/\[direcao:\w+\]/g, "").replace(/\[favorito:\w+\]/g, "").replace(/\[categoria:\w+\]/g, "").replace(/\[projeto:\w+\]/g, "").replace(/\[invtype:\w+\]/g, "").trim();
  };

  const displayDescription = item ? cleanDescription(description) : description;

  // Split helpers
  const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
  const totalAmount = parseNum(billAmount);
  const splitTotal = splitLines.reduce((s, l) => s + parseNum(l.amount), 0);
  const splitRemaining = totalAmount - splitTotal;
  const splitPct = totalAmount > 0 ? (splitTotal / totalAmount) * 100 : 0;

  const addSplitLine = () => {
    setSplitLines(prev => [...prev, {
      id: crypto.randomUUID(),
      accountId: "",
      paymentMethod: "",
      amount: splitRemaining > 0 ? splitRemaining.toFixed(2).replace(".", ",") : "",
    }]);
  };

  const updateSplitLine = (id: string, field: keyof SplitLine, value: string) => {
    setSplitLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeSplitLine = (id: string) => {
    setSplitLines(prev => prev.filter(l => l.id !== id));
  };

  // Helper to handle clearable select changes
  const handleClearableChange = (setter: (v: string) => void) => (v: string) => {
    setter(v === "__clear__" ? "" : v);
  };

  const handleSave = async () => {
    // Categoria creation
    if (eventType === "categoria") {
      if (!newCatName.trim()) { setCatNameError("Nome obrigatório"); return; }
      // Check unique name
      const { data: existing } = await supabase.from("categories").select("id").eq("user_id", userId).ilike("name", newCatName.trim());
      if (existing && existing.length > 0) { setCatNameError("Já existe uma categoria com esse nome"); return; }
      const parseNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
      await supabase.from("categories").insert({
        user_id: userId,
        name: newCatName.trim(),
        color: newCatColor,
        icon: newCatIcon,
        budget_amount: parseNum(newCatBudget),
        is_revenue: newCatIsRevenue,
        is_expense: newCatIsExpense,
        is_project: newCatIsProject,
      });
      onSaved();
      onOpenChange(false);
      return;
    }

    // Centro de Custo creation
    if (eventType === "centro_custo") {
      if (!ccName.trim()) return;
      await supabase.from("cost_centers" as any).insert({
        user_id: userId,
        name: ccName.trim(),
        description: ccDesc || null,
        color: ccColor,
        is_active: true,
      });
      onSaved();
      onOpenChange(false);
      return;
    }

    if (!title.trim() && eventType !== "carteira" && eventType !== "patrimonio") return;
    const startDt = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime}:00`);
    const endDt = allDay ? (endDate !== startDate ? new Date(`${endDate}T23:59:59`) : null) : new Date(`${endDate || startDate}T${endTime}:00`);

    const typeColor = EVENT_TYPES.find(t => t.value === eventType)?.color || "#3b82f6";

    const descWithMeta = [
      displayDescription,
      eventType !== "event" ? `[tipo:${eventType}]` : "",
      isFavorite ? "[favorito:true]" : "",
      reminder !== "none" ? `[lembrete:${reminder}min]` : "",
      eventType === "project" ? `[prioridade:${priority}]` : "",
      (eventType === "cashflow" || eventType === "investment") && billAmount ? `[valor:${billAmount}]` : "",
      eventType === "cashflow" ? `[direcao:${cashflowDirection}]` : "",
      eventType === "investment" ? `[invtype:${investmentType}]` : "",
    ].filter(Boolean).join(" ");

    if (item) {
      await supabase.from("calendar_events").update({
        title, start_time: startDt.toISOString(),
        end_time: endDt?.toISOString() || null,
        all_day: allDay, description: descWithMeta, color: typeColor,
        recurrence_rule: recurrence === "none" ? null : recurrence,
      }).eq("id", item.id);

      if (item.task_id) {
        await supabase.from("tasks").update({
          title, is_favorite: isFavorite,
          category_id: categoryId || null,
          project_id: projectId || null,
        }).eq("id", item.task_id);
      }
    } else {
      let taskId: string | null = null;
      if (eventType === "project") {
        const { data } = await supabase.from("tasks").insert({
          user_id: userId, title, description: displayDescription,
          scheduled_date: startDate, is_completed: false, is_favorite: isFavorite,
          category_id: categoryId || null,
          project_id: projectId || null,
        }).select("id").single();
        if (data) taskId = data.id;
      }

      if (eventType === "programa") {
        await supabase.from("programs").insert({
          user_id: userId, name: title, description: displayDescription || null,
        });
      }

      // Carteira: create a new financial account (wallet)
      if (eventType === "carteira" && newAccName.trim()) {
        const bal = parseNum(newAccBalance);
        await supabase.from("financial_accounts").insert({
          user_id: userId,
          name: newAccName.trim(),
          type: newAccType,
          currency: newAccCurrency,
          current_balance: bal,
          initial_balance: bal,
          is_active: true,
        } as any);
      }

      // Patrimônio: create asset record (stored as description-tagged entry for now)
      if (eventType === "patrimonio" && patrimonioName.trim()) {
        // Store patrimonio as a calendar event with metadata
        await supabase.from("calendar_events").insert({
          user_id: userId,
          title: patrimonioName.trim(),
          start_time: new Date().toISOString(),
          all_day: true,
          description: `[tipo:patrimonio] [patri_type:${patrimonioType}] [patri_value:${patrimonioValue}] ${patrimonioDesc}`.trim(),
          color: typeColor,
        });
      }

      // For cashflow, create a financial entry with all fields
      if (eventType === "cashflow" && billAmount) {
        const amount = parseNum(billAmount);
        if (amount > 0) {
          const numInst = Math.max(1, parseInt(installments) || 1);
          const instGroup = numInst > 1 ? crypto.randomUUID() : null;
          const maxDateLimit = new Date(startDt.getFullYear(), 11, 31);
          const effectiveCount = recurrence !== "none" ? (recurrenceIndeterminate ? 999 : Math.max(1, parseInt(recurrenceCount) || 12)) : numInst;

          const baseEntry: any = {
            user_id: userId,
            category_id: categoryId || null,
            project_id: projectId || null,
            cost_center_id: costCenterId || null,
            account_id: splitEnabled ? null : (accountId || null),
            payment_method: splitEnabled ? null : (paymentMethod || null),
            counterpart: counterpart || null,
            is_fixed: isFixed,
            has_split: splitEnabled && splitLines.length > 0,
          };

          if (recurrence !== "none") {
            const count = effectiveCount;
            const group = crypto.randomUUID();
            const entriesToInsert = Array.from({ length: count }, (_, i) => {
              const d = new Date(startDt);
              if (recurrence === "FREQ=DAILY") d.setDate(d.getDate() + i);
              else if (recurrence === "FREQ=WEEKLY") d.setDate(d.getDate() + i * 7);
              else if (recurrence === "FREQ=BIWEEKLY") d.setDate(d.getDate() + i * 14);
              else if (recurrence === "FREQ=MONTHLY") d.setMonth(d.getMonth() + i);
              else if (recurrence === "FREQ=QUARTERLY") d.setMonth(d.getMonth() + i * 3);
              else if (recurrence === "FREQ=SEMIANNUAL") d.setMonth(d.getMonth() + i * 6);
              else if (recurrence === "FREQ=YEARLY") d.setFullYear(d.getFullYear() + i);
              if (recurrenceDateMode === "first_business_day" && (recurrence === "FREQ=MONTHLY" || recurrence === "FREQ=QUARTERLY" || recurrence === "FREQ=SEMIANNUAL")) {
                d.setDate(1);
                while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
              }
              if (recurrenceIndeterminate && d > maxDateLimit) return null;
              return {
                ...baseEntry,
                title: recurrenceIndeterminate ? title : `${title} (${i + 1}/${count})`,
                amount, type: cashflowDirection,
                entry_date: format(d, "yyyy-MM-dd"),
                installment_group: group, installment_number: i + 1, total_installments: recurrenceIndeterminate ? 0 : count,
                is_paid: i === 0 ? isPaid : false,
                recurrence_type: recurrence.replace("FREQ=", "").toLowerCase(),
              };
            }).filter(Boolean);
            const { data: insertedEntries } = await supabase.from("financial_entries").insert(entriesToInsert as any[]).select("id");
            
            if (splitEnabled && splitLines.length > 0 && insertedEntries?.[0]) {
              const splits = splitLines.map(l => ({
                entry_id: insertedEntries[0].id,
                user_id: userId,
                account_id: l.accountId || null,
                payment_method: l.paymentMethod || null,
                amount: parseNum(l.amount),
              }));
              await supabase.from("payment_splits" as any).insert(splits);
            }
          } else {
            const entriesToInsert = Array.from({ length: numInst }, (_, i) => {
              const d = new Date(startDt);
              d.setMonth(d.getMonth() + i);
              return {
                ...baseEntry,
                title: numInst > 1 ? `${title} (${i + 1}/${numInst})` : title,
                amount: amount / numInst, type: cashflowDirection,
                entry_date: format(d, "yyyy-MM-dd"),
                installment_group: instGroup, installment_number: i + 1, total_installments: numInst,
                is_paid: i === 0 ? isPaid : false,
              };
            });
            const { data: insertedEntries } = await supabase.from("financial_entries").insert(entriesToInsert).select("id");
            
            if (splitEnabled && splitLines.length > 0 && insertedEntries?.[0]) {
              const splits = splitLines.map(l => ({
                entry_id: insertedEntries[0].id,
                user_id: userId,
                account_id: l.accountId || null,
                payment_method: l.paymentMethod || null,
                amount: parseNum(l.amount),
              }));
              await supabase.from("payment_splits" as any).insert(splits);
            }
          }
        }
      }

      // For investment, create a financial entry
      if (eventType === "investment" && billAmount) {
        const amount = parseNum(billAmount);
        if (amount > 0) {
          const maxDateLimitInv = new Date(startDt.getFullYear(), 11, 31);
          const effectiveCount = recurrence !== "none" ? (recurrenceIndeterminate ? 999 : Math.max(1, parseInt(recurrenceCount) || 12)) : 1;

          if (recurrence !== "none") {
            const group = crypto.randomUUID();
            const entriesToInsert = Array.from({ length: effectiveCount }, (_, i) => {
              const d = new Date(startDt);
              if (recurrence === "FREQ=DAILY") d.setDate(d.getDate() + i);
              else if (recurrence === "FREQ=WEEKLY") d.setDate(d.getDate() + i * 7);
              else if (recurrence === "FREQ=BIWEEKLY") d.setDate(d.getDate() + i * 14);
              else if (recurrence === "FREQ=MONTHLY") d.setMonth(d.getMonth() + i);
              else if (recurrence === "FREQ=QUARTERLY") d.setMonth(d.getMonth() + i * 3);
              else if (recurrence === "FREQ=SEMIANNUAL") d.setMonth(d.getMonth() + i * 6);
              else if (recurrence === "FREQ=YEARLY") d.setFullYear(d.getFullYear() + i);
              if (recurrenceIndeterminate && d > maxDateLimitInv) return null;
              return {
                user_id: userId, title: recurrenceIndeterminate ? title : `${title} (${i + 1}/${effectiveCount})`,
                amount, type: "investment" as const,
                category_id: categoryId || null, project_id: projectId || null,
                cost_center_id: costCenterId || null,
                entry_date: format(d, "yyyy-MM-dd"),
                installment_group: group, installment_number: i + 1, total_installments: recurrenceIndeterminate ? 0 : effectiveCount,
                is_paid: false,
              };
            }).filter(Boolean);
            await supabase.from("financial_entries").insert(entriesToInsert as any[]);
          } else {
            await supabase.from("financial_entries").insert({
              user_id: userId, title, amount, type: "investment",
              category_id: categoryId || null, project_id: projectId || null,
              cost_center_id: costCenterId || null,
              entry_date: format(startDt, "yyyy-MM-dd"), is_paid: false,
            } as any);
          }
        }
      }

      // Create calendar events - skip for cashflow/investment/carteira/patrimonio
      if (eventType !== "cashflow" && eventType !== "investment" && eventType !== "carteira" && eventType !== "patrimonio") {
        if (recurrence !== "none") {
          const calMaxDate = new Date(startDt.getFullYear(), 11, 31);
          const count = recurrenceIndeterminate ? 999 : Math.max(1, parseInt(recurrenceCount) || 12);
          const events = Array.from({ length: count }, (_, i) => {
            const d = new Date(startDt);
            if (recurrence === "FREQ=DAILY") d.setDate(d.getDate() + i);
            else if (recurrence === "FREQ=WEEKLY") d.setDate(d.getDate() + i * 7);
            else if (recurrence === "FREQ=BIWEEKLY") d.setDate(d.getDate() + i * 14);
            else if (recurrence === "FREQ=MONTHLY") d.setMonth(d.getMonth() + i);
            else if (recurrence === "FREQ=QUARTERLY") d.setMonth(d.getMonth() + i * 3);
            else if (recurrence === "FREQ=SEMIANNUAL") d.setMonth(d.getMonth() + i * 6);
            else if (recurrence === "FREQ=YEARLY") d.setFullYear(d.getFullYear() + i);
            if (recurrenceDateMode === "first_business_day" && (recurrence === "FREQ=MONTHLY" || recurrence === "FREQ=QUARTERLY" || recurrence === "FREQ=SEMIANNUAL")) {
              d.setDate(1);
              while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
            }
            if (recurrenceIndeterminate && d > calMaxDate) return null;
            return {
              user_id: userId,
              title: recurrenceIndeterminate ? title : `${title} (${i + 1}/${count})`,
              start_time: d.toISOString(),
              end_time: endDt ? (() => { const ed = new Date(d); ed.setHours(endDt.getHours(), endDt.getMinutes()); return ed.toISOString(); })() : null,
              all_day: allDay, description: descWithMeta, color: typeColor,
              recurrence_rule: recurrence,
              task_id: i === 0 ? taskId : null,
            };
          }).filter(Boolean);
          await supabase.from("calendar_events").insert(events as any[]);
        } else {
          await supabase.from("calendar_events").insert({
            user_id: userId, title,
            start_time: startDt.toISOString(),
            end_time: endDt?.toISOString() || null,
            all_day: allDay, description: descWithMeta, color: typeColor,
            recurrence_rule: null, task_id: taskId,
          });
        }
      }
    }

    // Update account balance if paid (only for non-split)
    if (isPaid && !splitEnabled && accountId && eventType === "cashflow" && billAmount) {
      const amount = parseNum(billAmount);
      const account = accounts.find((a: any) => a.id === accountId);
      if (account) {
        const delta = cashflowDirection === "revenue" ? amount : -amount;
        await supabase.from("financial_accounts").update({
          current_balance: account.current_balance + delta,
        }).eq("id", accountId);
      }
    }

    // Update account balances for split payments
    if (isPaid && splitEnabled && splitLines.length > 0 && eventType === "cashflow") {
      for (const line of splitLines) {
        if (line.accountId) {
          const amount = parseNum(line.amount);
          const account = accounts.find((a: any) => a.id === line.accountId);
          if (account && amount > 0) {
            const delta = cashflowDirection === "revenue" ? amount : -amount;
            await supabase.from("financial_accounts").update({
              current_balance: account.current_balance + delta,
            }).eq("id", line.accountId);
          }
        }
      }
    }

    onSaved();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!item) return;
    if (item.recurrence_rule) {
      setDeleteConfirmOpen(true);
      return;
    }
    await supabase.from("calendar_events").delete().eq("id", item.id);
    onSaved();
    onOpenChange(false);
  };

  const handleDeleteSingle = async () => {
    if (!item) return;
    await supabase.from("calendar_events").delete().eq("id", item.id);
    setDeleteConfirmOpen(false);
    onSaved();
    onOpenChange(false);
  };

  const handleDeleteFutureAndThis = async () => {
    if (!item) return;
    const baseTitle = item.title.replace(/\s*\(\d+\/\d+\)$/, "").trim();
    const itemDate = new Date(item.start_time);
    const { data: allEvents } = await supabase.from("calendar_events")
      .select("id, title, recurrence_rule, start_time")
      .eq("user_id", item.user_id)
      .eq("recurrence_rule", item.recurrence_rule!);
    if (allEvents) {
      const matching = allEvents.filter(e => {
        const eTitle = e.title.replace(/\s*\(\d+\/\d+\)$/, "").trim();
        return eTitle === baseTitle && new Date(e.start_time) >= itemDate;
      });
      const ids = matching.map(e => e.id);
      if (ids.length > 0) {
        await supabase.from("calendar_events").delete().in("id", ids);
      }
    }
    const { data: finEntries } = await supabase.from("financial_entries")
      .select("id, title, entry_date")
      .eq("user_id", item.user_id)
      .like("title", `${baseTitle}%`);
    if (finEntries) {
      const matchIds = finEntries
        .filter(e => new Date(e.entry_date) >= itemDate)
        .map(e => e.id);
      if (matchIds.length > 0) {
        await supabase.from("financial_entries").delete().in("id", matchIds);
      }
    }
    setDeleteConfirmOpen(false);
    onSaved();
    onOpenChange(false);
  };

  const handleDeleteAll = async () => {
    if (!item) return;
    const baseTitle = item.title.replace(/\s*\(\d+\/\d+\)$/, "").trim();
    const { data: allEvents } = await supabase.from("calendar_events")
      .select("id, title, recurrence_rule")
      .eq("user_id", item.user_id)
      .eq("recurrence_rule", item.recurrence_rule!);
    if (allEvents) {
      const matching = allEvents.filter(e => e.title.replace(/\s*\(\d+\/\d+\)$/, "").trim() === baseTitle);
      const ids = matching.map(e => e.id);
      if (ids.length > 0) {
        await supabase.from("calendar_events").delete().in("id", ids);
      }
    }
    await supabase.from("financial_entries").delete()
      .eq("user_id", item.user_id)
      .like("title", `${baseTitle}%`);
    setDeleteConfirmOpen(false);
    onSaved();
    onOpenChange(false);
  };

  const handleTypeChange = (t: EventType) => {
    setEventType(t);
    const typeConfig = EVENT_TYPES.find(et => et.value === t);
    if (typeConfig) setColor(typeConfig.color);
    if (t === "birthday") { setAllDay(true); setRecurrence("FREQ=YEARLY"); }
    if (t === "project") { setAllDay(true); }
  };

  const toggleWeeklyDay = (day: number) => {
    setWeeklyDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const getDialogTitle = () => {
    const typeLabel = EVENT_TYPES.find(t => t.value === eventType)?.label || "item";
    return item ? `Editar ${typeLabel.toLowerCase()}` : "Central de Lançamentos";
  };

  // Types that show the main title/description/classification fields
  const showMainFields = eventType !== "carteira" && eventType !== "patrimonio" && eventType !== "centro_custo" && eventType !== "categoria";
  // Types that show dates/scheduling
  const showDates = eventType !== "carteira" && eventType !== "patrimonio" && eventType !== "centro_custo" && eventType !== "categoria";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─── TYPE SELECTOR (Dropdown) ─── */}
          {(
            <div className="space-y-2 rounded-lg border border-border/30 p-3">
              <Label className="text-sm text-muted-foreground">Tipo de lançamento</Label>
              <Select value={eventType} onValueChange={(v) => handleTypeChange(v as EventType)}>
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span style={{ color: EVENT_TYPES.find(t => t.value === eventType)?.color }}>{EVENT_TYPE_ICONS[eventType]}</span>
                      {EVENT_TYPES.find(t => t.value === eventType)?.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <span style={{ color: t.color }}>{EVENT_TYPE_ICONS[t.value]}</span>
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ─── CATEGORIA CREATION ─── */}
          {eventType === "categoria" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <p className="text-xs text-muted-foreground">Criar nova categoria.</p>
              <div>
                <Label className="text-sm">Nome *</Label>
                <Input
                  value={newCatName}
                  onChange={(e) => { setNewCatName(e.target.value); setCatNameError(""); }}
                  placeholder="Ex: Alimentação"
                  className={catNameError ? "border-destructive" : ""}
                />
                {catNameError && <p className="text-[11px] text-destructive mt-1">{catNameError}</p>}
              </div>
              <div>
                <Label className="text-sm">Descrição</Label>
                <Input value={newCatDesc} onChange={(e) => setNewCatDesc(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <Label className="text-sm">Orçamento Mensal</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                  <Input
                    type="text" inputMode="decimal" placeholder="0,00"
                    value={newCatBudget}
                    onChange={(e) => setNewCatBudget(e.target.value.replace(/[^0-9.,]/g, ""))}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Cor</Label>
                <div className="mt-1 grid grid-cols-6 gap-1.5">
                  {CC_COLORS.map((c) => (
                    <button key={c} onClick={() => setNewCatColor(c)}
                      className={cn("h-8 w-8 rounded-lg border transition-all duration-200 hover:scale-110",
                        newCatColor === c ? "border-foreground ring-1 ring-foreground" : "border-transparent"
                      )} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Usar em</Label>
                <div className="flex items-center justify-between"><Label className="text-xs font-normal">Receitas</Label><Switch checked={newCatIsRevenue} onCheckedChange={(v) => setNewCatIsRevenue(!!v)} /></div>
                <div className="flex items-center justify-between"><Label className="text-xs font-normal">Despesas</Label><Switch checked={newCatIsExpense} onCheckedChange={(v) => setNewCatIsExpense(!!v)} /></div>
                <div className="flex items-center justify-between"><Label className="text-xs font-normal">Projetos</Label><Switch checked={newCatIsProject} onCheckedChange={(v) => setNewCatIsProject(!!v)} /></div>
              </div>
            </div>
          )}

          {eventType === "centro_custo" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <p className="text-xs text-muted-foreground">Criar novo programa.</p>
              <div>
                <Label className="text-sm">Nome</Label>
                <Input value={ccName} onChange={(e) => setCcName(e.target.value)} placeholder="Ex: TI, Marketing..." />
              </div>
              <div>
                <Label className="text-sm">Descrição</Label>
                <Input value={ccDesc} onChange={(e) => setCcDesc(e.target.value)} placeholder="Opcional" />
              </div>
              <div>
                <Label className="text-sm">Cor</Label>
                <div className="mt-1 grid grid-cols-6 gap-1.5">
                  {CC_COLORS.map((c) => (
                    <button key={c} onClick={() => setCcColor(c)}
                      className={cn("h-8 w-8 rounded-lg border transition-all duration-200 hover:scale-110",
                        ccColor === c ? "border-foreground ring-1 ring-foreground" : "border-transparent"
                      )} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── PRIMARY GROUP: Título, Descrição, Categoria, Centro de Custo, Projeto ─── */}
          {showMainFields && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <div>
                <Label className="text-sm">Título</Label>
                <div className="flex gap-2 items-center relative">
                  <div className="flex-1 relative">
                    <Input
                      ref={titleInputRef}
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder="Nome do lançamento"
                      autoComplete="off"
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md"
                      >
                        {filteredSuggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 text-left"
                            onClick={() => { setTitle(s.title); setShowSuggestions(false); }}
                          >
                            <span className="flex-1 truncate">{s.title}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">×{s.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {eventType !== "cashflow" && (
                    <button
                      type="button"
                      onClick={() => setIsFavorite(!isFavorite)}
                      className="shrink-0 p-1 rounded hover:bg-accent/50 transition-colors"
                      title="Favoritar"
                    >
                      <Star className={cn("h-5 w-5", isFavorite ? "fill-warning text-warning" : "text-muted-foreground")} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-sm">Descrição</Label>
                <Textarea value={displayDescription} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Opcional" rows={2} className="resize-none" />
              </div>

              <div>
                <Label className="text-sm">Categoria</Label>
                <ClearableSelect value={categoryId} onValueChange={handleClearableChange(setCategoryId)} placeholder="Selecionar categoria">
                  {categories.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </ClearableSelect>
              </div>

              {/* Programa - below Categoria, above Projeto */}
              {(eventType === "cashflow" || eventType === "investment" || eventType === "project") && (
                <div>
                  <Label className="text-sm">Programa</Label>
                  <ClearableSelect value={costCenterId} onValueChange={handleClearableChange(setCostCenterId)} placeholder="Selecionar programa">
                    {costCenters.map((cc: any) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cc.color }} />
                          {cc.name}
                        </span>
                      </SelectItem>
                    ))}
                  </ClearableSelect>
                </div>
              )}

              {(eventType === "project" || eventType === "event" || eventType === "cashflow") && (
                <div>
                  <Label className="text-sm">{eventType === "project" ? "Programa" : "Projeto"}</Label>
                  <ClearableSelect value={projectId} onValueChange={handleClearableChange(setProjectId)} placeholder={eventType === "project" ? "Selecionar programa" : "Selecionar projeto"}>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </ClearableSelect>
                </div>
              )}
            </div>
          )}

          {/* ─── CASHFLOW FIELDS ─── */}
          {eventType === "cashflow" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setCashflowDirection("expense")}
                  className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    cashflowDirection === "expense" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
                  )}
                ><CircleDollarSign className="h-3.5 w-3.5 inline mr-1" />Pagar</button>
                <button
                  onClick={() => setCashflowDirection("revenue")}
                  className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    cashflowDirection === "revenue" ? "bg-[hsl(var(--success))] text-white" : "bg-muted text-muted-foreground"
                  )}
                ><TrendingUp className="h-3.5 w-3.5 inline mr-1" />Receber</button>
              </div>
              <div>
                <Label className="text-sm">Contraparte (Recebedor / Pagador)</Label>
                <CounterpartInput value={counterpart} onChange={setCounterpart} counterpartSuggestions={counterpartSuggestions} />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-sm">Valor (R$)</Label>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
                </div>
                {recurrence === "none" && (
                  <div className="w-[100px]">
                    <Label className="text-sm">Parcelas</Label>
                    <Input type="number" placeholder="1" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} className="text-xs" />
                  </div>
                )}
              </div>

              {/* Single-source payment fields (hidden when split is enabled) */}
              {!splitEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm">Carteira</Label>
                    <ClearableSelect value={accountId} onValueChange={handleClearableChange(setAccountId)} placeholder="Selecionar">
                      {accounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </ClearableSelect>
                  </div>
                  <div>
                    <Label className="text-sm">Forma Pgto</Label>
                    <ClearableSelect value={paymentMethod} onValueChange={handleClearableChange(setPaymentMethod)} placeholder="Selecionar">
                      {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </ClearableSelect>
                  </div>
                </div>
              )}

              {/* Three toggles in one line */}
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-1.5">
                  <Switch checked={isFixed} onCheckedChange={(c) => setIsFixed(c)} />
                  <label className="text-xs cursor-pointer">Conta fixa</label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={splitEnabled} onCheckedChange={(c) => {
                    setSplitEnabled(c);
                    if (c && splitLines.length === 0) addSplitLine();
                  }} />
                  <label className="text-xs cursor-pointer">Múltiplas carteiras</label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={isPaid} onCheckedChange={(c) => setIsPaid(c)} />
                  <label className="text-xs cursor-pointer">Baixar conta</label>
                </div>
              </div>

              {/* Split Lines */}
              {splitEnabled && (
                <div className="space-y-2 rounded-md border border-border/30 p-2.5 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5" /> Fontes de pagamento
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
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Select value={line.accountId} onValueChange={(v) => updateSplitLine(line.id, "accountId", v)}>
                          <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Carteira" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map((a: any) => (
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
                      <div>
                        <Input
                          type="text" inputMode="decimal" placeholder="0,00"
                          value={line.amount}
                          onChange={(e) => updateSplitLine(line.id, "amount", e.target.value.replace(/[^0-9.,]/g, ""))}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Progress bar */}
                  {totalAmount > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">
                          {splitPct.toFixed(0)}% alocado
                        </span>
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
          )}

          {/* Investment: type + amount */}
          {eventType === "investment" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <div>
                <Label className="text-sm">Tipo de Investimento</Label>
                <Select value={investmentType} onValueChange={setInvestmentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INVESTMENT_TYPES_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Valor (R$)</Label>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
              </div>
            </div>
          )}

          {/* Carteira: create wallet/account */}
          {eventType === "carteira" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <p className="text-xs text-muted-foreground">Criar nova carteira ou conta.</p>
              <div>
                <Label className="text-sm">Nome da Carteira</Label>
                <Input value={newAccName} onChange={(e) => setNewAccName(e.target.value)} placeholder="Ex: Nubank, Itaú..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Tipo</Label>
                  <Select value={newAccType} onValueChange={setNewAccType}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Moeda</Label>
                  <Select value={newAccCurrency} onValueChange={setNewAccCurrency}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">R$ (Real)</SelectItem>
                      <SelectItem value="USD">US$ (Dólar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm">Saldo Inicial ({newAccCurrency === "USD" ? "US$" : "R$"})</Label>
                <Input type="text" inputMode="decimal" placeholder="0,00" value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value.replace(/[^0-9.,]/g, ""))} />
              </div>
            </div>
          )}

          {/* Patrimônio: imóveis, carros, etc. */}
          {eventType === "patrimonio" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <p className="text-xs text-muted-foreground">Registrar um bem patrimonial (imóvel, veículo, etc.).</p>
              <div>
                <Label className="text-sm">Nome do Bem</Label>
                <Input value={patrimonioName} onChange={(e) => setPatrimonioName(e.target.value)} placeholder="Ex: Apartamento Centro, Honda Civic..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-sm">Tipo</Label>
                  <Select value={patrimonioType} onValueChange={setPatrimonioType}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PATRIMONIO_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Valor Estimado (R$)</Label>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={patrimonioValue}
                    onChange={(e) => setPatrimonioValue(e.target.value.replace(/[^0-9.,]/g, ""))} />
                </div>
              </div>
              <div>
                <Label className="text-sm">Descrição</Label>
                <Textarea value={patrimonioDesc} onChange={(e) => setPatrimonioDesc(e.target.value)}
                  placeholder="Detalhes adicionais (opcional)" rows={2} className="resize-none" />
              </div>
            </div>
          )}

          {/* Project priority */}
          {eventType === "project" && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <div>
                <Label className="text-sm flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 Baixa</SelectItem>
                    <SelectItem value="medium">🟡 Média</SelectItem>
                    <SelectItem value="high">🔴 Alta</SelectItem>
                    <SelectItem value="urgent">🔥 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ─── Dates & Scheduling group ─── */}
          {showDates && (
            <div className="space-y-3 rounded-lg border border-border/30 p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-sm flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" /> Vencimento</Label>
                  <SimpleDatePicker value={startDate} onChange={setStartDate} placeholder="Selecionar data" />
                </div>
                <div className="flex items-center gap-1.5 pt-5">
                  <Switch checked={allDay} onCheckedChange={(c) => setAllDay(c)} />
                  <Label className="text-sm whitespace-nowrap">Dia inteiro</Label>
                </div>
              </div>

              {!allDay && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Hora início</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Hora término</Label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Recorrência</Label>
                <Select value={recurrence} onValueChange={setRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {recurrence === "FREQ=WEEKLY" && (
                <div>
                  <Label className="text-sm mb-1.5 block">Dias da semana</Label>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeeklyDay(idx)}
                        className={cn(
                          "h-8 w-8 rounded-full text-xs font-medium transition-colors",
                          weeklyDays.includes(idx)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recurrence !== "none" && (
                <>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={recurrenceIndeterminate}
                      onCheckedChange={(c) => setRecurrenceIndeterminate(c)}
                    />
                    <Label className="text-sm">Indeterminada</Label>
                  </div>
                  {!recurrenceIndeterminate && (
                    <div>
                      <Label className="text-sm flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Quantidade</Label>
                      <Input type="number" min="1" max="365" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} />
                    </div>
                  )}
                  {(recurrence === "FREQ=MONTHLY" || recurrence === "FREQ=QUARTERLY" || recurrence === "FREQ=SEMIANNUAL") && (
                    <div>
                      <Label className="text-sm">Repetir na:</Label>
                      <Select value={recurrenceDateMode} onValueChange={(v) => setRecurrenceDateMode(v as RecurrenceDateMode)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="same_date">Mesma data</SelectItem>
                          <SelectItem value="first_business_day">Primeiro dia útil do mês</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              <div>
                <Label className="text-sm flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Lembrete</Label>
                <Select value={reminder} onValueChange={setReminder}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ─── ACTION FOOTER ─── */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/20">
            {item && (
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5" onClick={handleSave}>
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete recurring confirmation dialog */}
    <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Excluir evento recorrente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">Como deseja excluir este evento recorrente?</p>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={handleDeleteSingle}>Apenas este</Button>
            <Button variant="outline" size="sm" onClick={handleDeleteFutureAndThis}>Este e futuros</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteAll}>Todos</Button>
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
