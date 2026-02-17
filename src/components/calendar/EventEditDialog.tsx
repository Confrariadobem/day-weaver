import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Save, Calendar, Clock, Bell, Tag, Hash, Star, Wallet, Repeat, Cake, CalendarDays, TrendingUp, FolderKanban, CircleDollarSign, Building2 } from "lucide-react";
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

type EventType = "birthday" | "event" | "cashflow" | "investment" | "project" | "patrimonio";

const EVENT_TYPE_ICONS: Record<EventType, React.ReactNode> = {
  birthday: <Cake className="h-3.5 w-3.5" />,
  event: <CalendarDays className="h-3.5 w-3.5" />,
  cashflow: <CircleDollarSign className="h-3.5 w-3.5" />,
  investment: <TrendingUp className="h-3.5 w-3.5" />,
  project: <FolderKanban className="h-3.5 w-3.5" />,
  patrimonio: <Building2 className="h-3.5 w-3.5" />,
};

const EVENT_TYPES: { value: EventType; label: string; color: string }[] = [
  { value: "birthday", label: "Aniversário", color: "#ec4899" },
  { value: "cashflow", label: "Fluxo de caixa", color: "#22c55e" },
  { value: "event", label: "Evento", color: "#3b82f6" },
  { value: "investment", label: "Investimento", color: "#d4a017" },
  { value: "patrimonio", label: "Patrimônio", color: "#8b5cf6" },
  { value: "project", label: "Projeto", color: "#eab308" },
];

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

const PAYMENT_METHODS = ["Débito", "Crédito", "PIX", "Boleto", "Transferência", "Dinheiro", "Crypto"];

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

