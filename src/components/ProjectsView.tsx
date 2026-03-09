import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Plus, Pencil, CheckCircle2, Trash2, CalendarDays, Filter,
  FolderKanban, Sparkles, Archive,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

type ProjectTab = "andamento" | "desejos" | "concluidos";
type ProjectStatus = "pendente" | "em_andamento" | "feito";
type Priority = "alta" | "media" | "baixa";

interface ProjectItem {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: Priority;
  date: string | null;
  observation: string | null;
  user_id: string;
  isTask?: boolean;
}

const STATUS_LABELS: Record<ProjectStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "text-amber-500" },
  em_andamento: { label: "Em andamento", className: "text-primary" },
  feito: { label: "Feito", className: "text-[hsl(var(--success))]" },
};

const PRIORITY_LABELS: Record<Priority, { label: string; className: string }> = {
  alta: { label: "Alta", className: "text-destructive" },
  media: { label: "Média", className: "text-amber-500" },
  baixa: { label: "Baixa", className: "text-[hsl(var(--success))]" },
};

const PRIORITY_ORDER: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

function mapStatus(dbStatus: string | null): ProjectStatus {
  if (!dbStatus) return "pendente";
  if (dbStatus === "completed" || dbStatus === "feito") return "feito";
  if (dbStatus === "in_progress" || dbStatus === "active" || dbStatus === "em_andamento") return "em_andamento";
  return "pendente";
}

function toDbStatus(s: ProjectStatus): string {
  if (s === "feito") return "completed";
  if (s === "em_andamento") return "in_progress";
  return "pending";
}

function parsePriority(desc: string | null): Priority {
  const match = (desc || "").match(/\[prioridade:(\w+)\]/);
  if (match) {
    if (["alta", "high", "urgent"].includes(match[1])) return "alta";
    if (["baixa", "low"].includes(match[1])) return "baixa";
  }
  return "media";
}

function parseObservation(desc: string | null): string {
  return (desc || "")
    .replace(/\[prioridade:\w+\]/g, "")
    .replace(/\[status:\w+\]/g, "")
    .replace(/\[marco\]/g, "")
    .replace(/\[links\][\s\S]*/g, "")
    .replace(/\[anotacoes\][\s\S]*/g, "")
    .trim();
}

