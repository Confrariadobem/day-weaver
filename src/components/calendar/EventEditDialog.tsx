import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Save, Calendar, Clock, Bell, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

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
}

interface EventEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CalendarItem | null;
  defaultDate?: Date;
  userId: string;
  onSaved: () => void;
}

type EventType = "event" | "task" | "birthday" | "celebration" | "countdown" | "bill";

const EVENT_TYPES: { value: EventType; label: string; icon: string }[] = [
  { value: "event", label: "Evento", icon: "📅" },
  { value: "task", label: "Tarefa", icon: "✅" },
  { value: "birthday", label: "Aniversário", icon: "🎂" },
  { value: "celebration", label: "Comemoração", icon: "🎉" },
  { value: "countdown", label: "Contagem Regressiva", icon: "⏳" },
  { value: "bill", label: "Conta a Pagar", icon: "💳" },
];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Sem recorrência" },
  { value: "FREQ=DAILY", label: "Diário" },
  { value: "FREQ=WEEKLY", label: "Semanal" },
  { value: "FREQ=BIWEEKLY", label: "Quinzenal" },
  { value: "FREQ=MONTHLY", label: "Mensal" },
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

const COLORS = [
  "#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

export default function EventEditDialog({ open, onOpenChange, item, defaultDate, userId, onSaved }: EventEditDialogProps) {
  const [eventType, setEventType] = useState<EventType>("event");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(true);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState("12");
  const [reminder, setReminder] = useState("none");
  // Task-specific
  const [priority, setPriority] = useState("medium");
  // Bill-specific
  const [billAmount, setBillAmount] = useState("");

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
      setEventType(item.is_task ? "task" : "event");
      setReminder("none");
    } else {
      const d = defaultDate || new Date();
      setTitle("");
      setStartDate(format(d, "yyyy-MM-dd"));
      setEndDate(format(d, "yyyy-MM-dd"));
      const h = d.getHours();
      setStartTime(h > 0 ? `${String(h).padStart(2, "0")}:00` : "09:00");
      setEndTime(h > 0 ? `${String(h + 1).padStart(2, "0")}:00` : "10:00");
      setAllDay(h === 0);
      setDescription("");
      setColor("#3b82f6");
      setRecurrence("none");
      setRecurrenceCount("12");
      setEventType("event");
      setReminder("none");
      setPriority("medium");
      setBillAmount("");
    }
  }, [item, defaultDate, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    const startDt = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime}:00`);
    const endDt = allDay ? null : new Date(`${endDate || startDate}T${endTime}:00`);

    const descWithMeta = [
      description,
      eventType !== "event" ? `[tipo:${eventType}]` : "",
      reminder !== "none" ? `[lembrete:${reminder}min]` : "",
      eventType === "task" ? `[prioridade:${priority}]` : "",
      eventType === "bill" && billAmount ? `[valor:${billAmount}]` : "",
    ].filter(Boolean).join(" ");

    if (item) {
      await supabase.from("calendar_events").update({
        title, start_time: startDt.toISOString(),
        end_time: endDt?.toISOString() || null,
        all_day: allDay, description: descWithMeta, color,
        recurrence_rule: recurrence === "none" ? null : recurrence,
      }).eq("id", item.id);

      if (item.task_id) {
        await supabase.from("tasks").update({ title }).eq("id", item.task_id);
      }
    } else {
      // If it's a task type, also create a task record
      let taskId: string | null = null;
      if (eventType === "task") {
        const { data } = await supabase.from("tasks").insert({
          user_id: userId, title, description,
          scheduled_date: startDate, is_completed: false,
        }).select("id").single();
        if (data) taskId = data.id;
      }

      if (recurrence !== "none") {
        const count = Math.max(1, parseInt(recurrenceCount) || 12);
        const events = Array.from({ length: count }, (_, i) => {
          const d = new Date(startDt);
          if (recurrence === "FREQ=DAILY") d.setDate(d.getDate() + i);
          else if (recurrence === "FREQ=WEEKLY") d.setDate(d.getDate() + i * 7);
          else if (recurrence === "FREQ=BIWEEKLY") d.setDate(d.getDate() + i * 14);
          else if (recurrence === "FREQ=MONTHLY") d.setMonth(d.getMonth() + i);
          else if (recurrence === "FREQ=YEARLY") d.setFullYear(d.getFullYear() + i);
          return {
            user_id: userId,
            title: `${title} (${i + 1}/${count})`,
            start_time: d.toISOString(),
            end_time: endDt ? (() => { const ed = new Date(d); ed.setHours(endDt.getHours(), endDt.getMinutes()); return ed.toISOString(); })() : null,
            all_day: allDay, description: descWithMeta, color,
            recurrence_rule: recurrence,
            task_id: i === 0 ? taskId : null,
          };
        });
        await supabase.from("calendar_events").insert(events);
      } else {
        await supabase.from("calendar_events").insert({
          user_id: userId, title,
          start_time: startDt.toISOString(),
          end_time: endDt?.toISOString() || null,
          all_day: allDay, description: descWithMeta, color,
          recurrence_rule: null, task_id: taskId,
        });
      }
    }
    onSaved();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!item) return;
    await supabase.from("calendar_events").delete().eq("id", item.id);
    onSaved();
    onOpenChange(false);
  };

  // Auto-set color based on type
  const handleTypeChange = (t: EventType) => {
    setEventType(t);
    if (t === "birthday") setColor("#ec4899");
    else if (t === "celebration") setColor("#f59e0b");
    else if (t === "countdown") setColor("#06b6d4");
    else if (t === "bill") setColor("#ef4444");
    else if (t === "task") setColor("#8b5cf6");
    else setColor("#3b82f6");

    if (t === "birthday" || t === "celebration") {
      setAllDay(true);
      setRecurrence("FREQ=YEARLY");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{item ? "Editar" : "Novo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event type selector */}
          {!item && (
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => handleTypeChange(t.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                    eventType === t.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <div>
            <Label className="text-sm">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={
              eventType === "birthday" ? "Nome do aniversariante" :
              eventType === "bill" ? "Nome da conta" :
              eventType === "countdown" ? "Nome do evento" :
              "Nome do evento ou tarefa"
            } />
          </div>

          {/* Date & time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-sm flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Data início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            {(eventType === "event" || eventType === "countdown") && (
              <div>
                <Label className="text-sm">Data fim</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
            {eventType !== "event" && eventType !== "countdown" && (
              <div className="flex items-end">
                <div className="flex items-center gap-1.5">
                  <Checkbox checked={allDay} onCheckedChange={(c) => setAllDay(!!c)} id="allday" />
                  <Label htmlFor="allday" className="text-sm">Dia inteiro</Label>
                </div>
              </div>
            )}
          </div>

          {(eventType === "event" || eventType === "task") && (
            <div className="flex items-center gap-1.5">
              <Checkbox checked={allDay} onCheckedChange={(c) => setAllDay(!!c)} id="allday2" />
              <Label htmlFor="allday2" className="text-sm">Dia inteiro</Label>
            </div>
          )}

          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Início</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Fim</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}

          {/* Bill amount */}
          {eventType === "bill" && (
            <div>
              <Label className="text-sm">Valor (R$)</Label>
              <Input type="text" inputMode="decimal" placeholder="0,00" value={billAmount}
                onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </div>
          )}

          {/* Task priority */}
          {eventType === "task" && (
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
          )}

          {/* Description */}
          <div>
            <Label className="text-sm">Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional" rows={2} className="resize-none" />
          </div>

          {/* Reminder */}
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

          {/* Color */}
          <div>
            <Label className="text-sm">Cor</Label>
            <div className="mt-1.5 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "hsl(var(--foreground))" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <Label className="text-sm">Recorrência</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recurrence !== "none" && !item && (
            <div>
              <Label className="text-sm">Quantidade de ocorrências</Label>
              <Input type="number" min="1" max="365" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} />
            </div>
          )}
        </div>

        {/* Footer with standardized buttons */}
        <div className="flex items-center gap-2 pt-4 border-t border-border/20">
          {item && (
            <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
