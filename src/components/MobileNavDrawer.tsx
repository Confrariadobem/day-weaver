import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
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
  
  X,
} from "lucide-react";
import type { ModuleKey } from "@/components/NavSidebar";

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: "calendar", label: "Calendário", icon: <CalendarDays className="h-5 w-5" /> },
  { key: "finances", label: "Finanças", icon: <CircleDollarSign className="h-5 w-5" /> },
  { key: "programs", label: "Projetos", icon: <FolderKanban className="h-5 w-5" /> },
  { key: "investments", label: "Investimentos", icon: <TrendingUp className="h-5 w-5" /> },
  { key: "patrimonio", label: "Patrimônio", icon: <Building2 className="h-5 w-5" /> },
];

const bottomItems: NavItem[] = [
  { key: "profile", label: "Perfil", icon: <User className="h-5 w-5" /> },
  { key: "preferences", label: "Preferências", icon: <Settings className="h-5 w-5" /> },
];

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeModule: ModuleKey;
  onModuleChange: (key: ModuleKey) => void;
}

export default function MobileNavDrawer({ open, onOpenChange, activeModule, onModuleChange }: MobileNavDrawerProps) {
  const { signOut } = useAuth();

  const handleSelect = (key: ModuleKey) => {
    onModuleChange(key);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0 flex flex-col bg-[hsl(var(--nav-background))]">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border/30">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-bold text-foreground">Menu</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleSelect(item.key)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                activeModule === item.key
                  ? "bg-primary text-primary-foreground shadow-md font-medium"
                  : "text-[hsl(var(--nav-foreground))] hover:bg-[hsl(var(--nav-hover))] hover:text-foreground"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-border/30 px-2 py-3 flex flex-col gap-0.5">
          {bottomItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleSelect(item.key)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                activeModule === item.key
                  ? "bg-primary text-primary-foreground shadow-md font-medium"
                  : "text-[hsl(var(--nav-foreground))] hover:bg-[hsl(var(--nav-hover))] hover:text-foreground"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => { onOpenChange(false); signOut(); }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[hsl(var(--nav-foreground))] transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
