import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, ChevronDown, ChevronRight, Trash2, Save, Search, X, Pencil,
  CalendarDays, FolderHeart, CheckCircle2, Circle, Filter, CalendarRange,
  GripVertical, Target,
} from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ProjectStatus = "pending" | "in_progress" | "completed" | "cancelled";

const STATUS_LABELS: Record<ProjectStatus, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "text-amber-500" },
  in_progress: { label: "Em andamento", color: "text-primary" },
  completed: { label: "Concluído", color: "text-[hsl(var(--success))]" },
  cancelled: { label: "Cancelado", color: "text-muted-foreground" },
};

const STATUS_OPTIONS: ProjectStatus[] = ["pending", "in_progress", "completed", "cancelled"];

interface ProjectWithTasks {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  budget: number | null;
  cost_center_id: string | null;
  user_id: string;
  tasks: TaskRow[];
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean | null;
  estimated_cost: number;
  scheduled_date: string | null;
  project_id: string | null;
  sort_order: number | null;
}

type TaskFilter = "all" | "pending" | "done" | "cheap";

export default function ProjectsDesejosView() {
  const { user } = useAuth();
  const { formatCurrency: brl } = useCurrency();

  // Data
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // UI
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [budgetLimit, setBudgetLimit] = useState("");

  // Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [projName, setProjName] = useState("");
  const [projDesc, setProjDesc] = useState("");
  const [projStatus, setProjStatus] = useState<ProjectStatus>("pending");
  const [projCostCenter, setProjCostCenter] = useState("");

  // Task dialog
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskCost, setTaskCost] = useState("");
  const [taskDate, setTaskDate] = useState("");

  // Quick-add
  const [quickAddProjectId, setQuickAddProjectId] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "project" | "task"; id: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [pRes, tRes, ccRes, accRes] = await Promise.all([
      supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
      supabase.from("tasks").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("cost_centers").select("*").eq("user_id", user.id).eq("is_active", true).order("name"),
      supabase.from("financial_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
    ]);
    if (pRes.data) setProjects(pRes.data);
    if (tRes.data) setTasks(tRes.data);
    if (ccRes.data) setCostCenters(ccRes.data);
    if (accRes.data) setAccounts(accRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    const handler = () => fetchData();
    window.addEventListener("lovable:data-changed", handler);
    return () => window.removeEventListener("lovable:data-changed", handler);
  }, [fetchData]);

  // Available cash
  const totalCash = useMemo(() => {
    return accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  }, [accounts]);

  // Projects with tasks combined
  const projectsWithTasks: ProjectWithTasks[] = useMemo(() => {
    return projects.map(p => ({
      ...p,
      tasks: tasks
        .filter(t => t.project_id === p.id)
        .map(t => ({ ...t, estimated_cost: Number(t.estimated_cost) || 0 })),
    }));
  }, [projects, tasks]);

  // Filtered and sorted
  const filteredProjects = useMemo(() => {
    let list = projectsWithTasks;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.tasks.some(t => t.title.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [projectsWithTasks, searchQuery]);

  const getFilteredTasks = (projectTasks: TaskRow[]) => {
    let list = projectTasks;
    if (taskFilter === "pending") list = list.filter(t => !t.is_completed);
    else if (taskFilter === "done") list = list.filter(t => t.is_completed);
    else if (taskFilter === "cheap") {
      const limit = parseFloat(budgetLimit) || 500;
      list = list.filter(t => !t.is_completed && t.estimated_cost <= limit);
    }
    // Pendentes primeiro
    return list.sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  };

  const getProjectProgress = (projectTasks: TaskRow[]) => {
    if (projectTasks.length === 0) return 0;
    const done = projectTasks.filter(t => t.is_completed).length;
    return Math.round((done / projectTasks.length) * 100);
  };

  const getProjectCost = (projectTasks: TaskRow[]) =>
    projectTasks.reduce((s, t) => s + t.estimated_cost, 0);

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // CRUD
  const resetProjectForm = () => {
    setProjName(""); setProjDesc(""); setProjStatus("pending"); setProjCostCenter("");
    setEditingProject(null);
  };

  const openProjectDialog = (project?: any) => {
    if (project) {
      setEditingProject(project);
      setProjName(project.name);
      setProjDesc(project.description || "");
      setProjStatus((project.status as ProjectStatus) || "pending");
      setProjCostCenter(project.cost_center_id || "");
    } else {
      resetProjectForm();
    }
    setProjectDialogOpen(true);
  };

  const saveProject = async () => {
    if (!user || !projName.trim()) return;
    const data: any = {
      name: projName.trim(),
      description: projDesc.trim() || null,
      status: projStatus,
      cost_center_id: projCostCenter || null,
      user_id: user.id,
    };
    if (editingProject) {
      await supabase.from("projects").update(data).eq("id", editingProject.id);
    } else {
      await supabase.from("projects").insert(data);
    }
    setProjectDialogOpen(false);
    resetProjectForm();
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const resetTaskForm = () => {
    setTaskTitle(""); setTaskDesc(""); setTaskCost(""); setTaskDate("");
    setTaskProjectId(""); setEditingTask(null);
  };

  const openTaskDialog = (task?: any, projectId?: string) => {
    if (task) {
      setEditingTask(task);
      setTaskTitle(task.title);
      setTaskDesc(task.description || "");
      setTaskCost(String(task.estimated_cost || ""));
      setTaskDate(task.scheduled_date || "");
      setTaskProjectId(task.project_id || "");
    } else {
      resetTaskForm();
      if (projectId) setTaskProjectId(projectId);
    }
    setTaskDialogOpen(true);
  };

  const saveTask = async () => {
    if (!user || !taskTitle.trim() || !taskProjectId) return;
    const data: any = {
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      estimated_cost: parseFloat(taskCost) || 0,
      scheduled_date: taskDate || null,
      project_id: taskProjectId,
      user_id: user.id,
    };
    if (editingTask) {
      await supabase.from("tasks").update(data).eq("id", editingTask.id);
    } else {
      await supabase.from("tasks").insert(data);
    }
    setTaskDialogOpen(false);
    resetTaskForm();
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const toggleTaskComplete = async (task: any) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const handleQuickAdd = async (projectId: string) => {
    if (!user || !quickAddTitle.trim()) return;
    await supabase.from("tasks").insert({
      title: quickAddTitle.trim(),
      project_id: projectId,
      user_id: user.id,
      estimated_cost: 0,
    });
    setQuickAddTitle("");
    setQuickAddProjectId(null);
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "project") {
      // Delete tasks first, then project
      await supabase.from("tasks").delete().eq("project_id", deleteConfirm.id);
      await supabase.from("projects").delete().eq("id", deleteConfirm.id);
    } else {
      await supabase.from("tasks").delete().eq("id", deleteConfirm.id);
    }
    setDeleteConfirm(null);
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const scheduleTask = async (taskId: string, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    await supabase.from("tasks").update({ scheduled_date: dateStr }).eq("id", taskId);
    // Also create a calendar event
    if (user) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        await supabase.from("calendar_events").insert({
          user_id: user.id,
          title: task.title + (Number(task.estimated_cost) > 0 ? ` — ${brl(Number(task.estimated_cost))}` : ""),
          start_time: `${dateStr}T09:00:00`,
          end_time: `${dateStr}T10:00:00`,
          all_day: false,
          task_id: taskId,
          color: "#10b981",
        });
      }
    }
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  // Summary
  const totalProjects = filteredProjects.length;
  const totalTasks = filteredProjects.reduce((s, p) => s + p.tasks.length, 0);
  const totalPendingCost = filteredProjects.reduce(
    (s, p) => s + p.tasks.filter(t => !t.is_completed).reduce((ts, t) => ts + t.estimated_cost, 0), 0
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1" style={{ maxWidth: 400 }}>
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos ou tarefas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-8 pr-7 text-xs rounded-lg"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter */}
          <Select value={taskFilter} onValueChange={(v) => setTaskFilter(v as TaskFilter)}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="done">Concluídas</SelectItem>
              <SelectItem value="cheap">Dentro do orçamento</SelectItem>
            </SelectContent>
          </Select>

          {taskFilter === "cheap" && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Limite:</span>
              <Input
                type="number"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                placeholder="500"
                className="h-7 w-24 text-xs"
              />
            </div>
          )}

          <button
            onClick={() => openProjectDialog()}
            className="flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Novo
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border/30 bg-card p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FolderHeart className="h-4 w-4" /> Projetos
            </p>
            <p className="text-lg font-bold text-foreground">{totalProjects}</p>
          </div>
          <div className="rounded-lg border border-border/30 bg-card p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Target className="h-4 w-4" /> Tarefas
            </p>
            <p className="text-lg font-bold text-foreground">{totalTasks}</p>
          </div>
          <div className="rounded-lg border border-border/30 bg-card p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <CalendarDays className="h-4 w-4" /> Custo Pendente
            </p>
            <p className="text-lg font-bold text-destructive">{brl(totalPendingCost)}</p>
          </div>
          <div className="rounded-lg border border-border/30 bg-card p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Caixa Disponível
            </p>
            <p className={cn("text-lg font-bold", totalCash >= totalPendingCost ? "text-[hsl(var(--success))]" : "text-destructive")}>
              {brl(totalCash)}
            </p>
          </div>
        </div>

        {/* Projects list */}
        <div className="space-y-2">
          {filteredProjects.length === 0 && (
            <div className="text-center py-12 text-muted-foreground/40">
              <FolderHeart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum projeto encontrado</p>
              <p className="text-xs mt-1">Clique em "Novo" para criar seu primeiro projeto</p>
            </div>
          )}

          {filteredProjects.map(project => {
            const isExpanded = expandedProjects.has(project.id);
            const progress = getProjectProgress(project.tasks);
            const totalCost = getProjectCost(project.tasks);
            const pendingCost = project.tasks.filter(t => !t.is_completed).reduce((s, t) => s + t.estimated_cost, 0);
            const status = (project.status as ProjectStatus) || "pending";
            const statusInfo = STATUS_LABELS[status];
            const cc = costCenters.find((c: any) => c.id === project.cost_center_id);
            const filteredTasks = getFilteredTasks(project.tasks);
            const canAfford = totalCash >= pendingCost;
            const isOverdue = status === "in_progress" && progress < 50;

            return (
              <div key={project.id} className="rounded-lg border border-border/30 bg-card overflow-hidden">
                {/* Project header */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
                  onClick={() => toggleProject(project.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[1.1rem] font-bold text-foreground truncate">{project.name}</h3>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                      {cc && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cc.color }} />
                          {cc.name}
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-[0.9rem] text-muted-foreground line-clamp-2 mt-0.5">{project.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {/* Cost */}
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Custo total</p>
                      <p className="text-sm font-bold tabular-nums text-foreground">{brl(totalCost)}</p>
                    </div>

                    {/* Progress */}
                    <div className="w-24">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-muted-foreground">{project.tasks.filter(t => t.is_completed).length}/{project.tasks.length}</span>
                        <span className="text-[10px] font-bold tabular-nums">{progress}%</span>
                      </div>
                      <Progress
                        value={progress}
                        className={cn("h-1.5", isOverdue ? "[&>div]:bg-destructive" : "[&>div]:bg-[hsl(var(--success))]")}
                      />
                    </div>
                  </div>
                </button>

                {/* Expanded: tasks */}
                {isExpanded && (
                  <div className="border-t border-border/20 px-4 pb-3">
                    {/* Project action bar */}
                    <div className="flex items-center gap-2 py-2 border-b border-border/10">
                      <button
                        onClick={() => openProjectDialog(project)}
                        className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" /> Editar projeto
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ type: "project", id: project.id })}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                      <div className="ml-auto flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          Pendente: <span className={cn("font-bold", canAfford ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(pendingCost)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Tasks */}
                    <div className="mt-2 space-y-0.5">
                      {filteredTasks.length === 0 && (
                        <p className="text-xs text-muted-foreground/40 py-4 text-center">Nenhuma tarefa</p>
                      )}
                      {filteredTasks.map(task => (
                        <div
                          key={task.id}
                          className={cn(
                            "group flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-primary/5 transition-colors",
                            task.is_completed && "opacity-50"
                          )}
                        >
                          <button onClick={() => toggleTaskComplete(task)} className="shrink-0">
                            {task.is_completed ? (
                              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/40 hover:text-[hsl(var(--success))]" />
                            )}
                          </button>

                          <span className={cn("flex-1 text-sm text-foreground truncate", task.is_completed && "line-through text-muted-foreground")}>
                            {task.title}
                          </span>

                          {task.scheduled_date && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {format(new Date(task.scheduled_date + "T12:00:00"), "dd/MM")}
                            </span>
                          )}

                          {task.estimated_cost > 0 && (
                            <span className={cn(
                              "text-xs font-semibold tabular-nums shrink-0",
                              task.is_completed ? "text-muted-foreground" : "text-destructive"
                            )}>
                              {brl(task.estimated_cost)}
                            </span>
                          )}

                          {/* Hover actions */}
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                  mode="single"
                                  locale={ptBR}
                                  selected={task.scheduled_date ? new Date(task.scheduled_date + "T12:00:00") : undefined}
                                  onSelect={(d) => { if (d) scheduleTask(task.id, d); }}
                                  className="pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                            <button
                              onClick={() => openTaskDialog(task)}
                              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ type: "task", id: task.id })}
                              className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Quick add */}
                      {quickAddProjectId === project.id ? (
                        <div className="flex items-center gap-2 py-1.5 px-2">
                          <Circle className="h-4 w-4 text-muted-foreground/20 shrink-0" />
                          <Input
                            ref={quickAddRef}
                            value={quickAddTitle}
                            onChange={(e) => setQuickAddTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleQuickAdd(project.id);
                              if (e.key === "Escape") { setQuickAddProjectId(null); setQuickAddTitle(""); }
                            }}
                            placeholder="Nome da tarefa..."
                            className="h-7 text-sm flex-1"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleQuickAdd(project.id)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setQuickAddProjectId(null); setQuickAddTitle(""); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setQuickAddProjectId(project.id); setTimeout(() => quickAddRef.current?.focus(), 50); }}
                          className="flex items-center gap-2 py-1.5 px-2 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors w-full"
                        >
                          <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Project Dialog */}
        <Dialog open={projectDialogOpen} onOpenChange={(o) => { setProjectDialogOpen(o); if (!o) resetProjectForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProject ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="Nome do projeto" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Input value={projDesc} onChange={(e) => setProjDesc(e.target.value)} placeholder="Descrição curta (opcional)" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={projStatus} onValueChange={(v) => setProjStatus(v as ProjectStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Centro de Custo</Label>
                <Select value={projCostCenter} onValueChange={(v) => setProjCostCenter(v === "__clear__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__"><span className="text-muted-foreground italic">Nenhum</span></SelectItem>
                    {costCenters.map((cc: any) => (
                      <SelectItem key={cc.id} value={cc.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cc.color }} />
                          {cc.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => { setProjectDialogOpen(false); resetProjectForm(); }}>Cancelar</Button>
              <Button size="sm" onClick={saveProject} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Task Dialog */}
        <Dialog open={taskDialogOpen} onOpenChange={(o) => { setTaskDialogOpen(o); if (!o) resetTaskForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Projeto</Label>
                <Select value={taskProjectId} onValueChange={setTaskProjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o projeto" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Título</Label>
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Nome da tarefa" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Input value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Descrição (opcional)" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Valor estimado (R$)</Label>
                  <Input
                    type="number"
                    value={taskCost}
                    onChange={(e) => setTaskCost(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data prevista</Label>
                  <Input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => { setTaskDialogOpen(false); resetTaskForm(); }}>Cancelar</Button>
              <Button size="sm" onClick={saveTask} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirmar exclusão</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {deleteConfirm?.type === "project"
                ? "Excluir este projeto e todas as suas tarefas?"
                : "Excluir esta tarefa?"}
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}
