import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Search, Plus, ChevronDown, Star, GripVertical, PanelLeftClose, PanelLeft,
  Filter, CheckCircle2, X, FolderOpen, Trash2, Save, User, Users, Check,
  Printer, ArrowUpDown, SquareCheckBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import EventEditDialog, { type CalendarItem } from "@/components/calendar/EventEditDialog";

interface UnifiedSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type SidebarTab = "projects" | "tasks" | "categories";
type SortField = "title" | "status" | "priority" | "date" | "assignee";
type SortDir = "asc" | "desc";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABELS: Record<string, string> = {
  active: "Ativo", paused: "Pausado", completed: "Concluído",
};

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

export default function UnifiedSidebar({ collapsed, onToggle }: UnifiedSidebarProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>("projects");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Data
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Tables<"tasks">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);

  // UI state
  const [search, setSearch] = useState("");
  const [newTask, setNewTask] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);

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
  const [projDialogTab, setProjDialogTab] = useState("details");
  const [resName, setResName] = useState("");
  const [resRole, setResRole] = useState("");

  // Task edit
  const [taskEditDialogOpen, setTaskEditDialogOpen] = useState(false);
  const [editingTaskItem, setEditingTaskItem] = useState<CalendarItem | null>(null);
  const [taskEditDefaultDate, setTaskEditDefaultDate] = useState<Date>(new Date());

  const lastProjClickRef = useRef<{ id: string; time: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, completedRes, catsRes, projRes, entRes, resRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", false).order("sort_order"),
      supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", true).order("updated_at", { ascending: false }).limit(50),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
      supabase.from("project_resources").select("*"),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (completedRes.data) setCompletedTasks(completedRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (entRes.data) setEntries(entRes.data);
    if (resRes.data) setResources(resRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    if (!user) return;
    const channel = supabase
      .channel("unified-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchData]);

  // ─── Sorting ───
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

  // ─── Task actions ───
  const addTask = async () => {
    if (!newTask.trim() || !user) return;
    await supabase.from("tasks").insert({ title: newTask.trim(), user_id: user.id });
    setNewTask("");
  };

  const toggleTaskComplete = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    fetchData();
  };

  const toggleFavorite = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_favorite: !task.is_favorite }).eq("id", task.id);
  };

  const printTasks = () => {
    const printContent = tasks.map(t => `${t.is_completed ? "✅" : "⬜"} ${t.title}`).join("\n");
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<pre style="font-family:sans-serif;font-size:14px;">${printContent}</pre>`);
      w.print();
    }
  };

  // ─── Project actions ───
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const aO = a.name.toLowerCase().includes("outro");
      const bO = b.name.toLowerCase().includes("outro");
      if (aO && !bO) return 1;
      if (!aO && bO) return -1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [categories]);

  const projectCategories = sortedCategories.filter(c => c.is_project);
  const activeProjects = projects.filter(p => p.status !== "completed");
  const completedProjectsList = projects.filter(p => p.status === "completed");

  const getProjectCosts = useCallback((projectId: string) => {
    const projEntries = entries.filter(e => e.project_id === projectId);
    const totalCost = projEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    return { totalCost };
  }, [entries]);

  const resetProjectForm = () => {
    setProjName(""); setProjDescription(""); setProjBudget(""); setProjStatus("active");
    setProjCategoryId(""); setProjResponsible(""); setEditingProject(null); setProjDialogTab("details");
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

  const projectResources = useMemo(() => {
    if (!editingProject) return [];
    return resources.filter((r: any) => r.project_id === editingProject.id);
  }, [resources, editingProject]);

  // Filtered tasks
  const allActiveTasks = useMemo(() => {
    let list = search ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tasks;
    return sortTasks(list);
  }, [tasks, search, sortTasks]);

  // Tasks grouped by category
  const tasksByCategory = useMemo(() => {
    const map: Record<string, Tables<"tasks">[]> = {};
    sortedCategories.forEach(c => { map[c.id] = []; });
    map["uncategorized"] = [];
    allActiveTasks.forEach(t => {
      const key = t.category_id || "uncategorized";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [allActiveTasks, sortedCategories]);

  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center border-l border-border/30 bg-sidebar-background py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggle}>
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const SortBar = () => (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/20 text-[10px] text-muted-foreground">
      {([
        { field: "title" as SortField, label: "Atividade" },
        { field: "status" as SortField, label: "Status" },
        { field: "priority" as SortField, label: "Prior." },
        { field: "date" as SortField, label: "Prazo" },
        { field: "assignee" as SortField, label: "Resp." },
      ]).map(s => (
        <button key={s.field} onClick={() => toggleSort(s.field)}
          className={cn("px-1 py-0.5 rounded hover:bg-accent/50 transition-colors flex items-center gap-0.5",
            sortField === s.field && "text-primary font-medium"
          )}>
          {s.label}
          {sortField === s.field && <ArrowUpDown className="h-2.5 w-2.5" />}
        </button>
      ))}
      <div className="ml-auto flex gap-0.5">
        <button onClick={printTasks} className="p-0.5 rounded hover:bg-accent/50" title="Imprimir">
          <Printer className="h-3 w-3" />
        </button>
      </div>
    </div>
  );

  const TaskRow = ({ task }: { task: Tables<"tasks"> }) => {
    const priority = getPriorityFromDesc(task.description);
    return (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("task-id", task.id); e.dataTransfer.setData("task-title", task.title); }}
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-accent/50 cursor-grab"
      >
        <Checkbox
          checked={!!task.is_completed}
          onCheckedChange={() => toggleTaskComplete(task)}
          className="h-3.5 w-3.5 shrink-0"
        />
        <span className="flex-1 truncate">{task.title}</span>
        {getPriorityBadge(priority)}
        {task.scheduled_date && (
          <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(task.scheduled_date), "dd/MM")}</span>
        )}
        <button onClick={() => toggleFavorite(task)} className="shrink-0 opacity-0 group-hover:opacity-100">
          <Star className={cn("h-3 w-3", task.is_favorite ? "fill-warning text-warning" : "text-muted-foreground")} />
        </button>
        <button onClick={() => deleteTask(task.id)} className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive">
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="flex h-full w-80 flex-col border-l border-border/30 bg-sidebar-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SidebarTab)} className="flex-1">
            <TabsList className="h-8 w-full bg-muted/50">
              <TabsTrigger value="projects" className="flex-1 text-xs h-7 data-[state=active]:bg-background">
                📁 Projetos
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex-1 text-xs h-7 data-[state=active]:bg-background">
                ☑️ Tarefas
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex-1 text-xs h-7 data-[state=active]:bg-background">
                🏷️ Categorias
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-1 shrink-0" onClick={onToggle}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 pl-8 text-xs" />
          </div>
        </div>

        <SortBar />

        {/* ─── PROJECTS TAB ─── */}
        {activeTab === "projects" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {activeProjects.map((p) => {
                const pTasks = [...tasks, ...completedTasks].filter(t => t.project_id === p.id);
                const pDone = pTasks.filter(t => t.is_completed).length;
                const costs = getProjectCosts(p.id);
                const isSelected = selectedProject === p.id;
                return (
                  <div key={p.id}>
                    <div
                      onClick={() => handleProjectClick(p)}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                        isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
                      )}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {pDone}/{pTasks.length} tarefas
                          {costs.totalCost > 0 && ` • ${brl(costs.totalCost)}`}
                        </p>
                      </div>
                      <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", !isSelected && "-rotate-90")} />
                    </div>

                    {isSelected && (
                      <div className="ml-4 mt-1 mb-2 space-y-0.5 border-l-2 border-primary/20 pl-2">
                        <div className="mb-2">
                          <Progress value={pTasks.length > 0 ? (pDone / pTasks.length) * 100 : 0} className="h-1.5" />
                          <p className="text-[10px] text-muted-foreground mt-0.5">{pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0}% concluído</p>
                        </div>
                        {sortTasks(pTasks.filter(t => !t.is_completed)).map((task) => (
                          <TaskRow key={task.id} task={task} />
                        ))}
                        {pTasks.filter(t => t.is_completed).length > 0 && (
                          <p className="text-[10px] text-muted-foreground/50 px-2 pt-1">
                            +{pTasks.filter(t => t.is_completed).length} concluída(s)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {activeProjects.length === 0 && completedProjectsList.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">Nenhum projeto</p>
              )}

              {completedProjectsList.length > 0 && (
                <Collapsible open={showCompletedProjects} onOpenChange={setShowCompletedProjects} className="mt-3">
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full px-2 py-1.5">
                    <ChevronDown className={cn("h-3 w-3 transition-transform", !showCompletedProjects && "-rotate-90")} />
                    <Check className="h-3 w-3" />
                    Concluídos ({completedProjectsList.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5 mt-1">
                    {completedProjectsList.map((p) => (
                      <div key={p.id} onClick={() => openEditProject(p)}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-accent/50 opacity-50">
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="text-xs truncate line-through">{p.name}</p>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="border-t border-border/30 p-2">
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => { resetProjectForm(); setProjectDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Novo Projeto
              </Button>
            </div>
          </div>
        )}

        {/* ─── TASKS TAB ─── */}
        {activeTab === "tasks" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-2 pt-1">
              {allActiveTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              {allActiveTasks.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma tarefa</p>
              )}

              {completedTasks.length > 0 && (
                <Collapsible open={showCompleted} onOpenChange={setShowCompleted} className="mt-3 mb-2">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
                    <ChevronDown className={cn("h-3 w-3 transition-transform", !showCompleted && "-rotate-90")} />
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Concluídas</span>
                    <span className="ml-auto text-[10px]">{completedTasks.length}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5 pl-2 pt-1">
                    {completedTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground/60 line-through">
                        <CheckCircle2 className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        <span className="flex-1 truncate">{task.title}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="border-t border-border/30 p-2">
              <div className="flex gap-1">
                <Input placeholder="Nova tarefa... (Enter)" value={newTask} onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()} className="h-7 text-xs" />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={addTask}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── CATEGORIES TAB ─── */}
        {activeTab === "categories" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-2 pt-1">
              {sortedCategories.map((cat) => {
                const catTasks = tasksByCategory[cat.id] || [];
                const catProjects = projects.filter(p => p.category_id === cat.id && p.status !== "completed");
                if (catTasks.length === 0 && catProjects.length === 0) return null;
                return (
                  <Collapsible key={cat.id} defaultOpen className="mb-1.5">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
                      <ChevronDown className="h-3 w-3" />
                      {cat.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />}
                      <span>{cat.icon} {cat.name}</span>
                      <span className="ml-auto text-[10px]">{catProjects.length}P / {catTasks.length}T</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-4 pt-0.5 space-y-0.5">
                      {catProjects.map(p => (
                        <div key={p.id} onClick={() => openEditProject(p)}
                          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent/50 cursor-pointer">
                          <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium">{p.name}</span>
                        </div>
                      ))}
                      {catTasks.map(task => (
                        <TaskRow key={task.id} task={task} />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Uncategorized */}
              {(tasksByCategory["uncategorized"] || []).length > 0 && (
                <Collapsible defaultOpen className="mb-1.5">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
                    <ChevronDown className="h-3 w-3" />
                    <span>Sem Categoria</span>
                    <span className="ml-auto text-[10px]">{(tasksByCategory["uncategorized"] || []).length}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 pt-0.5 space-y-0.5">
                    {(tasksByCategory["uncategorized"] || []).map(task => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="border-t border-border/30 p-2">
              <div className="flex gap-1">
                <Input placeholder="Nova tarefa... (Enter)" value={newTask} onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()} className="h-7 text-xs" />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={addTask}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Project Dialog ─── */}
      <Dialog open={projectDialogOpen} onOpenChange={(o) => { setProjectDialogOpen(o); if (!o) resetProjectForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingProject ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <Tabs value={projDialogTab} onValueChange={setProjDialogTab}>
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1 text-xs">Detalhes</TabsTrigger>
              {editingProject && <TabsTrigger value="resources" className="flex-1 text-xs">Recursos ({projectResources.length})</TabsTrigger>}
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
                    <Label className="text-sm">Categoria</Label>
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
