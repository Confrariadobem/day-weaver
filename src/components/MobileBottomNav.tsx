import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  CircleDollarSign,
  Building2,
  Heart,
  LayoutDashboard,
  CalendarDays,
  TrendingUp,
  FolderKanban,
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
  { key: "patrimonio", label: "Patrimônio", icon: <Building2 className="h-6 w-6" /> },
  { key: "investments", label: "Investimentos", icon: <TrendingUp className="h-6 w-6" /> },
];

interface MobileBottomNavProps {
  activeModule: ModuleKey;
  onModuleChange: (key: ModuleKey) => void;
}

export default function MobileBottomNav({ activeModule, onModuleChange }: MobileBottomNavProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback((label: string) => {
    timerRef.current = setTimeout(() => {
      setTooltip(label);
    }, 300);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltip(null);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-card md:hidden">
      {bottomNavItems.map((item) => {
        const isActive = activeModule === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onModuleChange(item.key)}
            onTouchStart={() => handleTouchStart(item.label)}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className={cn(
              "relative flex h-12 w-12 flex-col items-center justify-center rounded-xl transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {/* Active indicator line */}
            {isActive && (
              <div className="absolute top-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
            )}
            {item.icon}
            {/* Tooltip bubble on long press */}
            {tooltip === item.label && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg animate-in fade-in zoom-in-95 duration-150">
                {item.label}
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 h-2 w-2 rotate-45 bg-foreground" />
              </div>
            )}
          </button>
        );
      })}
    </nav>
  );
}
