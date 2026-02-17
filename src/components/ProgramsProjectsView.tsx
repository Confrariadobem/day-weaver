import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Plus, ChevronDown, Star, FolderOpen, FolderClosed,
  Trash2, Save, User, Users, Check, ArrowUpDown, ChevronsUpDown,
  Printer, Layers, FolderKanban, AlertTriangle, CalendarDays,
  TrendingUp, TrendingDown, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

type SortField = "title" | "status" | "priority" | "date" | "assignee";
type SortDir = "asc" | "desc";
type ViewMode = "dashboard" | "eap";
type FilterStatus = "all" | "active" | "delayed" | "completed";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function getPriorityFromDesc(desc: string | null): string {
  if (!desc) return "medium";
  const m = desc.match(/\[prioridade:(\w+)\]/);
  return m ? m[1] : "medium";
}

function getPriorityBadge(p: string) {
  if (p === "urgent") return <span className="text-[10px] px-1 py-0.5 rounded bg-destructive/20 text-destructive">🔥</span>;
  if (p === "high") return <span className="text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive/80">🔴</span>;
  if (p === "medium") return <span className="text-[10px] px-1 py-0.5 rounded bg-warning/10 text-warning">🟡</span>;
  return <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">🟢</span>;
}

interface Phase {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export default function ProgramsProjectsView() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("eap");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Tables<"tasks">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);

  const [search, setSearch] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newPhaseName, setNewPhaseName] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const [expandLevel, setExpandLevel] = useState(3);

  // Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Tables<"projects"> | null>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<string | null>(null);
  const [projName, setProjName] = useState("");
  const [projDescription, setProjDescription] = useState("");
  const [projBudget, setProjBudget] = useState("");
  const [projStatus, setProjStatus] = useState("active");
  const [projCategoryId, setProjCategoryId] = useState("");
  const [projResponsible, setProjResponsible] = useState("");
  const [projStartDate, setProjStartDate] = useState("");
  const [projEndDate, setProjEndDate] = useState("");
  const [projDialogTab, setProjDialogTab] = useState("details");
  const [resName, setResName] = useState("");
  const [resRole, setResRole] = useState("");

  // Task edit
  const [taskEditDialogOpen, setTaskEditDialogOpen] = useState(false);
  const [editingTaskItem, setEditingTaskItem] = useState<CalendarItem | null>(null);
  const [taskEditDefaultDate, setTaskEditDefaultDate] = useState<Date>(new Date());

  const lastProjClickRef = useRef<{ id: string; time: number } | null>(null);
  const lastTaskClickRef = useRef<{ id: string; time: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, completedRes, catsRes, projRes, entRes, resRes, phaseRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", false).order("sort_order"),
      supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", true).order("updated_at", { ascending: false }).limit(50),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
      supabase.from("project_resources").select("*"),
      supabase.from("project_phases").select("*").eq("user_id", user.id).order("sort_order"),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (completedRes.data) setCompletedTasks(completedRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (entRes.data) setEntries(entRes.data);
    if (resRes.data) setResources(resRes.data);
    if (phaseRes.data) setPhases(phaseRes.data as Phase[]);
  }, [user]);

  useEffect(() => {
    fetchData();
    if (!user) return;
    const channel = supabase
      .channel("programs-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchData]);

  const sortTasks = useCallback((list: Tables<"tasks">[]) => {
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = a.title.localeCompare(b.title, "pt-BR");
      else if (sortField === "priority") cmp = (PRIORITY_ORDER[getPriorityFromDesc(a.description)] || 2) - (PRIORITY_ORDER[getPriorityFromDesc(b.description)] || 2);
      else if (sortField === "date") cmp = (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999");
      else if (sortField === "assignee") cmp = (a.assignee || "zzz").localeCompare(b.assignee || "zzz", "pt-BR");
      else if (sortField === "status") cmp = (a.is_completed ? 1 : 0) - (b.is_completed ? 1 : 0);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const toggleTaskComplete = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    if (task.project_id && !task.is_completed) {
      const allProjectTasks = [...tasks, ...completedTasks].filter(t => t.project_id === task.project_id);
      const remainingIncomplete = allProjectTasks.filter(t => !t.is_completed && t.id !== task.id);
      if (remainingIncomplete.length === 0) {
        await supabase.from("projects").update({ status: "completed" }).eq("id", task.project_id);
      }
    }
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    fetchData();
  };

  const toggleFavorite = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_favorite: !task.is_favorite }).eq("id", task.id);
  };

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [categories]);

  const projectCategories = sortedCategories.filter(c => c.is_project);

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (filterStatus === "active") list = list.filter(p => p.status === "active");
    else if (filterStatus === "completed") list = list.filter(p => p.status === "completed");
    else if (filterStatus === "delayed") {
      const today = new Date().toISOString().slice(0, 10);
      list = list.filter(p => p.status !== "completed"); // simplified delay check
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [projects, filterStatus, search]);

  const activeProjects = filteredProjects.filter(p => p.status !== "completed");
  const completedProjectsList = filteredProjects.filter(p => p.status === "completed");

  const getProjectCosts = useCallback((projectId: string) => {
    const projEntries = entries.filter(e => e.project_id === projectId);
    const totalCost = projEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const totalRevenue = projEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
    return { totalCost, totalRevenue };
  }, [entries]);

  const getProjectProgress = useCallback((projectId: string) => {
    const pTasks = [...tasks, ...completedTasks].filter(t => t.project_id === projectId);
    if (pTasks.length === 0) return 0;
    return Math.round((pTasks.filter(t => t.is_completed).length / pTasks.length) * 100);
  }, [tasks, completedTasks]);

  const resetProjectForm = () => {
    setProjName(""); setProjDescription(""); setProjBudget(""); setProjStatus("active");
    setProjCategoryId(""); setProjResponsible(""); setProjStartDate(""); setProjEndDate("");
    setEditingProject(null); setProjDialogTab("details");
  };

  const openEditProject = (p: Tables<"projects">) => {
    setEditingProject(p);
    setProjName(p.name); setProjDescription(p.description || "");
    setProjBudget(p.budget ? String(p.budget) : ""); setProjStatus(p.status || "active");
    setProjCategoryId(p.category_id || ""); setProjResponsible((p as any).responsible || "");
    setProjDialogTab("details"); setProjectDialogOpen(true);
  };

  const handleProjectClick = (p: Tables<"projects">) => {
    const now = Date.now();
    if (lastProjClickRef.current?.id === p.id && now - lastProjClickRef.current.time < 400) {
      openEditProject(p); lastProjClickRef.current = null;
    } else {
      setSelectedProject(selectedProject === p.id ? null : p.id);
      lastProjClickRef.current = { id: p.id, time: now };
    }
  };

  const saveProject = async () => {
    if (!projName.trim() || !user) return;
    if (projStatus === "completed" && editingProject) {
      const allTasks = [...tasks, ...completedTasks];
      const projTasks = allTasks.filter(t => t.project_id === editingProject.id);
      const incompleteTasks = projTasks.filter(t => !t.is_completed);
      if (incompleteTasks.length > 0) {
        alert(`Não é possível concluir. ${incompleteTasks.length} tarefa(s) pendente(s).`);
        return;
      }
    }
    const data: any = {
      name: projName.trim(), description: projDescription || null,
      budget: projBudget ? parseFloat(projBudget.replace(/\./g, "").replace(",", ".")) : 0,
      status: projStatus, category_id: projCategoryId || null,
      responsible: projResponsible || null, user_id: user.id,
    };
    if (editingProject) await supabase.from("projects").update(data).eq("id", editingProject.id);
    else await supabase.from("projects").insert(data);
    resetProjectForm(); setProjectDialogOpen(false); fetchData();
  };

  const deleteProject = async (id: string) => {
    const allTasks = [...tasks, ...completedTasks];
    if (allTasks.filter(t => t.project_id === id).length > 0) {
      alert("Não é possível excluir. Tarefas associadas.");
      setDeleteProjectConfirm(null); return;
    }
    await supabase.from("projects").delete().eq("id", id);
    if (selectedProject === id) setSelectedProject(null);
    setDeleteProjectConfirm(null); setProjectDialogOpen(false);
    resetProjectForm(); fetchData();
  };

  const addResource = async () => {
    if (!resName.trim() || !editingProject || !user) return;
    await supabase.from("project_resources").insert({
      project_id: editingProject.id, user_id: user.id, name: resName.trim(), role: resRole || null,
    });
    setResName(""); setResRole(""); fetchData();
  };

  const removeResource = async (id: string) => {
    await supabase.from("project_resources").delete().eq("id", id);
    fetchData();
  };

  const addPhase = async (projectId: string) => {
    if (!newPhaseName.trim() || !user) return;
    const maxOrder = phases.filter(p => p.project_id === projectId).reduce((m, p) => Math.max(m, p.sort_order), 0);
    await supabase.from("project_phases").insert({
      project_id: projectId, user_id: user.id, name: newPhaseName.trim(), sort_order: maxOrder + 1,
    });
    setNewPhaseName(""); fetchData();
  };

  const deletePhase = async (id: string) => {
    await supabase.from("project_phases").delete().eq("id", id);
    fetchData();
  };

  const projectResources = useMemo(() => {
    if (!editingProject) return [];
    return resources.filter((r: any) => r.project_id === editingProject.id);
  }, [resources, editingProject]);

  const allActiveTasks = useMemo(() => {
    let list = search ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tasks;
    return sortTasks(list);
  }, [tasks, search, sortTasks]);

  const cycleExpand = () => setExpandLevel(prev => prev === 3 ? 1 : prev + 1);
  const expandLabel = expandLevel === 1 ? "Categorias" : expandLevel === 2 ? "Projetos" : "Tudo";

  const handleTaskDoubleClick = (task: Tables<"tasks">) => {
    const now = Date.now();
    if (lastTaskClickRef.current?.id === task.id && now - lastTaskClickRef.current.time < 400) {
      const calItem: CalendarItem = {
        id: `task-${task.id}`, title: task.title,
        start_time: task.scheduled_date ? new Date(`${task.scheduled_date}T00:00:00`).toISOString() : new Date().toISOString(),
        all_day: true, color: "#f97316", description: task.description,
        task_id: task.id, user_id: task.user_id, is_task: true, is_completed: task.is_completed,
        is_favorite: task.is_favorite || false,
      };
      setEditingTaskItem(calItem);
      setTaskEditDefaultDate(task.scheduled_date ? new Date(task.scheduled_date) : new Date());
      setTaskEditDialogOpen(true);
      lastTaskClickRef.current = null;
    } else {
      lastTaskClickRef.current = { id: task.id, time: now };
    }
  };

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    const active = projects.filter(p => p.status === "active");
    const completed = projects.filter(p => p.status === "completed");
    const totalBudget = active.reduce((s, p) => s + Number(p.budget || 0), 0);
    const totalSpent = active.reduce((s, p) => s + getProjectCosts(p.id).totalCost, 0);
    const avgProgress = active.length > 0 ? active.reduce((s, p) => s + getProjectProgress(p.id), 0) / active.length : 0;
    const overBudget = active.filter(p => {
      const costs = getProjectCosts(p.id);
      return Number(p.budget || 0) > 0 && costs.totalCost > Number(p.budget);
    });
    const upcomingTasks = tasks
      .filter(t => t.project_id && t.scheduled_date && !t.is_completed)
      .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
      .slice(0, 5);
    return { active: active.length, completed: completed.length, totalBudget, totalSpent, avgProgress, overBudget, upcomingTasks };
  }, [projects, tasks, getProjectCosts, getProjectProgress]);

  const TaskRow = ({ task }: { task: Tables<"tasks"> }) => {
    const priority = getPriorityFromDesc(task.description);
    return (
      <div
        onClick={() => handleTaskDoubleClick(task)}
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-accent/50 cursor-pointer"
      >
        <Checkbox
          checked={!!task.is_completed}
          onCheckedChange={() => toggleTaskComplete(task)}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0"
        />
        <span className={cn("flex-1 truncate", task.is_completed && "line-through opacity-50")}>{task.title}</span>
        {getPriorityBadge(priority)}
        {task.scheduled_date && (
          <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(task.scheduled_date), "dd/MM")}</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); toggleFavorite(task); }} className="shrink-0 opacity-0 group-hover:opacity-100">
          <Star className={cn("h-3 w-3", task.is_favorite ? "fill-warning text-warning" : "text-muted-foreground")} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive">
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  };

  const ProjectBlock = ({ p }: { p: Tables<"projects"> }) => {
    const allPTasks = [...tasks, ...completedTasks].filter(t => t.project_id === p.id);
    const pDone = allPTasks.filter(t => t.is_completed).length;
    const costs = getProjectCosts(p.id);
    const isSelected = selectedProject === p.id;
    const FolderIcon = isSelected ? FolderOpen : FolderClosed;
    const projectPhases = phases.filter(ph => ph.project_id === p.id).sort((a, b) => a.sort_order - b.sort_order);
    const isOverBudget = Number(p.budget || 0) > 0 && costs.totalCost > Number(p.budget);

    return (
      <div>
        <div onClick={() => handleProjectClick(p)}
          className={cn("group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
          )}>
          <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium truncate">{p.name}</p>
              {isOverBudget && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{pDone}/{allPTasks.length} atividades</span>
              {costs.totalCost > 0 && <span>• {brl(costs.totalCost)}{Number(p.budget) > 0 ? ` / ${brl(Number(p.budget))}` : ""}</span>}
            </div>
          </div>
          <div className="w-12 shrink-0">
            <Progress value={allPTasks.length > 0 ? (pDone / allPTasks.length) * 100 : 0} className="h-1.5" />
          </div>
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", !isSelected && "-rotate-90")} />
        </div>
        {isSelected && expandLevel >= 3 && (
          <div className="ml-4 mt-1 mb-2 space-y-1 border-l-2 border-primary/20 pl-2">
            {/* Phases */}
            {projectPhases.map(phase => {
              const phaseTasks = allPTasks.filter((t: any) => t.phase_id === phase.id);
              const phDone = phaseTasks.filter(t => t.is_completed).length;
              return (
                <Collapsible key={phase.id} defaultOpen>
                  <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-accent/30">
                    <ChevronDown className="h-2.5 w-2.5" />
                    <span>{phase.name}</span>
                    <span className="ml-auto text-[9px] font-normal">{phDone}/{phaseTasks.length}</span>
                    <button onClick={(e) => { e.stopPropagation(); deletePhase(phase.id); }} className="opacity-0 group-hover:opacity-100 hover:text-destructive">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-3 space-y-0.5">
                    {sortTasks(phaseTasks.filter(t => !t.is_completed)).map(task => <TaskRow key={task.id} task={task} />)}
                    {phaseTasks.filter(t => t.is_completed).length > 0 && (
                      <p className="text-[10px] text-muted-foreground/50 px-2 pt-0.5">+{phaseTasks.filter(t => t.is_completed).length} concluída(s)</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            {/* Unphased tasks */}
            {(() => {
              const phaseIds = new Set(projectPhases.map(ph => ph.id));
              const unphasedTasks = allPTasks.filter((t: any) => !t.phase_id || !phaseIds.has(t.phase_id));
              const activeTasks = unphasedTasks.filter(t => !t.is_completed);
              const doneTasks = unphasedTasks.filter(t => t.is_completed);
              if (activeTasks.length === 0 && doneTasks.length === 0 && projectPhases.length > 0) return null;
              return (
                <>
                  {projectPhases.length > 0 && activeTasks.length > 0 && (
                    <p className="text-[10px] text-muted-foreground font-medium px-1.5 pt-1">Sem etapa</p>
                  )}
                  {sortTasks(activeTasks).map(task => <TaskRow key={task.id} task={task} />)}
                  {doneTasks.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/50 px-2 pt-0.5">+{doneTasks.length} concluída(s)</p>
                  )}
                </>
              );
            })()}

            {/* Add phase */}
            <div className="flex gap-1 mt-1">
              <Input placeholder="Nova etapa..." value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addPhase(p.id); }}
                className="h-5 text-[9px]" />
              <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => addPhase(p.id)}>
                <Layers className="h-2.5 w-2.5" />
              </Button>
            </div>

            {/* Add task */}
            <div className="flex gap-1">
              <Input placeholder="Nova atividade..." value={newTask} onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newTask.trim() && user) {
                    await supabase.from("tasks").insert({ title: newTask.trim(), user_id: user.id, project_id: p.id });
                    setNewTask(""); fetchData();
                  }
                }} className="h-5 text-[9px]" />
              <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={async () => {
                if (newTask.trim() && user) {
                  await supabase.from("tasks").insert({ title: newTask.trim(), user_id: user.id, project_id: p.id });
                  setNewTask(""); fetchData();
                }
              }}><Plus className="h-2.5 w-2.5" /></Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Dashboard view
  const DashboardPanel = () => (
    <div className="space-y-4 p-4 overflow-auto h-full">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FolderKanban className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Ativos</p>
              <p className="text-lg font-bold">{dashboardStats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Check className="h-5 w-5 text-[hsl(var(--success))]" />
            <div>
              <p className="text-[10px] text-muted-foreground">Concluídos</p>
              <p className="text-lg font-bold">{dashboardStats.completed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground">Gasto Total</p>
              <p className="text-sm font-bold text-destructive">{brl(dashboardStats.totalSpent)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Orçado Total</p>
              <p className="text-sm font-bold">{brl(dashboardStats.totalBudget)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress overview */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Progresso Médio</p>
          <Progress value={dashboardStats.avgProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-1">{Math.round(dashboardStats.avgProgress)}% concluído</p>
        </CardContent>
      </Card>

      {/* Over budget alerts */}
      {dashboardStats.overBudget.length > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-destructive flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-4 w-4" /> Estouro de Orçamento
            </p>
            {dashboardStats.overBudget.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs py-1">
                <span>{p.name}</span>
                <span className="text-destructive font-medium">{brl(getProjectCosts(p.id).totalCost)} / {brl(Number(p.budget))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming tasks */}
      {dashboardStats.upcomingTasks.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-primary" /> Próximos Vencimentos
            </p>
            {dashboardStats.upcomingTasks.map(t => (
              <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                <span className="truncate flex-1">{t.title}</span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {t.scheduled_date ? format(new Date(t.scheduled_date), "dd/MM") : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top 5 active projects */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Top 5 Projetos Ativos</p>
          {projects.filter(p => p.status === "active").slice(0, 5).map(p => {
            const progress = getProjectProgress(p.id);
            const costs = getProjectCosts(p.id);
            return (
              <div key={p.id} className="mb-3 last:mb-0 cursor-pointer hover:bg-accent/30 rounded-lg p-2 -mx-2" onClick={() => { setViewMode("eap"); setSelectedProject(p.id); }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5 mb-1" />
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>Gasto: {brl(costs.totalCost)}</span>
                  {Number(p.budget) > 0 && <span>Orçamento: {brl(Number(p.budget))}</span>}
                </div>
              </div>
            );
          })}
          {projects.filter(p => p.status === "active").length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum projeto ativo</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Programas e Projetos</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5">
              <button onClick={() => setViewMode("dashboard")}
                className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === "dashboard" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}>Dashboard</button>
              <button onClick={() => setViewMode("eap")}
                className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewMode === "eap" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}>EAP</button>
            </div>
            <Button size="sm" onClick={() => { resetProjectForm(); setProjectDialogOpen(true); }} className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" /> Novo Projeto
            </Button>
          </div>
        </div>

        {viewMode === "dashboard" ? (
          <DashboardPanel />
        ) : (
          <>
            {/* Search & Filters */}
            <div className="px-4 pt-3 pb-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar programas, projetos ou atividades..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-sm" />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Em andamento</SelectItem>
                  <SelectItem value="delayed">Atrasados</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Bar */}
            <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border/20 text-[10px] text-muted-foreground">
              {([
                { field: "title" as SortField, label: "Atividade" },
                { field: "status" as SortField, label: "Status" },
                { field: "priority" as SortField, label: "Prior." },
                { field: "date" as SortField, label: "Prazo" },
                { field: "assignee" as SortField, label: "Resp." },
              ]).map(s => (
                <button key={s.field} onClick={() => toggleSort(s.field)}
                  className={cn("px-1.5 py-0.5 rounded hover:bg-accent/50 transition-colors flex items-center gap-0.5",
                    sortField === s.field && "text-primary font-medium"
                  )}>
                  {s.label}
                  {sortField === s.field && <ArrowUpDown className="h-2.5 w-2.5" />}
                </button>
              ))}
              <div className="ml-auto flex gap-0.5">
                <button onClick={cycleExpand} className="p-0.5 rounded hover:bg-accent/50 flex items-center gap-0.5" title={`Nível: ${expandLabel}`}>
                  <ChevronsUpDown className="h-3 w-3" />
                  <span className="text-[9px]">{expandLevel}</span>
                </button>
                <button onClick={() => {
                  const printContent = tasks.map(t => `${t.is_completed ? "✅" : "⬜"} ${t.title}`).join("\n");
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(`<pre style="font-family:sans-serif;font-size:14px;">${printContent}</pre>`); w.print(); }
                }} className="p-0.5 rounded hover:bg-accent/50" title="Imprimir">
                  <Printer className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* EAP Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {sortedCategories.filter(c => c.is_project).map((cat) => {
                const catProjects = activeProjects.filter(p => p.category_id === cat.id);
                const catOrphanTasks = allActiveTasks.filter(t => t.category_id === cat.id && !t.project_id);
                if (catProjects.length === 0 && catOrphanTasks.length === 0) return null;
                return (
                  <Collapsible key={cat.id} open={expandLevel >= 1} className="mb-1">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-foreground hover:bg-accent/50">
                      <Layers className="h-4 w-4 text-primary" />
                      {cat.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                      <span className="truncate">{cat.icon} {cat.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground font-normal">{catProjects.length} projetos • {catOrphanTasks.length} atividades</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 pt-0.5 space-y-0.5">
                      {expandLevel >= 2 && catProjects.map((p) => <ProjectBlock key={p.id} p={p} />)}
                      {expandLevel >= 3 && catOrphanTasks.map(task => <TaskRow key={task.id} task={task} />)}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Uncategorized */}
              {(() => {
                const uncatProjects = activeProjects.filter(p => !p.category_id);
                const uncatTasks = allActiveTasks.filter(t => !t.category_id && !t.project_id);
                if (uncatProjects.length === 0 && uncatTasks.length === 0) return null;
                return (
                  <Collapsible open={expandLevel >= 1} className="mb-1">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-foreground hover:bg-accent/50">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <span>Sem Programa</span>
                      <span className="ml-auto text-[10px] text-muted-foreground font-normal">{uncatProjects.length}P / {uncatTasks.length}T</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 pt-0.5 space-y-0.5">
                      {expandLevel >= 2 && uncatProjects.map((p) => <ProjectBlock key={p.id} p={p} />)}
                      {expandLevel >= 3 && uncatTasks.map(task => <TaskRow key={task.id} task={task} />)}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })()}

              {activeProjects.length === 0 && allActiveTasks.filter(t => !t.project_id).length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Layers className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">Nenhum programa ou projeto</p>
                  <p className="text-xs">Crie um novo projeto para começar a organizar suas atividades.</p>
                </div>
              )}

              {/* Completed */}
              {completedProjectsList.length > 0 && (
                <Collapsible open={showCompletedProjects} onOpenChange={setShowCompletedProjects} className="mt-4">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full px-2 py-1.5">
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showCompletedProjects && "-rotate-90")} />
                    <Check className="h-3.5 w-3.5" />
                    Concluídos ({completedProjectsList.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5 mt-1">
                    {completedProjectsList.map((p) => (
                      <div key={p.id} onClick={() => openEditProject(p)}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-accent/50 opacity-50">
                        <FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="text-xs truncate line-through">{p.name}</p>
                        <span className="ml-auto text-[10px] text-muted-foreground">{getProjectProgress(p.id)}%</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </>
        )}
      </div>

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={(o) => { setProjectDialogOpen(o); if (!o) resetProjectForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingProject ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          </DialogHeader>
          <Tabs value={projDialogTab} onValueChange={setProjDialogTab}>
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1 text-xs">Detalhes</TabsTrigger>
              {editingProject && <TabsTrigger value="resources" className="flex-1 text-xs">Recursos ({projectResources.length})</TabsTrigger>}
              {editingProject && <TabsTrigger value="phases" className="flex-1 text-xs">Etapas ({phases.filter(ph => ph.project_id === editingProject.id).length})</TabsTrigger>}
            </TabsList>
            <div className="mt-4">
              {projDialogTab === "details" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Nome do Projeto</Label>
                    <Input value={projName} onChange={(e) => setProjName(e.target.value)} className="mt-1" placeholder="Ex: Reforma do escritório" />
                  </div>
                  <div>
                    <Label className="text-sm">Descrição</Label>
                    <Textarea value={projDescription} onChange={(e) => setProjDescription(e.target.value)} className="mt-1" placeholder="Opcional" rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Data Início</Label>
                      <Input type="date" value={projStartDate} onChange={(e) => setProjStartDate(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-sm">Data Término</Label>
                      <Input type="date" value={projEndDate} onChange={(e) => setProjEndDate(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm">Orçamento</Label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span>
                        <Input type="text" inputMode="decimal" placeholder="0,00" value={projBudget}
                          onChange={(e) => setProjBudget(e.target.value.replace(/[^0-9.,]/g, ""))} className="pl-10" />
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
                    <Label className="text-sm flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Responsável</Label>
                    <Input value={projResponsible} onChange={(e) => setProjResponsible(e.target.value)} className="mt-1" placeholder="Nome do responsável" />
                  </div>
                  <div>
                    <Label className="text-sm">Programa (Categoria)</Label>
                    <Select value={projCategoryId} onValueChange={setProjCategoryId}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {projectCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {projDialogTab === "resources" && editingProject && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input placeholder="Nome" value={resName} onChange={(e) => setResName(e.target.value)} className="flex-1 text-sm" />
                    <Input placeholder="Função" value={resRole} onChange={(e) => setResRole(e.target.value)} className="w-32 text-sm" />
                    <Button size="sm" onClick={addResource} className="shrink-0"><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  {projectResources.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum recurso alocado</p>}
                  {projectResources.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border/30 p-2.5">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        {r.role && <p className="text-xs text-muted-foreground">{r.role}</p>}
                      </div>
                      <button onClick={() => removeResource(r.id)} className="rounded p-1 hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {projDialogTab === "phases" && editingProject && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input placeholder="Nova etapa (ex: Planejamento, Execução, Entrega)" value={newPhaseName}
                      onChange={(e) => setNewPhaseName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addPhase(editingProject.id); }}
                      className="flex-1 text-sm" />
                    <Button size="sm" onClick={() => addPhase(editingProject.id)} className="shrink-0"><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  {phases.filter(ph => ph.project_id === editingProject.id).sort((a, b) => a.sort_order - b.sort_order).map(ph => {
                    const phaseTasks = [...tasks, ...completedTasks].filter((t: any) => t.phase_id === ph.id);
                    const done = phaseTasks.filter(t => t.is_completed).length;
                    return (
                      <div key={ph.id} className="flex items-center gap-3 rounded-lg border border-border/30 p-2.5">
                        <Layers className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{ph.name}</p>
                          <p className="text-xs text-muted-foreground">{done}/{phaseTasks.length} atividades</p>
                        </div>
                        <button onClick={() => deletePhase(ph.id)} className="rounded p-1 hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
                        </button>
                      </div>
                    );
                  })}
                  {phases.filter(ph => ph.project_id === editingProject.id).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma etapa criada. Sugestões: Planejamento, Execução, Entrega</p>
                  )}
                </div>
              )}
            </div>
          </Tabs>
          <div className="flex items-center gap-2 pt-4 border-t border-border/20">
            {editingProject && (
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setDeleteProjectConfirm(editingProject.id)}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => { setProjectDialogOpen(false); resetProjectForm(); }}>Cancelar</Button>
              <Button size="sm" onClick={saveProject} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteProjectConfirm} onOpenChange={(o) => { if (!o) setDeleteProjectConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setDeleteProjectConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteProjectConfirm && deleteProject(deleteProjectConfirm)}>Excluir</Button>
          </div>
        </DialogContent>
      </Dialog>

      <EventEditDialog open={taskEditDialogOpen} onOpenChange={setTaskEditDialogOpen} item={editingTaskItem}
        defaultDate={taskEditDefaultDate} userId={user?.id || ""} onSaved={fetchData} />
    </>
  );
}
