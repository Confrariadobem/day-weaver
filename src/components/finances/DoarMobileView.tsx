import React, { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Eye, EyeOff, ChevronDown, ChevronUp, X } from "lucide-react";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface DoarSection {
  revRows: { id: string; name: string; color?: string | null; months: number[]; entries: any[][] }[];
  expRows: { id: string; name: string; color?: string | null; months: number[]; entries: any[][] }[];
  monthTotalsRev: number[];
  monthTotalsExp: number[];
  monthBalance: number[];
  accumulated: number[];
  carryOver: number;
}

interface DoarMobileViewProps {
  dreData: {
    months: string[];
    previsto: DoarSection;
    realizado: DoarSection;
  };
  brl: (v: number) => string;
  availableYears: number[];
  periodYear: number;
  onYearChange: (year: number) => void;
}

export default function DoarMobileView({ dreData, brl, availableYears, periodYear, onYearChange }: DoarMobileViewProps) {
  const [activeMonth, setActiveMonth] = useState(new Date().getMonth());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const carouselRef = useRef<HTMLDivElement>(null);

  // Find first month with data
  const firstMonthWithData = useMemo(() => {
    for (let i = 0; i < 12; i++) {
      const hasRev = dreData.previsto.monthTotalsRev[i] > 0 || dreData.realizado.monthTotalsRev[i] > 0;
      const hasExp = dreData.previsto.monthTotalsExp[i] > 0 || dreData.realizado.monthTotalsExp[i] > 0;
      if (hasRev || hasExp) return i;
    }
    return 0;
  }, [dreData]);

  // Months with data
  const monthsWithData = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < 12; i++) {
      if (dreData.previsto.monthTotalsRev[i] > 0 || dreData.previsto.monthTotalsExp[i] > 0 ||
          dreData.realizado.monthTotalsRev[i] > 0 || dreData.realizado.monthTotalsExp[i] > 0) {
        set.add(i);
      }
    }
    return set;
  }, [dreData]);

  // Scroll to active month
  useEffect(() => {
    if (carouselRef.current) {
      const el = carouselRef.current.children[activeMonth] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  }, [activeMonth]);

  const filterRow = (name: string) => {
    if (!searchQuery) return true;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderSection = (section: DoarSection, label: string, keyPrefix: string) => {
    const mi = activeMonth;
    const revRows = section.revRows.filter(r => r.months[mi] > 0 && filterRow(r.name));
    const expRows = section.expRows.filter(r => r.months[mi] > 0 && filterRow(r.name));
    const totalRev = section.monthTotalsRev[mi];
    const totalExp = section.monthTotalsExp[mi];
    const balance = section.monthBalance[mi];
    const accumulated = section.accumulated[mi];

    if (totalRev === 0 && totalExp === 0 && !showSettled) return null;

    return (
      <div key={keyPrefix} className="space-y-2">
        <div className="text-xs font-bold text-primary uppercase tracking-wider px-1">{label}</div>

        {/* Receitas */}
        {revRows.length > 0 && (
          <Card className="border-[hsl(var(--success))]/20">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[hsl(var(--success))] uppercase">Receitas</span>
                <span className="text-sm font-bold text-[hsl(var(--success))]">{brl(totalRev)}</span>
              </div>
              {revRows.map(row => {
                const pct = totalRev > 0 ? ((row.months[mi] / totalRev) * 100).toFixed(1) : "0";
                const isExpanded = expandedCats.has(`${keyPrefix}-${row.id}`);
                return (
                  <div key={row.id}>
                    <button
                      onClick={() => toggleCat(`${keyPrefix}-${row.id}`)}
                      className="w-full flex items-center justify-between py-1.5 text-xs hover:bg-muted/30 rounded px-1 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3 rotate-90" />}
                        <span className="uppercase text-muted-foreground">{row.name}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">{pct}%</span>
                        <span className="font-medium text-[hsl(var(--success))]">{brl(row.months[mi])}</span>
                      </span>
                    </button>
                    {isExpanded && row.entries[mi]?.length > 0 && (
                      <div className="pl-5 space-y-0.5">
                        {row.entries[mi].map((e: any, i: number) => (
                          <div key={i} className={cn("flex items-center justify-between text-[10px] py-0.5", e.is_paid && !showSettled && "hidden", e.is_paid && showSettled && "opacity-50")}>
                            <span className="text-muted-foreground truncate flex-1">{e.title}</span>
                            <span className="text-[hsl(var(--success))] font-medium ml-2">{brl(Number(e.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Despesas */}
        {expRows.length > 0 && (
          <Card className="border-destructive/20">
            <CardContent className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-destructive uppercase">Despesas</span>
                <span className="text-sm font-bold text-destructive">{brl(totalExp)}</span>
              </div>
              {expRows.map(row => {
                const pct = totalExp > 0 ? ((row.months[mi] / totalExp) * 100).toFixed(1) : "0";
                const isExpanded = expandedCats.has(`${keyPrefix}-${row.id}`);
                return (
                  <div key={row.id}>
                    <button
                      onClick={() => toggleCat(`${keyPrefix}-${row.id}`)}
                      className="w-full flex items-center justify-between py-1.5 text-xs hover:bg-muted/30 rounded px-1 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3 rotate-90" />}
                        <span className="uppercase text-muted-foreground">{row.name}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">{pct}%</span>
                        <span className="font-medium text-destructive">{brl(row.months[mi])}</span>
                      </span>
                    </button>
                    {isExpanded && row.entries[mi]?.length > 0 && (
                      <div className="pl-5 space-y-0.5">
                        {row.entries[mi].map((e: any, i: number) => (
                          <div key={i} className={cn("flex items-center justify-between text-[10px] py-0.5", e.is_paid && !showSettled && "hidden", e.is_paid && showSettled && "opacity-50")}>
                            <span className="text-muted-foreground truncate flex-1">{e.title}</span>
                            <span className="text-destructive font-medium ml-2">{brl(Number(e.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Result */}
        <Card className={cn("border-primary/20", balance >= 0 ? "bg-[hsl(var(--success))]/5" : "bg-destructive/5")}>
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-primary uppercase">Resultado</span>
            <span className={cn("text-sm font-bold", balance >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(balance)}</span>
          </CardContent>
        </Card>
        <Card className="border-muted">
          <CardContent className="p-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Acumulado</span>
            <span className={cn("text-xs font-bold", accumulated >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>{brl(accumulated)}</span>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Filter years to only those with data
  const yearsToShow = availableYears.length > 0 ? availableYears : [periodYear];

  return (
    <div className="space-y-3">
      {/* Year selector */}
      <div className="flex items-center gap-2">
        <Select value={String(periodYear)} onValueChange={(v) => onYearChange(parseInt(v))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearsToShow.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Quitados toggle */}
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
      <div className="relative" style={{ width: "80%", margin: "0 auto" }}>
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 pl-8 pr-7 text-xs rounded-lg"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Month preview bar */}
      <div ref={carouselRef} className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide" style={{ height: 40 }}>
        {MONTH_LABELS.map((label, i) => {
          const hasData = monthsWithData.has(i);
          return (
            <button
              key={i}
              onClick={() => hasData && setActiveMonth(i)}
              className={cn(
                "flex-1 min-w-[2.5rem] h-full flex items-center justify-center text-[10px] font-medium rounded transition-colors",
                activeMonth === i ? "bg-primary text-primary-foreground" :
                  hasData ? "text-foreground hover:bg-muted" : "text-muted-foreground/30 cursor-default"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* "Início dos lançamentos" line */}
      {activeMonth === firstMonthWithData && (
        <div className="flex items-center gap-2 px-2" style={{ height: 20 }}>
          <div className="flex-1 border-t border-primary/30" />
          <span className="text-[9px] font-medium text-primary/60 uppercase whitespace-nowrap">Início dos lançamentos</span>
          <div className="flex-1 border-t border-primary/30" />
        </div>
      )}

      {/* Month content */}
      <div className="space-y-4">
        <h3 className="text-center text-sm font-bold text-foreground">
          {dreData.months[activeMonth]} {periodYear}
        </h3>

        {renderSection(dreData.previsto, "Previsto", "prev")}
        {renderSection(dreData.realizado, "Realizado", "real")}

        {!dreData.previsto.monthTotalsRev[activeMonth] && !dreData.previsto.monthTotalsExp[activeMonth] &&
         !dreData.realizado.monthTotalsRev[activeMonth] && !dreData.realizado.monthTotalsExp[activeMonth] && (
          <p className="text-center text-xs text-muted-foreground py-8">Sem lançamentos neste mês</p>
        )}
      </div>
    </div>
  );
}
