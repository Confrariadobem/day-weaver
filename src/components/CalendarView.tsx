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
import { ChevronLeft, ChevronRight, Plus, MoreVertical, Search, CalendarDays, Calculator, Timer, Star } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

type ViewMode = "today" | "3days" | "weekly" | "monthly" | "yearly";
type CalendarFilter = "all" | "birthdays" | "events" | "holidays" | "cashflow" | "investments" | "projects" | "tasks";

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

export default function CalendarView() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [events, setEvents] = useState<Tables<"calendar_events">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
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
  const [activeFilters, setActiveFilters] = useState<CalendarFilter[]>(["all"]);
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [countdownName, setCountdownName] = useState("");
  const [countdownDate, setCountdownDate] = useState("");
  const [favoriteFilter, setFavoriteFilter] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [evRes, taskRes, finRes] = await Promise.all([
      supabase.from("calendar_events").select("*").eq("user_id", user.id).order("start_time"),
      supabase.from("tasks").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
    ]);
    if (evRes.data) setEvents(evRes.data);
    if (taskRes.data) setTasks(taskRes.data);
    if (finRes.data) setEntries(finRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    if (!user) return;
    const ch = supabase
      .channel("cal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    const linkedTaskIds = new Set(events.filter((e) => e.task_id).map((e) => e.task_id));
    tasks.forEach((t) => {
      if (t.scheduled_date && !linkedTaskIds.has(t.id)) {
        items.push({
          id: `task-${t.id}`, title: t.title,
          start_time: new Date(`${t.scheduled_date}T00:00:00`).toISOString(),
          all_day: true, color: "#f97316", description: t.description,
          task_id: t.id, user_id: t.user_id, is_task: true, is_completed: t.is_completed,
          is_favorite: t.is_favorite || false,
        });
      }
    });
    // Add Brazilian holidays - gray color
    const yearsToCheck = new Set<number>();
    yearsToCheck.add(currentDate.getFullYear());
    yearsToCheck.add(currentDate.getFullYear() - 1);
    yearsToCheck.add(currentDate.getFullYear() + 1);
    yearsToCheck.forEach(yr => {
      getBrazilianHolidays(yr).forEach(h => {
        items.push({
          id: `holiday-${h.name}-${yr}`, title: `🇧🇷 ${h.name}`,
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
  }, [events, tasks, currentDate, user]);

  const toggleFilter = (f: CalendarFilter) => {
    if (f === "all") {
      setActiveFilters(["all"]);
    } else {
      setActiveFilters(prev => {
        const without = prev.filter(x => x !== "all");
        const has = without.includes(f);
        const next = has ? without.filter(x => x !== f) : [...without, f];
        return next.length === 0 ? ["all"] : next;
      });
    }
  };

  const filteredItems = useMemo(() => {
    let result = calendarItems.filter(it => !it.is_completed);
    // Favorite filter
    if (favoriteFilter) {
      result = result.filter(it => it.is_favorite);
    }
    if (activeFilters.includes("all")) return result;
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
    { key: "today", label: "Dia" },
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

  const FILTER_OPTIONS: { key: CalendarFilter; label: string; color: string; icon: string }[] = [
    { key: "all", label: "Todos", color: "hsl(var(--primary))", icon: "" },
    { key: "birthdays", label: "Aniversários", color: "#ec4899", icon: "🎂" },
    { key: "events", label: "Eventos", color: "#3b82f6", icon: "📅" },
    { key: "holidays", label: "Feriados", color: "#6b7280", icon: "🏳️" },
    { key: "cashflow", label: "Fluxo de caixa", color: "#22c55e", icon: "💵" },
    { key: "investments", label: "Investimentos", color: "#d4a017", icon: "📈" },
    { key: "projects", label: "Projetos", color: "#eab308", icon: "📁" },
    { key: "tasks", label: "Tarefas", color: "#f97316", icon: "☑️" },
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
        {/* Mini finance bars */}
        <div className="flex items-center gap-2 mr-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <div className="h-2 rounded-full bg-[hsl(var(--success))]" style={{ width: `${Math.max(4, (viewFinSummary.rev / maxFinVal) * 60)}px` }} />
              <span className="text-[9px] text-[hsl(var(--success))]">{viewFinSummary.rev > 0 ? `+${(viewFinSummary.rev / 1000).toFixed(0)}k` : "0"}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 rounded-full bg-destructive" style={{ width: `${Math.max(4, (viewFinSummary.exp / maxFinVal) * 60)}px` }} />
              <span className="text-[9px] text-destructive">{viewFinSummary.exp > 0 ? `-${(viewFinSummary.exp / 1000).toFixed(0)}k` : "0"}</span>
            </div>
          </div>
          <div className={cn("text-[10px] font-semibold", viewFinSummary.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
            {viewFinSummary.balance >= 0 ? "+" : "-"}R${Math.abs(viewFinSummary.balance).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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

          <Button variant="outline" size="sm" className="h-8 text-sm" onClick={() => openNew(currentDate)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Novo
          </Button>

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
            <span className="text-muted-foreground whitespace-nowrap">{f.icon && <span className="mr-0.5">{f.icon}</span>}{f.label}</span>
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
      <span className="truncate">{item.title}</span>
      {item.is_favorite && <Star className="h-2.5 w-2.5 shrink-0 fill-warning text-warning" />}
      {!item.all_day && <span className="ml-auto shrink-0 opacity-70 text-xs">{format(new Date(item.start_time), "HH:mm")}</span>}
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
      <div className="flex-1 overflow-auto">
        {HOURS.map((h) => (
          <div key={h} className={cn("grid border-b border-border/10", days.length === 1 ? "grid-cols-[50px_1fr]" : `grid-cols-[50px_repeat(${days.length},1fr)]`)}>
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
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/30 p-3">
          <p className="text-xs text-muted-foreground">Receitas anuais</p>
          <p className="text-lg font-semibold text-[hsl(var(--success))]">{brlFmt(yearFin.rev)}</p>
        </div>
        <div className="rounded-lg border border-border/30 p-3">
          <p className="text-xs text-muted-foreground">Despesas anuais</p>
          <p className="text-lg font-semibold text-destructive">{brlFmt(yearFin.exp)}</p>
        </div>
        <div className="rounded-lg border border-border/30 p-3">
          <p className="text-xs text-muted-foreground">Saldo previsto</p>
          <p className={cn("text-lg font-semibold", yearFin.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brlFmt(yearFin.balance)}</p>
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
                      className="text-muted-foreground cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); setListDialog({ open: true, title: `Feriados - ${format(month, "MMMM", { locale: ptBR })}`, items: monthItems.filter(it => it.is_holiday) }); }}
                    >{holidayCount}🏳️</span>
                  )}
                  {eventCount > 0 && (
                    <span
                      className="text-primary cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); setListDialog({ open: true, title: `Eventos - ${format(month, "MMMM", { locale: ptBR })}`, items: monthItems.filter(it => !it.is_task && !it.is_holiday) }); }}
                    >{eventCount}📅</span>
                  )}
                  {taskCount > 0 && (
                    <span
                      className="text-orange-500 cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); setListDialog({ open: true, title: `Tarefas - ${format(month, "MMMM", { locale: ptBR })}`, items: monthItems.filter(it => it.is_task) }); }}
                    >{taskCount}☑️</span>
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
