import { useState } from "react";
import NavSidebar, { type ModuleKey } from "@/components/NavSidebar";
import CalendarView from "@/components/CalendarView";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import FinancesView from "@/components/FinancesView";
import ProfileView from "@/components/ProfileView";
import PreferencesView from "@/components/PreferencesView";
import DashboardView from "@/components/DashboardView";
import ProgramsProjectsView from "@/components/ProgramsProjectsView";
import FloatingActionButton from "@/components/FloatingActionButton";

export default function Dashboard() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("calendar");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const showUnifiedSidebar = activeModule === "calendar";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <NavSidebar activeModule={activeModule} onModuleChange={setActiveModule} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border px-4 py-2">
          <h1 className="text-sm font-bold text-primary">Task Calendar</h1>
          <span className="text-xs text-muted-foreground capitalize">
            {activeModule === "calendar" && "Calendário"}
            {activeModule === "finances" && "Finanças"}
            {activeModule === "dashboard" && "Dashboard"}
            {activeModule === "profile" && "Perfil"}
            {activeModule === "preferences" && "Preferências"}
            {activeModule === "programs" && "Programas e Projetos"}
          </span>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeModule === "dashboard" && <DashboardView />}
            {activeModule === "calendar" && <CalendarView />}
            {activeModule === "finances" && <FinancesView />}
            {activeModule === "programs" && <ProgramsProjectsView />}
            {activeModule === "profile" && <ProfileView />}
            {activeModule === "preferences" && <PreferencesView />}
          </div>

          {showUnifiedSidebar && (
            <UnifiedSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          )}
        </div>
      </main>

      {/* Global FAB */}
      <FloatingActionButton />
    </div>
  );
}
