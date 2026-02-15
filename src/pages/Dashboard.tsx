import { useState } from "react";
import NavSidebar, { type ModuleKey } from "@/components/NavSidebar";
import CalendarView from "@/components/CalendarView";
import BacklogSidebar from "@/components/BacklogSidebar";
import ProjectsView from "@/components/ProjectsView";
import FinancesView from "@/components/FinancesView";
import ProfileView from "@/components/ProfileView";
import DashboardView from "@/components/DashboardView";

export default function Dashboard() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Vertical icon navigation */}
      <NavSidebar activeModule={activeModule} onModuleChange={setActiveModule} />

      {/* Backlog sidebar - shown alongside calendar */}
      {activeModule === "backlog" && (
        <BacklogSidebar collapsed={backlogCollapsed} onToggle={() => setBacklogCollapsed(!backlogCollapsed)} />
      )}

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-2">
          <h1 className="text-sm font-bold text-primary">Task Calendar</h1>
          <span className="text-xs text-muted-foreground capitalize">
            {activeModule === "calendar" && "Calendário"}
            {activeModule === "projects" && "Projetos"}
            {activeModule === "finances" && "Finanças"}
            {activeModule === "dashboard" && "Dashboard"}
            {activeModule === "backlog" && "Backlog"}
            {activeModule === "profile" && "Perfil & Configurações"}
          </span>
        </header>

        <div className="flex-1 overflow-hidden">
          {activeModule === "dashboard" && <DashboardView />}
          {activeModule === "calendar" && <CalendarView />}
          {activeModule === "backlog" && <CalendarView />}
          {activeModule === "projects" && <ProjectsView />}
          {activeModule === "finances" && <FinancesView />}
          {activeModule === "profile" && <ProfileView />}
        </div>
      </main>
    </div>
  );
}
