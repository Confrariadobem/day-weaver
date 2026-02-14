import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Plus, ChevronDown, Star, GripVertical, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface BacklogSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function BacklogSidebar({ collapsed, onToggle }: BacklogSidebarProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [search, setSearch] = useState("");
  const [newTask, setNewTask] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [tasksRes, catsRes] = await Promise.all([
        supabase.from("tasks").select("*").eq("user_id", user.id).eq("is_completed", false).order("sort_order"),
        supabase.from("categories").select("*").eq("user_id", user.id),
      ]);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (catsRes.data) {
        setCategories(catsRes.data);
        const open: Record<string, boolean> = { uncategorized: true };
        catsRes.data.forEach((c) => (open[c.id] = true));
        setOpenCategories(open);
      }
    };
    fetchData();

    const channel = supabase
      .channel("backlog-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${user.id}` }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const addTask = async () => {
    if (!newTask.trim() || !user) return;
    await supabase.from("tasks").insert({ title: newTask.trim(), user_id: user.id });
    setNewTask("");
  };

  const toggleFavorite = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_favorite: !task.is_favorite }).eq("id", task.id);
  };

  const filtered = tasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));

  const grouped = categories.reduce<Record<string, Tables<"tasks">[]>>((acc, cat) => {
    acc[cat.id] = filtered.filter((t) => t.category_id === cat.id);
    return acc;
  }, {});
  const uncategorized = filtered.filter((t) => !t.category_id);

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r border-border bg-sidebar-background py-2">
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-sidebar-background">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Backlog</h2>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {uncategorized.length > 0 && (
          <TaskGroup
            label="Sem Categoria"
            tasks={uncategorized}
            open={openCategories.uncategorized ?? true}
            onToggle={() => setOpenCategories((s) => ({ ...s, uncategorized: !s.uncategorized }))}
            onFavorite={toggleFavorite}
          />
        )}
        {categories.map((cat) => (
          <TaskGroup
            key={cat.id}
            label={cat.name}
            color={cat.color ?? undefined}
            tasks={grouped[cat.id] || []}
            open={openCategories[cat.id] ?? true}
            onToggle={() => setOpenCategories((s) => ({ ...s, [cat.id]: !s[cat.id] }))}
            onFavorite={toggleFavorite}
          />
        ))}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-1.5">
          <Input
            placeholder="Nova tarefa... (Enter)"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            className="h-8 text-xs"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={addTask}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskGroup({
  label,
  color,
  tasks,
  open,
  onToggle,
  onFavorite,
}: {
  label: string;
  color?: string;
  tasks: Tables<"tasks">[];
  open: boolean;
  onToggle: () => void;
  onFavorite: (t: Tables<"tasks">) => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} className="mb-2">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
        {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
        <span>{label}</span>
        <span className="ml-auto text-[10px]">{tasks.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-2 pt-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("task-id", task.id);
              e.dataTransfer.setData("task-title", task.title);
            }}
            className="group flex cursor-grab items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-border hover:bg-accent/50"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
            <span className="flex-1 truncate">{task.title}</span>
            <button onClick={() => onFavorite(task)} className="shrink-0">
              <Star className={cn("h-3 w-3", task.is_favorite ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
