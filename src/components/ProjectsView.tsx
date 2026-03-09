import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDateFormat } from "@/contexts/DateFormatContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, Pencil, CheckCircle2, Trash2, CalendarDays, Search, X,
  FolderKanban, Sparkles, Archive, ChevronDown, ChevronUp, ChevronRight,
  FileUp, FileDown, Printer, CalendarRange, Filter, Save, Layers,
  Star, Users, BarChart3, TrendingUp, Clock, AlertTriangle,
} from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

type ProjectTab = "andamento" | "backlog";
type ProjectStatus = "pendente" | "em_andamento" | "feito";
type Priority = "alta" | "media" | "baixa";
type WeekPriority = "hoje" | "essa_semana" | "proxima" | "adiar" | null;
type SortField = "name" | "responsible" | "status" | "priority" | "target_date" | "observation" | "week_priority";
type SortDir = "asc" | "desc";

interface ProjectItem {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: Priority;
  target_date: string | null;
  observation: string | null;
  user_id: string;
  parent_id: string | null;
  responsible: string | null;
  week_priority: WeekPriority;
  children?: ProjectItem[];
}

const STATUS_LABELS: Record<ProjectStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "text-amber-500" },
  em_andamento: { label: "Em andamento", className: "text-primary" },
  feito: { label: "Concluído", className: "text-[hsl(var(--success))]" },
};

const PRIORITY_LABELS: Record<Priority, { label: string; className: string }> = {
  alta: { label: "Alta", className: "text-destructive" },
  media: { label: "Média", className: "text-amber-500" },
  baixa: { label: "Baixa", className: "text-[hsl(var(--success))]" },
};

const WEEK_PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  hoje: { label: "Hoje", className: "text-destructive" },
  essa_semana: { label: "Essa Semana", className: "text-amber-500" },
  proxima: { label: "Próxima", className: "text-primary" },
  adiar: { label: "Adiado", className: "text-muted-foreground" },
};

const PRIORITY_ORDER: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };
const WEEK_PRIORITY_ORDER: Record<string, number> = { hoje: 0, essa_semana: 1, proxima: 2, adiar: 3 };

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--success))", "#f59e0b", "#8b5cf6", "#06b6d4"];

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

function parsePriority(p: string | null): Priority {
  if (p === "alta" || p === "high") return "alta";
  if (p === "baixa" || p === "low") return "baixa";
  return "media";
}

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

