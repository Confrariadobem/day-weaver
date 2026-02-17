import { useState } from "react";
import { Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import EventEditDialog from "@/components/calendar/EventEditDialog";

export default function FloatingActionButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

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
        open={open}
        onOpenChange={setOpen}
        item={null}
        defaultDate={new Date()}
        userId={user?.id || ""}
        onSaved={() => {}}
      />
    </>
  );
}
