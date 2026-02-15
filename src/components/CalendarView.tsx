import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isToday,
  isSameMonth,
  isSameDay,
  addDays,
  subDays,
  getISOWeek,
  startOfYear,
  endOfYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

type ViewMode = "today" | "3days" | "weekly" | "monthly" | "yearly";

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
    const items: CalendarItem[] = events.map((e) => ({
      ...e,
      is_task: !!e.task_id,
      is_completed: false,
    }));
    const linkedTaskIds = new Set(events.filter((e) => e.task_id).map((e) => e.task_id));
    tasks.forEach((t) => {
      if (t.scheduled_date && !linkedTaskIds.has(t.id)) {
        items.push({
          id: `task-${t.id}`,
          title: t.title,
          start_time: new Date(`${t.scheduled_date}T00:00:00`).toISOString(),
          all_day: true,
          color: "#8b5cf6",
          description: t.description,
          task_id: t.id,
          user_id: t.user_id,
          is_task: true,
          is_completed: t.is_completed,
        });
      }
    });
    return items;
  }, [events, tasks]);

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
    ? `Semana ${getISOWeek(currentDate)} • ${format(currentDate, "MMMM yyyy", { locale: ptBR })}`
    : format(currentDate, "MMMM yyyy", { locale: ptBR });

  // Financial summary for the current view period
  const viewFinSummary = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === "today") { start = currentDate; end = currentDate; }
    else if (viewMode === "3days") { start = currentDate; end = addDays(currentDate, 2); }
    else if (viewMode === "weekly") { start = startOfWeek(currentDate, { locale: ptBR }); end = addDays(start, 6); }
    else if (viewMode === "monthly") { start = startOfMonth(currentDate); end = endOfMonth(currentDate); }
    else { start = startOfYear(currentDate); end = endOfYear(currentDate); }
    return getFinancialSummary(start, end);
  }, [currentDate, viewMode, getFinancialSummary]);

  const brlFmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        {/* Financial summary - top left */}
        <div className="text-sm text-muted-foreground mr-2">
          Recurso previsto: <span className={cn("font-medium", viewFinSummary.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brlFmt(viewFinSummary.balance)}</span>
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

          <Button variant="outline" size="sm" className="h-8 text-sm" onClick={handleToday}>
            Hoje
          </Button>

          <Button variant="outline" size="sm" className="h-8 text-sm" onClick={() => openNew(currentDate)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Evento
          </Button>

          <div className="flex rounded-lg bg-muted p-0.5">
            {views.map((v) => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  viewMode === v.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "today" && (
          <HourlyDayView
            days={[currentDate]}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
          />
        )}
        {viewMode === "3days" && (
          <HourlyDayView
            days={[currentDate, addDays(currentDate, 1), addDays(currentDate, 2)]}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
          />
        )}
        {viewMode === "weekly" && (
          <HourlyWeekView
            date={currentDate}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
          />
        )}
        {viewMode === "monthly" && (
          <MonthlyGrid
            date={currentDate}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
          />
        )}
        {viewMode === "yearly" && (
          <YearlyView
            date={currentDate}
            items={calendarItems}
            entries={entries}
            tasks={tasks}
            getFinSummary={getFinancialSummary}
            onMonthClick={(d) => { setCurrentDate(d); setViewMode("monthly"); }}
          />
        )}
      </div>

      <EventEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editingItem}
        defaultDate={editDefaultDate}
        userId={user?.id || ""}
        onSaved={fetchData}
      />
    </div>
  );
}

/* ─── Shared ──────────────────────────────────────── */

interface HourlyViewProps {
  items: CalendarItem[];
  onDrop: (e: React.DragEvent, d: Date) => void;
  onToggle: (item: CalendarItem) => void;
  onClick: (item: CalendarItem) => void;
  onNewEvent: (d: Date) => void;
}

/* ─── Event Chip ──────────────────────────────────── */

