import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface SimpleDatePickerProps {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export default function SimpleDatePicker({ value, onChange, placeholder = "Selecionar data", className }: SimpleDatePickerProps) {
  const [open, setOpen] = useState(false);

  const date = value ? new Date(value + "T12:00:00") : undefined;

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onChange(format(d, "yyyy-MM-dd"));
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 text-sm",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="mr-2 h-3.5 w-3.5" />
          {date ? format(date, "dd/MM/yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          locale={ptBR}
          className={cn("p-2 pointer-events-auto text-xs [&_table]:text-xs [&_button]:h-7 [&_button]:w-7 [&_th]:w-7 [&_caption]:text-xs")}
          formatters={{
            formatCaption: (d) => {
              const m = format(d, "LLLL", { locale: ptBR });
              return m.charAt(0).toUpperCase() + m.slice(1) + " " + format(d, "yyyy");
            },
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
