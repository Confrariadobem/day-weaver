import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Star, ChevronDown, Check, Trash2, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

export default function ProjectsView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [tasks, setTasks] = useState<Tables<"tasks">[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    const [projRes, taskRes] = await Promise.all([
      supabase.from("projects").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("tasks").select("*").eq("user_id", user.id).order("sort_order"),
    ]);
    if (projRes.data) setProjects(projRes.data);
    if (taskRes.data) setTasks(taskRes.data);
  };

  useEffect(() => { fetchData(); }, [user]);

  const createProject = async () => {
    if (!newProjectName.trim() || !user) return;
    await supabase.from("projects").insert({ name: newProjectName.trim(), user_id: user.id });
    setNewProjectName("");
    setDialogOpen(false);
    fetchData();
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !selectedProject || !user) return;
    await supabase.from("tasks").insert({ title: newTaskTitle.trim(), user_id: user.id, project_id: selectedProject });
    setNewTaskTitle("");
    fetchData();
  };

  const toggleComplete = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    fetchData();
  };

  const toggleFavorite = async (task: Tables<"tasks">) => {
    await supabase.from("tasks").update({ is_favorite: !task.is_favorite }).eq("id", task.id);
    fetchData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    fetchData();
  };

  const selectedTasks = tasks.filter((t) => t.project_id === selectedProject);
  const activeTasks = selectedTasks.filter((t) => !t.is_completed);
  const completedTasks = selectedTasks.filter((t) => t.is_completed);
  const progress = selectedTasks.length > 0 ? (completedTasks.length / selectedTasks.length) * 100 : 0;

  return (
    <div className="flex h-full">
      {/* Project list */}
      <div className="w-64 shrink-0 border-r border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Projetos</h3>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-3.5 w-3.5" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Projeto</DialogTitle></DialogHeader>
              <Input placeholder="Nome do projeto" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProject()} />
              <Button onClick={createProject}>Criar</Button>
            </DialogContent>
          </Dialog>
        </div>
        <div className="space-y-1">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className={cn("w-full rounded-md px-3 py-2 text-left text-sm transition-colors", selectedProject === p.id ? "bg-primary/10 text-primary" : "hover:bg-accent")}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Task area */}
      <div className="flex-1 p-4">
        {selectedProject ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{projects.find((p) => p.id === selectedProject)?.name}</h2>
              <div className="mt-2 flex items-center gap-3">
                <Progress value={progress} className="h-2 flex-1" />
                <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
              </div>
            </div>

            {/* Active tasks */}
            <div className="space-y-1.5">
              {activeTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={toggleComplete} onFavorite={toggleFavorite} onDelete={deleteTask} />
              ))}
            </div>

            {/* Add task */}
            <div className="mt-3 flex gap-1.5">
              <Input
                placeholder="Nova tarefa... (Enter)"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                className="h-8 text-xs"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={addTask}><Plus className="h-3.5 w-3.5" /></Button>
            </div>

            {/* Completed */}
            {completedTasks.length > 0 && (
              <Collapsible open={showCompleted} onOpenChange={setShowCompleted} className="mt-4">
                <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ChevronDown className={cn("h-3 w-3 transition-transform", !showCompleted && "-rotate-90")} />
                  Concluídas ({completedTasks.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5">
                  {completedTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onToggle={toggleComplete} onFavorite={toggleFavorite} onDelete={deleteTask} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">Selecione um projeto para ver as tarefas</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onToggle, onFavorite, onDelete }: {
  task: Tables<"tasks">;
  onToggle: (t: Tables<"tasks">) => void;
  onFavorite: (t: Tables<"tasks">) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={cn("group flex items-center gap-2 rounded-lg border border-border px-3 py-2", task.is_completed && "opacity-60")}>
      <button onClick={() => onToggle(task)} className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", task.is_completed ? "border-primary bg-primary" : "border-muted-foreground")}>
        {task.is_completed && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>
      <span className={cn("flex-1 text-sm", task.is_completed && "line-through")}>{task.title}</span>
      <button onClick={() => onFavorite(task)} className="shrink-0">
        <Star className={cn("h-3.5 w-3.5", task.is_favorite ? "fill-warning text-warning" : "text-muted-foreground opacity-0 group-hover:opacity-100")} />
      </button>
      <button onClick={() => onDelete(task.id)} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
