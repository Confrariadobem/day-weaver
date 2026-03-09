import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  LayoutDashboard,
  User,
  Settings,
  LogOut,
  Sparkles,
  FolderKanban,
  TrendingUp,
  Building2,
  CircleDollarSign,
  FolderHeart,
} from "lucide-react";

export type ModuleKey = "calendar" | "finances" | "dashboard" | "profile" | "preferences" | "programs" | "investments" | "patrimonio";

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: React.ReactNode;
}

const topNavItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: "calendar", label: "Calendário", icon: <CalendarDays className="h-5 w-5" /> },
  { key: "finances", label: "Finanças", icon: <CircleDollarSign className="h-6 w-6" /> },
  { key: "programs", label: "Projetos", icon: <FolderKanban className="h-5 w-5" /> },
  { key: "investments", label: "Investimentos", icon: <TrendingUp className="h-5 w-5" /> },
  { key: "patrimonio", label: "Patrimônio", icon: <Building2 className="h-5 w-5" /> },
];

interface NavSidebarProps {
  activeModule: ModuleKey;
  onModuleChange: (key: ModuleKey) => void;
}

export default function NavSidebar({ activeModule, onModuleChange }: NavSidebarProps) {
  const { signOut } = useAuth();

  return (
    <div className="flex h-full w-16 flex-col items-center border-r border-border bg-[hsl(var(--nav-background))] py-3">
      {/* Logo */}
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
        <Sparkles className="h-5 w-5 text-primary-foreground" />
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {topNavItems.map((item) => (
          <Tooltip key={item.key} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onModuleChange(item.key)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                  activeModule === item.key
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-[hsl(var(--nav-foreground))] hover:bg-[hsl(var(--nav-hover))] hover:text-foreground"
                )}
              >
                {item.icon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        ))}

      </nav>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModuleChange("profile")}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                activeModule === "profile"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-[hsl(var(--nav-foreground))] hover:bg-[hsl(var(--nav-hover))] hover:text-foreground"
              )}
            >
              <User className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Perfil
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModuleChange("preferences")}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                activeModule === "preferences"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-[hsl(var(--nav-foreground))] hover:bg-[hsl(var(--nav-hover))] hover:text-foreground"
              )}
            >
              <Settings className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Preferências
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={signOut}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[hsl(var(--nav-foreground))] transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Sair
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
