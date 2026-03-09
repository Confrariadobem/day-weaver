import { useRef, useEffect, useCallback } from "react";
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

// Tripled for infinite loop illusion
const LOOP_ITEMS = [...bottomNavItems, ...bottomNavItems, ...bottomNavItems];
const ITEM_WIDTH = 72; // 48px icon + 16px*2 gap ~ 72px per item
const SET_COUNT = bottomNavItems.length;

interface MobileBottomNavProps {
  activeModule: ModuleKey;
  onModuleChange: (key: ModuleKey) => void;
}

export default function MobileBottomNav({ activeModule, onModuleChange }: MobileBottomNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  // Center the middle set on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const middleOffset = SET_COUNT * ITEM_WIDTH;
    el.scrollLeft = middleOffset;
  }, []);

  // Infinite loop: when scrolling past boundaries, silently jump to middle set
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isScrolling.current) return;

    const totalWidth = SET_COUNT * ITEM_WIDTH;
    const maxScroll = totalWidth * 3 - el.clientWidth;

    if (el.scrollLeft < totalWidth * 0.3) {
      isScrolling.current = true;
      el.scrollLeft += totalWidth;
      requestAnimationFrame(() => { isScrolling.current = false; });
    } else if (el.scrollLeft > totalWidth * 2.2) {
      isScrolling.current = true;
      el.scrollLeft -= totalWidth;
      requestAnimationFrame(() => { isScrolling.current = false; });
    }
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden"
      style={{ height: 56 }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex items-center h-full overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        style={{ scrollBehavior: "auto", WebkitOverflowScrolling: "touch", paddingLeft: 16, paddingRight: 16 }}
      >
        {LOOP_ITEMS.map((item, i) => {
          const isActive = activeModule === item.key;
          return (
            <button
              key={`${item.key}-${i}`}
              onClick={() => onModuleChange(item.key)}
              className={cn(
                "relative flex flex-col items-center justify-center shrink-0 snap-center transition-colors",
                "px-2 py-1",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              style={{ width: ITEM_WIDTH, height: 48 }}
            >
              {isActive && (
                <div className="absolute top-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
              )}
              {item.icon}
              <span className="text-[9px] mt-0.5 leading-tight truncate w-full text-center">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
