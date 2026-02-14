import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  isToday,
  isSameMonth,
  isSameDay,
  addDays,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ViewMode = "today" | "3days" | "monthly" | "yearly" | "custom";

export default function CalendarView() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [events, setEvents] = useState<Tables<"calendar_events">[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", user.id)
        .order("start_time");
      if (data) setEvents(data);
    };
    fetchEvents();

    const channel = supabase
      .channel("calendar-events")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events", filter: `user_id=eq.${user.id}` }, () => {
        fetchEvents();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleDrop = async (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("task-id");
    const taskTitle = e.dataTransfer.getData("task-title");
    if (!taskId || !user) return;

    await supabase.from("calendar_events").insert({
      user_id: user.id,
      task_id: taskId,
      title: taskTitle,
      start_time: date.toISOString(),
      all_day: true,
    });

    await supabase.from("tasks").update({ scheduled_date: format(date, "yyyy-MM-dd") }).eq("id", taskId);
  };

  const views: { key: ViewMode; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "3days", label: "3 Dias" },
    { key: "monthly", label: "Mensal" },
    { key: "yearly", label: "Anual" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
            if (viewMode === "monthly") setCurrentDate(subMonths(currentDate, 1));
            else setCurrentDate(subDays(currentDate, viewMode === "3days" ? 3 : 1));
          }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[140px] text-center text-sm font-semibold">
            {viewMode === "yearly"
              ? format(currentDate, "yyyy")
              : format(currentDate, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
            if (viewMode === "monthly") setCurrentDate(addMonths(currentDate, 1));
            else setCurrentDate(addDays(currentDate, viewMode === "3days" ? 3 : 1));
          }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCurrentDate(new Date())}>
          <CalendarDays className="mr-1 h-3 w-3" /> Hoje
        </Button>

        <div className="ml-auto flex gap-1">
          {views.map((v) => (
            <Button
              key={v.key}
              variant={viewMode === v.key ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {viewMode === "today" && <TodayView date={currentDate} events={events} onDrop={handleDrop} />}
        {viewMode === "3days" && <ThreeDaysView date={currentDate} events={events} onDrop={handleDrop} />}
        {viewMode === "monthly" && <MonthlyView date={currentDate} events={events} onDrop={handleDrop} />}
        {viewMode === "yearly" && <YearlyView date={currentDate} events={events} />}
      </div>
    </div>
  );
}

function TodayView({ date, events, onDrop }: { date: Date; events: Tables<"calendar_events">[]; onDrop: (e: React.DragEvent, d: Date) => void }) {
  const dayEvents = events.filter((ev) => isSameDay(new Date(ev.start_time), date));
  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, date)}
    >
      <h3 className="text-lg font-semibold">{format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}</h3>
      {dayEvents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento hoje</p>}
      {dayEvents.map((ev) => (
        <Card key={ev.id} className="p-3">
          <p className="text-sm font-medium">{ev.title}</p>
          {!ev.all_day && (
            <p className="text-xs text-muted-foreground">{format(new Date(ev.start_time), "HH:mm")}</p>
          )}
        </Card>
      ))}
    </div>
  );
}

function ThreeDaysView({ date, events, onDrop }: { date: Date; events: Tables<"calendar_events">[]; onDrop: (e: React.DragEvent, d: Date) => void }) {
  const days = [date, addDays(date, 1), addDays(date, 2)];
  return (
    <div className="grid grid-cols-3 gap-3">
      {days.map((day) => {
        const dayEvents = events.filter((ev) => isSameDay(new Date(ev.start_time), day));
        return (
          <div
            key={day.toISOString()}
            className={cn("min-h-[200px] rounded-lg border border-border p-2", isToday(day) && "border-primary")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, day)}
          >
            <p className={cn("mb-2 text-center text-xs font-medium", isToday(day) && "text-primary")}>
              {format(day, "EEE d", { locale: ptBR })}
            </p>
            {dayEvents.map((ev) => (
              <div key={ev.id} className="mb-1 rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                {ev.title}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MonthlyView({ date, events, onDrop }: { date: Date; events: Tables<"calendar_events">[]; onDrop: (e: React.DragEvent, d: Date) => void }) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-px">
        {weekDays.map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {days.map((day) => {
          const dayEvents = events.filter((ev) => isSameDay(new Date(ev.start_time), day));
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[80px] rounded border border-transparent p-1 text-xs",
                !isSameMonth(day, date) && "opacity-40",
                isToday(day) && "border-primary bg-primary/5"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, day)}
            >
              <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]", isToday(day) && "bg-primary text-primary-foreground")}>
                {format(day, "d")}
              </span>
              {dayEvents.slice(0, 3).map((ev) => (
                <div key={ev.id} className="mt-0.5 truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                  {ev.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">+{dayEvents.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearlyView({ date, events }: { date: Date; events: Tables<"calendar_events">[] }) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(date.getFullYear(), i, 1));
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
      {months.map((month) => {
        const monthEvents = events.filter((ev) => {
          const d = new Date(ev.start_time);
          return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
        });
        return (
          <Card key={month.toISOString()} className="p-3">
            <p className="mb-1 text-xs font-semibold capitalize">{format(month, "MMMM", { locale: ptBR })}</p>
            <p className="text-[10px] text-muted-foreground">{monthEvents.length} evento(s)</p>
          </Card>
        );
      })}
    </div>
  );
}
