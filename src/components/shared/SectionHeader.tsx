import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Sticky section header with solid background + backdrop blur.
 * Reuse in long lists: finances, investments, tasks, preferences.
 */
export function SectionHeader({ title, className, children }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 px-4 border-b border-border font-medium text-sm flex items-center justify-between",
        className
      )}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
