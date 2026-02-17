import { useState } from "react";
import { Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import EventEditDialog from "@/components/calendar/EventEditDialog";
import type { ModuleKey } from "@/components/NavSidebar";

type EventType = "birthday" | "event" | "cashflow" | "investment" | "project";

const MODULE_TO_EVENT_TYPE: Partial<Record<ModuleKey, EventType>> = {
  calendar: "event",
  finances: "cashflow",
  investments: "investment",
  programs: "project",
  patrimonio: "cashflow",
  dashboard: "event",
};

interface FloatingActionButtonProps {
  activeModule?: ModuleKey;
}

export default function FloatingActionButton({ activeModule }: FloatingActionButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const defaultEventType = activeModule ? MODULE_TO_EVENT_TYPE[activeModule] : undefined;

  const handleSaved = () => {
    // Force a page-level re-render by dispatching a custom event
    // that all views can listen to, or use window reload as fallback
    window.dispatchEvent(new CustomEvent("lovable:data-changed"));
    setRefreshKey(k => k + 1);
  };

  return (
    <>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-lg",
              "transition-all duration-200 hover:scale-110 hover:shadow-xl",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "md:h-14 md:w-14"
            )}
            aria-label="Novo Lançamento"
          >
            <Plus className="h-7 w-7" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={12}>
          Novo Lançamento
        </TooltipContent>
      </Tooltip>

      <EventEditDialog
        key={refreshKey}
        open={open}
        onOpenChange={setOpen}
        item={null}
        defaultDate={new Date()}
        userId={user?.id || ""}
        onSaved={handleSaved}
        defaultEventType={defaultEventType}
      />
    </>
  );
}
