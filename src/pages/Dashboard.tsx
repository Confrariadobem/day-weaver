import { useState, useEffect, useMemo } from "react";
import NavSidebar, { type ModuleKey } from "@/components/NavSidebar";
import CalendarView from "@/components/CalendarView";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import FinancesView from "@/components/FinancesView";
import ProfileView from "@/components/ProfileView";
import PreferencesView from "@/components/PreferencesView";
import DashboardView from "@/components/DashboardView";
import ProgramsProjectsView from "@/components/ProgramsProjectsView";
import InvestmentsView from "@/components/InvestmentsView";
import PatrimonioView from "@/components/PatrimonioView";
import FloatingActionButton from "@/components/FloatingActionButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

function BulletChart({ value, marker, maxVal, balance, label }: { value: number; marker: number; maxVal: number; balance: number; label?: string }) {
  return (
    <div className="flex items-center gap-3" style={{ width: 180, height: 36 }}>
      <div className="flex-1 relative h-full flex flex-col justify-center gap-0.5">
        <div className="relative h-3 rounded-full bg-muted/30 overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-[hsl(var(--success))]"
            style={{ width: `${Math.min(100, (value / maxVal) * 100)}%` }}
          />
          <div
            className="absolute top-0 h-full w-[2px] bg-destructive"
            style={{ left: `${Math.min(100, (marker / maxVal) * 100)}%` }}
          />
        </div>
        <span className={cn(
          "text-[10px] font-bold tabular-nums leading-none",
          balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive"
        )}>
          {label || brl(balance)}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>("calendar");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Data for bullet charts in the header
  const [entries, setEntries] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  // Active tab state passed up from child modules for bullet chart filtering
  const [financeTab, setFinanceTab] = useState<string>("previsao");
  const [investmentTab, setInvestmentTab] = useState<string>("dashboard");
  const [projectTab, setProjectTab] = useState<string>("projects");

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [eRes, iRes, pRes, tRes] = await Promise.all([
        supabase.from("financial_entries").select("*").eq("user_id", user.id),
        supabase.from("investments").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("projects").select("*").eq("user_id", user.id),
        supabase.from("tasks").select("*").eq("user_id", user.id),
      ]);
      if (eRes.data) setEntries(eRes.data);
      if (iRes.data) setInvestments(iRes.data);
      if (pRes.data) setProjects(pRes.data);
      if (tRes.data) setTasks(tRes.data);
    };
    fetchData();
    const handleDataChanged = () => fetchData();
    window.addEventListener("lovable:data-changed", handleDataChanged);
    return () => window.removeEventListener("lovable:data-changed", handleDataChanged);
  }, [user]);

  // Dashboard bullet: current month revenue vs expense
  const dashBullet = useMemo(() => {
    const now = new Date();
    const monthEntries = entries.filter(e => {
      const d = new Date(e.entry_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const rev = monthEntries.filter(e => e.type === "revenue").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const exp = monthEntries.filter(e => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);
    return { rev, exp, balance: rev - exp, maxVal: Math.max(rev, exp, 1) };
  }, [entries]);

  // Calendar bullet: current month
  const calBullet = dashBullet;

  // Investments bullet: filtered by active tab
  const invBullet = useMemo(() => {
    let filtered = investments;
    if (investmentTab !== "dashboard") {
      filtered = investments.filter(i => i.type === investmentTab);
    }
    const invested = filtered.reduce((s: number, i: any) => s + (Number(i.purchase_price) || 0) * (Number(i.quantity) || 0), 0);
    const current = filtered.reduce((s: number, i: any) => s + (Number(i.current_price) || 0) * (Number(i.quantity) || 0), 0);
    const profit = current - invested;
    return { invested, current, profit, maxVal: Math.max(invested, current, 1) };
  }, [investments, investmentTab]);

  // Finance bullet: filtered by active tab
  const finBullet = useMemo(() => {
    if (financeTab === "indicadores" || financeTab === "doar") {
      // For analytics tabs, show overall pending
      const rev = entries.filter(e => e.type === "revenue" && !e.is_paid).reduce((s: number, e: any) => s + Number(e.amount), 0);
      const exp = entries.filter(e => e.type === "expense" && !e.is_paid).reduce((s: number, e: any) => s + Number(e.amount), 0);
      return { rev, exp, balance: rev - exp, maxVal: Math.max(rev, exp, 1) };
    }
    // previsao / fluxo: show pending items
    const rev = entries.filter(e => e.type === "revenue" && !e.is_paid).reduce((s: number, e: any) => s + Number(e.amount), 0);
    const exp = entries.filter(e => e.type === "expense" && !e.is_paid).reduce((s: number, e: any) => s + Number(e.amount), 0);
    return { rev, exp, balance: rev - exp, maxVal: Math.max(rev, exp, 1) };
  }, [entries, financeTab]);

  // Projects bullet: filtered by active tab
  const projBullet = useMemo(() => {
    if (projectTab === "dashboard" || projectTab === "projects") {
      const totalBudget = projects.reduce((s: number, p: any) => s + Number(p.budget || 0), 0);
      const totalCost = entries.filter(e => e.type === "expense" && e.project_id).reduce((s: number, e: any) => s + Number(e.amount), 0);
      return { totalBudget, totalCost, available: totalBudget - totalCost, maxVal: Math.max(totalBudget, totalCost, 1) };
    }
    if (projectTab === "tasks") {
      const total = tasks.length;
      const completed = tasks.filter(t => t.is_completed).length;
      const pending = total - completed;
      return { totalBudget: total, totalCost: completed, available: pending, maxVal: Math.max(total, 1) };
    }
    // programs
    const totalBudget = projects.reduce((s: number, p: any) => s + Number(p.budget || 0), 0);
    const totalCost = entries.filter(e => e.type === "expense" && e.project_id).reduce((s: number, e: any) => s + Number(e.amount), 0);
    return { totalBudget, totalCost, available: totalBudget - totalCost, maxVal: Math.max(totalBudget, totalCost, 1) };
  }, [projects, entries, tasks, projectTab]);

  const showUnifiedSidebar = activeModule === "calendar";

  const renderBulletChart = () => {
    switch (activeModule) {
      case "dashboard":
        return <BulletChart value={dashBullet.rev} marker={dashBullet.exp} maxVal={dashBullet.maxVal} balance={dashBullet.balance} />;
      case "calendar":
        return <BulletChart value={calBullet.rev} marker={calBullet.exp} maxVal={calBullet.maxVal} balance={calBullet.balance} />;
      case "finances":
        return <BulletChart value={finBullet.rev} marker={finBullet.exp} maxVal={finBullet.maxVal} balance={finBullet.balance} />;
      case "investments":
        return <BulletChart value={invBullet.current} marker={invBullet.invested} maxVal={invBullet.maxVal} balance={invBullet.profit} label={`${invBullet.profit >= 0 ? "+" : ""}${brl(invBullet.profit)}`} />;
      case "programs":
        if (projectTab === "tasks") {
          return <BulletChart value={projBullet.totalCost} marker={projBullet.totalBudget} maxVal={projBullet.maxVal} balance={projBullet.available} label={`${projBullet.available} pendentes`} />;
        }
        return <BulletChart value={projBullet.totalBudget - projBullet.totalCost} marker={projBullet.totalCost} maxVal={projBullet.maxVal} balance={projBullet.available} label={`${brl(projBullet.available)} disp.`} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <NavSidebar activeModule={activeModule} onModuleChange={setActiveModule} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border/30 px-4 py-2.5">
          <h1 className="text-sm font-bold text-foreground">
            {activeModule === "calendar" && "Calendário"}
            {activeModule === "finances" && "Finanças"}
            {activeModule === "dashboard" && "Dashboard"}
            {activeModule === "profile" && "Perfil"}
            {activeModule === "preferences" && "Preferências"}
            {activeModule === "programs" && "Projetos"}
            {activeModule === "investments" && "Investimentos"}
            {activeModule === "patrimonio" && "Patrimônio"}
          </h1>
          <div className="ml-auto">
            {renderBulletChart()}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeModule === "dashboard" && <DashboardView />}
            {activeModule === "calendar" && <CalendarView />}
            {activeModule === "finances" && <FinancesView onTabChange={setFinanceTab} />}
            {activeModule === "programs" && <ProgramsProjectsView onTabChange={setProjectTab} />}
            {activeModule === "investments" && <InvestmentsView onTabChange={setInvestmentTab} />}
            {activeModule === "patrimonio" && <PatrimonioView />}
            {activeModule === "profile" && <ProfileView />}
            {activeModule === "preferences" && <PreferencesView />}
          </div>

          {showUnifiedSidebar && (
            <UnifiedSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          )}
        </div>
      </main>

      {/* Global FAB */}
      <FloatingActionButton activeModule={activeModule} />
    </div>
  );
}
