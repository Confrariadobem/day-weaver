import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, ChevronRight, Star, Trash2, Save, User,
  Check, FolderKanban, Layers, ListTodo, Clock,
  ArrowLeft, BarChart3, CircleDollarSign, Plus, GripVertical,
  AlertCircle, Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

type FilterStatus = "all" | "programs" | "projects" | "tasks";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

interface Phase {
  id: string; project_id: string; user_id: string;
  name: string; sort_order: number; created_at: string;
}

interface Program {
  id: string; user_id: string; name: string; description: string | null;
  color: string | null; status: string | null;
  created_at: string; updated_at: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: "Urgente", icon: <AlertCircle className="h-3 w-3" />, color: "text-destructive" },
  high: { label: "Alta", icon: <Flag className="h-3 w-3" />, color: "text-destructive" },
  medium: { label: "Média", icon: <Flag className="h-3 w-3" />, color: "text-warning" },
  low: { label: "Baixa", icon: <Flag className="h-3 w-3" />, color: "text-[hsl(var(--success))]" },
};

export default function ProgramsProjectsView() {
  const { user } = useAuth();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Tables<"tasks">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [search, setSearch] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newPhaseName, setNewPhaseName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<string | null>(null);
  const [projName, setProjName] = useState("");
  const [projDescription, setProjDescription] = useState("");
  const [projBudget, setProjBudget] = useState("");
  const [projStatus, setProjStatus] = useState("active");
  const [projCategoryId, setProjCategoryId] = useState("");
  const [projResponsible, setProjResponsible] = useState("");
  const [projProgramId, setProjProgramId] = useState("");
  const [projDialogTab, setProjDialogTab] = useState("details");
  const [resName, setResName] = useState("");
  const [resRole, setResRole] = useState("");
  const [taskEditDialogOpen, setTaskEditDialogOpen] = useState(false);
  const [editingTaskItem, setEditingTaskItem] = useState<CalendarItem | null>(null);
  const [taskEditDefaultDate, setTaskEditDefaultDate] = useState<Date>(new Date());
  const lastTaskClickRef = useRef<{ id: string; time: number } | null>(null);

  // Program dialog
  const [programDialogOpen, setProgramDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [progName, setProgName] = useState("");
  const [progDescription, setProgDescription] = useState("");
  const [progColor, setProgColor] = useState("#3b82f6");
  const [progProjectIds, setProgProjectIds] = useState<string[]>([]);
  const [deleteProgramConfirm, setDeleteProgramConfirm] = useState<string | null>(null);

  // WBS view
  const [showWBS, setShowWBS] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, completedRes, catsRes, projRes, entRes, resRes, phaseRes, progRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", false).order("sort_order"),
      supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", true).order("updated_at", { ascending: false }).limit(50),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
      supabase.from("project_resources").select("*"),
      supabase.from("project_phases").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("programs").select("*").eq("user_id", user.id).order("name"),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (completedRes.data) setCompletedTasks(completedRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (entRes.data) setEntries(entRes.data);
    if (resRes.data) setResources(resRes.data);
    if (phaseRes.data) setPhases(phaseRes.data as Phase[]);
    if (progRes.data) setPrograms(progRes.data as Program[]);
  }, [user]);

  useEffect(() => {
    fetchData();
    if (!user) return;
    const channel = supabase
      .channel("programs-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "programs", filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();
    const handleDataChanged = () => fetchData();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => { supabase.removeChannel(channel); window.removeEventListener("lovable:data-changed", handleDataChanged); };
  }, [user, fetchData]);

  const allTasks = useMemo(() => [...tasks, ...completedTasks], [tasks, completedTasks]);

  const getProjectCosts = useCallback((projectId: string) => {
    const projEntries = entries.filter(e => e.project_id === projectId);
    const totalCost = projEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const totalRevenue = projEntries.filter(e => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
    return { totalCost, totalRevenue };
  }, [entries]);

  const getProjectProgress = useCallback((projectId: string) => {
    const pTasks = allTasks.filter(t => t.project_id === projectId);
    if (pTasks.length === 0) return 0;
    return Math.round((pTasks.filter(t => t.is_completed).length / pTasks.length) * 100);
  }, [allTasks]);

  // KPIs
  const kpis = useMemo(() => {
    const active = projects.filter(p => p.status !== "completed").length;
    const completed = projects.filter(p => p.status === "completed").length;
    const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
    const totalCost = projects.reduce((s, p) => s + getProjectCosts(p.id).totalCost, 0);
    const pendingTasks = tasks.length;
    const programCount = programs.length;
    return { active, completed, totalBudget, totalCost, pendingTasks, programCount };
  }, [projects, tasks, getProjectCosts, programs]);

  const visibleProjects = useMemo(() => {
    let list = projects;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [projects, search]);

  const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId) || null, [projects, selectedProjectId]);

  // Actions
  const toggleTaskComplete = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    if (task.project_id && !task.is_completed) {
      const projTasks = allTasks.filter(t => t.project_id === task.project_id);
      const remaining = projTasks.filter(t => !t.is_completed && t.id !== task.id);
      if (remaining.length === 0) {
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
    fetchData();
  };

  const resetProjectForm = () => {
    setProjName(""); setProjDescription(""); setProjBudget(""); setProjStatus("active");
    setProjCategoryId(""); setProjResponsible(""); setProjProgramId(""); setEditingProject(null); setProjDialogTab("details");
  };

  const openEditProject = (p: any) => {
    setEditingProject(p);
    setProjName(p.name); setProjDescription(p.description || "");
    setProjBudget(p.budget ? String(p.budget) : ""); setProjStatus(p.status || "active");
    setProjCategoryId(p.category_id || ""); setProjResponsible(p.responsible || "");
    setProjProgramId(p.program_id || "");
    setProjDialogTab("details"); setProjectDialogOpen(true);
  };

  const saveProject = async () => {
    if (!projName.trim() || !user) return;
    const data: any = {
      name: projName.trim(), description: projDescription || null,
      budget: projBudget ? parseFloat(projBudget.replace(/\./g, "").replace(",", ".")) : 0,
      status: projStatus, category_id: projCategoryId || null,
      responsible: projResponsible || null, user_id: user.id,
      program_id: projProgramId || null,
    };
    if (editingProject) await supabase.from("projects").update(data).eq("id", editingProject.id);
    else await supabase.from("projects").insert(data);
    resetProjectForm(); setProjectDialogOpen(false); fetchData();
  };

  const deleteProject = async (id: string) => {
    if (allTasks.filter(t => t.project_id === id).length > 0) {
      alert("Não é possível excluir. Tarefas associadas.");
      setDeleteProjectConfirm(null); return;
    }
    await supabase.from("projects").delete().eq("id", id);
    if (selectedProjectId === id) setSelectedProjectId(null);
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

  // Program CRUD
  const resetProgramForm = () => {
    setProgName(""); setProgDescription(""); setProgColor("#3b82f6");
    setProgProjectIds([]); setEditingProgram(null);
  };

  const openEditProgram = (prog: Program) => {
    setEditingProgram(prog);
    setProgName(prog.name); setProgDescription(prog.description || "");
    setProgColor(prog.color || "#3b82f6");
    const linkedProjects = projects.filter(p => p.program_id === prog.id).map(p => p.id);
    setProgProjectIds(linkedProjects);
    setProgramDialogOpen(true);
  };

  const saveProgram = async () => {
    if (!progName.trim() || !user) return;
    const data = {
      name: progName.trim(), description: progDescription || null,
      color: progColor, user_id: user.id,
    };
    let programId: string;
    if (editingProgram) {
      await supabase.from("programs").update(data).eq("id", editingProgram.id);
      programId = editingProgram.id;
    } else {
      const { data: result } = await supabase.from("programs").insert(data).select("id").single();
      if (!result) return;
      programId = result.id;
    }
    // Update project associations
    const currentLinked = projects.filter(p => p.program_id === programId).map(p => p.id);
    const toAdd = progProjectIds.filter(id => !currentLinked.includes(id));
    const toRemove = currentLinked.filter(id => !progProjectIds.includes(id));
    for (const id of toAdd) await supabase.from("projects").update({ program_id: programId }).eq("id", id);
    for (const id of toRemove) await supabase.from("projects").update({ program_id: null }).eq("id", id);
    resetProgramForm(); setProgramDialogOpen(false); fetchData();
  };

  const deleteProgram = async (id: string) => {
    await supabase.from("projects").update({ program_id: null }).eq("program_id", id);
    await supabase.from("programs").delete().eq("id", id);
    setDeleteProgramConfirm(null); setProgramDialogOpen(false);
    resetProgramForm(); fetchData();
  };

  const toggleProgProjectId = (id: string) => {
    setProgProjectIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleTaskClick = (task: Tables<"tasks">) => {
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

  const statusConfig: Record<string, { label: string; color: string }> = {
    active: { label: "Em andamento", color: "bg-primary/15 text-primary border-primary/30" },
    paused: { label: "Pausado", color: "bg-warning/15 text-warning border-warning/30" },
    completed: { label: "Concluído", color: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" },
  };

  const getStatusBadge = (status: string | null) => {
    const cfg = statusConfig[(status || "active")] || statusConfig.active;
    return <Badge variant="outline" className={cn("text-[10px] font-medium border", cfg.color)}>{cfg.label}</Badge>;
  };

  const projectCategories = useMemo(() => categories.filter(c => c.is_project).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [categories]);

  // Get program name for a project
  const getProgramName = (programId: string | null) => {
    if (!programId) return null;
    return programs.find(p => p.id === programId)?.name || null;
  };

  // Group projects by program
  const projectsByProgram = useMemo(() => {
    const groups: { program: Program | null; projects: any[] }[] = [];
    const programMap = new Map<string, any[]>();
    const unlinked: any[] = [];

    visibleProjects.forEach(p => {
      if (p.program_id) {
        if (!programMap.has(p.program_id)) programMap.set(p.program_id, []);
        programMap.get(p.program_id)!.push(p);
      } else {
        unlinked.push(p);
      }
    });

    programs.forEach(prog => {
      const projList = programMap.get(prog.id) || [];
      if (projList.length > 0 || filterStatus === "programs") {
        groups.push({ program: prog, projects: projList });
      }
    });

    if (unlinked.length > 0) {
      groups.push({ program: null, projects: unlinked });
    }

    return groups;
  }, [visibleProjects, programs, filterStatus]);

  // ─── DETAIL VIEW ───
  if (selectedProject) {
    const projectTasks = allTasks.filter(t => t.project_id === selectedProject.id);
    const activeTasks = projectTasks.filter(t => !t.is_completed);
    const doneTasks = projectTasks.filter(t => t.is_completed);
    const projectPhases = phases.filter(ph => ph.project_id === selectedProject.id).sort((a, b) => a.sort_order - b.sort_order);
    const costs = getProjectCosts(selectedProject.id);
    const progress = getProjectProgress(selectedProject.id);
    const isOverBudget = Number(selectedProject.budget || 0) > 0 && costs.totalCost > Number(selectedProject.budget);

    const TaskItem = ({ task }: { task: Tables<"tasks"> }) => {
      const desc = task.description || "";
      const priorityMatch = desc.match(/\[prioridade:(\w+)\]/);
      const priority = priorityMatch ? priorityMatch[1] : null;
      const pConfig = priority ? PRIORITY_CONFIG[priority] : null;

      return (
        <div
          onClick={() => handleTaskClick(task)}
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
        >
          <Checkbox
            checked={!!task.is_completed}
            onCheckedChange={() => toggleTaskComplete(task)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm truncate", task.is_completed && "line-through text-muted-foreground")}>{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {task.assignee && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <User className="h-2.5 w-2.5" /> {task.assignee}
                </span>
              )}
              {pConfig && (
                <span className={cn("text-[10px] flex items-center gap-0.5", pConfig.color)}>
                  {pConfig.icon} {pConfig.label}
                </span>
              )}
            </div>
          </div>
          {task.scheduled_date && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" /> {format(new Date(task.scheduled_date), "dd/MM")}
            </span>
          )}
          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(task); }} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Star className={cn("h-3.5 w-3.5", task.is_favorite ? "fill-warning text-warning" : "text-muted-foreground")} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      );
    };

    return (
      <>
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {/* Back + Header */}
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedProjectId(null)} className="p-2 rounded-lg hover:bg-accent transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate">{selectedProject.name}</h2>
                <div className="flex items-center gap-2">
                  {getProgramName(selectedProject.program_id) && (
                    <span className="text-[10px] text-primary">Programa: {getProgramName(selectedProject.program_id)}</span>
                  )}
                  {selectedProject.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{selectedProject.description}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={showWBS ? "default" : "outline"} className="h-8 text-xs gap-1" onClick={() => setShowWBS(!showWBS)}>
                  <BarChart3 className="h-3 w-3" /> EAP
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEditProject(selectedProject)}>
                  Editar
                </Button>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-card">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Progresso</p>
                  <p className="text-lg font-bold text-primary">{progress}%</p>
                  <Progress value={progress} className="h-1.5 mt-1" />
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pendentes</p>
                  <p className="text-lg font-bold">{activeTasks.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Concluídas</p>
                  <p className="text-lg font-bold text-[hsl(var(--success))]">{doneTasks.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-card">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gasto</p>
                  <p className={cn("text-lg font-bold", isOverBudget ? "text-destructive" : "text-foreground")}>{brl(costs.totalCost)}</p>
                  {Number(selectedProject.budget) > 0 && (
                    <p className="text-[10px] text-muted-foreground">/ {brl(Number(selectedProject.budget))}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ─── WBS / EAP Table ─── */}
            {showWBS && (
              <Card className="bg-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="px-4 py-2 border-b border-border/30 bg-muted/30">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" /> Estrutura Analítica do Projeto (EAP)
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground/60 uppercase tracking-wider border-b border-border/20 bg-muted/20">
                          <th className="text-left py-2 px-3 w-8">#</th>
                          <th className="text-left py-2 px-3">Atividade</th>
                          <th className="text-left py-2 px-3">Etapa</th>
                          <th className="text-left py-2 px-3">Responsável</th>
                          <th className="text-left py-2 px-3">Prazo</th>
                          <th className="text-left py-2 px-3">Prioridade</th>
                          <th className="text-center py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((task, idx) => {
                          const phase = phases.find(ph => ph.id === task.phase_id);
                          const desc = task.description || "";
                          const priorityMatch = desc.match(/\[prioridade:(\w+)\]/);
                          const priority = priorityMatch ? priorityMatch[1] : "medium";
                          const pConfig = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;

                          return (
                            <tr key={task.id} className={cn(
                              "border-b border-border/10 transition-colors hover:bg-accent/30 cursor-pointer",
                              task.is_completed && "opacity-50"
                            )} onClick={() => handleTaskClick(task)}>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{idx + 1}</td>
                              <td className="py-2 px-3 text-xs font-medium">
                                <span className={cn(task.is_completed && "line-through")}>{task.title}</span>
                              </td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{phase?.name || "—"}</td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{task.assignee || "—"}</td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">
                                {task.scheduled_date ? format(new Date(task.scheduled_date), "dd/MM/yy") : "—"}
                              </td>
                              <td className="py-2 px-3">
                                <span className={cn("text-[10px] flex items-center gap-0.5", pConfig.color)}>
                                  {pConfig.icon} {pConfig.label}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {task.is_completed
                                  ? <Badge variant="outline" className="text-[10px] bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">Concluída</Badge>
                                  : <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Pendente</Badge>
                                }
                              </td>
                            </tr>
                          );
                        })}
                        {projectTasks.length === 0 && (
                          <tr><td colSpan={7} className="py-4 text-center text-xs text-muted-foreground">Nenhuma atividade cadastrada</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Phases & Tasks */}
            {projectPhases.map(phase => {
              const phaseTasks = projectTasks.filter((t: any) => t.phase_id === phase.id);
              const phaseActive = phaseTasks.filter(t => !t.is_completed);
              const phaseDone = phaseTasks.filter(t => t.is_completed);
              const phaseProgress = phaseTasks.length > 0 ? Math.round((phaseDone.length / phaseTasks.length) * 100) : 0;
              return (
                <Card key={phase.id} className="bg-card overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30">
                    <Layers className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold flex-1">{phase.name}</span>
                    <span className="text-[10px] text-muted-foreground">{phaseDone.length}/{phaseTasks.length}</span>
                    <div className="w-16"><Progress value={phaseProgress} className="h-1.5" /></div>
                    <button onClick={() => deletePhase(phase.id)} className="p-1 rounded hover:bg-destructive/10 opacity-50 hover:opacity-100">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                  <CardContent className="p-0 divide-y divide-border/20">
                    {phaseActive.map(task => <TaskItem key={task.id} task={task} />)}
                    {phaseDone.length > 0 && (
                      <div className="px-4 py-1.5 bg-accent/10">
                        <p className="text-[10px] text-muted-foreground">{phaseDone.length} concluída{phaseDone.length !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                    {phaseTasks.length === 0 && (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">Nenhuma atividade</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Unphased tasks */}
            {(() => {
              const phaseIds = new Set(projectPhases.map(ph => ph.id));
              const unphased = projectTasks.filter((t: any) => !t.phase_id || !phaseIds.has(t.phase_id));
              const unphasedActive = unphased.filter(t => !t.is_completed);
              const unphasedDone = unphased.filter(t => t.is_completed);
              if (unphasedActive.length === 0 && unphasedDone.length === 0 && projectPhases.length > 0) return null;
              return (
                <Card className="bg-card overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30">
                    <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold flex-1">
                      {projectPhases.length > 0 ? "Tarefas Rápidas" : "Atividades"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{unphasedDone.length}/{unphased.length}</span>
                  </div>
                  <CardContent className="p-0 divide-y divide-border/20">
                    {unphasedActive.map(task => <TaskItem key={task.id} task={task} />)}
                    {unphasedDone.length > 0 && (
                      <div className="px-4 py-1.5 bg-accent/10">
                        <p className="text-[10px] text-muted-foreground">{unphasedDone.length} concluída{unphasedDone.length !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Quick add */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Nova etapa..." value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addPhase(selectedProject.id); }}
                  className="h-9 text-xs flex-1" />
                <Button size="sm" variant="outline" className="h-9 gap-1.5 shrink-0" onClick={() => addPhase(selectedProject.id)}>
                  <Layers className="h-3.5 w-3.5" /> Etapa
                </Button>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Nova atividade..." value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newTask.trim() && user) {
                      await supabase.from("tasks").insert({ title: newTask.trim(), user_id: user.id, project_id: selectedProject.id });
                      setNewTask(""); fetchData();
                    }
                  }}
                  className="h-9 text-xs flex-1" />
                <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={async () => {
                  if (newTask.trim() && user) {
                    await supabase.from("tasks").insert({ title: newTask.trim(), user_id: user.id, project_id: selectedProject.id });
                    setNewTask(""); fetchData();
                  }
                }}>
                  <ListTodo className="h-3.5 w-3.5" /> Atividade
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Task edit dialog */}
        <EventEditDialog
          open={taskEditDialogOpen}
          onOpenChange={setTaskEditDialogOpen}
          item={editingTaskItem}
          defaultDate={taskEditDefaultDate}
          userId={user?.id || ""}
          onSaved={() => { setTaskEditDialogOpen(false); fetchData(); }}
        />

        {/* Project edit dialog */}
        {renderProjectDialog()}
      </>
    );
  }

  // ─── LIST VIEW ───
  function renderProjectDialog() {
    return (
      <>
        <Dialog open={projectDialogOpen} onOpenChange={(o) => { setProjectDialogOpen(o); if (!o) resetProjectForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{editingProject ? "Editar projeto" : "Novo projeto"}</DialogTitle>
            </DialogHeader>
            <Tabs value={projDialogTab} onValueChange={setProjDialogTab}>
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1 text-xs">Detalhes</TabsTrigger>
                {editingProject && <TabsTrigger value="resources" className="flex-1 text-xs">Recursos ({projectResources.length})</TabsTrigger>}
              </TabsList>
            </Tabs>
            {projDialogTab === "details" && (
              <div className="space-y-3">
                <div><Label className="text-sm">Nome</Label><Input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="Nome do projeto" /></div>
                <div><Label className="text-sm">Descrição</Label><Textarea value={projDescription} onChange={(e) => setProjDescription(e.target.value)} placeholder="Opcional" rows={2} className="resize-none" /></div>
                <div>
                  <Label className="text-sm">Programa</Label>
                  <Select value={projProgramId} onValueChange={setProjProgramId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar programa (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm">Categoria</Label>
                    <Select value={projCategoryId} onValueChange={setProjCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {projectCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Status</Label>
                    <Select value={projStatus} onValueChange={setProjStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Em andamento</SelectItem>
                        <SelectItem value="paused">Pausado</SelectItem>
                        <SelectItem value="completed">Concluído</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm">Orçamento (R$)</Label>
                    <Input type="text" inputMode="decimal" value={projBudget} onChange={(e) => setProjBudget(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" />
                  </div>
                  <div>
                    <Label className="text-sm">Responsável</Label>
                    <Input value={projResponsible} onChange={(e) => setProjResponsible(e.target.value)} placeholder="Opcional" />
                  </div>
                </div>
              </div>
            )}
            {projDialogTab === "resources" && editingProject && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Nome" value={resName} onChange={(e) => setResName(e.target.value)} className="flex-1" />
                  <Input placeholder="Função" value={resRole} onChange={(e) => setResRole(e.target.value)} className="w-32" />
                  <Button size="sm" onClick={addResource}><Save className="h-3.5 w-3.5" /></Button>
                </div>
                {projectResources.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.role}</span>
                    <button onClick={() => removeResource(r.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 pt-3 border-t border-border/20">
              {editingProject && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteProjectConfirm(editingProject.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => { setProjectDialogOpen(false); resetProjectForm(); }}>Cancelar</Button>
                <Button size="sm" onClick={saveProject} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Salvar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteProjectConfirm} onOpenChange={(o) => { if (!o) setDeleteProjectConfirm(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirmar exclusão</DialogTitle>
              <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteProjectConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteProjectConfirm && deleteProject(deleteProjectConfirm)}>Excluir</Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  function renderProgramDialog() {
    return (
      <>
        <Dialog open={programDialogOpen} onOpenChange={(o) => { setProgramDialogOpen(o); if (!o) resetProgramForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{editingProgram ? "Editar programa" : "Novo programa"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-sm">Nome</Label><Input value={progName} onChange={(e) => setProgName(e.target.value)} placeholder="Nome do programa" /></div>
              <div><Label className="text-sm">Descrição</Label><Textarea value={progDescription} onChange={(e) => setProgDescription(e.target.value)} placeholder="Opcional" rows={2} className="resize-none" /></div>
              <div>
                <Label className="text-sm">Cor</Label>
                <Input type="color" value={progColor} onChange={(e) => setProgColor(e.target.value)} className="h-10 w-20 p-1" />
              </div>
              <div>
                <Label className="text-sm">Projetos associados</Label>
                <p className="text-[10px] text-muted-foreground mb-2">Selecione os projetos que pertencem a este programa</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-border/30 p-2">
                  {projects.map(p => (
                    <div key={p.id} className="flex items-center gap-2 py-1">
                      <Checkbox
                        checked={progProjectIds.includes(p.id)}
                        onCheckedChange={() => toggleProgProjectId(p.id)}
                        id={`prog-proj-${p.id}`}
                      />
                      <label htmlFor={`prog-proj-${p.id}`} className="text-sm cursor-pointer flex-1">{p.name}</label>
                      {p.program_id && p.program_id !== editingProgram?.id && (
                        <span className="text-[10px] text-warning">Já vinculado</span>
                      )}
                    </div>
                  ))}
                  {projects.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum projeto criado</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-3 border-t border-border/20">
              {editingProgram && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteProgramConfirm(editingProgram.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => { setProgramDialogOpen(false); resetProgramForm(); }}>Cancelar</Button>
                <Button size="sm" onClick={saveProgram} className="gap-1.5" disabled={!progName.trim()}>
                  <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteProgramConfirm} onOpenChange={(o) => { if (!o) setDeleteProgramConfirm(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirmar exclusão do programa</DialogTitle>
              <DialogDescription>Os projetos associados não serão excluídos, apenas desvinculados.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteProgramConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteProgramConfirm && deleteProgram(deleteProgramConfirm)}>Excluir</Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          {/* Filter buttons */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <Button size="sm"
              variant={filterStatus === "programs" ? "default" : "ghost"}
              className={cn("h-7 text-xs px-3 rounded-full gap-1.5", filterStatus !== "programs" && "text-muted-foreground")}
              onClick={() => setFilterStatus("programs")}
            >
              <FolderKanban className="h-3 w-3" /> Programas
            </Button>
            <Button size="sm"
              variant={filterStatus === "projects" ? "default" : "ghost"}
              className={cn("h-7 text-xs px-3 rounded-full gap-1.5", filterStatus !== "projects" && "text-muted-foreground")}
              onClick={() => setFilterStatus("projects")}
            >
              <Layers className="h-3 w-3" /> Projeto
            </Button>
            <Button size="sm"
              variant={filterStatus === "tasks" ? "default" : "ghost"}
              className={cn("h-7 text-xs px-3 rounded-full gap-1.5", filterStatus !== "tasks" && "text-muted-foreground")}
              onClick={() => setFilterStatus("tasks")}
            >
              <ListTodo className="h-3 w-3" /> Tarefas
            </Button>
            <Button size="sm"
              variant={filterStatus === "all" ? "default" : "ghost"}
              className={cn("h-7 text-xs px-3 rounded-full gap-1.5", filterStatus !== "all" && "text-muted-foreground")}
              onClick={() => setFilterStatus("all")}
            >
              Todos
            </Button>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setProgramDialogOpen(true)}>
                <Plus className="h-3 w-3" /> Programa
              </Button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-8 text-xs w-40" />
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <FolderKanban className="h-3 w-3" /> Programas
                </p>
                <p className="text-lg font-bold text-primary">{kpis.programCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Em Andamento
                </p>
                <p className="text-lg font-bold text-primary">{kpis.active}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Check className="h-3 w-3" /> Concluídos
                </p>
                <p className="text-lg font-bold text-[hsl(var(--success))]">{kpis.completed}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <ListTodo className="h-3 w-3" /> Tarefas
                </p>
                <p className="text-lg font-bold">{kpis.pendingTasks}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CircleDollarSign className="h-3 w-3" /> Orçamento
                </p>
                <p className="text-lg font-bold">{brl(kpis.totalBudget)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" /> Gasto
                </p>
                <p className={cn("text-lg font-bold", kpis.totalCost > kpis.totalBudget && kpis.totalBudget > 0 ? "text-destructive" : "text-foreground")}>
                  {brl(kpis.totalCost)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Project cards grouped by program */}
          {projectsByProgram.map((group, gi) => (
            <div key={group.program?.id || "unlinked"}>
              <div className="flex items-center gap-2 mb-2">
                {group.program ? (
                  <>
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: group.program.color || "#3b82f6" }} />
                    <h3 className="text-sm font-semibold flex-1">{group.program.name}</h3>
                    <span className="text-[10px] text-muted-foreground">{group.projects.length} projeto{group.projects.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => openEditProgram(group.program!)} className="text-xs text-primary hover:underline">Editar</button>
                  </>
                ) : (
                  <h3 className="text-sm font-semibold text-muted-foreground">Sem programa</h3>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mb-4">
                {group.projects.map(p => {
                  const progress = getProjectProgress(p.id);
                  const costs = getProjectCosts(p.id);
                  const pTasks = allTasks.filter(t => t.project_id === p.id);
                  const pending = pTasks.filter(t => !t.is_completed).length;
                  const done = pTasks.filter(t => t.is_completed).length;
                  const isOverBudget = Number(p.budget || 0) > 0 && costs.totalCost > Number(p.budget);

                  return (
                    <Card
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className="cursor-pointer transition-all hover:shadow-md group"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold truncate">{p.name}</h4>
                            {p.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>
                            )}
                          </div>
                          {getStatusBadge(p.status)}
                        </div>

                        <div className="space-y-1.5 mt-3">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Progresso</span>
                            <span className="font-medium">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ListTodo className="h-3 w-3" /> {pending} pendente{pending !== 1 ? "s" : ""}
                          </span>
                          <span className="flex items-center gap-1">
                            <Check className="h-3 w-3 text-[hsl(var(--success))]" /> {done}
                          </span>
                        </div>

                        {(costs.totalCost > 0 || Number(p.budget) > 0) && (
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30 text-[11px]">
                            <span className={cn("font-medium", isOverBudget ? "text-destructive" : "text-foreground")}>
                              {brl(costs.totalCost)}
                            </span>
                            {Number(p.budget) > 0 && (
                              <span className="text-muted-foreground">/ {brl(Number(p.budget))}</span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}

          {visibleProjects.length === 0 && programs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderKanban className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum projeto encontrado</p>
              <p className="text-xs mt-1">Use o botão + para criar um novo projeto ou programa.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {renderProjectDialog()}
      {renderProgramDialog()}
    </>
  );
}
