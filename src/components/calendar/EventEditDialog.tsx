import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

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
  // joined task fields
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

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Sem recorrência" },
  { value: "FREQ=DAILY", label: "Diário" },
  { value: "FREQ=WEEKLY", label: "Semanal" },
  { value: "FREQ=BIWEEKLY", label: "Quinzenal" },
  { value: "FREQ=MONTHLY", label: "Mensal" },
  { value: "FREQ=YEARLY", label: "Anual" },
];

const COLORS = [
  "#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

export default function EventEditDialog({ open, onOpenChange, item, defaultDate, userId, onSaved }: EventEditDialogProps) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(true);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState("12");

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      const d = new Date(item.start_time);
      setStartDate(format(d, "yyyy-MM-dd"));
      setStartTime(format(d, "HH:mm"));
      if (item.end_time) setEndTime(format(new Date(item.end_time), "HH:mm"));
      setAllDay(item.all_day ?? true);
      setDescription(item.description || "");
      setColor(item.color || "#3b82f6");
      setRecurrence(item.recurrence_rule || "none");
    } else {
      const d = defaultDate || new Date();
      setTitle("");
      setStartDate(format(d, "yyyy-MM-dd"));
      setStartTime("09:00");
      setEndTime("10:00");
      setAllDay(true);
      setDescription("");
      setColor("#3b82f6");
      setRecurrence("none");
      setRecurrenceCount("12");
    }
  }, [item, defaultDate, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    const startDt = allDay
      ? new Date(`${startDate}T00:00:00`)
      : new Date(`${startDate}T${startTime}:00`);
    const endDt = allDay ? null : new Date(`${startDate}T${endTime}:00`);

    if (item) {
      // Update existing
      await supabase.from("calendar_events").update({
        title,
        start_time: startDt.toISOString(),
        end_time: endDt?.toISOString() || null,
        all_day: allDay,
        description,
        color,
        recurrence_rule: recurrence === "none" ? null : recurrence,
      }).eq("id", item.id);

      // If it's a task, update task title too
      if (item.task_id) {
        await supabase.from("tasks").update({ title }).eq("id", item.task_id);
      }
    } else {
      // Create new
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
            all_day: allDay,
            description,
            color,
            recurrence_rule: recurrence,
          };
        });
        await supabase.from("calendar_events").insert(events);
      } else {
        await supabase.from("calendar_events").insert({
          user_id: userId,
          title,
          start_time: startDt.toISOString(),
          end_time: endDt?.toISOString() || null,
          all_day: allDay,
          description,
          color,
          recurrence_rule: null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{item ? "Editar Evento" : "Novo Evento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" placeholder="Nome do evento" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1.5">
                <Checkbox checked={allDay} onCheckedChange={(c) => setAllDay(!!c)} id="allday" />
                <Label htmlFor="allday" className="text-xs">Dia inteiro</Label>
              </div>
            </div>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-sm" placeholder="Opcional" />
          </div>

          <div>
            <Label className="text-xs">Cor</Label>
            <div className="mt-1 flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "hsl(var(--foreground))" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Recorrência</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {recurrence !== "none" && !item && (
            <div>
              <Label className="text-xs">Quantidade de ocorrências</Label>
              <Input type="number" min="1" max="365" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} className="h-8 text-sm" />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-2">
          {item && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