export default function ProjectsView() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<ProjectTab>("andamento");
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  const [filterStatus, setFilterStatus] = useState<"all" | ProjectStatus>("all");
  const [filterPriority, setFilterPriority] = useState<"all" | Priority>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<ProjectStatus>("pendente");
  const [formPriority, setFormPriority] = useState<Priority>("media");
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formObs, setFormObs] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteIsTask, setDeleteIsTask] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [pRes, tRes] = await Promise.all([
      supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
      supabase.from("tasks").select("*").eq("user_id", user.id),
    ]);
    if (pRes.data) setProjects(pRes.data);
    if (tRes.data) setTasks(tRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    const handler = () => fetchData();
    window.addEventListener("lovable:data-changed", handler);
    return () => window.removeEventListener("lovable:data-changed", handler);
  }, [fetchData]);

  const allItems: ProjectItem[] = useMemo(() => {
    const fromProjects: ProjectItem[] = projects.map(p => ({
      id: p.id,
      name: p.name,
      status: mapStatus(p.status),
      priority: parsePriority(p.description),
      date: p.created_at ? p.created_at.slice(0, 10) : null,
      observation: parseObservation(p.description),
      user_id: p.user_id,
    }));

    const orphanTasks: ProjectItem[] = tasks
      .filter(t => !t.project_id)
      .map(t => ({
        id: t.id,
        name: t.title,
        status: t.is_completed ? "feito" as ProjectStatus : mapStatus(null),
        priority: parsePriority(t.description),
        date: t.scheduled_date || t.created_at?.slice(0, 10) || null,
        observation: parseObservation(t.description),
        user_id: t.user_id,
        isTask: true,
      }));

    return [...fromProjects, ...orphanTasks];
  }, [projects, tasks]);

  const tabItems = useMemo(() => {
    let list = allItems;

    if (activeTab === "andamento") {
      list = list.filter(p => p.status === "pendente" || p.status === "em_andamento");
    } else if (activeTab === "desejos") {
      list = list.filter(p => p.status === "pendente");
    } else {
      list = list.filter(p => p.status === "feito");
    }

    if (filterStatus !== "all") list = list.filter(p => p.status === filterStatus);
    if (filterPriority !== "all") list = list.filter(p => p.priority === filterPriority);

    return list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [allItems, activeTab, filterStatus, filterPriority]);

  const resetForm = () => {
    setFormName(""); setFormStatus("pendente"); setFormPriority("media");
    setFormDate(undefined); setFormObs(""); setEditing(null);
  };

  const openDialog = (item?: ProjectItem) => {
    if (item) {
      setEditing(item);
      setFormName(item.name);
      setFormStatus(item.status);
      setFormPriority(item.priority);
      setFormDate(item.date ? new Date(item.date) : undefined);
      setFormObs(item.observation || "");
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const saveProject = async () => {
    if (!user || !formName.trim()) return;
    let desc = formObs.trim();
    desc += ` [prioridade:${formPriority}]`;
    const dateStr = formDate ? format(formDate, "yyyy-MM-dd") : null;

    if (editing?.isTask) {
      await supabase.from("tasks").update({
        title: formName.trim(),
        description: desc,
        is_completed: formStatus === "feito",
        scheduled_date: dateStr,
      }).eq("id", editing.id);
    } else if (editing) {
      await supabase.from("projects").update({
        name: formName.trim(),
        description: desc,
        status: toDbStatus(formStatus),
      }).eq("id", editing.id);
    } else {
      await supabase.from("projects").insert({
        name: formName.trim(),
        description: desc,
        status: toDbStatus(formStatus),
        user_id: user.id,
      });
    }

    setDialogOpen(false);
    resetForm();
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
    toast({ title: editing ? "Projeto atualizado!" : "Projeto criado!" });
  };

  const markComplete = async (item: ProjectItem) => {
    if (item.isTask) {
      await supabase.from("tasks").update({ is_completed: true }).eq("id", item.id);
    } else {
      await supabase.from("projects").update({ status: "completed" }).eq("id", item.id);
    }
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
    toast({ title: "Marcado como concluído!" });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (deleteIsTask) {
      await supabase.from("tasks").delete().eq("id", deleteId);
    } else {
      await supabase.from("tasks").delete().eq("project_id", deleteId);
      await supabase.from("projects").delete().eq("id", deleteId);
    }
    setDeleteId(null);
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
    toast({ title: "Projeto excluído!" });
  };

  const formatDateDisplay = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yyyy"); } catch { return d; }
  };

  const tabConfig: { key: ProjectTab; label: string; icon: React.ReactNode }[] = [
    { key: "andamento", label: "Em Andamento", icon: <FolderKanban className="h-3.5 w-3.5" /> },
    { key: "desejos", label: "Desejos", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: "concluidos", label: "Concluídos", icon: <Archive className="h-3.5 w-3.5" /> },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Tabs + Filters */}
        <div className={cn("flex gap-2", isMobile ? "flex-col" : "flex-row items-center")}>
          <div className="flex gap-2 overflow-x-auto">
            {tabConfig.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all shrink-0",
                  activeTab === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/80 hover:bg-primary/5"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className={cn("flex gap-2 items-center", !isMobile && "ml-auto")}>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="feito">Feito</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" onClick={() => openDialog()} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              Adicionar Projeto
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Nome</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-32">Status</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-28">Prioridade</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-28">Data</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Observação</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tabItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground/50 text-sm">
                      Nenhum projeto nesta aba
                    </td>
                  </tr>
                )}
                {tabItems.map(item => (
                  <tr key={item.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-foreground">{item.name}</td>
                    <td className="py-2.5 px-3">
                      <span className={cn("text-xs font-medium", STATUS_LABELS[item.status].className)}>
                        {STATUS_LABELS[item.status].label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={cn("text-xs font-medium", PRIORITY_LABELS[item.priority].className)}>
                        {PRIORITY_LABELS[item.priority].label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground tabular-nums">
                      {formatDateDisplay(item.date)}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {item.observation || "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDialog(item)}
                          className="p-1.5 rounded-md hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {item.status !== "feito" && (
                          <button
                            onClick={() => markComplete(item)}
                            className="p-1.5 rounded-md hover:bg-[hsl(var(--success))]/10 text-muted-foreground hover:text-[hsl(var(--success))] transition-colors"
                            title="Concluir"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => { setDeleteId(item.id); setDeleteIsTask(!!item.isTask); }}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Projeto" : "Adicionar Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome do projeto" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ProjectStatus)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="feito">Feito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridade</Label>
                <Select value={formPriority} onValueChange={(v) => setFormPriority(v as Priority)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-xs font-normal gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {formDate ? format(formDate, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" locale={ptBR} selected={formDate} onSelect={(d) => { setFormDate(d); setDatePickerOpen(false); }} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observação</Label>
              <Textarea value={formObs} onChange={(e) => setFormObs(e.target.value)} placeholder="Notas, links, detalhes..." className="min-h-[80px] text-xs" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="text-xs">Cancelar</Button>
            <Button onClick={saveProject} disabled={!formName.trim()} className="text-xs">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir projeto?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="text-xs">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} className="text-xs">Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