export default function ProjectsView() {
  const { user } = useAuth();
  const { formatDate: fmtDate, dateFormat } = useDateFormat();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<ProjectTab>("andamento");
  const [rawProjects, setRawProjects] = useState<any[]>([]);

  // Local week_priority state (not persisted to DB yet, stored in memory)
  const [weekPriorities, setWeekPriorities] = useState<Record<string, WeekPriority>>({});

  // Sort
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // EAP modal
  const [eapOpen, setEapOpen] = useState(false);

  // Interval filter
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<ProjectStatus>("pendente");
  const [formPriority, setFormPriority] = useState<Priority>("media");
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formObs, setFormObs] = useState("");
  const [formParentId, setFormParentId] = useState<string>("");
  const [formResponsible, setFormResponsible] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // FAB menu
  const [fabOpen, setFabOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("name");
    if (data) setRawProjects(data);
  }, [user]);

  useEffect(() => {
    fetchData();
    const handler = () => fetchData();
    window.addEventListener("lovable:data-changed", handler);
    return () => window.removeEventListener("lovable:data-changed", handler);
  }, [fetchData]);

  // Build hierarchical items
  const allItems: ProjectItem[] = useMemo(() => {
    return rawProjects.map(p => ({
      id: p.id,
      name: p.name,
      status: mapStatus(p.status),
      priority: parsePriority((p as any).priority),
      target_date: (p as any).target_date || null,
      observation: p.description || null,
      user_id: p.user_id,
      parent_id: (p as any).parent_id || null,
      responsible: (p as any).responsible || null,
      week_priority: weekPriorities[p.id] || null,
    }));
  }, [rawProjects, weekPriorities]);

  const hierarchy = useMemo(() => {
    const parents = allItems.filter(i => !i.parent_id);
    const childMap = new Map<string, ProjectItem[]>();
    allItems.filter(i => i.parent_id).forEach(i => {
      const arr = childMap.get(i.parent_id!) || [];
      arr.push(i);
      childMap.set(i.parent_id!, arr);
    });
    return parents.map(p => ({
      ...p,
      children: childMap.get(p.id) || [],
    }));
  }, [allItems]);

  const getEffectiveStatus = (parent: ProjectItem & { children: ProjectItem[] }): ProjectStatus => {
    if (parent.children.length === 0) return parent.status;
    const allDone = parent.children.every(c => c.status === "feito");
    const anyInProgress = parent.children.some(c => c.status === "em_andamento" || c.status === "feito");
    if (allDone) return "feito";
    if (anyInProgress) return "em_andamento";
    return "pendente";
  };

  const getProgress = (children: ProjectItem[]): number => {
    if (children.length === 0) return 0;
    const done = children.filter(c => c.status === "feito").length;
    return Math.round((done / children.length) * 100);
  };

  // ─── Indicadores data ───────────────────────────────────────────────────
  const indicadoresData = useMemo(() => {
    const total = allItems.length;
    const done = allItems.filter(i => i.status === "feito").length;
    const inProgress = allItems.filter(i => i.status === "em_andamento").length;
    const pending = allItems.filter(i => i.status === "pendente").length;
    const overdue = allItems.filter(i => {
      if (!i.target_date || i.status === "feito") return false;
      return new Date(i.target_date) < new Date();
    }).length;
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

    // By responsible
    const byResponsible: Record<string, number> = {};
    allItems.forEach(i => {
      const r = i.responsible || "Sem responsável";
      byResponsible[r] = (byResponsible[r] || 0) + 1;
    });
    const responsibleData = Object.entries(byResponsible).map(([name, value]) => ({ name, value }));

    // Status distribution
    const statusData = [
      { name: "Pendente", value: pending, fill: "#f59e0b" },
      { name: "Em andamento", value: inProgress, fill: "hsl(var(--primary))" },
      { name: "Concluído", value: done, fill: "hsl(var(--success))" },
    ].filter(d => d.value > 0);

    // Priority distribution
    const alta = allItems.filter(i => i.priority === "alta").length;
    const media = allItems.filter(i => i.priority === "media").length;
    const baixa = allItems.filter(i => i.priority === "baixa").length;
    const priorityData = [
      { name: "Alta", value: alta },
      { name: "Média", value: media },
      { name: "Baixa", value: baixa },
    ];

    return { total, done, inProgress, pending, overdue, progressPct, responsibleData, statusData, priorityData };
  }, [allItems]);

  // Filter by tab (for list tabs)
  const tabFiltered = useMemo(() => {
    if (activeTab === "indicadores") return hierarchy;
    return hierarchy.filter(p => {
      const eff = getEffectiveStatus(p);
      if (activeTab === "andamento") return eff === "pendente" || eff === "em_andamento";
      if (activeTab === "desejos") return eff === "pendente";
      return eff === "feito";
    });
  }, [hierarchy, activeTab]);

  const filtered = useMemo(() => {
    let list = tabFiltered;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.observation || "").toLowerCase().includes(q) ||
        (p.responsible || "").toLowerCase().includes(q) ||
        p.children.some(c => c.name.toLowerCase().includes(q) || (c.observation || "").toLowerCase().includes(q))
      );
    }
    if (filterStatus !== "all") list = list.filter(p => getEffectiveStatus(p) === filterStatus);
    if (filterPriority !== "all") list = list.filter(p => p.priority === filterPriority);
    if (dateFrom || dateTo) {
      const from = dateFrom ? parseDMY(dateFrom) : null;
      const to = dateTo ? parseDMY(dateTo) : null;
      list = list.filter(p => {
        if (!p.target_date) return false;
        const d = new Date(p.target_date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    return [...list].sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === "name") { aVal = a.name; bVal = b.name; }
      else if (sortField === "responsible") { aVal = a.responsible || ""; bVal = b.responsible || ""; }
      else if (sortField === "status") { aVal = a.status; bVal = b.status; }
      else if (sortField === "priority") { aVal = PRIORITY_ORDER[a.priority]; bVal = PRIORITY_ORDER[b.priority]; }
      else if (sortField === "target_date") { aVal = a.target_date || ""; bVal = b.target_date || ""; }
      else if (sortField === "week_priority") { aVal = WEEK_PRIORITY_ORDER[a.week_priority || "adiar"] ?? 9; bVal = WEEK_PRIORITY_ORDER[b.week_priority || "adiar"] ?? 9; }
      else { aVal = a.observation || ""; bVal = b.observation || ""; }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tabFiltered, searchQuery, filterStatus, filterPriority, dateFrom, dateTo, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="ml-1 inline-flex flex-col leading-none">
      <ChevronUp className={cn("h-2.5 w-2.5", sortField === field && sortDir === "asc" ? "text-foreground" : "text-muted-foreground/40")} />
      <ChevronDown className={cn("h-2.5 w-2.5 -mt-0.5", sortField === field && sortDir === "desc" ? "text-foreground" : "text-muted-foreground/40")} />
    </span>
  );

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allFilteredIds = useMemo(() => {
    const ids: string[] = [];
    filtered.forEach(p => { ids.push(p.id); p.children.forEach(c => ids.push(c.id)); });
    return ids;
  }, [filtered]);

  const resetForm = () => {
    setFormName(""); setFormStatus("pendente"); setFormPriority("media");
    setFormDate(undefined); setFormObs(""); setFormParentId(""); setFormResponsible(""); setEditing(null);
  };

  const openDialog = (item?: ProjectItem) => {
    if (item) {
      setEditing(item);
      setFormName(item.name);
      setFormStatus(item.status);
      setFormPriority(item.priority);
      setFormDate(item.target_date ? new Date(item.target_date) : undefined);
      setFormObs(item.observation || "");
      setFormParentId(item.parent_id || "");
      setFormResponsible(item.responsible || "");
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const saveProject = async () => {
    if (!user || !formName.trim()) return;
    const dateStr = formDate ? format(formDate, "yyyy-MM-dd") : null;
    const payload: any = {
      name: formName.trim(),
      description: formObs.trim() || null,
      status: toDbStatus(formStatus),
      priority: formPriority,
      target_date: dateStr,
      parent_id: formParentId || null,
      responsible: formResponsible.trim() || null,
    };
    if (editing) {
      await supabase.from("projects").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("projects").insert({ ...payload, user_id: user.id });
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
    toast({ title: editing ? "Projeto atualizado!" : "Projeto criado!" });
  };

  const markComplete = async (item: ProjectItem) => {
    await supabase.from("projects").update({ status: "completed" }).eq("id", item.id);
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
    toast({ title: "Marcado como concluído!" });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { data: children } = await supabase.from("projects").select("*").eq("user_id", user!.id);
    const childIds = (children || []).filter((c: any) => c.parent_id === deleteId).map((c: any) => c.id);
    if (childIds.length > 0) await supabase.from("projects").delete().in("id", childIds);
    await supabase.from("tasks").delete().eq("project_id", deleteId);
    await supabase.from("projects").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
    toast({ title: "Projeto excluído!" });
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    const { data: allProj } = await supabase.from("projects").select("*").eq("user_id", user!.id);
    const childIdsToDelete = (allProj || []).filter((c: any) => ids.includes(c.parent_id)).map((c: any) => c.id);
    if (childIdsToDelete.length > 0) await supabase.from("projects").delete().in("id", childIdsToDelete);
    for (const id of ids) {
      await supabase.from("tasks").delete().eq("project_id", id);
    }
    await supabase.from("projects").delete().in("id", ids);
    setSelectedIds(new Set());
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const handleBatchComplete = async () => {
    const ids = Array.from(selectedIds);
    await supabase.from("projects").update({ status: "completed" }).in("id", ids);
    setSelectedIds(new Set());
    fetchData();
    window.dispatchEvent(new Event("lovable:data-changed"));
  };

  const handleExportCSV = () => {
    const rows = [["Nome", "Responsável", "Pai", "Status", "Prioridade", "Data", "Observação"]];
    filtered.forEach(p => {
      rows.push([p.name, p.responsible || "", "", STATUS_LABELS[getEffectiveStatus(p)].label, PRIORITY_LABELS[p.priority].label, p.target_date || "", p.observation || ""]);
      p.children.forEach(c => {
        rows.push([c.name, c.responsible || "", p.name, STATUS_LABELS[c.status].label, PRIORITY_LABELS[c.priority].label, c.target_date || "", c.observation || ""]);
      });
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projetos-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const handleIntervalSelect = (range: any) => {
    if (range?.from) { setCustomFrom(range.from); setDateFrom(format(range.from, "dd/MM/yyyy")); }
    if (range?.to) { setCustomTo(range.to); setDateTo(format(range.to, "dd/MM/yyyy")); }
  };

  const handleClearInterval = () => {
    setCustomFrom(undefined); setCustomTo(undefined);
    setDateFrom(""); setDateTo(""); setIntervalOpen(false);
  };

  const formatDateDisplay = (d: string | null) => {
    if (!d) return "—";
    try { return fmtDate(new Date(d)); } catch { return d; }
  };

  const parentOptions = allItems.filter(i => !i.parent_id && i.id !== editing?.id);

  // Unique responsibles for select
  const uniqueResponsibles = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach(i => { if (i.responsible) set.add(i.responsible); });
    return Array.from(set).sort();
  }, [allItems]);

  const tabConfig: { key: ProjectTab; label: string; icon: React.ReactNode }[] = [
    { key: "indicadores", label: "Indicadores", icon: <BarChart3 className="h-3 w-3" /> },
    { key: "andamento", label: "Em Andamento", icon: <FolderKanban className="h-3 w-3" /> },
    { key: "desejos", label: "Desejos", icon: <Sparkles className="h-3 w-3" /> },
    { key: "concluidos", label: "Concluídos", icon: <Archive className="h-3 w-3" /> },
  ];

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let result: React.ReactNode[] = [text];
    words.forEach(word => {
      const newResult: React.ReactNode[] = [];
      result.forEach((part, pi) => {
        if (typeof part !== "string") { newResult.push(part); return; }
        const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        const splits = part.split(regex);
        splits.forEach((s, si) => {
          if (s.toLowerCase() === word) {
            newResult.push(<mark key={`${pi}-${si}`} className="bg-primary/30 text-foreground rounded-sm px-0.5">{s}</mark>);
          } else {
            newResult.push(s);
          }
        });
      });
      result = newResult;
    });
    return <>{result}</>;
  };

  // Week priority handler
  const setWeekPriorityForItem = (id: string, wp: WeekPriority) => {
    setWeekPriorities(prev => ({ ...prev, [id]: wp }));
    toast({ title: wp ? `Priorizado: ${WEEK_PRIORITY_LABELS[wp]?.label}` : "Prioridade removida" });
  };

  // Star priority popover component
  const StarPriority = ({ item }: { item: ProjectItem }) => {
    const wp = item.week_priority;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn("rounded p-0.5 transition-colors", wp ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")}>
            <Star className={cn("h-3.5 w-3.5", wp && "fill-amber-400")} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="start">
          <div className="space-y-0.5">
            {(["hoje", "essa_semana", "proxima", "adiar"] as WeekPriority[]).map(wp => (
              <button key={wp} onClick={() => setWeekPriorityForItem(item.id, wp)}
                className={cn("w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/50 transition-colors",
                  item.week_priority === wp && "bg-muted font-semibold"
                )}>
                <span className={WEEK_PRIORITY_LABELS[wp!].className}>{WEEK_PRIORITY_LABELS[wp!].label}</span>
              </button>
            ))}
            {item.week_priority && (
              <>
                <Separator className="my-1" />
                <button onClick={() => setWeekPriorityForItem(item.id, null)}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/50 text-muted-foreground">
                  Remover
                </button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Render table row
  const renderRow = (item: ProjectItem, isChild: boolean, parent?: ProjectItem & { children: ProjectItem[] }) => {
    const hasChildren = !isChild && (hierarchy.find(h => h.id === item.id)?.children.length || 0) > 0;
    const isExpanded = expandedIds.has(item.id);
    const children = hierarchy.find(h => h.id === item.id)?.children || [];
    const progress = getProgress(children);

    return (
      <tr
        key={item.id}
        className={cn(
          "group transition-colors hover:bg-primary/5",
          "border-t border-border/10",
          item.status === "feito" && "opacity-60",
        )}
      >
        <td className="py-2.5 px-2">
          <Checkbox
            checked={selectedIds.has(item.id)}
            onCheckedChange={(c) => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (c) next.add(item.id); else next.delete(item.id);
                return next;
              });
            }}
            className="h-3.5 w-3.5"
          />
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: isChild ? 30 : 0 }}>
            {hasChildren && (
              <button onClick={() => toggleExpand(item.id)} className="p-0.5 rounded hover:bg-muted/30 transition-colors">
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
              </button>
            )}
            {!hasChildren && !isChild && <span className="w-[18px]" />}
            <span className="text-xs font-bold text-foreground truncate max-w-[200px]">
              {highlightMatch(item.name, searchQuery)}
            </span>
            {hasChildren && (
              <div className="flex items-center gap-1.5 ml-2">
                <Progress value={progress} className="h-1.5 w-16" />
                <span className="text-[10px] text-muted-foreground">{progress}%</span>
              </div>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            {item.responsible ? (
              <>
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                  {item.responsible.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">{item.responsible}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/40">—</span>
            )}
          </div>
        </td>
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
        <td className="py-2.5 px-2 text-center">
          <StarPriority item={item} />
          {item.week_priority && (
            <span className={cn("text-[9px] block", WEEK_PRIORITY_LABELS[item.week_priority].className)}>
              {WEEK_PRIORITY_LABELS[item.week_priority].label}
            </span>
          )}
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground tabular-nums">
          {formatDateDisplay(item.target_date)}
        </td>
        <td className="py-2.5 px-1 w-24 no-print">
          <div className="hidden group-hover:flex items-center gap-0.5 justify-center">
            {item.status !== "feito" && (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button onClick={() => markComplete(item)}
                    className="rounded p-0.5 text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.1)] transition-colors">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Concluir</TooltipContent>
              </Tooltip>
            )}
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={() => openDialog(item)}
                  className="rounded p-0.5 text-foreground hover:text-foreground/80 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Editar</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button onClick={() => setDeleteId(item.id)}
                  className="rounded p-0.5 text-destructive hover:text-destructive/80 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Excluir</TooltipContent>
            </Tooltip>
          </div>
        </td>
      </tr>
    );
  };

  // Mobile card renderer
  const renderCard = (item: ProjectItem, isChild: boolean) => {
    const hasChildren = !isChild && (hierarchy.find(h => h.id === item.id)?.children.length || 0) > 0;
    const isExpanded = expandedIds.has(item.id);
    const children = hierarchy.find(h => h.id === item.id)?.children || [];
    const progress = getProgress(children);

    return (
      <div key={item.id} className={cn("rounded-lg border border-border/30 p-3 space-y-2", isChild && "ml-4 border-l-2 border-l-primary/20")}>
        <div className="flex items-start gap-2">
          <Checkbox
            checked={selectedIds.has(item.id)}
            onCheckedChange={(c) => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (c) next.add(item.id); else next.delete(item.id);
                return next;
              });
            }}
            className="h-3.5 w-3.5 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {hasChildren && (
                <button onClick={() => toggleExpand(item.id)} className="p-0.5">
                  <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                </button>
              )}
              <span className="text-sm font-bold text-foreground truncate">{item.name}</span>
              <StarPriority item={item} />
            </div>
            {hasChildren && (
              <div className="flex items-center gap-1.5 mt-1">
                <Progress value={progress} className="h-1.5 flex-1" />
                <span className="text-[10px] text-muted-foreground">{progress}%</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className={cn("font-medium", STATUS_LABELS[item.status].className)}>{STATUS_LABELS[item.status].label}</span>
          <span className={cn("font-medium", PRIORITY_LABELS[item.priority].className)}>{PRIORITY_LABELS[item.priority].label}</span>
          <span className="text-muted-foreground tabular-nums">{formatDateDisplay(item.target_date)}</span>
          {item.responsible && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> {item.responsible}
            </span>
          )}
        </div>
        {item.observation && <p className="text-xs text-muted-foreground truncate">{item.observation}</p>}
        <div className="flex items-center gap-1 justify-end">
          {item.status !== "feito" && (
            <button onClick={() => markComplete(item)} className="rounded p-1 text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.1)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => openDialog(item)} className="rounded p-1 text-foreground hover:text-foreground/80">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setDeleteId(item.id)} className="rounded p-1 text-destructive hover:text-destructive/80">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {hasChildren && isExpanded && children.map(c => renderCard(c, true))}
      </div>
    );
  };

  // ─── Indicadores View ─────────────────────────────────────────────────────
  const renderIndicadores = () => {
    const { total, done, inProgress, pending, overdue, progressPct, responsibleData, statusData, priorityData } = indicadoresData;

    const summaryCards = [
      { label: "Total", value: total, icon: <FolderKanban className="h-4 w-4" />, color: "text-primary" },
      { label: "Concluídos", value: done, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-[hsl(var(--success))]" },
      { label: "Em Andamento", value: inProgress, icon: <TrendingUp className="h-4 w-4" />, color: "text-primary" },
      { label: "Atrasados", value: overdue, icon: <AlertTriangle className="h-4 w-4" />, color: "text-destructive" },
    ];

    return (
      <div className="space-y-4 px-1">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summaryCards.map(c => (
            <Card key={c.label} className="border-border/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("shrink-0", c.color)}>{c.icon}</div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{c.value}</p>
                  <p className="text-[11px] text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Progress bar */}
        <Card className="border-border/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Progresso Geral</p>
              <span className="text-sm font-bold text-foreground">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
            <p className="text-[11px] text-muted-foreground">{done} de {total} projetos concluídos</p>
          </CardContent>
        </Card>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Status Pie */}
          <Card className="border-border/30">
            <CardContent className="p-4">
              <p className="text-xs font-semibold mb-3">Distribuição por Status</p>
              {statusData.length > 0 ? (
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                        {statusData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
              )}
              <div className="flex items-center justify-center gap-4 mt-2">
                {statusData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Responsible Bar */}
          <Card className="border-border/30">
            <CardContent className="p-4">
              <p className="text-xs font-semibold mb-3">Distribuição por Responsável</p>
              {responsibleData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={responsibleData} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {responsibleData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className={cn("p-4 space-y-4 max-w-full overflow-hidden", isMobile && "px-3")}>
        {/* Tab buttons + Toolbar on same line */}
        <div className="bg-card border-b border-border py-2 -mx-4 px-4 flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            {tabConfig.map(tab => (
              <Button key={tab.key} size="sm"
                variant={activeTab === tab.key ? "default" : "ghost"}
                className={cn("h-7 text-xs px-3 rounded-full gap-1.5", activeTab !== tab.key && "text-muted-foreground")}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon} {tab.label}
              </Button>
            ))}
          </div>
          {activeTab !== "indicadores" && (
            <div className="ml-auto flex items-center gap-3">
              {/* Search */}
              <div className="relative" style={{ width: isMobile ? 200 : 400 }}>
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar projetos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-8 pr-14 text-xs rounded-lg" />
                <div className="absolute right-2 top-1 flex items-center gap-1">
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
                    className={cn("rounded p-0.5 transition-colors",
                      advancedFilterOpen || filterStatus !== "all" || filterPriority !== "all" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}>
                    <Filter className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Interval */}
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
                  <Calendar mode="range" locale={ptBR} showOutsideDays={false}
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

              {/* Hoje toggle */}
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

              {/* EAP */}
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button onClick={() => setEapOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary/80 hover:text-primary hover:bg-primary/5 transition-all duration-200 shrink-0">
                    <Layers className="size-4" />
                    <span>EAP</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Estrutura Analítica do Projeto</TooltipContent>
              </Tooltip>

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
          )}
        </div>

        {/* Advanced Filter Panel */}
        {activeTab !== "indicadores" && advancedFilterOpen && (
          <div className="my-4 space-y-4">
            <div className="rounded-lg border border-border/50 bg-card p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> Filtros Avançados
                </p>
                <button onClick={() => { setFilterStatus("all"); setFilterPriority("all"); }}
                  className="text-[10px] text-muted-foreground hover:text-primary underline">Limpar filtros</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="feito">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Prioridade</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="baixa">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="border-t border-border/50" />
          </div>
        )}

        {/* Content */}
        {activeTab === "indicadores" ? (
          renderIndicadores()
        ) : isMobile ? (
          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground/50 text-sm py-12">Nenhum projeto nesta aba</p>
            )}
            {filtered.map(p => renderCard(p, false))}
          </div>
        ) : (
          <div className="rounded-lg overflow-auto max-h-[calc(100vh-256px)] border border-border/30">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="py-2.5 px-2 w-8">
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds.size === allFilteredIds.length}
                      onCheckedChange={(c) => {
                        if (c) setSelectedIds(new Set(allFilteredIds));
                        else setSelectedIds(new Set());
                      }}
                      className="h-3.5 w-3.5"
                    />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    Nome <SortIcon field="name" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-32" onClick={() => toggleSort("responsible")}>
                    Responsável <SortIcon field="responsible" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-32" onClick={() => toggleSort("status")}>
                    Status <SortIcon field="status" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-28" onClick={() => toggleSort("priority")}>
                    Prioridade <SortIcon field="priority" />
                  </th>
                  <th className="text-center py-2.5 px-2 cursor-pointer select-none w-24" onClick={() => toggleSort("week_priority")}>
                    <Star className="h-3 w-3 inline" /> <SortIcon field="week_priority" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-28" onClick={() => toggleSort("target_date")}>
                    Data <SortIcon field="target_date" />
                  </th>
                  <th className="w-24 py-2.5 px-1">
                    {selectedIds.size > 0 ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <button onClick={handleBatchComplete}
                              className="rounded p-0.5 text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.1)] transition-colors">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Concluir</TooltipContent>
                        </Tooltip>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <button onClick={handleBatchDelete}
                              className="rounded p-0.5 text-destructive hover:text-destructive/80 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Excluir</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : null}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-muted-foreground/40 py-12">
                    Nenhum projeto nesta aba
                  </td></tr>
                )}
                {filtered.map(p => {
                  const rows: React.ReactNode[] = [];
                  rows.push(renderRow(p, false));
                  if (expandedIds.has(p.id)) {
                    p.children.forEach(c => rows.push(renderRow(c, true, p)));
                  }
                  return rows;
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-card border-t border-border">
                <tr>
                  <td colSpan={8} className="py-2 px-4">
                    <span className="text-xs text-muted-foreground">
                      Selecionados: {selectedIds.size.toLocaleString("pt-BR")}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* FAB with menu */}
      <div className="fixed z-50 bottom-20 right-4 md:bottom-6 md:right-6">
        {fabOpen && (
          <div className="mb-2 flex flex-col gap-1.5 animate-in slide-in-from-bottom-2 duration-200">
            <button onClick={() => { setFabOpen(false); resetForm(); setDialogOpen(true); }}
              className="flex items-center gap-2 rounded-full bg-card border border-border shadow-lg px-4 py-2 text-xs font-medium hover:bg-muted/50 transition-colors">
              <FolderKanban className="h-3.5 w-3.5 text-primary" /> Novo Projeto
            </button>
            <button onClick={() => { setFabOpen(false); window.dispatchEvent(new CustomEvent("lovable:open-fab-event", { detail: { type: "project" } })); }}
              className="flex items-center gap-2 rounded-full bg-card border border-border shadow-lg px-4 py-2 text-xs font-medium hover:bg-muted/50 transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Nova Tarefa
            </button>
            <button onClick={() => { setFabOpen(false); window.dispatchEvent(new CustomEvent("lovable:open-team-modal")); }}
              className="flex items-center gap-2 rounded-full bg-card border border-border shadow-lg px-4 py-2 text-xs font-medium hover:bg-muted/50 transition-colors">
              <Users className="h-3.5 w-3.5 text-pink-500" /> Nova Equipe
            </button>
          </div>
        )}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-lg",
            "transition-all duration-200 hover:scale-110 hover:shadow-xl",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            fabOpen && "rotate-45"
          )}
          aria-label="Novo lançamento"
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Projeto" : "Novo Projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/30 p-3 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nome *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome do projeto" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Observação</Label>
                <Textarea value={formObs} onChange={(e) => setFormObs(e.target.value)} placeholder="Notas, links, detalhes..." className="min-h-[80px] text-xs" />
              </div>
            </div>

            <div className="rounded-lg border border-border/30 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ProjectStatus)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="feito">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Prioridade</Label>
                  <Select value={formPriority} onValueChange={(v) => setFormPriority(v as Priority)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="baixa">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Responsável</Label>
                <Input value={formResponsible} onChange={(e) => setFormResponsible(e.target.value)}
                  placeholder="Nome do responsável" className="text-xs" />
                {uniqueResponsibles.length > 0 && !formResponsible && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {uniqueResponsibles.slice(0, 5).map(r => (
                      <button key={r} onClick={() => setFormResponsible(r)}
                        className="text-[10px] bg-muted rounded-full px-2 py-0.5 hover:bg-muted/80 transition-colors">
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border/30 p-3 space-y-2">
              <div>
                <Label className="text-xs text-muted-foreground">Data Alvo</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !formDate && "text-muted-foreground")}>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formDate ? format(formDate, "dd/MM/yyyy") : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" locale={ptBR} selected={formDate}
                      onSelect={(d) => setFormDate(d ?? undefined)}
                      className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Projeto Pai (opcional)</Label>
                <Select value={formParentId || "__none__"} onValueChange={(v) => setFormParentId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Nenhum (projeto raiz)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__"><span className="text-muted-foreground italic">Nenhum (projeto raiz)</span></SelectItem>
                    {parentOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-border/20">
            {editing && (
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setDialogOpen(false); setDeleteId(editing.id); }}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
              <Button size="sm" onClick={saveProject} disabled={!formName.trim()} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir projeto?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita. Subprojetos também serão excluídos.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="text-xs">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} className="text-xs">Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EAP Modal */}
      <Dialog open={eapOpen} onOpenChange={setEapOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> Estrutura Analítica do Projeto (EAP)</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {hierarchy.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum projeto cadastrado. Crie um projeto primeiro.</p>
            )}
            {hierarchy.map(parent => {
              const children = parent.children || [];
              const progress = getProgress(children);
              const effStatus = getEffectiveStatus(parent);
              return (
                <div key={parent.id} className="space-y-0.5">
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", children.length > 0 && "text-primary")} />
                    <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold flex-1 truncate">{parent.name}</span>
                    <span className={cn("text-[10px] font-medium shrink-0", STATUS_LABELS[effStatus].className)}>{STATUS_LABELS[effStatus].label}</span>
                    {children.length > 0 && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Progress value={progress} className="h-1.5 w-16" />
                        <span className="text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
                      </div>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 shrink-0"
                      onClick={() => { setFormParentId(parent.id); setEapOpen(false); resetForm(); setFormParentId(parent.id); setDialogOpen(true); }}>
                      <Plus className="h-3 w-3" /> Filho
                    </Button>
                  </div>
                  {children.map(child => (
                    <div key={child.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 ml-8 bg-muted/10 hover:bg-muted/20 transition-colors">
                      <span className="text-xs text-muted-foreground">└</span>
                      <span className="text-xs font-medium flex-1 truncate">{child.name}</span>
                      <span className={cn("text-[10px]", STATUS_LABELS[child.status].className)}>{STATUS_LABELS[child.status].label}</span>
                      <span className={cn("text-[10px]", PRIORITY_LABELS[child.priority].className)}>{PRIORITY_LABELS[child.priority].label}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-border/20">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEapOpen(false); resetForm(); setDialogOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> Novo Projeto Raiz
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEapOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
