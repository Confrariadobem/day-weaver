import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PALETTE_COLORS = [
  "#ef4444", "#3b82f6", "#10b981", "#fbbf24", "#a855f7", "#f97316",
  "#ec4899", "#14b8a6", "#6b7280", "#6366f1", "#84cc16", "#d946ef",
];

interface ColorPaletteGridProps {
  selected: string;
  onSelect: (color: string) => void;
  onShowMore?: () => void;
}

export function ColorPaletteGrid({ selected, onSelect, onShowMore }: ColorPaletteGridProps) {
  const { toast } = useToast();
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const handleClick = (color: string) => {
    onSelect(color);
    navigator.clipboard.writeText(color).then(() => {
      setCopiedColor(color);
      toast({ title: "Copiado!" });
      setTimeout(() => setCopiedColor(null), 1500);
    });
  };

  const copyHex = (color: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(color).then(() => {
      toast({ title: "Copiado!" });
    });
  };

  // Determine if check should be white or black based on luminance
  const getCheckColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#000000" : "#ffffff";
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1.5" style={{ gridAutoRows: "auto" }}>
        {PALETTE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => handleClick(color)}
            className={cn(
              "relative h-8 w-8 rounded-lg border transition-all duration-200 hover:scale-110",
              selected === color ? "border-foreground ring-1 ring-foreground" : "border-transparent"
            )}
            style={{ backgroundColor: color }}
          >
            {(selected === color || copiedColor === color) && (
              <Check
                className="absolute inset-0 m-auto h-4 w-4"
                style={{ color: getCheckColor(color) }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Selected color hex */}
      {selected && (
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded" style={{ backgroundColor: selected }} />
          <span className="text-[11px] text-muted-foreground font-mono">{selected}</span>
          <button
            type="button"
            onClick={(e) => copyHex(selected, e)}
            className="p-0.5 hover:text-foreground text-muted-foreground transition-colors"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      )}

      {onShowMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="text-[11px] text-primary hover:underline"
        >
          Mais cores
        </button>
      )}
    </div>
  );
}
