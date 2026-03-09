import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CircleDollarSign,
  Building2,
  TrendingUp,
  FolderKanban,
  Settings,
} from "lucide-react";
import type { ModuleKey } from "@/components/NavSidebar";

interface BottomNavItem {
  key: ModuleKey;
  label: string;
  icon: React.ReactNode;
}

const bottomNavItems: BottomNavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-6 w-6" /> },
  { key: "finances", label: "Fluxo de Caixa", icon: <CircleDollarSign className="h-6 w-6" /> },
  { key: "investments", label: "Investimentos", icon: <TrendingUp className="h-6 w-6" /> },
  { key: "patrimonio", label: "Patrimônio", icon: <Building2 className="h-6 w-6" /> },
  { key: "programs", label: "Projetos", icon: <FolderKanban className="h-6 w-6" /> },
  { key: "preferences", label: "Preferências", icon: <Settings className="h-6 w-6" /> },
];

interface MobileBottomNavProps {
  activeModule: ModuleKey;
  onModuleChange: (key: ModuleKey) => void;
}

export default function MobileBottomNav({ activeModule, onModuleChange }: MobileBottomNavProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = useCallback((label: string) => {
    holdTimer.current = setTimeout(() => setTooltip(label), 300);
  }, []);

  const endHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setTooltip(null);
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden"
      style={{ height: 56 }}
    >
      {/* Tooltip */}
      {tooltip && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-medium px-2 py-1 rounded pointer-events-none z-10">
          {tooltip}
        </div>
      )}

      <div
        className="flex items-center h-full overflow-x-auto scrollbar-hide"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "auto",
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {bottomNavItems.map(item => {
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onModuleChange(item.key)}
              onTouchStart={() => startHold(item.label)}
              onTouchEnd={endHold}
              onTouchCancel={endHold}
              className={cn(
                "relative flex items-center justify-center shrink-0 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
              style={{
                width: 56,
                height: 56,
                scrollSnapAlign: "center",
                backfaceVisibility: "hidden",
                transform: "translateZ(0)",
              }}
            >
              {isActive && (
                <div className="absolute top-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
              )}
              {item.icon}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
