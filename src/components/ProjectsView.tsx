import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus, Star, ChevronDown, Check, Trash2, Pencil, FolderOpen, Save,
  CalendarDays, DollarSign, User, Tag, FileText, GripVertical, Search,
  Filter, ArrowUpDown, PanelLeftClose, PanelLeft, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

type SortField = "title" | "scheduled_date" | "assignee" | "category" | "status";
type SortDir = "asc" | "desc";

export default function ProjectsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Tables<"projects"> | null>(null);
  const [editingTask, setEditingTask] = useState<Tables<"tasks"> | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Task toolbar state
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilterCategory, setTaskFilterCategory] = useState<string>("all");
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showTaskFilters, setShowTaskFilters] = useState(false);

  // Drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Project form
  const [projName, setProjName] = useState("");
  const [projDescription, setProjDescription] = useState("");
  const [projBudget, setProjBudget] = useState("");
  const [projStatus, setProjStatus] = useState("active");
  const [projCategoryId, setProjCategoryId] = useState("");

  // Task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskScheduledDate, setTaskScheduledDate] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskCategoryId, setTaskCategoryId] = useState("");
  const [taskIsFavorite, setTaskIsFavorite] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [projRes, taskRes, catRes, entRes] = await Promise.all([
      supabase.from("projects").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("tasks").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
    ]);
    if (projRes.data) setProjects(projRes.data);
    if (taskRes.data) setTasks(taskRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (entRes.data) setEntries(entRes.data);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getProjectCosts = useCallback((projectId: string) => {
    const projEntries = entries.filter(e => e.project_id === projectId);
    const totalCost = projEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const totalRevenue = projEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
    const paidCost = projEntries.filter(e => e.type === "expense" && e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
    return { totalCost, totalRevenue, paidCost, pendingCost: totalCost - paidCost };
  }, [entries]);

  // Project form handlers
  const resetProjectForm = () => {
    setProjName(""); setProjDescription(""); setProjBudget(""); setProjStatus("active"); setProjCategoryId("");
    setEditingProject(null);
  };

  const openEditProject = (p: Tables<"projects">) => {
    setEditingProject(p);
    setProjName(p.name);
    setProjDescription(p.description || "");
    setProjBudget(p.budget ? String(p.budget) : "");
    setProjStatus(p.status || "active");
    setProjCategoryId(p.category_id || "");
    setProjectDialogOpen(true);
  };

  const saveProject = async () => {
    if (!projName.trim() || !user) return;
    const data: any = {
      name: projName.trim(),
      description: projDescription || null,
      budget: projBudget ? parseFloat(projBudget.replace(/\./g, "").replace(",", ".")) : 0,
      status: projStatus,
      category_id: projCategoryId || null,
      user_id: user.id,
    };
    if (editingProject) {
      await supabase.from("projects").update(data).eq("id", editingProject.id);
    } else {
      await supabase.from("projects").insert(data);
    }
    resetProjectForm();
    setProjectDialogOpen(false);
    fetchData();
  };

  const deleteProject = async (id: string) => {
    await supabase.from("projects").delete().eq("id", id);
    if (selectedProject === id) setSelectedProject(null);
    fetchData();
  };

  // Task form handlers
  const resetTaskForm = () => {
    setTaskTitle(""); setTaskDescription(""); setTaskScheduledDate("");
    setTaskAssignee(""); setTaskCategoryId(""); setTaskIsFavorite(false);
    setEditingTask(null);
  };

  const openEditTask = (t: Tables<"tasks">) => {
    setEditingTask(t);
    setTaskTitle(t.title);
    setTaskDescription(t.description || "");
    setTaskScheduledDate(t.scheduled_date || "");
    setTaskAssignee(t.assignee || "");
    setTaskCategoryId(t.category_id || "");
    setTaskIsFavorite(t.is_favorite || false);
    setTaskDialogOpen(true);
  };

  const saveTask = async () => {
    if (!taskTitle.trim() || !selectedProject || !user) return;
    const data: any = {
      title: taskTitle.trim(),
      description: taskDescription || null,
      scheduled_date: taskScheduledDate || null,
      assignee: taskAssignee || null,
      category_id: taskCategoryId || null,
      is_favorite: taskIsFavorite,
      project_id: selectedProject,
      user_id: user.id,
    };
    if (editingTask) {
      await supabase.from("tasks").update(data).eq("id", editingTask.id);
    } else {
      await supabase.from("tasks").insert(data);
    }
    if (taskScheduledDate) {
      if (editingTask) {
        const { data: existingEvent } = await supabase
          .from("calendar_events").select("id").eq("task_id", editingTask.id).maybeSingle();
        if (existingEvent) {
          await supabase.from("calendar_events").update({
            title: taskTitle.trim(),
            start_time: new Date(`${taskScheduledDate}T00:00:00`).toISOString(),
          }).eq("id", existingEvent.id);
        }
      } else {
        const { data: newTask } = await supabase.from("tasks").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single();
        if (newTask) {
          await supabase.from("calendar_events").insert({
            user_id: user.id, task_id: newTask.id, title: taskTitle.trim(),
            start_time: new Date(`${taskScheduledDate}T00:00:00`).toISOString(),
            all_day: true, color: "#8b5cf6",
          });
        }
      }
    }
    resetTaskForm();
    setTaskDialogOpen(false);
    fetchData();
  };

  const toggleComplete = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("calendar_events").delete().eq("task_id", id);
    await supabase.from("tasks").delete().eq("id", id);
    fetchData();
  };

  // Drag reorder
  const handleDragEnd = async (fromIdx: number, toIdx: number, taskList: Tables<"tasks">[]) => {
    if (fromIdx === toIdx) return;
    const reordered = [...taskList];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Update sort_order in DB
    const updates = reordered.map((t, i) => supabase.from("tasks").update({ sort_order: i }).eq("id", t.id));
    await Promise.all(updates);
    setDragIdx(null);
    setDragOverIdx(null);
    fetchData();
  };

  const selectedTasks = tasks.filter((t) => t.project_id === selectedProject);

  // Filter & sort
  const filteredTasks = useMemo(() => {
    let list = selectedTasks;
    if (taskSearch) list = list.filter(t => t.title.toLowerCase().includes(taskSearch.toLowerCase()));
    if (taskFilterCategory !== "all") list = list.filter(t => (t.category_id || "none") === taskFilterCategory);
    if (taskFilterStatus === "active") list = list.filter(t => !t.is_completed);
    else if (taskFilterStatus === "completed") list = list.filter(t => t.is_completed);
    return list;
  }, [selectedTasks, taskSearch, taskFilterCategory, taskFilterStatus]);

  const sortedActive = useMemo(() => {
    const active = filteredTasks.filter(t => !t.is_completed);
    return [...active].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = a.title.localeCompare(b.title);
      else if (sortField === "scheduled_date") cmp = (a.scheduled_date || "").localeCompare(b.scheduled_date || "");
      else if (sortField === "assignee") cmp = (a.assignee || "").localeCompare(b.assignee || "");
      else if (sortField === "category") cmp = (a.category_id || "").localeCompare(b.category_id || "");
      else if (sortField === "status") cmp = (a.is_completed ? 1 : 0) - (b.is_completed ? 1 : 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredTasks, sortField, sortDir]);

  const completedTasks = filteredTasks.filter(t => t.is_completed);
  const allSelectedTasks = selectedTasks;
  const allCompleted = allSelectedTasks.filter(t => t.is_completed);
  const progress = allSelectedTasks.length > 0 ? (allCompleted.length / allSelectedTasks.length) * 100 : 0;
  const currentProject = projects.find(p => p.id === selectedProject);
  const projectCosts = selectedProject ? getProjectCosts(selectedProject) : null;
  const projectCategories = categories.filter(c => c.is_project);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className={cn("ml-1 inline-flex", sortField === field ? "text-primary" : "text-muted-foreground/40")}>
      {sortField === field && sortDir === "desc" ? "↓" : "↑"}
    </span>
  );

  const hasActiveTaskFilters = taskSearch || taskFilterCategory !== "all" || taskFilterStatus !== "all";

  return (
    <div className="flex h-full">
      {/* Project list sidebar - collapsible */}
      {sidebarCollapsed ? (
        <div className="flex h-full w-12 shrink-0 flex-col items-center border-r border-border/30 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarCollapsed(false)}>
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="w-72 shrink-0 border-r border-border/30 flex flex-col">
          <div className="flex items-center justify-between p-4 pb-2">
            <h3 className="text-sm font-bold">Projetos</h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { resetProjectForm(); setProjectDialogOpen(true); }}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarCollapsed(true)}>
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-1">
            {projects.map((p) => {
              const costs = getProjectCosts(p.id);
              const pTasks = tasks.filter(t => t.project_id === p.id);
              const pDone = pTasks.filter(t => t.is_completed).length;
              const pTotal = pTasks.length;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProject(p.id)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                    selectedProject === p.id ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
                  )}
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pDone}/{pTotal} tarefas
                      {costs.totalCost > 0 && ` • ${brl(costs.totalCost)}`}
                    </p>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); openEditProject(p); }} className="rounded p-1 hover:bg-muted">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} className="rounded p-1 hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
                    </button>
                  </div>
                </div>
              );
            })}
            {projects.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum projeto</p>
            )}
          </div>
        </div>
      )}

      {/* Task area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedProject && currentProject ? (
          <>
            {/* Project header */}
            <div className="p-5 pb-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold">{currentProject.name}</h2>
                  {currentProject.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{currentProject.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-medium",
                    currentProject.status === "active" ? "bg-success/10 text-success" :
                    currentProject.status === "completed" ? "bg-primary/10 text-primary" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {currentProject.status === "active" ? "Ativo" : currentProject.status === "completed" ? "Concluído" : "Pausado"}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => openEditProject(currentProject)}>
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <Progress value={progress} className="h-2.5 flex-1" />
                <span className="text-sm font-semibold text-muted-foreground">{Math.round(progress)}%</span>
              </div>

              {projectCosts && (currentProject.budget || projectCosts.totalCost > 0) && (
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {currentProject.budget ? (
                    <Card><CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Orçamento</p>
                      <p className="text-base font-bold text-primary">{brl(Number(currentProject.budget))}</p>
                    </CardContent></Card>
                  ) : null}
                  <Card><CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Custo Total</p>
                    <p className="text-base font-bold text-destructive">{brl(projectCosts.totalCost)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Pago</p>
                    <p className="text-base font-bold text-success">{brl(projectCosts.paidCost)}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Pendente</p>
                    <p className="text-base font-bold text-warning">{brl(projectCosts.pendingCost)}</p>
                  </CardContent></Card>
                  {currentProject.budget && Number(currentProject.budget) > 0 && (
                    <Card><CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Orçamento Restante</p>
                      <p className={cn("text-base font-bold", Number(currentProject.budget) - projectCosts.totalCost >= 0 ? "text-success" : "text-destructive")}>
                        {brl(Number(currentProject.budget) - projectCosts.totalCost)}
                      </p>
                    </CardContent></Card>
                  )}
                </div>
              )}

              {/* Task toolbar - filters & search like finances */}
              <div className="flex items-center gap-2 mb-3 border-b border-border/20 pb-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar tarefas..."
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Button
                  variant="ghost" size="sm"
                  className={cn("h-8 text-xs gap-1", hasActiveTaskFilters && "text-primary")}
                  onClick={() => setShowTaskFilters(!showTaskFilters)}
                >
                  <Filter className="h-3.5 w-3.5" /> Filtros
                </Button>
                {hasActiveTaskFilters && (
                  <button onClick={() => { setTaskSearch(""); setTaskFilterCategory("all"); setTaskFilterStatus("all"); }}
                    className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <X className="h-3 w-3" /> Limpar
                  </button>
                )}
              </div>

              {showTaskFilters && (
                <div className="flex items-center gap-3 mb-3">
                  <Select value={taskFilterCategory} onValueChange={setTaskFilterCategory}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas categorias</SelectItem>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={taskFilterStatus} onValueChange={setTaskFilterStatus}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="active">Pendentes</SelectItem>
                      <SelectItem value="completed">Concluídas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* EAP Task Table with drag reorder */}
            <div className="flex-1 overflow-auto px-5 pb-5">
              <div className="rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-muted-foreground/60 uppercase tracking-wider border-b border-border/20">
                      <th className="text-left py-2.5 px-3 w-8"></th>
                      <th className="text-left py-2.5 px-3 w-8">#</th>
                      <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("title")}>
                        Tarefa <SortIcon field="title" />
                      </th>
                      <th className="text-left py-2.5 px-3 w-28 cursor-pointer select-none" onClick={() => toggleSort("assignee")}>
                        Responsável <SortIcon field="assignee" />
                      </th>
                      <th className="text-left py-2.5 px-3 w-28 cursor-pointer select-none" onClick={() => toggleSort("scheduled_date")}>
                        Data <SortIcon field="scheduled_date" />
                      </th>
                      <th className="text-left py-2.5 px-3 w-24 cursor-pointer select-none" onClick={() => toggleSort("category")}>
                        Categoria <SortIcon field="category" />
                      </th>
                      <th className="text-center py-2.5 px-3 w-16 cursor-pointer select-none" onClick={() => toggleSort("status")}>
                        Status <SortIcon field="status" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedActive.map((task, idx) => (
                      <tr
                        key={task.id}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                        onDragEnd={() => { if (dragIdx !== null && dragOverIdx !== null) handleDragEnd(dragIdx, dragOverIdx, sortedActive); }}
                        className={cn(
                          "group cursor-pointer transition-colors hover:bg-muted/20 border-t border-border/10",
                          dragOverIdx === idx && "border-t-2 border-t-primary"
                        )}
                        onClick={() => openEditTask(task)}
                      >
                        <td className="py-2.5 px-3">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
                        </td>
                        <td className="py-2.5 px-3">
                          <button onClick={(e) => { e.stopPropagation(); toggleComplete(task); }} className={cn(
                            "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                            task.is_completed ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary"
                          )}>
                            {task.is_completed && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            {task.is_favorite && <Star className="h-3.5 w-3.5 fill-warning text-warning shrink-0" />}
                            <span className="text-sm">{task.title}</span>
                          </div>
                          {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">{task.description}</p>}
                        </td>
                        <td className="py-2.5 px-3 text-sm text-muted-foreground">{task.assignee || "—"}</td>
                        <td className="py-2.5 px-3 text-sm text-muted-foreground">
                          {task.scheduled_date ? format(new Date(task.scheduled_date), "dd/MM/yy") : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          {(() => {
                            const cat = categories.find(c => c.id === task.category_id);
                            return cat ? (
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cat.color}20`, color: cat.color || undefined }}>
                                {cat.icon} {cat.name}
                              </span>
                            ) : <span className="text-sm text-muted-foreground">—</span>;
                          })()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", "bg-warning/10 text-warning")}>
                            Pendente
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                variant="ghost" size="sm"
                className="mt-3 text-sm text-muted-foreground hover:text-foreground gap-1.5"
                onClick={() => { resetTaskForm(); setTaskDialogOpen(true); }}
              >
                <Plus className="h-4 w-4" /> Nova Tarefa
              </Button>

              {completedTasks.length > 0 && (
                <Collapsible open={showCompleted} onOpenChange={setShowCompleted} className="mt-5">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", !showCompleted && "-rotate-90")} />
                    Concluídas ({completedTasks.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <table className="w-full">
                      <tbody>
                        {completedTasks.map((task, idx) => (
                          <tr key={task.id}
                            className="group cursor-pointer transition-colors hover:bg-muted/20 border-t border-border/10 opacity-50"
                            onClick={() => openEditTask(task)}>
                            <td className="py-2.5 px-3 w-8"></td>
                            <td className="py-2.5 px-3 w-8">
                              <button onClick={(e) => { e.stopPropagation(); toggleComplete(task); }} className="flex h-5 w-5 items-center justify-center rounded border-2 border-primary bg-primary">
                                <Check className="h-3.5 w-3.5 text-primary-foreground" />
                              </button>
                            </td>
                            <td className="py-2.5 px-3"><span className="text-sm line-through">{task.title}</span></td>
                            <td className="py-2.5 px-3 text-sm text-muted-foreground">{task.assignee || "—"}</td>
                            <td className="py-2.5 px-3 text-sm text-muted-foreground">
                              {task.scheduled_date ? format(new Date(task.scheduled_date), "dd/MM/yy") : "—"}
                            </td>
                            <td className="py-2.5 px-3">
                              {(() => {
                                const cat = categories.find(c => c.id === task.category_id);
                                return cat ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cat.color}20`, color: cat.color || undefined }}>{cat.icon} {cat.name}</span> : "—";
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">Feito</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-base font-medium">Selecione um projeto</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Escolha um projeto na barra lateral para ver as tarefas</p>
            </div>
          </div>
        )}
      </div>

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={(o) => { setProjectDialogOpen(o); if (!o) resetProjectForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editingProject ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Nome do Projeto</Label>
              <Input value={projName} onChange={(e) => setProjName(e.target.value)} className="mt-1" placeholder="Ex: Reforma do escritório" />
            </div>
            <div>
              <Label className="text-sm">Descrição</Label>
              <Textarea value={projDescription} onChange={(e) => setProjDescription(e.target.value)} className="mt-1" placeholder="Descrição do projeto (opcional)" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Orçamento</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span>
                  <Input type="text" inputMode="decimal" placeholder="0,00" value={projBudget} onChange={(e) => setProjBudget(e.target.value.replace(/[^0-9.,]/g, ""))} className="pl-10" />
                </div>
              </div>
              <div>
                <Label className="text-sm">Status</Label>
                <Select value={projStatus} onValueChange={setProjStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm">Categoria</Label>
              <Select value={projCategoryId} onValueChange={setProjCategoryId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                <SelectContent>
                  {projectCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveProject} className="w-full gap-2">
              <Save className="h-4 w-4" /> {editingProject ? "Salvar Alterações" : "Criar Projeto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={(o) => { setTaskDialogOpen(o); if (!o) resetTaskForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Título da Tarefa</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="mt-1" placeholder="O que precisa ser feito?" />
            </div>
            <div>
              <Label className="text-sm">Notas / Descrição</Label>
              <Textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} className="mt-1" placeholder="Detalhes, links, observações..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Data</Label>
                <Input type="date" value={taskScheduledDate} onChange={(e) => setTaskScheduledDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1.5"><User className="h-4 w-4" /> Responsável</Label>
                <Input value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="mt-1" placeholder="Nome" />
              </div>
            </div>
            <div>
              <Label className="text-sm flex items-center gap-1.5"><Tag className="h-4 w-4" /> Categoria</Label>
              <Select value={taskCategoryId} onValueChange={setTaskCategoryId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={taskIsFavorite} onCheckedChange={(c) => setTaskIsFavorite(!!c)} id="task-fav" />
              <label htmlFor="task-fav" className="text-sm cursor-pointer flex items-center gap-1.5">
                <Star className="h-4 w-4 text-warning" /> Marcar como favorita
              </label>
            </div>
            <DialogFooter className="flex gap-2">
              {editingTask && (
                <Button variant="destructive" onClick={() => { deleteTask(editingTask.id); setTaskDialogOpen(false); }} className="gap-1">
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveTask} className="gap-1">
                <Save className="h-4 w-4" /> {editingTask ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
