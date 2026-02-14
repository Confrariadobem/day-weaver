import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import BacklogSidebar from "@/components/BacklogSidebar";
import CalendarView from "@/components/CalendarView";
import ProjectsView from "@/components/ProjectsView";
import FinancesView from "@/components/FinancesView";
import { CalendarDays, FolderKanban, Wallet, Moon, Sun, LogOut } from "lucide-react";

export default function Dashboard() {
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <BacklogSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="calendar" className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center gap-2 border-b border-border px-4 py-2">
            <h1 className="text-sm font-bold text-primary">PlanMaster</h1>
            <TabsList className="ml-4">
              <TabsTrigger value="calendar" className="gap-1.5 text-xs">
                <CalendarDays className="h-3.5 w-3.5" /> Calendário
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-1.5 text-xs">
                <FolderKanban className="h-3.5 w-3.5" /> Projetos
              </TabsTrigger>
              <TabsTrigger value="finances" className="gap-1.5 text-xs">
                <Wallet className="h-3.5 w-3.5" /> Finanças
              </TabsTrigger>
            </TabsList>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <TabsContent value="calendar" className="flex-1 overflow-hidden mt-0">
            <CalendarView />
          </TabsContent>
          <TabsContent value="projects" className="flex-1 overflow-hidden mt-0">
            <ProjectsView />
          </TabsContent>
          <TabsContent value="finances" className="flex-1 overflow-hidden mt-0">
            <FinancesView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