const INVESTMENT_TYPES_OPTIONS = [
  { value: "stock", label: "Ações" },
  { value: "crypto", label: "Criptoativos" },
  { value: "etf", label: "ETFs" },
  { value: "fii", label: "FIIs" },
  { value: "fixed_income", label: "Renda Fixa" },
  { value: "other", label: "Outros" },
];

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
  const [projectId, setProjectId] = useState("");
  const [programId, setProgramId] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Cashflow extra fields
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [installments, setInstallments] = useState("1");
  const [accounts, setAccounts] = useState<any[]>([]);

  // Autocomplete state
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [allTitles, setAllTitles] = useState<{ title: string; count: number }[]>([]);

  // Fetch categories, projects, accounts, and past titles
  useEffect(() => {
    if (!userId || !open) return;
    const fetchAll = async () => {
      const [catRes, projRes, accRes, evtRes, taskRes, finRes] = await Promise.all([
        supabase.from("categories").select("*").eq("user_id", userId).order("name"),
        supabase.from("projects").select("*").eq("user_id", userId).order("name"),
        supabase.from("financial_accounts").select("*").eq("user_id", userId).eq("is_active", true).order("name"),
        supabase.from("calendar_events").select("title").eq("user_id", userId),
        supabase.from("tasks").select("title").eq("user_id", userId),
        supabase.from("financial_entries").select("title").eq("user_id", userId),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (projRes.data) setProjects(projRes.data);
      if (accRes.data) setAccounts(accRes.data);

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
    };
    fetchAll();
  }, [userId, open]);

  useEffect(() => {
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
      const desc = item.description || "";
      setIsFavorite(desc.includes("[favorito:true]") || !!item.is_favorite);
      if (desc.includes("[tipo:birthday]")) setEventType("birthday");
      else if (desc.includes("[tipo:cashflow]") || desc.includes("[tipo:bill]") || desc.includes("[tipo:receivable]")) setEventType("cashflow");
      else if (desc.includes("[tipo:investment]")) setEventType("investment");
      else if (desc.includes("[tipo:project]")) setEventType("project");
      else if (desc.includes("[tipo:patrimonio]")) setEventType("patrimonio");
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
      // Pre-fill times from the clicked time slot
      const h = d.getHours();
      if (h > 0 && h < 24) {
        setStartTime(`${String(h).padStart(2, "0")}:00`);
        setEndTime(`${String(Math.min(h + 1, 23)).padStart(2, "0")}:00`);
        setAllDay(false);
      } else {
        setStartTime("09:00");
        setEndTime("10:00");
        setAllDay(true);
      }
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
      setProjectId("");
      setProgramId("");
      setAccountId("");
      setPaymentMethod("");
      setIsPaid(false);
      setInstallments("1");
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

  const handleSave = async () => {
    if (!title.trim()) return;
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

        // Project association is handled via the projectId field selection
      }

      // For cashflow, create a financial entry with all fields
      if (eventType === "cashflow" && billAmount) {
        const amount = parseFloat(billAmount.replace(/\./g, "").replace(",", ".")) || 0;
        if (amount > 0) {
          const numInst = Math.max(1, parseInt(installments) || 1);
          const instGroup = numInst > 1 ? crypto.randomUUID() : null;
          // Limit indeterminate recurrence to Dec 31 of current year
          const maxDateLimit = new Date(startDt.getFullYear(), 11, 31);
          const effectiveCount = recurrence !== "none" ? (recurrenceIndeterminate ? 999 : Math.max(1, parseInt(recurrenceCount) || 12)) : numInst;

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
              // Stop if past Dec 31 for indeterminate recurrence
              if (recurrenceIndeterminate && d > maxDateLimit) return null;
              return {
                user_id: userId, title: recurrenceIndeterminate ? title : `${title} (${i + 1}/${count})`,
                amount, type: cashflowDirection,
                category_id: categoryId || null, project_id: projectId || null,
                entry_date: format(d, "yyyy-MM-dd"),
                installment_group: group, installment_number: i + 1, total_installments: recurrenceIndeterminate ? 0 : count,
                account_id: accountId || null, payment_method: paymentMethod || null,
                is_paid: i === 0 ? isPaid : false,
                recurrence_type: recurrence.replace("FREQ=", "").toLowerCase(),
              };
            }).filter(Boolean);
            await supabase.from("financial_entries").insert(entriesToInsert as any[]);
          } else {
            const entriesToInsert = Array.from({ length: numInst }, (_, i) => {
              const d = new Date(startDt);
              d.setMonth(d.getMonth() + i);
              return {
                user_id: userId,
                title: numInst > 1 ? `${title} (${i + 1}/${numInst})` : title,
                amount: amount / numInst, type: cashflowDirection,
                category_id: categoryId || null, project_id: projectId || null,
                entry_date: format(d, "yyyy-MM-dd"),
                installment_group: instGroup, installment_number: i + 1, total_installments: numInst,
                account_id: accountId || null, payment_method: paymentMethod || null,
                is_paid: i === 0 ? isPaid : false,
              };
            });
            await supabase.from("financial_entries").insert(entriesToInsert);
          }
        }
      }

      // For investment, create a financial entry with type "investment"
      if (eventType === "investment" && billAmount) {
        const amount = parseFloat(billAmount.replace(/\./g, "").replace(",", ".")) || 0;
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
              entry_date: format(startDt, "yyyy-MM-dd"), is_paid: false,
            });
          }
        }
      }

      // Create calendar events
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

    // Update account balance if paid
    if (isPaid && accountId && eventType === "cashflow" && billAmount) {
      const amount = parseFloat(billAmount.replace(/\./g, "").replace(",", ".")) || 0;
      const account = accounts.find((a: any) => a.id === accountId);
      if (account) {
        const delta = cashflowDirection === "revenue" ? amount : -amount;
        await supabase.from("financial_accounts").update({
          current_balance: account.current_balance + delta,
        }).eq("id", accountId);
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
    // Also delete related financial entries from this date forward
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

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{getDialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─── PRIMARY GROUP: Título, Descrição, Categoria, Projeto ─── */}
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
                <button
                  type="button"
                  onClick={() => setIsFavorite(!isFavorite)}
                  className="shrink-0 p-1 rounded hover:bg-accent/50 transition-colors"
                  title="Favoritar"
                >
                  <Star className={cn("h-5 w-5", isFavorite ? "fill-warning text-warning" : "text-muted-foreground")} />
                </button>
              </div>
            </div>

            <div>
              <Label className="text-sm">Descrição</Label>
              <Textarea value={displayDescription} onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional" rows={2} className="resize-none" />
            </div>

            <div>
              <Label className="text-sm">Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(eventType === "project" || eventType === "event" || eventType === "cashflow") && (
              <div>
                <Label className="text-sm">Projeto</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar projeto (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ─── SECONDARY GROUP: Type selector ─── */}
          {!item && (
            <div className="space-y-2 rounded-lg border border-border/30 p-3">
              <Label className="text-sm text-muted-foreground">Tipo de lançamento</Label>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => handleTypeChange(t.value)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                      eventType === t.value
                        ? "text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    style={eventType === t.value ? { backgroundColor: t.color } : {}}
                  >
                    {EVENT_TYPE_ICONS[t.value]}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── TERTIARY GROUP: Type-specific fields ─── */}
          {(item || true) && (
            <>
              {/* Cashflow: direction + amount + payment fields */}
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
                    <Label className="text-sm">Valor (R$)</Label>
                    <Input type="text" inputMode="decimal" placeholder="0,00" value={billAmount}
                      onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
                  </div>
                  {!item && recurrence === "none" && (
                    <div>
                      <Label className="text-sm">Parcelas</Label>
                      <Input type="number" placeholder="1" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-sm">Carteira</Label>
                      <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger className="text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Forma Pgto</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={isPaid} onCheckedChange={(c) => setIsPaid(!!c)} id="is-paid-central" />
                    <label htmlFor="is-paid-central" className="text-xs cursor-pointer">Marcar como pago</label>
                  </div>
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

              {/* Patrimônio fields */}
              {eventType === "patrimonio" && (
                <div className="space-y-3 rounded-lg border border-border/30 p-3">
                  <div>
                    <Label className="text-sm">Valor (R$)</Label>
                    <Input type="text" inputMode="decimal" placeholder="0,00" value={billAmount}
                      onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCashflowDirection("revenue")}
                      className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                        cashflowDirection === "revenue" ? "bg-[hsl(var(--success))] text-white" : "bg-muted text-muted-foreground"
                      )}
                    >Entrada</button>
                    <button
                      onClick={() => setCashflowDirection("expense")}
                      className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                        cashflowDirection === "expense" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >Saída</button>
                  </div>
                  <div>
                    <Label className="text-sm">Carteira</Label>
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger className="text-xs"><SelectValue placeholder="Selecionar conta" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

              {/* ─── Dates group ─── */}
              <div className="space-y-3 rounded-lg border border-border/30 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Checkbox checked={allDay} onCheckedChange={(c) => setAllDay(!!c)} id="allday" />
                  <Label htmlFor="allday" className="text-sm">Dia inteiro</Label>
                </div>

                {allDay ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-sm flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" /> Data início</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-sm">Data fim</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-sm flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" /> Data de início</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
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
                  </>
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

                {/* Weekly day selector */}
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

                {recurrence !== "none" && !item && (
                  <>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={recurrenceIndeterminate}
                        onCheckedChange={(c) => setRecurrenceIndeterminate(!!c)}
                        id="rec-indeterminate"
                      />
                      <Label htmlFor="rec-indeterminate" className="text-sm">Indeterminada</Label>
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
              </div>

              {/* ─── Lembrete ─── */}
              <div className="space-y-3 rounded-lg border border-border/30 p-3">
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
            </>
          )}
        </div>

        <div className="flex items-center gap-2 pt-4 border-t border-border/20">
          {item && (
            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete recurring event confirmation */}
    <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir evento recorrente</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Este evento faz parte de uma série recorrente. O que deseja excluir?
        </p>
        <div className="flex flex-col gap-2 pt-3 border-t border-border/20">
          <Button variant="outline" size="sm" onClick={handleDeleteSingle}>
            Este evento
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeleteFutureAndThis}>
            Este e eventos futuros
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteAll}>
            Todos os eventos
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
