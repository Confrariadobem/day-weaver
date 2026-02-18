import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks,
  isToday, isSameMonth, isSameDay, addDays, subDays, getISOWeek,
  startOfYear, endOfYear, differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, MoreVertical, Search, CalendarDays, Calculator, Timer, Star, Cake, Flag, CircleDollarSign, TrendingUp, FolderKanban, CheckSquare, Repeat } from "lucide-react";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

type ViewMode = "today" | "3days" | "weekly" | "monthly" | "yearly";
type CalendarFilter = "birthdays" | "events" | "holidays" | "cashflow" | "investments" | "projects" | "tasks";

// Brazilian official holidays (fixed + calculated)
function getBrazilianHolidays(year: number): { date: Date; name: string }[] {
  const holidays: { date: Date; name: string }[] = [
    { date: new Date(year, 0, 1), name: "Confraternização Universal" },
    { date: new Date(year, 3, 21), name: "Tiradentes" },
    { date: new Date(year, 4, 1), name: "Dia do Trabalho" },
    { date: new Date(year, 8, 7), name: "Independência do Brasil" },
    { date: new Date(year, 9, 12), name: "Nossa Sra. Aparecida" },
    { date: new Date(year, 10, 2), name: "Finados" },
    { date: new Date(year, 10, 15), name: "Proclamação da República" },
    { date: new Date(year, 11, 25), name: "Natal" },
  ];
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month, day);
  const addDaysToDate = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  holidays.push(
    { date: addDaysToDate(easter, -48), name: "Segunda de Carnaval" },
    { date: addDaysToDate(easter, -47), name: "Terça de Carnaval" },
    { date: addDaysToDate(easter, -2), name: "Sexta-feira Santa" },
    { date: easter, name: "Páscoa" },
    { date: addDaysToDate(easter, 60), name: "Corpus Christi" },
  );
  return holidays;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getNextRecurrence(date: Date, type: string): Date {
  const d = new Date(date);
  switch (type) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "semiannual": d.setMonth(d.getMonth() + 6); break;
    case "annual": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export default function CalendarView() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [events, setEvents] = useState<Tables<"calendar_events">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [editDefaultDate, setEditDefaultDate] = useState<Date>(new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [gotoDateOpen, setGotoDateOpen] = useState(false);
  const [gotoDate, setGotoDate] = useState("");
  const [calcDateOpen, setCalcDateOpen] = useState(false);
  const [calcFrom, setCalcFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [calcTo, setCalcTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeFilters, setActiveFilters] = useState<CalendarFilter[]>(["birthdays", "events", "holidays", "cashflow", "investments", "projects", "tasks"]);
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [countdownName, setCountdownName] = useState("");
  const [countdownDate, setCountdownDate] = useState("");
  const [favoriteFilter, setFavoriteFilter] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [evRes, taskRes, finRes, invRes] = await Promise.all([
      supabase.from("calendar_events").select("*").eq("user_id", user.id).order("start_time"),
      supabase.from("tasks").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id).eq("is_active", true),
    ]);
    if (evRes.data) setEvents(evRes.data);
    if (taskRes.data) setTasks(taskRes.data);
    if (finRes.data) setEntries(finRes.data);
    if (invRes.data) setInvestments(invRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    if (!user) return;
    const ch = supabase
      .channel("cal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries", filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();
    const handleDataChanged = () => fetchData();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => { supabase.removeChannel(ch); window.removeEventListener("lovable:data-changed", handleDataChanged); };
  }, [user, fetchData]);

  const calendarItems = useMemo(() => {
    const items: CalendarItem[] = events.map((e) => {
      const desc = e.description || "";
      const isBirthday = desc.includes("[tipo:birthday]");
      const isProject = desc.includes("[tipo:project]");
      const isCashflow = desc.includes("[tipo:bill]") || desc.includes("[tipo:receivable]") || desc.includes("[tipo:cashflow]");
      const isInvestment = desc.includes("[tipo:investment]");
      const isFavorite = desc.includes("[favorito:true]");
      return {
        ...e, is_task: !!e.task_id, is_completed: false,
        is_project: isProject, is_finance: isCashflow, is_cashflow: isCashflow,
        is_birthday: isBirthday, is_investment: isInvestment, is_favorite: isFavorite,
      };
    });

    // Tasks with scheduled_date (not already linked to a calendar event)
    const linkedTaskIds = new Set(events.filter((e) => e.task_id).map((e) => e.task_id));
    tasks.forEach((t) => {
      if (t.scheduled_date && !linkedTaskIds.has(t.id)) {
        const isProjectTask = !!t.project_id;
        items.push({
          id: `task-${t.id}`, title: t.title,
          start_time: new Date(`${t.scheduled_date}T00:00:00`).toISOString(),
          all_day: true,
          color: isProjectTask ? "#3b82f6" : "#f97316",
          description: t.description,
          task_id: t.id, user_id: t.user_id, is_task: true, is_completed: t.is_completed,
          is_favorite: t.is_favorite || false,
          is_project: isProjectTask,
        });
      }
    });

    // Financial entries as calendar events (auto-generated, read-only visualization)
    entries.forEach((fe: any) => {
      if (!fe.entry_date) return;
      const isExpense = fe.type === "expense";
      const isRevenue = fe.type === "revenue";
      const isInvestment = fe.type === "investment";
      const amount = Number(fe.amount || 0);
      const amountLabel = amount > 0 ? ` R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";
      const color = isInvestment ? "#a855f7" : isExpense ? "#ef4444" : "#22c55e";
      const recLabel = fe.recurrence_type ? " ↻" : "";
      items.push({
        id: `fin-${fe.id}`,
        title: `${fe.title}${amountLabel}${recLabel}`,
        start_time: new Date(`${fe.entry_date}T00:00:00`).toISOString(),
        all_day: true,
        color,
        description: fe.project_id ? `[tipo:cashflow] Projeto vinculado` : `[tipo:cashflow]`,
        user_id: fe.user_id,
        is_task: false,
        is_cashflow: true,
        is_finance: true,
        is_investment: isInvestment,
        is_project: !!fe.project_id,
        is_favorite: false,
      });

      // Generate recurrent entries
      if (fe.recurrence_type) {
        const baseDate = new Date(`${fe.entry_date}T00:00:00`);
        const endDate = fe.recurrence_end_date ? new Date(`${fe.recurrence_end_date}T00:00:00`) : addMonths(baseDate, 12);
        let nextDate = getNextRecurrence(baseDate, fe.recurrence_type);
        let idx = 1;
        while (nextDate <= endDate && idx < 60) {
          items.push({
            id: `fin-rec-${fe.id}-${idx}`,
            title: `↻ ${fe.title}${amountLabel}`,
            start_time: nextDate.toISOString(),
            all_day: true,
            color,
            description: `[tipo:cashflow] Recorrente`,
            user_id: fe.user_id,
            is_task: false,
            is_cashflow: true,
            is_finance: true,
            is_investment: isInvestment,
            is_project: !!fe.project_id,
            is_favorite: false,
          });
          nextDate = getNextRecurrence(nextDate, fe.recurrence_type);
          idx++;
        }
      }
    });

    // Investment events (purchase + next dividend)
    investments.forEach((inv: any) => {
      if (inv.purchase_date) {
        const amount = Number(inv.purchase_price || 0) * Number(inv.quantity || 0);
        const amountLabel = amount > 0 ? ` R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";
        items.push({
          id: `inv-buy-${inv.id}`,
          title: `Aporte: ${inv.name}${inv.ticker ? ` (${inv.ticker})` : ""}${amountLabel}`,
          start_time: new Date(`${inv.purchase_date}T00:00:00`).toISOString(),
          all_day: true,
          color: "#a855f7",
          description: `[tipo:investment] Aporte ${inv.type}`,
          user_id: inv.user_id,
          is_task: false,
          is_investment: true,
          is_favorite: false,
        });
      }
      if (inv.next_dividend_date && Number(inv.dividend_amount || 0) > 0) {
        const divLabel = ` R$ ${Number(inv.dividend_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        items.push({
          id: `inv-div-${inv.id}`,
          title: `Dividendos ${inv.ticker || inv.name}${divLabel}`,
          start_time: new Date(`${inv.next_dividend_date}T00:00:00`).toISOString(),
          all_day: true,
          color: "#a855f7",
          description: `[tipo:investment] Dividendo`,
          user_id: inv.user_id,
          is_task: false,
          is_investment: true,
          is_favorite: false,
        });
      }
    });

    // Brazilian holidays
    const yearsToCheck = new Set<number>();
    yearsToCheck.add(currentDate.getFullYear());
    yearsToCheck.add(currentDate.getFullYear() - 1);
    yearsToCheck.add(currentDate.getFullYear() + 1);
    yearsToCheck.forEach(yr => {
      getBrazilianHolidays(yr).forEach(h => {
        items.push({
          id: `holiday-${h.name}-${yr}`, title: h.name,
          start_time: h.date.toISOString(),
          all_day: true, color: "#6b7280", description: "Feriado oficial do Brasil",
          user_id: user?.id || "", is_task: false, is_holiday: true,
        });
      });
    });

    items.sort((a, b) => {
      const dayA = a.start_time.slice(0, 10);
      const dayB = b.start_time.slice(0, 10);
      if (dayA !== dayB) return dayA.localeCompare(dayB);
      if (a.is_holiday && !b.is_holiday) return -1;
      if (!a.is_holiday && b.is_holiday) return 1;
      return 0;
    });
    return items;
  }, [events, tasks, entries, investments, currentDate, user]);

  const toggleFilter = (f: CalendarFilter) => {
    setActiveFilters(prev => {
      const has = prev.includes(f);
      const next = has ? prev.filter(x => x !== f) : [...prev, f];
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    let result = calendarItems.filter(it => !it.is_completed);
    if (favoriteFilter) {
      result = result.filter(it => it.is_favorite);
    }
    if (activeFilters.length === 0) return result;
    return result.filter(it => {
      if (activeFilters.includes("birthdays") && it.is_birthday) return true;
      if (activeFilters.includes("events") && !it.is_task && !it.is_holiday && !it.is_birthday && !it.is_cashflow && !it.is_investment && !it.is_project) return true;
      if (activeFilters.includes("holidays") && it.is_holiday) return true;
      if (activeFilters.includes("cashflow") && it.is_cashflow) return true;
      if (activeFilters.includes("investments") && it.is_investment) return true;
      if (activeFilters.includes("projects") && it.is_project) return true;
      if (activeFilters.includes("tasks") && it.is_task) return true;
      return false;
    });
  }, [calendarItems, activeFilters, favoriteFilter]);

  const getFinancialSummary = useCallback((startDate: Date, endDate: Date) => {
    const rev = entries.filter((e) => {
      const d = new Date(e.entry_date);
      return e.type === "revenue" && d >= startDate && d <= endDate;
    }).reduce((s: number, e: any) => s + Number(e.amount), 0);
    const exp = entries.filter((e) => {
      const d = new Date(e.entry_date);
      return e.type === "expense" && d >= startDate && d <= endDate;
    }).reduce((s: number, e: any) => s + Number(e.amount), 0);
    return { rev, exp, balance: rev - exp };
  }, [entries]);

  const handleDrop = async (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("task-id");
    const taskTitle = e.dataTransfer.getData("task-title");
    const eventId = e.dataTransfer.getData("event-id");
    if (eventId) {
      await supabase.from("calendar_events").update({ start_time: date.toISOString() }).eq("id", eventId);
      const ev = events.find((ev) => ev.id === eventId);
      if (ev?.task_id) {
        await supabase.from("tasks").update({ scheduled_date: format(date, "yyyy-MM-dd") }).eq("id", ev.task_id);
      }
      fetchData();
      return;
    }
    if (!taskId || !user) return;
    await supabase.from("calendar_events").insert({
      user_id: user.id, task_id: taskId, title: taskTitle,
      start_time: date.toISOString(), all_day: true,
    });
    await supabase.from("tasks").update({ scheduled_date: format(date, "yyyy-MM-dd") }).eq("id", taskId);
    fetchData();
  };

  const toggleComplete = async (item: CalendarItem) => {
    if (item.task_id) {
      const realTaskId = item.id.startsWith("task-") ? item.task_id : item.task_id;
      const task = tasks.find((t) => t.id === realTaskId);
      if (task) {
        await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", realTaskId);
        fetchData();
      }
    }
  };

  const openEdit = (item: CalendarItem) => {
    if (item.id.startsWith("task-")) {
      setEditingItem(null);
      setEditDefaultDate(new Date(item.start_time));
    } else {
      setEditingItem(item);
    }
    setEditDialogOpen(true);
  };

  const openNew = (date: Date) => {
    setEditingItem(null);
    setEditDefaultDate(date);
    setEditDialogOpen(true);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setViewMode("today");
  };

  const nav = (dir: -1 | 1) => {
    if (viewMode === "monthly") setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === "weekly") setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else if (viewMode === "yearly") setCurrentDate(dir === 1 ? addMonths(currentDate, 12) : subMonths(currentDate, 12));
    else setCurrentDate(dir === 1 ? addDays(currentDate, viewMode === "3days" ? 3 : 1) : subDays(currentDate, viewMode === "3days" ? 3 : 1));
  };

  const views: { key: ViewMode; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "3days", label: "3 Dias" },
    { key: "weekly", label: "Semana" },
    { key: "monthly", label: "Mês" },
    { key: "yearly", label: "Ano" },
  ];

  const headerLabel = viewMode === "yearly"
    ? format(currentDate, "yyyy")
    : viewMode === "weekly"
    ? `S${getISOWeek(currentDate)} • ${format(currentDate, "MMMM yyyy", { locale: ptBR })}`
    : format(currentDate, "MMMM yyyy", { locale: ptBR });

  const viewFinSummary = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === "today") { start = currentDate; end = currentDate; }
    else if (viewMode === "3days") { start = currentDate; end = addDays(currentDate, 2); }
    else if (viewMode === "weekly") { start = startOfWeek(currentDate, { locale: ptBR }); end = addDays(start, 6); }
    else if (viewMode === "monthly") { start = startOfMonth(currentDate); end = endOfMonth(currentDate); }
    else { start = startOfYear(currentDate); end = endOfYear(currentDate); }
    return getFinancialSummary(start, end);
  }, [currentDate, viewMode, getFinancialSummary]);

  const FILTER_OPTIONS: { key: CalendarFilter; label: string; color: string; icon: React.ReactNode }[] = [
    { key: "birthdays", label: "Aniversários", color: "#ec4899", icon: <Cake className="h-3 w-3" /> },
    { key: "events", label: "Eventos", color: "#3b82f6", icon: <CalendarDays className="h-3 w-3" /> },
    { key: "holidays", label: "Feriados", color: "#6b7280", icon: <Flag className="h-3 w-3" /> },
    { key: "cashflow", label: "Fluxo de caixa", color: "#22c55e", icon: <CircleDollarSign className="h-3 w-3" /> },
    { key: "investments", label: "Investimentos", color: "#d4a017", icon: <TrendingUp className="h-3 w-3" /> },
    { key: "projects", label: "Projetos", color: "#eab308", icon: <FolderKanban className="h-3 w-3" /> },
    { key: "tasks", label: "Tarefas", color: "#f97316", icon: <CheckSquare className="h-3 w-3" /> },
  ];

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return calendarItems.filter(it => it.title.toLowerCase().includes(q)).slice(0, 10);
  }, [searchQuery, calendarItems]);

  const calcDays = useMemo(() => {
    if (!calcFrom || !calcTo) return null;
    return differenceInDays(new Date(calcTo), new Date(calcFrom));
  }, [calcFrom, calcTo]);

  // Mini finance bars for calendar header
  const maxFinVal = Math.max(viewFinSummary.rev, viewFinSummary.exp, 1);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        {/* Bullet Chart - weekly cash flow */}
        <div className="flex items-center gap-3 mr-2" style={{ width: 180, height: 40 }}>
          <div className="flex-1 relative h-full flex flex-col justify-center gap-0.5">
            <div className="relative h-3 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-[hsl(var(--success))]"
                style={{ width: `${Math.min(100, (viewFinSummary.rev / maxFinVal) * 100)}%` }}
              />
              <div
                className="absolute top-0 h-full w-[2px] bg-destructive"
                style={{ left: `${Math.min(100, (viewFinSummary.exp / maxFinVal) * 100)}%` }}
              />
            </div>
            <span className={cn(
              "text-[11px] font-bold tabular-nums",
              viewFinSummary.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
            )}>
              {brl(viewFinSummary.balance)}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="min-w-[180px] text-center text-base font-semibold capitalize">{headerLabel}</h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex rounded-lg bg-muted p-0.5">
            {views.map((v) => (
              <button
                key={v.key}
                onClick={() => {
                  if (v.key === "today") setCurrentDate(new Date());
                  setViewMode(v.key);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === v.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>




          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", favoriteFilter ? "text-warning" : "text-muted-foreground")}
            onClick={() => setFavoriteFilter(!favoriteFilter)}
            title="Filtrar favoritos"
          >
            <Star className={cn("h-4 w-4", favoriteFilter && "fill-warning")} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSearchOpen(true)}>
                <Search className="mr-2 h-4 w-4" /> Pesquisar eventos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGotoDateOpen(true)}>
                <CalendarDays className="mr-2 h-4 w-4" /> Ir para data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCalcDateOpen(true)}>
                <Calculator className="mr-2 h-4 w-4" /> Calcular data
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCountdownOpen(true)}>
                <Timer className="mr-2 h-4 w-4" /> Contagem regressiva
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/20 overflow-x-auto">
        {FILTER_OPTIONS.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 cursor-pointer text-sm shrink-0">
            <Checkbox
              checked={activeFilters.includes(f.key)}
              onCheckedChange={() => toggleFilter(f.key)}
              className="h-3.5 w-3.5"
              style={{ borderColor: f.color, ...(activeFilters.includes(f.key) ? { backgroundColor: f.color } : {}) }}
            />
            <span className="text-muted-foreground whitespace-nowrap flex items-center gap-1">{f.icon}{f.label}</span>
          </label>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "today" && <HourlyDayView days={[currentDate]} items={filteredItems} onDrop={handleDrop} onToggle={toggleComplete} onClick={openEdit} onNewEvent={openNew} />}
        {viewMode === "3days" && <HourlyDayView days={[currentDate, addDays(currentDate, 1), addDays(currentDate, 2)]} items={filteredItems} onDrop={handleDrop} onToggle={toggleComplete} onClick={openEdit} onNewEvent={openNew} />}
        {viewMode === "weekly" && <HourlyWeekView date={currentDate} items={filteredItems} onDrop={handleDrop} onToggle={toggleComplete} onClick={openEdit} onNewEvent={openNew} />}
        {viewMode === "monthly" && <MonthlyGrid date={currentDate} items={filteredItems} onDrop={handleDrop} onToggle={toggleComplete} onClick={openEdit} onNewEvent={openNew} />}
        {viewMode === "yearly" && <YearlyView date={currentDate} items={filteredItems} entries={entries} tasks={tasks} getFinSummary={getFinancialSummary} onMonthClick={(d) => { setCurrentDate(d); setViewMode("monthly"); }} onEditItem={openEdit} />}
      </div>

      <EventEditDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} item={editingItem} defaultDate={editDefaultDate} userId={user?.id || ""} onSaved={fetchData} />

      {/* Search dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pesquisar Eventos</DialogTitle></DialogHeader>
          <Input placeholder="Digite para buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
          <div className="max-h-60 overflow-auto space-y-1">
            {searchResults.map((it) => (
              <div key={it.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted/30 cursor-pointer" onClick={() => {
                setCurrentDate(new Date(it.start_time));
                setSearchOpen(false);
                setSearchQuery("");
              }}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color || "#3b82f6" }} />
                <span className="text-sm flex-1 truncate">{it.title}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(it.start_time), "dd/MM/yy")}</span>
              </div>
            ))}
            {searchQuery && searchResults.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Go to date dialog */}
      <Dialog open={gotoDateOpen} onOpenChange={setGotoDateOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Ir para Data</DialogTitle></DialogHeader>
          <Input type="date" value={gotoDate} onChange={(e) => setGotoDate(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setGotoDateOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => { if (gotoDate) { setCurrentDate(new Date(gotoDate)); setGotoDateOpen(false); } }}>Ir</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Date calculator dialog */}
      <Dialog open={calcDateOpen} onOpenChange={setCalcDateOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Calcular Dias</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">De</label>
              <Input type="date" value={calcFrom} onChange={(e) => setCalcFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Até</label>
              <Input type="date" value={calcTo} onChange={(e) => setCalcTo(e.target.value)} />
            </div>
            {calcDays !== null && (
              <p className="text-center text-lg font-bold">{Math.abs(calcDays)} dias</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Countdown dialog */}
      <Dialog open={countdownOpen} onOpenChange={setCountdownOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Contagem Regressiva</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome do evento" value={countdownName} onChange={(e) => setCountdownName(e.target.value)} />
            <Input type="date" value={countdownDate} onChange={(e) => setCountdownDate(e.target.value)} />
            {countdownDate && (
              <div className="text-center">
                <p className="text-3xl font-bold">{Math.abs(differenceInDays(new Date(countdownDate), new Date()))}</p>
                <p className="text-sm text-muted-foreground">
                  {differenceInDays(new Date(countdownDate), new Date()) >= 0 ? "dias restantes" : "dias atrás"}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Event Chip ──────────────────────────────────── */

interface HourlyViewProps {
  items: CalendarItem[];
  onDrop: (e: React.DragEvent, d: Date) => void;
  onToggle: (item: CalendarItem) => void;
  onClick: (item: CalendarItem) => void;
  onNewEvent: (d: Date) => void;
}

function EventChip({ item, onToggle, onClick, compact }: { item: CalendarItem; onToggle: (i: CalendarItem) => void; onClick: (i: CalendarItem) => void; compact?: boolean }) {
  const completed = item.is_completed;
  const hasRecurrence = item.recurrence_rule || item.title.includes("↻");
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("event-id", item.id); e.dataTransfer.setData("task-title", item.title); }}
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm leading-snug transition-colors hover:brightness-110",
        completed && "opacity-50 line-through", compact ? "truncate" : ""
      )}
      style={{ backgroundColor: `${item.color || "#3b82f6"}20`, color: item.color || "#3b82f6" }}
    >
      {item.is_task && (
        <span onClick={(e) => { e.stopPropagation(); onToggle(item); }} className="shrink-0">
          <Checkbox checked={!!completed} className="h-3.5 w-3.5 border-current" />
        </span>
      )}
      {!item.is_task && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#3b82f6" }} />}
      <span className="truncate">{item.title.replace(/^↻\s*/, "")}</span>
      {item.is_favorite && <Star className="h-2.5 w-2.5 shrink-0 fill-warning text-warning" />}
      {hasRecurrence && <Repeat className="h-2.5 w-2.5 shrink-0 ml-auto opacity-70" />}
      {!item.all_day && !hasRecurrence && <span className="ml-auto shrink-0 opacity-70 text-xs">{format(new Date(item.start_time), "HH:mm")}</span>}
    </div>
  );
}

/* ─── Hourly Day View ─── */

function HourlyDayView({ days, items, onDrop, onToggle, onClick, onNewEvent }: HourlyViewProps & { days: Date[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("grid border-b border-border/20", days.length === 1 ? "grid-cols-[50px_1fr]" : `grid-cols-[50px_repeat(${days.length},1fr)]`)}>
        <div />
        {days.map((day) => (
          <div key={day.toISOString()} className={cn("flex items-center gap-2 px-3 py-2", isToday(day) && "bg-primary/5")}>
            <span className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
              isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
            )}>
              {format(day, "d")}
            </span>
            <div>
              <p className="text-sm font-medium capitalize">{format(day, "EEEE", { locale: ptBR })}</p>
              <p className="text-xs text-muted-foreground">{format(day, "d MMM yyyy", { locale: ptBR })}</p>
            </div>
          </div>
        ))}
      </div>

      {/* All-day section */}
      {days.some(day => items.some(it => isSameDay(new Date(it.start_time), day) && it.all_day)) && (
        <div className={cn("grid border-b border-border/20", days.length === 1 ? "grid-cols-[50px_1fr]" : `grid-cols-[50px_repeat(${days.length},1fr)]`)}>
          <div className="flex items-center justify-end pr-2 text-xs text-muted-foreground">Dia</div>
          {days.map((day) => {
            const allDayItems = items.filter((it) => isSameDay(new Date(it.start_time), day) && it.all_day);
            return (
              <div key={day.toISOString()} className="px-1 py-1 space-y-0.5">
                {allDayItems.map((it) => <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />)}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable hourly grid */}
      <div className="flex-1 overflow-auto relative">
        {HOURS.map((h) => {
          const now = new Date();
          const isCurrentHour = days.some(d => isToday(d)) && now.getHours() === h;
          const minuteOffset = now.getMinutes();
          return (
          <div key={h} className={cn("grid border-b border-border/10 relative", days.length === 1 ? "grid-cols-[50px_1fr]" : `grid-cols-[50px_repeat(${days.length},1fr)]`)}>
            <div className="flex h-14 items-start justify-end pr-2 pt-0.5 sticky left-0 bg-background z-10">
              <span className="text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
            </div>
            {days.map((day) => {
              const hourItems = items.filter((it) => {
                const d = new Date(it.start_time);
                return isSameDay(d, day) && !it.all_day && d.getHours() === h;
              });
              const slotDate = new Date(day);
              slotDate.setHours(h, 0, 0, 0);
              const showTimeLine = isToday(day) && isCurrentHour;
              return (
                <div
                  key={day.toISOString()}
                  className="h-14 border-l border-border/10 px-0.5 hover:bg-accent/10 transition-colors relative"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, slotDate)}
                  onClick={() => onNewEvent(slotDate)}
                >
                  {showTimeLine && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${(minuteOffset / 60) * 100}%` }}>
                      <div className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-destructive shrink-0 -ml-1" />
                        <div className="h-[2px] w-full bg-destructive" />
                      </div>
                    </div>
                  )}
                  {hourItems.map((it) => <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />)}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Hourly Weekly View ─── */

function HourlyWeekView({ date, items, onDrop, onToggle, onClick, onNewEvent }: HourlyViewProps & { date: Date }) {
  const weekStart = startOfWeek(date, { locale: ptBR });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const weekNum = getISOWeek(date);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-border/20">
        <div className="flex items-center justify-center text-xs text-muted-foreground/50">S{weekNum}</div>
        {days.map((day) => (
          <div key={day.toISOString()} className={cn("flex flex-col items-center py-2 cursor-pointer hover:bg-accent/10", isToday(day) && "bg-primary/5")}
            onClick={() => onNewEvent(day)}>
            <span className="text-xs uppercase text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</span>
            <span className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
              isToday(day) ? "bg-primary text-primary-foreground" : ""
            )}>
              {format(day, "d")}
            </span>
          </div>
        ))}
      </div>

      {days.some(day => items.some(it => isSameDay(new Date(it.start_time), day) && it.all_day)) && (
        <div className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-border/20">
          <div className="flex items-center justify-end pr-2 text-xs text-muted-foreground">Dia</div>
          {days.map((day) => {
            const allDayItems = items.filter((it) => isSameDay(new Date(it.start_time), day) && it.all_day);
            return (
              <div key={day.toISOString()} className="px-1 py-1 space-y-0.5 border-l border-border/10">
                {allDayItems.slice(0, 3).map((it) => <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />)}
                {allDayItems.length > 3 && <span className="block text-center text-xs text-muted-foreground">+{allDayItems.length - 3}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {HOURS.map((h) => (
          <div key={h} className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-border/10">
            <div className="flex h-14 items-start justify-end pr-2 pt-0.5 sticky left-0 bg-background z-10">
              <span className="text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
            </div>
            {days.map((day) => {
              const hourItems = items.filter((it) => {
                const d = new Date(it.start_time);
                return isSameDay(d, day) && !it.all_day && d.getHours() === h;
              });
              const slotDate = new Date(day);
              slotDate.setHours(h, 0, 0, 0);
              return (
                <div
                  key={day.toISOString()}
                  className="h-14 border-l border-border/10 px-0.5 hover:bg-accent/10 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, slotDate)}
                  onClick={() => onNewEvent(slotDate)}
                >
                  {hourItems.map((it) => <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Monthly Grid ──────────────────────────────────── */

function MonthlyGrid({ date, items, onDrop, onToggle, onClick, onNewEvent }: HourlyViewProps & { date: Date }) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="flex h-full flex-col px-1">
      <div className="grid grid-cols-[32px_repeat(7,1fr)] gap-px">
        <div />
        {weekDays.map((d) => (
          <div key={d} className="py-2 text-center text-sm font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-px">
        {weeks.map((week, wi) => {
          const weekNum = getISOWeek(week[0]);
          return (
            <div key={wi} className="grid min-h-[80px] flex-1 grid-cols-[32px_repeat(7,1fr)] gap-px">
              <div className="flex items-start justify-center pt-2">
                <span className="text-xs text-muted-foreground/40">S{weekNum}</span>
              </div>
              {week.map((day) => {
                const dayItems = items.filter((it) => isSameDay(new Date(it.start_time), day));
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "group relative cursor-pointer rounded-md p-1 transition-colors hover:bg-accent/30",
                      !isSameMonth(day, date) && "opacity-30",
                      isToday(day) && "bg-primary/5"
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, day)}
                    onClick={() => onNewEvent(day)}
                  >
                    <div className="flex items-center justify-between px-0.5">
                      <span className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                        isToday(day) ? "bg-primary text-primary-foreground" : ""
                      )}>
                        {format(day, "d")}
                      </span>
                      {dayItems.length > 0 && (
                        <div className="flex gap-[2px]">
                          {dayItems.slice(0, 4).map((it) => (
                            <span key={it.id} className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: it.color || "#3b82f6" }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-0.5 space-y-[1px]">
                      {dayItems.slice(0, 3).map((it) => <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />)}
                      {dayItems.length > 3 && <span className="block text-center text-xs text-muted-foreground">+{dayItems.length - 3}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Yearly View ───────────────────────────────────── */

function YearlyView({ date, items, entries, tasks, getFinSummary, onMonthClick, onEditItem }: {
  date: Date; items: CalendarItem[]; entries: any[]; tasks: Tables<"tasks">[];
  getFinSummary: (s: Date, e: Date) => { rev: number; exp: number; balance: number };
  onMonthClick: (d: Date) => void;
  onEditItem: (item: CalendarItem) => void;
}) {
  const [listDialog, setListDialog] = useState<{ open: boolean; title: string; items: CalendarItem[] }>({ open: false, title: "", items: [] });
  const months = Array.from({ length: 12 }, (_, i) => new Date(date.getFullYear(), i, 1));
  const yearStart = startOfYear(date);
  const yearEnd = endOfYear(date);
  const yearFin = getFinSummary(yearStart, yearEnd);
  const totalTasks = tasks.filter(t => {
    if (!t.scheduled_date) return false;
    return new Date(t.scheduled_date).getFullYear() === date.getFullYear();
  });
  const completedTasks = totalTasks.filter(t => t.is_completed);
  const brlFmt = (v: number) => {
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (v < 0) return `- R$ ${formatted}`;
    if (v > 0) return `+ R$ ${formatted}`;
    return `R$ ${formatted}`;
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border/30 p-3">
          <p className="text-xs text-muted-foreground">Eventos do ano</p>
          <p className="text-lg font-semibold">{items.filter(it => !it.is_holiday && new Date(it.start_time).getFullYear() === date.getFullYear()).length}</p>
        </div>
        <div className="rounded-lg border border-border/30 p-3">
          <p className="text-xs text-muted-foreground">Tarefas anuais</p>
          <p className="text-lg font-semibold">
            <span className="text-[hsl(var(--success))]">{completedTasks.length}</span>
            <span className="text-muted-foreground">/{totalTasks.length}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {months.map((month) => {
          const mStart = startOfMonth(month);
          const mEnd = endOfMonth(month);
          const monthItems = items.filter((it) => {
            const d = new Date(it.start_time);
            return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
          });
          const holidayCount = monthItems.filter(it => it.is_holiday).length;
          const taskCount = monthItems.filter(it => it.is_task).length;
          const eventCount = monthItems.filter(it => !it.is_task && !it.is_holiday).length;
          const fin = getFinSummary(mStart, mEnd);
          const mDays = eachDayOfInterval({ start: startOfWeek(mStart, { locale: ptBR }), end: endOfWeek(mEnd, { locale: ptBR }) });

          return (
            <div
              key={month.toISOString()}
              className="cursor-pointer rounded-lg border border-border/30 p-3 transition-colors hover:bg-accent/20"
              onClick={() => onMonthClick(month)}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold capitalize">{format(month, "MMMM", { locale: ptBR })}</span>
                <div className="flex gap-1.5 text-xs">
                  {holidayCount > 0 && (
                    <span
                      className="text-muted-foreground cursor-pointer hover:underline flex items-center gap-0.5"
                      onClick={(e) => { e.stopPropagation(); setListDialog({ open: true, title: `Feriados - ${format(month, "MMMM", { locale: ptBR })}`, items: monthItems.filter(it => it.is_holiday) }); }}
                    >{holidayCount}<Flag className="h-3 w-3" /></span>
                  )}
                  {eventCount > 0 && (
                    <span
                      className="text-primary cursor-pointer hover:underline flex items-center gap-0.5"
                      onClick={(e) => { e.stopPropagation(); setListDialog({ open: true, title: `Eventos - ${format(month, "MMMM", { locale: ptBR })}`, items: monthItems.filter(it => !it.is_task && !it.is_holiday) }); }}
                    >{eventCount}<CalendarDays className="h-3 w-3" /></span>
                  )}
                  {taskCount > 0 && (
                    <span
                      className="text-orange-500 cursor-pointer hover:underline flex items-center gap-0.5"
                      onClick={(e) => { e.stopPropagation(); setListDialog({ open: true, title: `Tarefas - ${format(month, "MMMM", { locale: ptBR })}`, items: monthItems.filter(it => it.is_task) }); }}
                    >{taskCount}<CheckSquare className="h-3 w-3" /></span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-[2px]">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <span key={i} className="text-center text-[10px] text-muted-foreground">{d}</span>
                ))}
                {mDays.map((day, i) => {
                  const hasEvent = monthItems.some((it) => isSameDay(new Date(it.start_time), day));
                  return (
                    <span
                      key={i}
                      className={cn(
                        "text-center text-[11px] leading-5",
                        !isSameMonth(day, month) && "opacity-20",
                        isToday(day) && "rounded-full bg-primary text-primary-foreground font-bold",
                        hasEvent && !isToday(day) && "font-bold text-primary"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  );
                })}
              </div>

              {(fin.rev > 0 || fin.exp > 0) && (
                <div className="mt-2 text-xs">
                  <span className={cn(fin.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                    {brlFmt(fin.balance)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={listDialog.open} onOpenChange={(o) => setListDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="capitalize">{listDialog.title}</DialogTitle></DialogHeader>
          <div className="max-h-60 overflow-auto space-y-1">
            {listDialog.items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted/30 cursor-pointer"
                onClick={() => {
                  if (!it.is_holiday) {
                    onEditItem(it);
                    setListDialog(prev => ({ ...prev, open: false }));
                  }
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color || "#3b82f6" }} />
                <span className="text-sm flex-1 truncate">{it.title}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(it.start_time), "dd/MM")}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
