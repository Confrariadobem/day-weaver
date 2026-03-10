import React, { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Eye, EyeOff, X, ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface CcData {
  id: string;
  name: string;
  color: string | null;
  revRows: { name: string; months: number[] }[];
  expRows: { name: string; months: number[] }[];
  monthTotalsRev: number[];
  monthTotalsExp: number[];
  monthBalance: number[];
}

interface CentroCustoMobileViewProps {
  ccReportData: CcData[];
  months: string[];
  brl: (v: number) => string;
  availableYears: number[];
  periodYear: number;
  onYearChange: (year: number) => void;
}

export default function CentroCustoMobileView({ ccReportData, months, brl, availableYears, periodYear, onYearChange }: CentroCustoMobileViewProps) {
  const [activeMonth, setActiveMonth] = useState(new Date().getMonth());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const monthBarRef = useRef<HTMLDivElement>(null);

  // Find months with data
  const monthsWithData = useMemo(() => {
    const set = new Set<number>();
    ccReportData.forEach(cc => {
      for (let i = 0; i < 12; i++) {
        if (cc.monthTotalsRev[i] > 0 || cc.monthTotalsExp[i] > 0) set.add(i);
      }
    });
    return set;
  }, [ccReportData]);

  const firstMonthWithData = useMemo(() => {
    for (let i = 0; i < 12; i++) {
      if (monthsWithData.has(i)) return i;
    }
    return 0;
  }, [monthsWithData]);

  // Scroll month bar to center active month
  useEffect(() => {
    if (monthBarRef.current) {
      const container = monthBarRef.current;
      const btn = container.children[activeMonth] as HTMLElement;
      if (btn) {
        const scrollLeft = btn.offsetLeft - container.clientWidth / 2 + btn.clientWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [activeMonth]);

  const navigateMonth = (dir: -1 | 1) => {
    const monthsArr = Array.from(monthsWithData).sort((a, b) => a - b);
    if (monthsArr.length === 0) return;
    const currentIdx = monthsArr.indexOf(activeMonth);
    if (dir === -1) {
      if (currentIdx > 0) setActiveMonth(monthsArr[currentIdx - 1]);
    } else {
      if (currentIdx < monthsArr.length - 1) setActiveMonth(monthsArr[currentIdx + 1]);
    }
  };

  const filteredCcs = useMemo(() => {
    if (!searchQuery) return ccReportData;
    const q = searchQuery.toLowerCase();
    return ccReportData.filter(cc =>
      cc.name.toLowerCase().includes(q) ||
      cc.revRows.some(r => r.name.toLowerCase().includes(q)) ||
      cc.expRows.some(r => r.name.toLowerCase().includes(q))
    );
  }, [ccReportData, searchQuery]);

  const yearsToShow = availableYears.length > 0 ? availableYears : [periodYear];

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      {/* Year selector */}
      <div className="flex items-center gap-2">
        <Select value={String(periodYear)} onValueChange={(v) => onYearChange(parseInt(v))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearsToShow.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={() => setShowSettled(!showSettled)}
          className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
            showSettled ? "border-primary text-primary" : "border-border text-muted-foreground")}
        >
          {showSettled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span>Quitados</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mx-auto" style={{ width: "80%" }}>
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 pl-8 pr-7 text-xs rounded-lg" />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Month carousel with arrows */}
      <div className="flex items-center gap-1">
        <button onClick={() => navigateMonth(-1)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div ref={monthBarRef} className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide" style={{ height: 40, scrollSnapType: "x mandatory" }}>
          {MONTH_LABELS.map((label, i) => {
            const hasData = monthsWithData.has(i);
            return (
              <button
                key={i}
                onClick={() => hasData && setActiveMonth(i)}
                style={{ scrollSnapAlign: "center" }}
                className={cn(
                  "shrink-0 w-[2.5rem] h-full flex items-center justify-center text-[10px] font-medium rounded transition-colors",
                  activeMonth === i ? "bg-primary text-primary-foreground" :
                    hasData ? "text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-default"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button onClick={() => navigateMonth(1)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Start line */}
      {activeMonth === firstMonthWithData && (
        <div className="flex items-center gap-2 px-2" style={{ height: 20 }}>
          <div className="flex-1 border-t border-primary/30" />
          <span className="text-[9px] font-medium text-primary/60 uppercase whitespace-nowrap">Início dos lançamentos</span>
          <div className="flex-1 border-t border-primary/30" />
        </div>
      )}

      {/* Month heading */}
      <h3 className="text-center text-sm font-bold text-foreground">
        {months[activeMonth]} {periodYear}
      </h3>

      {/* CC cards */}
      {filteredCcs.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">Sem dados de centros de custo</p>
      )}

      {filteredCcs.map(cc => {
        const mi = activeMonth;
        const totalRev = cc.monthTotalsRev[mi];
        const totalExp = cc.monthTotalsExp[mi];
        const balance = cc.monthBalance[mi];
        const revRows = cc.revRows.filter(r => r.months[mi] > 0);
        const expRows = cc.expRows.filter(r => r.months[mi] > 0);

        if (totalRev === 0 && totalExp === 0) return null;

        return (
          <Card key={cc.id} className="border-border/50">
            <CardContent className="p-3 space-y-2">
              {/* CC header */}
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cc.color || "#6b7280" }} />
                <span className="text-sm font-bold text-foreground">{cc.name}</span>
              </div>

              {/* Revenue rows */}
              {revRows.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[hsl(var(--success))] uppercase">Receitas</span>
                    <span className="font-bold text-[hsl(var(--success))]">{brl(totalRev)}</span>
                  </div>
                  {revRows.map(row => (
                    <div key={row.name} className="flex items-center justify-between text-[10px] pl-3">
                      <span className="text-muted-foreground truncate flex-1">{row.name}</span>
                      <span className="text-[hsl(var(--success))] font-medium shrink-0 ml-2">{brl(row.months[mi])}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Expense rows */}
              {expRows.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-destructive uppercase">Despesas</span>
                    <span className="font-bold text-destructive">{brl(totalExp)}</span>
                  </div>
                  {expRows.map(row => (
                    <div key={row.name} className="flex items-center justify-between text-[10px] pl-3">
                      <span className="text-muted-foreground uppercase truncate flex-1">{row.name}</span>
                      <span className="text-destructive font-medium shrink-0 ml-2">{brl(row.months[mi])}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Result */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                <span className="font-bold text-primary uppercase">Resultado</span>
                <span className={cn("font-bold", balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(balance)}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
