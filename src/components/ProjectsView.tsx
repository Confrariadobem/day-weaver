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
import {
  Plus, Pencil, CheckCircle2, Trash2, CalendarDays, Search, X,
  FolderKanban, Sparkles, Archive, ChevronDown, ChevronUp, ChevronRight,
  FileUp, FileDown, Printer, CalendarRange, Filter, Save,
} from "lucide-react";
import { format, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

type ProjectTab = "andamento" | "desejos" | "concluidos";
type ProjectStatus = "pendente" | "em_andamento" | "feito";
type Priority = "alta" | "media" | "baixa";
type SortField = "name" | "status" | "priority" | "target_date" | "observation";
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

function parsePriority(p: string | null): Priority {
  if (p === "alta" || p === "high") return "alta";
  if (p === "baixa" || p === "low") return "baixa";
  return "media";
}

// Date input helpers
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
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    }));
  }, [rawProjects]);

  // Parents with children
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

  // Compute parent status from children
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

  // Filter by tab
  const tabFiltered = useMemo(() => {
    return hierarchy.filter(p => {
      const eff = getEffectiveStatus(p);
      if (activeTab === "andamento") return eff === "pendente" || eff === "em_andamento";
      if (activeTab === "desejos") return eff === "pendente";
      return eff === "feito";
    });
  }, [hierarchy, activeTab]);

  // Apply search + advanced filters + date range
  const filtered = useMemo(() => {
    let list = tabFiltered;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.observation || "").toLowerCase().includes(q) ||
        p.children.some(c => c.name.toLowerCase().includes(q) || (c.observation || "").toLowerCase().includes(q))
      );
    }

    // Advanced filters
    if (filterStatus !== "all") list = list.filter(p => getEffectiveStatus(p) === filterStatus);
    if (filterPriority !== "all") list = list.filter(p => p.priority === filterPriority);

    // Date range
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

    // Sort
    return [...list].sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === "name") { aVal = a.name; bVal = b.name; }
      else if (sortField === "status") { aVal = a.status; bVal = b.status; }
      else if (sortField === "priority") { aVal = PRIORITY_ORDER[a.priority]; bVal = PRIORITY_ORDER[b.priority]; }
      else if (sortField === "target_date") { aVal = a.target_date || ""; bVal = b.target_date || ""; }
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
    setFormDate(undefined); setFormObs(""); setFormParentId(""); setEditing(null);
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
    // Delete children first via RPC-style raw
    const { data: children } = await supabase.from("projects").select("id").eq("user_id", user!.id);
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
    // Delete children of selected parents
    const { data: allProj } = await supabase.from("projects").select("id").eq("user_id", user!.id);
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
    const rows = [["Nome", "Pai", "Status", "Prioridade", "Data", "Observação"]];
    filtered.forEach(p => {
      rows.push([p.name, "", STATUS_LABELS[getEffectiveStatus(p)].label, PRIORITY_LABELS[p.priority].label, p.target_date || "", p.observation || ""]);
      p.children.forEach(c => {
        rows.push([c.name, p.name, STATUS_LABELS[c.status].label, PRIORITY_LABELS[c.priority].label, c.target_date || "", c.observation || ""]);
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

  const handlePrint = () => {
    window.print();
  };

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

  // Top-level parents for parent selector
  const parentOptions = allItems.filter(i => !i.parent_id && i.id !== editing?.id);

  const tabConfig: { key: ProjectTab; label: string; icon: React.ReactNode }[] = [
    { key: "andamento", label: "Em Andamento", icon: <FolderKanban className="h-3 w-3" /> },
    { key: "desejos", label: "Desejos", icon: <Sparkles className="h-3 w-3" /> },
    { key: "concluidos", label: "Concluídos", icon: <Archive className="h-3 w-3" /> },
  ];

  // Highlight match in search
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

  // Render a project row (parent or child)
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
          {formatDateDisplay(item.target_date)}
        </td>
        <td className="py-2.5 px-3 text-xs text-muted-foreground max-w-[200px] truncate">
          {item.observation ? highlightMatch(item.observation, searchQuery) : "—"}
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
      <div key={item.id} className={cn("rounded-lg border border-border/30 p-3 space-y-2", isChild && "ml-6 border-l-2 border-l-primary/20")}>
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

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 max-w-full overflow-hidden">
        {/* Tab buttons + Toolbar on same line */}
        <div className="flex items-center gap-2 overflow-x-auto">
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
          <div className="ml-auto flex items-center gap-3">
            {/* Search with filter icon inside */}
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
                <button
                  onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
                  className={cn(
                    "rounded p-0.5 transition-colors",
                    advancedFilterOpen || filterStatus !== "all" || filterPriority !== "all"
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Filter className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Interval */}
            <Popover open={intervalOpen} onOpenChange={setIntervalOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-1 transition-all duration-200 shrink-0",
                    (dateFrom || dateTo)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/80 hover:bg-primary/5"
                  )}
                >
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
                    <Input value={dateFrom}
                      onChange={(e) => setDateFrom(normalizeDateInput(e.target.value))}
                      onBlur={() => { const d = parseDMY(dateFrom); if (d) { setCustomFrom(d); setDateFrom(format(d, "dd/MM/yyyy")); } }}
                      placeholder="DD / MM / YYYY" className="h-10 text-sm rounded-md border-border" style={{ width: 130 }} maxLength={10} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-8 shrink-0">Até:</span>
                    <Input value={dateTo}
                      onChange={(e) => setDateTo(normalizeDateInput(e.target.value))}
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

        {/* Advanced Filter Panel */}
        {advancedFilterOpen && (
          <>
            <div className="rounded-lg border border-border/50 bg-card p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> Filtros Avançados
                </p>
                <button
                  onClick={() => { setFilterStatus("all"); setFilterPriority("all"); }}
                  className="text-[10px] text-muted-foreground hover:text-primary underline"
                >
                  Limpar filtros
                </button>
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
          </>
        )}

        {/* Desktop Table / Mobile Cards */}
        {isMobile ? (
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
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-32" onClick={() => toggleSort("status")}>
                    Status <SortIcon field="status" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-28" onClick={() => toggleSort("priority")}>
                    Prioridade <SortIcon field="priority" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none w-28" onClick={() => toggleSort("target_date")}>
                    Data <SortIcon field="target_date" />
                  </th>
                  <th className="text-left py-2.5 px-3 cursor-pointer select-none" onClick={() => toggleSort("observation")}>
                    Observação <SortIcon field="observation" />
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
                  <tr><td colSpan={7} className="text-center text-muted-foreground/40 py-12">
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
                  <td colSpan={7} className="py-2 px-4">
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

      {/* FAB */}
      <button
        onClick={() => { resetForm(); setDialogOpen(true); }}
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full",
          "bottom-20 right-4 md:bottom-6 md:right-6",
          "bg-primary text-primary-foreground shadow-lg",
          "transition-all duration-200 hover:scale-110 hover:shadow-xl",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        )}
        aria-label="Novo projeto"
      >
        <Plus className="h-7 w-7" />
      </button>

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
    </ScrollArea>
  );
}
