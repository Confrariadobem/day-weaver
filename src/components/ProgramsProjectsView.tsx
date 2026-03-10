import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useModulePreferences } from "@/hooks/useModulePreferences";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Search, ChevronRight, ChevronDown, ChevronUp, Star, Trash2, Save, User,
  Check, FolderKanban, Layers, ListTodo, Clock, Diamond,
  ArrowLeft, BarChart3, CircleDollarSign, Plus, GripVertical,
  AlertCircle, Flag, Pencil, Copy, Link, FileText, CalendarDays,
  MoreHorizontal, Filter, FileUp, Printer, CalendarRange, X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDateFormat } from "@/contexts/DateFormatContext";
import { cn } from "@/lib/utils";
import { format, differenceInDays, isAfter, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";

type ProjectTab = "indicadores" | "lista" | "dashboard";
type Priority = "alta" | "media" | "baixa";
type TaskStatus = "pendente" | "andamento" | "concluido";

interface TaskWithHierarchy extends Tables<"tasks"> {
  children?: TaskWithHierarchy[];
  level: number;
  numbering: string;
  priority?: Priority;
  taskStatus?: TaskStatus;
  isMilestone?: boolean;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  alta: { label: "Alta", color: "text-destructive", bg: "bg-destructive/10" },
  media: { label: "Média", color: "text-warning", bg: "bg-warning/10" },
  baixa: { label: "Baixa", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10" },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  pendente: { label: "Pendente", color: "text-muted-foreground", bg: "bg-muted/30" },
  andamento: { label: "Em Andamento", color: "text-primary", bg: "bg-primary/10" },
  concluido: { label: "Concluído", color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10" },
};

const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" };
const CHART_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function ProgramsProjectsView({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const { user } = useAuth();
  const { formatCurrency: brl } = useCurrency();
  const { formatDate: fmtDate, dateFormat } = useDateFormat();
  const [activeTab, setActiveTab] = useState<ProjectTab>("indicadores");
  const { visibleTabs } = useModulePreferences("programs");

  useEffect(() => { onTabChange?.(activeTab); }, [activeTab, onTabChange]);

  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<"all" | Priority>("all");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Interval filter
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const normalizeDateInput = (val: string) => {
    const digits = val.replace(/\D/g, "");
    let out = "";
    for (let i = 0; i < digits.length && i < 8; i++) {
      if (i === 2 || i === 4) out += "/";
      out += digits[i];
    }
    return out;
  };
  const parseDMY = (val: string): Date | null => {
    const parts = val.split("/");
    if (parts.length !== 3) return null;
    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
    if (isNaN(d) || isNaN(m) || isNaN(y) || y < 1900) return null;
    return new Date(y, m, d);
  };
  const handleIntervalSelect = (range: any) => {
    if (range?.from) { setCustomFrom(range.from); setDateFrom(format(range.from, "dd/MM/yyyy")); }
    if (range?.to) { setCustomTo(range.to); setDateTo(format(range.to, "dd/MM/yyyy")); }
  };
  const handleClearInterval = () => {
    setCustomFrom(undefined); setCustomTo(undefined);
    setDateFrom(""); setDateTo(""); setIntervalOpen(false);
  };
  const handleExportCSV = () => {
    const rows = [["Tarefa", "Projeto", "Prioridade", "Status", "Custo", "Data"]];
    filteredTasks.forEach(t => {
      rows.push([t.title, getProjectName(t.project_id), t.priority || "media", t.taskStatus || "pendente", String(getTaskCost(t)), t.scheduled_date || ""]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `projetos-tarefas-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const handlePrint = () => window.print();
  
  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Tables<"tasks"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("media");
  const [editStatus, setEditStatus] = useState<TaskStatus>("pendente");
  const [editCost, setEditCost] = useState("");
  const [editDateStart, setEditDateStart] = useState("");
  const [editDateEnd, setEditDateEnd] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editCostCenterId, setEditCostCenterId] = useState("");
  const [editResponsible, setEditResponsible] = useState("");
  const [editLinks, setEditLinks] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editIsMilestone, setEditIsMilestone] = useState(false);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, projRes, catsRes, ccRes, entRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", user.id).order("sort_order"),
      supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("cost_centers").select("*").eq("user_id", user.id).eq("is_active", true),
      supabase.from("financial_entries").select("*").eq("user_id", user.id),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (catsRes.data) setCategories(catsRes.data);
    if (ccRes.data) setCostCenters(ccRes.data);
    if (entRes.data) setEntries(entRes.data);
  }, [user]);

  useEffect(() => {
    fetchData();
    const handleDataChanged = () => fetchData();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => window.removeEventListener("lovable:data-changed", handleDataChanged);
  }, [fetchData]);

  // Parse priority from description [prioridade:alta]
  const getPriority = (task: Tables<"tasks">): Priority => {
    const match = (task.description || "").match(/\[prioridade:(\w+)\]/);
    if (match) {
      if (match[1] === "alta" || match[1] === "high" || match[1] === "urgent") return "alta";
      if (match[1] === "baixa" || match[1] === "low") return "baixa";
    }
    return "media";
  };

  // Parse status from description [status:andamento]
  const getStatus = (task: Tables<"tasks">): TaskStatus => {
    if (task.is_completed) return "concluido";
    const match = (task.description || "").match(/\[status:(\w+)\]/);
    if (match && match[1] === "andamento") return "andamento";
    return "pendente";
  };

  // Check if milestone [marco]
  const isMilestone = (task: Tables<"tasks">): boolean => {
    return (task.description || "").includes("[marco]");
  };

  // Check if overdue
  const isOverdue = (task: Tables<"tasks">): boolean => {
    if (!task.scheduled_date || task.is_completed) return false;
    return isBefore(new Date(task.scheduled_date), startOfDay(new Date()));
  };

  // Calculate costs
  const getProjectCosts = useCallback((projectId: string) => {
    const projEntries = entries.filter(e => e.project_id === projectId);
    const realizado = projEntries.filter(e => e.type === "expense" && e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
    return realizado;
  }, [entries]);

  const getTaskCost = (task: Tables<"tasks">): number => Number(task.estimated_cost || 0);

  // KPIs
  const kpis = useMemo(() => {
    const allTasks = tasks;
    const completed = allTasks.filter(t => t.is_completed).length;
    const total = allTasks.length;
    const overdue = allTasks.filter(t => isOverdue(t)).length;
    const previsto = allTasks.reduce((s, t) => s + getTaskCost(t), 0);
    const realizado = projects.reduce((s, p) => s + getProjectCosts(p.id), 0);
    const pctConcluido = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { previsto, realizado, overdue, pctConcluido, total, completed };
  }, [tasks, projects, entries, getProjectCosts]);

  // Priority tasks (alta + overdue)
  const priorityTasks = useMemo(() => {
    return tasks
      .filter(t => !t.is_completed && (getPriority(t) === "alta" || isOverdue(t)))
      .sort((a, b) => {
        const aOverdue = isOverdue(a);
        const bOverdue = isOverdue(b);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        return (a.scheduled_date || "").localeCompare(b.scheduled_date || "");
      })
      .slice(0, 5);
  }, [tasks]);

  // Overdue tasks
  const overdueTasks = useMemo(() => {
    return tasks
      .filter(t => isOverdue(t))
      .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
      .slice(0, 5);
  }, [tasks]);

  // Milestones
  const milestones = useMemo(() => {
    return tasks
      .filter(t => isMilestone(t) && !t.is_completed)
      .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""))
      .slice(0, 3);
  }, [tasks]);

  // Budget chart data by category
  const budgetChartData = useMemo(() => {
    const catMap = new Map<string, { previsto: number; realizado: number; name: string }>();
    tasks.forEach(t => {
      const catId = t.category_id || "sem-categoria";
      const cat = categories.find(c => c.id === catId);
      const catName = cat?.name || "Sem categoria";
      if (!catMap.has(catId)) catMap.set(catId, { previsto: 0, realizado: 0, name: catName });
      catMap.get(catId)!.previsto += getTaskCost(t);
    });
    entries.filter(e => e.type === "expense" && e.is_paid).forEach(e => {
      const catId = e.category_id || "sem-categoria";
      const cat = categories.find(c => c.id === catId);
      const catName = cat?.name || "Sem categoria";
      if (!catMap.has(catId)) catMap.set(catId, { previsto: 0, realizado: 0, name: catName });
      catMap.get(catId)!.realizado += Number(e.amount);
    });
    return Array.from(catMap.values()).filter(d => d.previsto > 0 || d.realizado > 0).slice(0, 6);
  }, [tasks, entries, categories]);

  // Build hierarchical task list for Lista tab
  const hierarchicalTasks = useMemo(() => {
    // Group by project
    const projectTasks = new Map<string | null, Tables<"tasks">[]>();
    tasks.forEach(t => {
      const pid = t.project_id || null;
      if (!projectTasks.has(pid)) projectTasks.set(pid, []);
      projectTasks.get(pid)!.push(t);
    });

    const result: TaskWithHierarchy[] = [];
    let mainIdx = 0;

    // Projects first
    projects.forEach(proj => {
      const pTasks = projectTasks.get(proj.id) || [];
      if (pTasks.length === 0) return;
      mainIdx++;
      
      // Sort by sort_order
      pTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      pTasks.forEach((t, idx) => {
        result.push({
          ...t,
          level: 0,
          numbering: `${mainIdx}.${idx + 1}`,
          priority: getPriority(t),
          taskStatus: getStatus(t),
          isMilestone: isMilestone(t),
        });
      });
    });

    // Tasks without project
    const orphanTasks = projectTasks.get(null) || [];
    if (orphanTasks.length > 0) {
      mainIdx++;
      orphanTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      orphanTasks.forEach((t, idx) => {
        result.push({
          ...t,
          level: 0,
          numbering: `${mainIdx}.${idx + 1}`,
          priority: getPriority(t),
          taskStatus: getStatus(t),
          isMilestone: isMilestone(t),
        });
      });
    }

    return result;
  }, [tasks, projects]);

  // Filtered list
  const filteredTasks = useMemo(() => {
    let list = hierarchicalTasks;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q));
    }
    if (filterPriority !== "all") {
      list = list.filter(t => t.priority === filterPriority);
    }
    if (filterOverdue) {
      list = list.filter(t => isOverdue(t));
    }
    return list;
  }, [hierarchicalTasks, search, filterPriority, filterOverdue]);

  // Dashboard data
  const dashboardData = useMemo(() => {
    const byProject = projects.map(p => {
      const pTasks = tasks.filter(t => t.project_id === p.id);
      const previsto = pTasks.reduce((s, t) => s + getTaskCost(t), 0);
      const realizado = getProjectCosts(p.id);
      return { name: p.name, previsto, realizado, id: p.id };
    }).filter(d => d.previsto > 0 || d.realizado > 0);

    const byCostCenter = costCenters.map(cc => {
      const ccEntries = entries.filter(e => e.cost_center_id === cc.id && e.type === "expense");
      const previsto = ccEntries.reduce((s, e) => s + Number(e.amount), 0);
      const realizado = ccEntries.filter(e => e.is_paid).reduce((s, e) => s + Number(e.amount), 0);
      return { name: cc.name, previsto, realizado, id: cc.id };
    }).filter(d => d.previsto > 0 || d.realizado > 0);

    return { byProject, byCostCenter };
  }, [projects, tasks, costCenters, entries, getProjectCosts]);

  // Actions
  const toggleComplete = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    fetchData();
  };

  const duplicateTask = async (task: Tables<"tasks">) => {
    if (!user) return;
    const { id, created_at, updated_at, ...rest } = task;
    await supabase.from("tasks").insert({ ...rest, title: `${task.title} (cópia)`, user_id: user.id });
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    fetchData();
  };

  const openEditDialog = (task: Tables<"tasks">) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription((task.description || "").replace(/\[prioridade:\w+\]/g, "").replace(/\[status:\w+\]/g, "").replace(/\[marco\]/g, "").trim());
    setEditPriority(getPriority(task));
    setEditStatus(getStatus(task));
    setEditCost(task.estimated_cost ? String(task.estimated_cost) : "");
    setEditDateEnd(task.scheduled_date || "");
    setEditDateStart("");
    setEditCategoryId(task.category_id || "");
    setEditCostCenterId("");
    setEditResponsible(task.assignee || "");
    setEditLinks("");
    setEditNotes("");
    setEditIsMilestone(isMilestone(task));
    setEditDialogOpen(true);
  };

  const saveTask = async () => {
    if (!editingTask || !user) return;
    
    // Build description with metadata
    let desc = editDescription.trim();
    desc += ` [prioridade:${editPriority}]`;
    if (editStatus === "andamento") desc += ` [status:andamento]`;
    if (editIsMilestone) desc += ` [marco]`;
    if (editLinks) desc += `\n\n[links]\n${editLinks}`;
    if (editNotes) desc += `\n\n[anotacoes]\n${editNotes}`;

    await supabase.from("tasks").update({
      title: editTitle,
      description: desc,
      estimated_cost: editCost ? parseFloat(editCost.replace(/\./g, "").replace(",", ".")) : 0,
      scheduled_date: editDateEnd || null,
      category_id: editCategoryId || null,
      assignee: editResponsible || null,
      is_completed: editStatus === "concluido",
    }).eq("id", editingTask.id);

    setEditDialogOpen(false);
    fetchData();
  };

  const addSubTask = async (parentTask: Tables<"tasks">) => {
    if (!user) return;
    await supabase.from("tasks").insert({
      title: "Nova sub-tarefa",
      user_id: user.id,
      project_id: parentTask.project_id,
      sort_order: (parentTask.sort_order || 0) + 1,
    });
    fetchData();
  };

  // Drag handlers
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd = async () => {
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...filteredTasks];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dragOverIdx, 0, moved);
    
    const updates = reordered.map((t, i) => supabase.from("tasks").update({ sort_order: i }).eq("id", t.id));
    await Promise.all(updates);
    setDragIdx(null);
    setDragOverIdx(null);
    fetchData();
  };

  const toggleCardExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "Sem projeto";
    return projects.find(p => p.id === projectId)?.name || "Sem projeto";
  };

  // Calculate parent sums
  const getProjectSummary = (projectId: string) => {
    const pTasks = tasks.filter(t => t.project_id === projectId);
    const previsto = pTasks.reduce((s, t) => s + getTaskCost(t), 0);
    const overdue = pTasks.filter(t => isOverdue(t)).length;
    return { previsto, overdue };
  };

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          {/* Tab navigation */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 overflow-x-auto scrollbar-hide">
            {([
              { key: "indicadores" as ProjectTab, label: "Indicadores", icon: <BarChart3 className="h-3 w-3" /> },
              { key: "lista" as ProjectTab, label: "Lista", icon: <ListTodo className="h-3 w-3" /> },
              { key: "dashboard" as ProjectTab, label: "Dashboard", icon: <Layers className="h-3 w-3" /> },
            ]).filter(tab => visibleTabs.includes(tab.key)).map(tab => (
              <Button key={tab.key} size="sm"
                variant={activeTab === tab.key ? "default" : "ghost"}
                className={cn("h-7 text-xs px-3 rounded-full gap-1.5 shrink-0", activeTab !== tab.key && "text-muted-foreground")}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon} {tab.label}
              </Button>
            ))}
            <div className="flex items-center gap-3 w-full md:w-auto md:ml-auto flex-wrap">
              <div className="relative flex-1 md:flex-none" style={{ minWidth: 150, maxWidth: 200 }}>
                <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-8 pr-7 text-xs rounded-lg" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Intervalo */}
              <Popover open={intervalOpen} onOpenChange={setIntervalOpen}>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-1 transition-all duration-200 shrink-0",
                    (dateFrom || dateTo) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/80 hover:bg-primary/5"
                  )}>
                    <CalendarRange className="size-4" />
                    <span className="text-xs font-medium">Intervalo</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 bg-background border rounded-lg shadow-lg p-3 space-y-3" align="start">
                  <CalendarComponent mode="range" locale={ptBR} showOutsideDays={false}
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={handleIntervalSelect}
                    className="pointer-events-auto"
                    formatters={{ formatCaption: (date) => { const m = format(date, "LLLL", { locale: ptBR }); const cap = m.charAt(0).toUpperCase() + m.slice(1); const y = format(date, "yyyy"); return dateFormat === "YYYY/MM/DD" ? `${y} ${cap}` : `${cap} ${y}`; } }} />
                  <div className="space-y-2 border-t border-border/30 pt-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-8 shrink-0">De:</span>
                      <Input value={dateFrom} onChange={(e) => setDateFrom(normalizeDateInput(e.target.value))}
                        onBlur={() => { const d = parseDMY(dateFrom); if (d) { setCustomFrom(d); setDateFrom(format(d, "dd/MM/yyyy")); } }}
                        placeholder="DD / MM / YYYY" className="h-10 text-sm rounded-md border-border" style={{ width: 130 }} maxLength={10} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold w-8 shrink-0">Até:</span>
                      <Input value={dateTo} onChange={(e) => setDateTo(normalizeDateInput(e.target.value))}
                        onBlur={() => { const d = parseDMY(dateTo); if (d) { setCustomTo(d); setDateTo(format(d, "dd/MM/yyyy")); } }}
                        placeholder="DD / MM / YYYY" className="h-10 text-sm rounded-md border-border" style={{ width: 130 }} maxLength={10} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleClearInterval}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors duration-200"
                      style={{ minWidth: 80, height: 32 }}>Limpar</button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Hoje */}
              <button
                onClick={() => {
                  const today = new Date();
                  const todayStr = format(today, "dd/MM/yyyy");
                  if (dateFrom === todayStr && dateTo === todayStr) {
                    handleClearInterval();
                  } else {
                    setCustomFrom(today); setCustomTo(today);
                    setDateFrom(todayStr); setDateTo(todayStr);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-1 transition-all duration-200 shrink-0",
                  dateFrom === format(new Date(), "dd/MM/yyyy") && dateTo === format(new Date(), "dd/MM/yyyy")
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/80 hover:bg-primary/5"
                )}
              >
                <CalendarDays className="size-4" />
                <span className="text-xs font-medium">Hoje</span>
              </button>

              {/* Export/Print */}
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button onClick={handleExportCSV} className="text-muted-foreground hover:text-primary transition-colors">
                    <FileUp className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Exportar CSV</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button onClick={handlePrint} className="text-muted-foreground hover:text-primary transition-colors">
                    <Printer className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Imprimir</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* ════════════════ INDICADORES TAB ════════════════ */}
          {activeTab === "indicadores" && (
            <div className="space-y-4">
              {/* Summary Card */}
              <Card className="bg-card">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Resumo
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Previsto</p>
                      <p className="text-lg font-bold">{brl(kpis.previsto)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Realizado</p>
                      <p className="text-lg font-bold text-primary">{brl(kpis.realizado)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Atrasados</p>
                      <p className={cn("text-lg font-bold", kpis.overdue > 0 ? "text-destructive" : "text-muted-foreground")}>{kpis.overdue}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase">Concluído</p>
                      <p className="text-lg font-bold text-[hsl(var(--success))]">{kpis.pctConcluido}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Priority + Overdue + Milestones */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Prioridades do Dia */}
                <Collapsible open={expandedCards.has("priority")} onOpenChange={() => toggleCardExpand("priority")}>
                  <Card className="bg-card">
                    <CardContent className="p-4">
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Flag className="h-4 w-4 text-destructive" /> Prioridades do Dia
                          </h3>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedCards.has("priority") && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <div className="mt-3 space-y-2">
                        {priorityTasks.slice(0, expandedCards.has("priority") ? 5 : 3).map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-sm">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", isOverdue(t) ? "bg-destructive" : "bg-warning")} />
                            <span className="flex-1 truncate">{t.title}</span>
                            {t.scheduled_date && (
                              <span className={cn("text-[10px] shrink-0", isOverdue(t) ? "text-destructive font-bold" : "text-muted-foreground")}>
                                {format(new Date(t.scheduled_date), "dd/MM")}
                              </span>
                            )}
                          </div>
                        ))}
                        {priorityTasks.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma tarefa prioritária</p>}
                      </div>
                      <CollapsibleContent>
                        {priorityTasks.slice(3).map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-sm mt-2">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", isOverdue(t) ? "bg-destructive" : "bg-warning")} />
                            <span className="flex-1 truncate">{t.title}</span>
                            {t.scheduled_date && (
                              <span className={cn("text-[10px] shrink-0", isOverdue(t) ? "text-destructive font-bold" : "text-muted-foreground")}>
                                {format(new Date(t.scheduled_date), "dd/MM")}
                              </span>
                            )}
                          </div>
                        ))}
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>

                {/* Atrasados */}
                <Collapsible open={expandedCards.has("overdue")} onOpenChange={() => toggleCardExpand("overdue")}>
                  <Card className="bg-card">
                    <CardContent className="p-4">
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive" /> Atrasados
                          </h3>
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedCards.has("overdue") && "rotate-180")} />
                        </div>
                      </CollapsibleTrigger>
                      <div className="mt-3 space-y-2">
                        {overdueTasks.slice(0, expandedCards.has("overdue") ? 5 : 3).map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                            <span className="flex-1 truncate text-destructive">{t.title}</span>
                            {t.scheduled_date && (
                              <span className="text-[10px] text-destructive font-bold shrink-0">
                                {format(new Date(t.scheduled_date), "dd/MM")}
                              </span>
                            )}
                          </div>
                        ))}
                        {overdueTasks.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma tarefa atrasada 🎉</p>}
                      </div>
                      <CollapsibleContent>
                        {overdueTasks.slice(3).map(t => (
                          <div key={t.id} className="flex items-center gap-2 text-sm mt-2">
                            <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                            <span className="flex-1 truncate text-destructive">{t.title}</span>
                            {t.scheduled_date && (
                              <span className="text-[10px] text-destructive font-bold shrink-0">
                                {format(new Date(t.scheduled_date), "dd/MM")}
                              </span>
                            )}
                          </div>
                        ))}
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>

                {/* Marcos Próximos */}
                <Card className="bg-card">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Diamond className="h-4 w-4 text-primary" /> Marcos Próximos
                    </h3>
                    <div className="space-y-2">
                      {milestones.map(t => (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          <Diamond className="h-3 w-3 text-primary shrink-0" />
                          <span className="flex-1 truncate">{t.title}</span>
                          {t.scheduled_date && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {format(new Date(t.scheduled_date), "dd/MM")}
                            </span>
                          )}
                          <Badge variant="outline" className="text-[9px]">
                            {getStatus(t) === "concluido" ? "Concluído" : "Pendente"}
                          </Badge>
                        </div>
                      ))}
                      {milestones.length === 0 && <p className="text-xs text-muted-foreground">Nenhum marco definido</p>}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Budget Chart */}
              <Card className="bg-card">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <CircleDollarSign className="h-4 w-4 text-primary" /> Previsto vs Realizado por Categoria
                  </h3>
                  {budgetChartData.length > 0 ? (
                  <div className="h-48 w-full min-w-0 overflow-hidden">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={budgetChartData} layout="vertical" margin={{ left: 60, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => brl(v)} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={80} />
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => brl(value)} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="previsto" name="Previsto" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="realizado" name="Realizado" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">Sem dados para exibir</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ════════════════ LISTA TAB (EAP) ════════════════ */}
          {activeTab === "lista" && (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as any)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="alta">🔴 Alta</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant={filterOverdue ? "default" : "outline"} className="h-7 text-xs gap-1"
                  onClick={() => setFilterOverdue(!filterOverdue)}>
                  <AlertCircle className="h-3 w-3" /> Atrasadas
                </Button>
              </div>

              {/* Table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground/60 uppercase tracking-wider bg-muted/30 border-b border-border/30">
                        <th className="py-2.5 px-2 w-10 text-center">#</th>
                        <th className="py-2.5 px-2 text-left">Tarefa</th>
                        <th className="py-2.5 px-2 w-24 text-center">Prioridade</th>
                        <th className="py-2.5 px-2 w-28 text-center">Status</th>
                        <th className="py-2.5 px-2 w-28 text-right">Valor Previsto</th>
                        <th className="py-2.5 px-2 w-24 text-center">Data Fim</th>
                        <th className="py-2.5 px-2 w-14">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 && (
                        <tr><td colSpan={7} className="py-12 text-center text-muted-foreground/40">Nenhuma tarefa encontrada</td></tr>
                      )}
                      {filteredTasks.map((task, idx) => {
                        const taskOverdue = isOverdue(task);
                        const pConfig = PRIORITY_CONFIG[task.priority || "media"];
                        const sConfig = STATUS_CONFIG[task.taskStatus || "pendente"];
                        
                        return (
                          <tr key={task.id}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              "border-b border-border/10 transition-colors hover:bg-muted/20 group cursor-grab",
                              dragOverIdx === idx && "bg-primary/10",
                              task.is_completed && "opacity-50"
                            )}
                          >
                            <td className="py-2.5 px-2 text-center text-xs text-muted-foreground">
                              <div className="flex items-center justify-center gap-1">
                                <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-50 cursor-grab" />
                                {task.isMilestone ? <Diamond className="h-3 w-3 text-primary" /> : task.numbering}
                              </div>
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={task.is_completed || false}
                                  onCheckedChange={() => toggleComplete(task)}
                                  className="h-3.5 w-3.5 shrink-0"
                                />
                                <span className={cn("font-medium", task.is_completed && "line-through text-muted-foreground")}>
                                  {task.title}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground ml-6">{getProjectName(task.project_id)}</p>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <Select value={task.priority} onValueChange={async (v) => {
                                const newDesc = (task.description || "").replace(/\[prioridade:\w+\]/g, "") + ` [prioridade:${v}]`;
                                await supabase.from("tasks").update({ description: newDesc }).eq("id", task.id);
                                fetchData();
                              }}>
                                <SelectTrigger className={cn("h-6 text-[10px] border-none", pConfig.bg, pConfig.color)}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="alta">🔴 Alta</SelectItem>
                                  <SelectItem value="media">🟡 Média</SelectItem>
                                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <Select value={task.taskStatus} onValueChange={async (v) => {
                                const isCompleted = v === "concluido";
                                let newDesc = (task.description || "").replace(/\[status:\w+\]/g, "");
                                if (v === "andamento") newDesc += " [status:andamento]";
                                await supabase.from("tasks").update({ description: newDesc, is_completed: isCompleted }).eq("id", task.id);
                                fetchData();
                              }}>
                                <SelectTrigger className={cn("h-6 text-[10px] border-none", sConfig.bg, sConfig.color)}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="andamento">Em Andamento</SelectItem>
                                  <SelectItem value="concluido">Concluído</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-2.5 px-2 text-right font-medium tabular-nums text-xs">
                              {getTaskCost(task) > 0 ? brl(getTaskCost(task)) : "—"}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {taskOverdue && <AlertCircle className="h-3 w-3 text-destructive" />}
                                <span className={cn("text-xs", taskOverdue && "text-destructive font-bold")}>
                                  {task.scheduled_date ? format(new Date(task.scheduled_date), "dd/MM/yy") : "—"}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => toggleComplete(task)} className="p-1 rounded hover:bg-[hsl(var(--success))]/10">
                                  <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                                </button>
                                <button onClick={() => duplicateTask(task)} className="p-1 rounded hover:bg-muted">
                                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button onClick={() => openEditDialog(task)} className="p-1 rounded hover:bg-muted">
                                  <Pencil className="h-3.5 w-3.5 text-foreground" />
                                </button>
                                <button onClick={() => deleteTask(task.id)} className="p-1 rounded hover:bg-destructive/10">
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                                <button onClick={() => addSubTask(task)} className="p-1 rounded hover:bg-primary/10">
                                  <Plus className="h-3.5 w-3.5 text-primary" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Project summaries */}
              <div className="space-y-2">
                {projects.filter(p => tasks.some(t => t.project_id === p.id)).map(p => {
                  const summary = getProjectSummary(p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1.5 bg-muted/20 rounded">
                      <span className="font-medium">{p.name}</span>
                      <div className="flex items-center gap-3">
                        <span>{brl(summary.previsto)}</span>
                        {summary.overdue > 0 && <span className="text-destructive font-bold">{summary.overdue} atrasados</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════ DASHBOARD TAB ════════════════ */}
          {activeTab === "dashboard" && (
            <div className="space-y-4">
              {/* Totals */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-card">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Total Previsto</p>
                    <p className="text-2xl font-bold">{brl(kpis.previsto)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Total Realizado</p>
                    <p className="text-2xl font-bold text-primary">{brl(kpis.realizado)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Chart by Project */}
              <Card className="bg-card">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <FolderKanban className="h-4 w-4 text-primary" /> Por Projeto
                  </h3>
                  {dashboardData.byProject.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dashboardData.byProject} margin={{ left: 20, right: 20, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => brl(v)} />
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => brl(value)} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="previsto" name="Previsto" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="realizado" name="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">Sem dados de projetos</p>
                  )}
                </CardContent>
              </Card>

              {/* Chart by Cost Center */}
              <Card className="bg-card">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Layers className="h-4 w-4 text-primary" /> Por Centro de Custo
                  </h3>
                  {dashboardData.byCostCenter.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dashboardData.byCostCenter} margin={{ left: 20, right: 20, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-45} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => brl(v)} />
                          <RechartsTooltip contentStyle={tooltipStyle} formatter={(value: number) => brl(value)} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="previsto" name="Previsto" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="realizado" name="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">Sem dados de centros de custo</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { setEditDialogOpen(o); if (!o) setEditingTask(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Editar Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Título</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Anotações</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Texto livre..." rows={3} className="resize-none" />
            </div>
            <div>
              <Label className="text-sm">Links</Label>
              <Input value={editLinks} onChange={(e) => setEditLinks(e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Categoria</Label>
                <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Centro de Custo</Label>
                <Select value={editCostCenterId} onValueChange={setEditCostCenterId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {costCenters.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm">Responsável</Label>
              <Input value={editResponsible} onChange={(e) => setEditResponsible(e.target.value)} placeholder="Nome ou avatar" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Data Início</Label>
                <Input type="date" value={editDateStart} onChange={(e) => setEditDateStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Data Fim</Label>
                <Input type="date" value={editDateEnd} onChange={(e) => setEditDateEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Prioridade</Label>
                <Select value={editPriority} onValueChange={(v) => setEditPriority(v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">🔴 Alta</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Valor Previsto (R$)</Label>
                <Input value={editCost} onChange={(e) => setEditCost(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={editIsMilestone} onCheckedChange={(c) => setEditIsMilestone(!!c)} id="milestone" />
              <Label htmlFor="milestone" className="text-sm cursor-pointer flex items-center gap-1">
                <Diamond className="h-3 w-3 text-primary" /> Marcar como Marco
              </Label>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-border/20">
            {editingTask && (
              <Button variant="destructive" size="sm" onClick={() => { deleteTask(editingTask.id); setEditDialogOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveTask} className="gap-1.5 bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90">
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