function EventChip({ item, onToggle, onClick, compact }: { item: CalendarItem; onToggle: (i: CalendarItem) => void; onClick: (i: CalendarItem) => void; compact?: boolean }) {
  const completed = item.is_completed;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("event-id", item.id);
        e.dataTransfer.setData("task-title", item.title);
      }}
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm leading-snug transition-colors hover:brightness-110",
        completed && "opacity-50 line-through",
        compact ? "truncate" : ""
      )}
      style={{ backgroundColor: `${item.color || "#3b82f6"}20`, color: item.color || "#3b82f6" }}
    >
      {item.is_task && (
        <span onClick={(e) => { e.stopPropagation(); onToggle(item); }} className="shrink-0">
          <Checkbox checked={!!completed} className="h-3.5 w-3.5 border-current" />
        </span>
      )}
      {!item.is_task && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#3b82f6" }} />
      )}
      <span className="truncate">{item.title}</span>
      {!item.all_day && (
        <span className="ml-auto shrink-0 opacity-70 text-xs">{format(new Date(item.start_time), "HH:mm")}</span>
      )}
    </div>
  );
}

/* ─── Hourly Day View (Today & 3 Days) ─────────────── */

function HourlyDayView({ days, items, onDrop, onToggle, onClick, onNewEvent }: HourlyViewProps & { days: Date[] }) {
  return (
    <div className={cn("flex h-full", days.length === 1 ? "" : "")}>
      {/* Time gutter */}
      <div className="flex flex-col border-r border-border/20 pt-10">
        {HOURS.map((h) => (
          <div key={h} className="flex h-14 w-16 items-start justify-end pr-2">
            <span className="text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</span>
          </div>
        ))}
      </div>
      {/* Day columns */}
      <div className={cn("flex flex-1", days.length > 1 ? "divide-x divide-border/20" : "")}>
        {days.map((day) => {
          const allDayItems = items.filter((it) => isSameDay(new Date(it.start_time), day) && it.all_day);
          const timedItems = items.filter((it) => isSameDay(new Date(it.start_time), day) && !it.all_day);
          return (
            <div key={day.toISOString()} className="flex flex-1 flex-col">
              {/* Day header */}
              <div className={cn("flex items-center gap-2 px-3 py-2 border-b border-border/20", isToday(day) && "bg-primary/5")}>
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
                <button onClick={() => onNewEvent(day)} className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {/* All day events */}
              {allDayItems.length > 0 && (
                <div className="border-b border-border/20 px-2 py-1 space-y-0.5">
                  {allDayItems.map((it) => (
                    <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />
                  ))}
                </div>
              )}
              {/* Hourly grid */}
              <div className="flex-1 overflow-auto">
                {HOURS.map((h) => {
                  const hourItems = timedItems.filter((it) => new Date(it.start_time).getHours() === h);
                  const slotDate = new Date(day);
                  slotDate.setHours(h, 0, 0, 0);
                  return (
                    <div
                      key={h}
                      className="relative h-14 border-b border-border/10 px-2 hover:bg-accent/10 transition-colors"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDrop(e, slotDate)}
                      onClick={() => onNewEvent(slotDate)}
                    >
                      {hourItems.map((it) => (
                        <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Hourly Weekly View ─────────────────────────────── */

function HourlyWeekView({ date, items, onDrop, onToggle, onClick, onNewEvent }: HourlyViewProps & { date: Date }) {
  const weekStart = startOfWeek(date, { locale: ptBR });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const weekNum = getISOWeek(date);

  return (
    <div className="flex h-full flex-col">
      {/* Week header with day names */}
      <div className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-border/20">
        <div className="flex items-center justify-center text-xs text-muted-foreground/50">S{weekNum}</div>
        {days.map((day) => {
          const dayItems = items.filter((it) => isSameDay(new Date(it.start_time), day));
          return (
            <div key={day.toISOString()} className={cn("flex flex-col items-center py-2", isToday(day) && "bg-primary/5")}>
              <span className="text-xs uppercase text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</span>
              <span className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                isToday(day) ? "bg-primary text-primary-foreground" : ""
              )}>
                {format(day, "d")}
              </span>
              {dayItems.length > 0 && (
                <div className="mt-0.5 flex gap-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <span key={it.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: it.color || "#3b82f6" }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Hourly grid */}
      <div className="flex-1 overflow-auto">
        {HOURS.map((h) => (
          <div key={h} className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-border/10">
            <div className="flex h-14 items-start justify-end pr-2 pt-0.5">
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
                  {hourItems.map((it) => (
                    <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />
                  ))}
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
      {/* Weekday header */}
      <div className="grid grid-cols-[32px_repeat(7,1fr)] gap-px">
        <div />
        {weekDays.map((d) => (
          <div key={d} className="py-2 text-center text-sm font-medium text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex flex-1 flex-col gap-px">
        {weeks.map((week, wi) => {
          const weekNum = getISOWeek(week[0]);
          return (
            <div key={wi} className="grid min-h-[80px] flex-1 grid-cols-[32px_repeat(7,1fr)] gap-px">
              <div className="flex items-start justify-center pt-2">
                <span className="text-xs text-muted-foreground/40">{weekNum}</span>
              </div>
              {week.map((day) => {
                const dayItems = items.filter((it) => isSameDay(new Date(it.start_time), day));
                const hasDots = dayItems.length > 0;
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
                      {hasDots && (
                        <div className="flex gap-[2px]">
                          {dayItems.slice(0, 4).map((it) => (
                            <span key={it.id} className="h-[5px] w-[5px] rounded-full" style={{ backgroundColor: it.color || "#3b82f6" }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-0.5 space-y-[1px]">
                      {dayItems.slice(0, 3).map((it) => (
                        <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />
                      ))}
                      {dayItems.length > 3 && (
                        <span className="block text-center text-xs text-muted-foreground">+{dayItems.length - 3}</span>
                      )}
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

function YearlyView({ date, items, entries, tasks, getFinSummary, onMonthClick }: {
  date: Date;
  items: CalendarItem[];
  entries: any[];
  tasks: Tables<"tasks">[];
  getFinSummary: (s: Date, e: Date) => { rev: number; exp: number; balance: number };
  onMonthClick: (d: Date) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(date.getFullYear(), i, 1));
  const yearStart = startOfYear(date);
  const yearEnd = endOfYear(date);
  const yearFin = getFinSummary(yearStart, yearEnd);
  const totalTasks = tasks.filter(t => {
    if (!t.scheduled_date) return false;
    const d = new Date(t.scheduled_date);
    return d.getFullYear() === date.getFullYear();
  });
  const completedTasks = totalTasks.filter(t => t.is_completed);
  const brlFmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="h-full overflow-auto p-4">
      {/* Annual Dashboard */}
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
          <p className="text-lg font-semibold">{completedTasks.length}<span className="text-sm text-muted-foreground">/{totalTasks.length}</span></p>
        </div>
      </div>

      {/* Month cards */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {months.map((month) => {
          const mStart = startOfMonth(month);
          const mEnd = endOfMonth(month);
          const monthItems = items.filter((it) => {
            const d = new Date(it.start_time);
            return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
          });
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
                <span className="text-xs text-muted-foreground">{monthItems.length}</span>
              </div>

              <div className="grid grid-cols-7 gap-[2px]">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                  <span key={i} className="text-center text-[9px] text-muted-foreground">{d}</span>
                ))}
                {mDays.map((day, i) => {
                  const hasEvent = monthItems.some((it) => isSameDay(new Date(it.start_time), day));
                  return (
                    <span
                      key={i}
                      className={cn(
                        "text-center text-[10px] leading-4",
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
                    {fin.balance >= 0 ? "+" : ""}{brlFmt(fin.balance)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
