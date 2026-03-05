import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import EventEditDialog from "@/components/calendar/EventEditDialog";
import type { ModuleKey } from "@/components/NavSidebar";

type EventType = "birthday" | "event" | "cashflow" | "investment" | "project" | "patrimonio" | "programa";

const MODULE_TO_EVENT_TYPE: Partial<Record<ModuleKey, EventType>> = {
  calendar: "event",
  finances: "cashflow",
  investments: "investment",
  programs: "project",
  patrimonio: "patrimonio",
  dashboard: "event",
};

interface FloatingActionButtonProps {
  activeModule?: ModuleKey;
}

export default function FloatingActionButton({ activeModule }: FloatingActionButtonProps) {
  const { user } = useAuth();
  const [eventOpen, setEventOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultDate] = useState(() => new Date());

  const defaultEventType = activeModule ? MODULE_TO_EVENT_TYPE[activeModule] : undefined;

  const handleSaved = () => {
    window.dispatchEvent(new CustomEvent("lovable:data-changed"));
    setRefreshKey(k => k + 1);
  };

  return (
    <>
      <button
        onClick={() => setEventOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-lg",
          "transition-all duration-200 hover:scale-110 hover:shadow-xl",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        )}
        aria-label="Novo lançamento"
      >
        <Plus className="h-7 w-7" />
      </button>

      <EventEditDialog
        key={refreshKey}
        open={eventOpen}
        onOpenChange={setEventOpen}
        item={null}
        defaultDate={defaultDate}
        userId={user?.id || ""}
        onSaved={handleSaved}
        defaultEventType={defaultEventType}
      />
    </>
  );
}
