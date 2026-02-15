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
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

type ViewMode = "today" | "3days" | "weekly" | "monthly" | "yearly";

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

  // Merge events + scheduled tasks into a unified list
  const calendarItems = useMemo(() => {
    const items: CalendarItem[] = events.map((e) => ({
      ...e,
      is_task: !!e.task_id,
      is_completed: false,
    }));
    // Add scheduled tasks not already linked to events
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
    // Dragging event between days
    const eventId = e.dataTransfer.getData("event-id");
    if (eventId) {
      await supabase.from("calendar_events").update({ start_time: date.toISOString() }).eq("id", eventId);
      // Also update task scheduled_date if linked
      const ev = events.find((ev) => ev.id === eventId);
      if (ev?.task_id) {
        await supabase.from("tasks").update({ scheduled_date: format(date, "yyyy-MM-dd") }).eq("id", ev.task_id);
      }
      fetchData();
      return;
    }
    if (!taskId || !user) return;
    await supabase.from("calendar_events").insert({
      user_id: user.id,
      task_id: taskId,
      title: taskTitle,
      start_time: date.toISOString(),
      all_day: true,
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
    // For virtual task items, find the real event or open task
    if (item.id.startsWith("task-")) {
      // No calendar event yet, create one on save
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => nav(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[180px] text-center text-base font-semibold capitalize">{headerLabel}</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => nav(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCurrentDate(new Date())}>
          Hoje
        </Button>

        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openNew(currentDate)}>
          <Plus className="mr-1 h-3 w-3" /> Evento
        </Button>

        <div className="ml-auto flex rounded-lg bg-muted p-0.5">
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

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "today" && (
          <DayColumnView
            days={[currentDate]}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
            getFinSummary={getFinancialSummary}
          />
        )}
        {viewMode === "3days" && (
          <DayColumnView
            days={[currentDate, addDays(currentDate, 1), addDays(currentDate, 2)]}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
            getFinSummary={getFinancialSummary}
          />
        )}
        {viewMode === "weekly" && (
          <WeeklyView
            date={currentDate}
            items={calendarItems}
            onDrop={handleDrop}
            onToggle={toggleComplete}
            onClick={openEdit}
            onNewEvent={openNew}
            getFinSummary={getFinancialSummary}
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
            getFinSummary={getFinancialSummary}
          />
        )}
        {viewMode === "yearly" && (
          <YearlyView date={currentDate} items={calendarItems} getFinSummary={getFinancialSummary} onMonthClick={(d) => { setCurrentDate(d); setViewMode("monthly"); }} />
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

/* ─── Shared Props ──────────────────────────────────────────── */

interface ViewProps {
  items: CalendarItem[];
  onDrop: (e: React.DragEvent, d: Date) => void;
  onToggle: (item: CalendarItem) => void;
  onClick: (item: CalendarItem) => void;
  onNewEvent: (d: Date) => void;
  getFinSummary: (s: Date, e: Date) => { rev: number; exp: number; balance: number };
}

const brl = (v: number) => v > 0 ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "";

/* ─── Event Chip ────────────────────────────────────────────── */

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
        "group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs leading-tight transition-colors hover:brightness-110",
        completed && "opacity-50 line-through",
        compact ? "truncate" : ""
      )}
      style={{ backgroundColor: `${item.color || "#3b82f6"}20`, color: item.color || "#3b82f6" }}
    >
      {item.is_task && (
        <span onClick={(e) => { e.stopPropagation(); onToggle(item); }} className="shrink-0">
          <Checkbox checked={!!completed} className="h-3 w-3 border-current" />
        </span>
      )}
      {!item.is_task && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#3b82f6" }} />
      )}
      <span className="truncate">{item.title}</span>
      {!item.all_day && (
        <span className="ml-auto shrink-0 opacity-70">{format(new Date(item.start_time), "HH:mm")}</span>
      )}
    </div>
  );
}

/* ─── Financial Badge ───────────────────────────────────────── */

function FinBadge({ rev, exp }: { rev: number; exp: number }) {
  if (rev === 0 && exp === 0) return null;
  return (
    <div className="flex gap-1.5 text-xs leading-none">
      {rev > 0 && <span className="text-[hsl(var(--success))]">+{brl(rev)}</span>}
      {exp > 0 && <span className="text-destructive">-{brl(exp)}</span>}
    </div>
  );
}

/* ─── Day Column View (Today & 3 Days) ─────────────────────── */

function DayColumnView({ days, items, onDrop, onToggle, onClick, onNewEvent, getFinSummary }: ViewProps & { days: Date[] }) {
  return (
    <div className={cn("grid h-full gap-px", days.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
      {days.map((day) => {
        const dayItems = items.filter((it) => isSameDay(new Date(it.start_time), day));
        const fin = getFinSummary(day, day);
        return (
          <div
            key={day.toISOString()}
            className={cn("flex flex-col border-r border-border/30 last:border-r-0")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, day)}
          >
            <div className={cn(
              "flex items-center justify-between px-3 py-2",
              isToday(day) && "bg-primary/5"
            )}>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                  isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
                )}>
                  {format(day, "d")}
                </span>
                <div>
                <p className="text-sm font-medium capitalize">{format(day, "EEEE", { locale: ptBR })}</p>
                  <p className="text-xs text-muted-foreground">{format(day, "d MMM", { locale: ptBR })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FinBadge rev={fin.rev} exp={fin.exp} />
                <button onClick={() => onNewEvent(day)} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-0.5 overflow-auto px-2 pb-2">
              {dayItems.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground/50">Sem eventos</p>
              )}
              {dayItems.map((it) => (
                <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Weekly View ───────────────────────────────────────────── */

function WeeklyView({ date, items, onDrop, onToggle, onClick, onNewEvent, getFinSummary }: ViewProps & { date: Date }) {
  const weekStart = startOfWeek(date, { locale: ptBR });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const weekNum = getISOWeek(date);
  const fin = getFinSummary(days[0], days[6]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs text-muted-foreground">S{weekNum}</span>
        <FinBadge rev={fin.rev} exp={fin.exp} />
      </div>
      <div className="grid flex-1 grid-cols-7 gap-px">
        {days.map((day) => {
          const dayItems = items.filter((it) => isSameDay(new Date(it.start_time), day));
          return (
            <div
              key={day.toISOString()}
              className="flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, day)}
            >
              <div
                className={cn("flex flex-col items-center py-1.5", isToday(day) && "bg-primary/5")}
                onClick={() => onNewEvent(day)}
              >
                <span className="text-xs uppercase text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</span>
                <span className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                  isToday(day) ? "bg-primary text-primary-foreground" : ""
                )}>
                  {format(day, "d")}
                </span>
                {dayItems.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5">
                    {dayItems.slice(0, 3).map((it) => (
                      <span key={it.id} className="h-1 w-1 rounded-full" style={{ backgroundColor: it.color || "#3b82f6" }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-0.5 overflow-auto px-0.5 pb-1">
                {dayItems.map((it) => (
                  <EventChip key={it.id} item={it} onToggle={onToggle} onClick={onClick} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Monthly Grid ──────────────────────────────────────────── */

function MonthlyGrid({ date, items, onDrop, onToggle, onClick, onNewEvent, getFinSummary }: ViewProps & { date: Date }) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Monthly financial summary
  const fin = getFinSummary(monthStart, monthEnd);

  return (
    <div className="flex h-full flex-col px-1">
      {/* Financial summary bar */}
      {(fin.rev > 0 || fin.exp > 0) && (
        <div className="flex items-center gap-3 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Resumo:</span>
          <span className="text-[hsl(var(--success))]">Receitas {brl(fin.rev)}</span>
          <span className="text-destructive">Despesas {brl(fin.exp)}</span>
          <span className={cn(fin.balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
            Saldo {fin.balance >= 0 ? "+" : ""}{brl(fin.balance)}
          </span>
        </div>
      )}

      {/* Weekday header */}
      <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-px">
        <div /> {/* week number column */}
        {weekDays.map((d) => (
          <div key={d} className="py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex flex-1 flex-col gap-px">
        {weeks.map((week, wi) => {
          const weekNum = getISOWeek(week[0]);
          return (
            <div key={wi} className="grid min-h-[72px] flex-1 grid-cols-[28px_repeat(7,1fr)] gap-px">
              {/* Week number */}
              <div className="flex items-start justify-center pt-1">
                <span className="text-xs text-muted-foreground/50">{weekNum}</span>
              </div>
              {week.map((day) => {
                const dayItems = items.filter((it) => isSameDay(new Date(it.start_time), day));
                const hasDots = dayItems.length > 0;
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "group relative cursor-pointer rounded-md p-0.5 transition-colors hover:bg-accent/30",
                      !isSameMonth(day, date) && "opacity-30",
                      isToday(day) && "bg-primary/5"
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, day)}
                    onClick={() => onNewEvent(day)}
                  >
                    <div className="flex items-center justify-between px-0.5">
                      <span className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        isToday(day) ? "bg-primary text-primary-foreground" : ""
                      )}>
                        {format(day, "d")}
                      </span>
                      {hasDots && (
                        <div className="flex gap-[2px]">
                          {dayItems.slice(0, 4).map((it) => (
                            <span key={it.id} className="h-[4px] w-[4px] rounded-full" style={{ backgroundColor: it.color || "#3b82f6" }} />
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

/* ─── Yearly View ───────────────────────────────────────────── */

function YearlyView({ date, items, getFinSummary, onMonthClick }: {
  date: Date;
  items: CalendarItem[];
  getFinSummary: (s: Date, e: Date) => { rev: number; exp: number; balance: number };
  onMonthClick: (d: Date) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(date.getFullYear(), i, 1));

  return (
    <div className="grid grid-cols-3 gap-3 p-3 sm:grid-cols-4">
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
            className="cursor-pointer rounded-lg border border-border/30 p-2 transition-colors hover:bg-accent/20"
            onClick={() => onMonthClick(month)}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold capitalize">{format(month, "MMMM", { locale: ptBR })}</span>
              <span className="text-xs text-muted-foreground">{monthItems.length} item(s)</span>
            </div>

            {/* Mini calendar grid */}
            <div className="grid grid-cols-7 gap-[1px]">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                <span key={i} className="text-center text-[7px] text-muted-foreground">{d}</span>
              ))}
              {mDays.map((day, i) => {
                const hasEvent = monthItems.some((it) => isSameDay(new Date(it.start_time), day));
                return (
                  <span
                    key={i}
                    className={cn(
                      "text-center text-[7px]",
                      !isSameMonth(day, month) && "opacity-20",
                      isToday(day) && "rounded-full bg-primary text-primary-foreground",
                      hasEvent && !isToday(day) && "font-bold text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                );
              })}
            </div>

            {(fin.rev > 0 || fin.exp > 0) && (
              <div className="mt-1.5 flex gap-2 text-xs">
                {fin.rev > 0 && <span className="text-[hsl(var(--success))]">+{brl(fin.rev)}</span>}
                {fin.exp > 0 && <span className="text-destructive">-{brl(fin.exp)}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
