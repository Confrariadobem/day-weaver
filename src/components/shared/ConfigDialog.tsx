import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Extra footer content (e.g. delete button) */
  footerLeft?: React.ReactNode;
}

/**
 * Standardised config/edit dialog. Grid-friendly, larger padding, consistent footer.
 * Reuse for: categories, cost centers, wallets, projects, etc.
 */
export function ConfigDialog({
  open,
  title,
  children,
  onClose,
  onSave,
  saveLabel = "Salvar",
  saveDisabled = false,
  footerLeft,
}: ConfigDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">{children}</div>
        <div className="flex items-center gap-2 pt-4 border-t border-border/30">
          {footerLeft}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            {onSave && (
              <Button size="sm" className="gap-1.5" onClick={onSave} disabled={saveDisabled}>
                <Save className="h-4 w-4" /> {saveLabel}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
