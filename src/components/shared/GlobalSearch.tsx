import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  placeholder?: string;
  onSearch: (term: string) => void;
  className?: string;
}

/**
 * Debounced search input (300ms). Export and reuse in any long page.
 */
export function GlobalSearch({
  placeholder = "Buscar configuração...",
  onSearch,
  className,
}: GlobalSearchProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value.toLowerCase().trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8 h-9 text-sm rounded-lg"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
