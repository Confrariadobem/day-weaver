import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, ArrowUpDown, TrendingUp, TrendingDown, Wallet, Trash2, Pencil,
  CalendarDays, CalendarRange, Calendar as CalendarIcon, CalendarClock, CalendarCheck,
  Printer, FileDown, BarChart3, Repeat,
} from "lucide-react";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addMonths, addWeeks, addDays, startOfYear, endOfYear, eachMonthOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Line, Legend, Cell,
} from "recharts";
import type { Tables as DBTables } from "@/integrations/supabase/types";

type PeriodFilter = "daily" | "3days" | "weekly" | "monthly" | "yearly" | "custom";
type SortField = "title" | "amount" | "entry_date" | "type";
type SortDir = "asc" | "desc";
type RecurrenceType = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
type ViewTab = "lancamentos" | "doar" | "relatorios";

const periodIcons: { key: PeriodFilter; label: string; icon: React.ReactNode }[] = [
  { key: "daily", label: "Dia", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "3days", label: "3 Dias", icon: <CalendarRange className="h-4 w-4" /> },
  { key: "weekly", label: "Semana", icon: <CalendarClock className="h-4 w-4" /> },
  { key: "monthly", label: "Mês", icon: <CalendarIcon className="h-4 w-4" /> },
  { key: "yearly", label: "Ano", icon: <CalendarCheck className="h-4 w-4" /> },
];

const tooltipStyle = {
  background: "hsl(0 0% 10%)",
  border: "1px solid hsl(0 0% 20%)",
  borderRadius: 8,
  fontSize: 12,
};

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function FinancesView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DBTables<"financial_entries">[]>([]);
  const [projects, setProjects] = useState<DBTables<"projects">[]>([]);
  const [categories, setCategories] = useState<DBTables<"categories">[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("monthly");
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DBTables<"financial_entries"> | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("lancamentos");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const reportRef = useRef<HTMLDivElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"revenue" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [installments, setInstallments] = useState("1");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("none");
  const [recurrenceCount, setRecurrenceCount] = useState("12");

  const fetchData = async () => {
    if (!user) return;
    const [entRes, projRes, catRes] = await Promise.all([
      supabase.from("financial_entries").select("*").eq("user_id", user.id).order("entry_date", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", user.id),
      supabase.from("categories").select("*").eq("user_id", user.id),
    ]);
    if (entRes.data) setEntries(entRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (catRes.data) setCategories(catRes.data);
  };

  useEffect(() => { fetchData(); }, [user]);

  const resetForm = () => {
    setTitle(""); setAmount(""); setInstallments("1"); setCategoryId(""); setProjectId("");
    setEntryDate(format(new Date(), "yyyy-MM-dd")); setType("expense");
    setRecurrence("none"); setRecurrenceCount("12"); setEditingEntry(null);
  };

  const openEditDialog = (entry: DBTables<"financial_entries">) => {
    setEditingEntry(entry);
    setTitle(entry.title.replace(/\s*\(\d+\/\d+\)$/, ""));
    setAmount(String(entry.amount));
    setType(entry.type as "revenue" | "expense");
    setCategoryId(entry.category_id || "");
    setProjectId(entry.project_id || "");
    setEntryDate(entry.entry_date);
    setInstallments("1");
    setRecurrence("none");
    setDialogOpen(true);
  };

  const getNextDate = (base: Date, rec: RecurrenceType, i: number): Date => {
    switch (rec) {
      case "daily": return addDays(base, i);
      case "weekly": return addWeeks(base, i);
      case "biweekly": return addWeeks(base, i * 2);
      case "monthly": return addMonths(base, i);
      case "yearly": return addMonths(base, i * 12);
      default: return base;
    }
  };

  const createOrUpdateEntry = async () => {
    if (!title.trim() || !amount || !user) return;

    if (editingEntry) {
      await supabase.from("financial_entries").update({
        title, amount: parseFloat(amount), type,
        category_id: categoryId || null, project_id: projectId || null, entry_date: entryDate,
      }).eq("id", editingEntry.id);
    } else {
      const baseAmount = parseFloat(amount);
      const baseDate = new Date(entryDate);

      if (recurrence !== "none") {
        const count = Math.max(1, parseInt(recurrenceCount) || 12);
        const group = crypto.randomUUID();
        const entriesToInsert = Array.from({ length: count }, (_, i) => ({
          user_id: user.id,
          title: `${title} (${i + 1}/${count})`,
          amount: baseAmount,
          type,
          category_id: categoryId || null,
          project_id: projectId || null,
          entry_date: format(getNextDate(baseDate, recurrence, i), "yyyy-MM-dd"),
          installment_group: group,
          installment_number: i + 1,
          total_installments: count,
        }));
        await supabase.from("financial_entries").insert(entriesToInsert);
      } else {
        const numInstallments = Math.max(1, parseInt(installments) || 1);
        const installmentGroup = numInstallments > 1 ? crypto.randomUUID() : null;
        const entriesToInsert = Array.from({ length: numInstallments }, (_, i) => ({
          user_id: user.id,
          title: numInstallments > 1 ? `${title} (${i + 1}/${numInstallments})` : title,
          amount: baseAmount / numInstallments,
          type,
          category_id: categoryId || null,
          project_id: projectId || null,
          entry_date: format(addMonths(baseDate, i), "yyyy-MM-dd"),
          installment_group: installmentGroup,
          installment_number: i + 1,
          total_installments: numInstallments,
        }));
        await supabase.from("financial_entries").insert(entriesToInsert);
      }

      // Also create calendar events for recurrences
      if (recurrence !== "none") {
        const count = Math.max(1, parseInt(recurrenceCount) || 12);
        const calEvents = Array.from({ length: count }, (_, i) => {
          const eventDate = getNextDate(baseDate, recurrence, i);
          return {
            user_id: user.id,
            title: `💰 ${title}`,
            start_time: eventDate.toISOString(),
            all_day: true,
            color: type === "revenue" ? "#22c55e" : "#ef4444",
            description: `Lançamento financeiro: ${brl(baseAmount)} (${type === "revenue" ? "Receita" : "Despesa"})`,
          };
        });
        await supabase.from("calendar_events").insert(calEvents);
      }
    }

    resetForm();
    setDialogOpen(false);
    fetchData();
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("financial_entries").delete().eq("id", id);
    fetchData();
  };

  const now = new Date();
  const periodRange = useMemo(() => {
    switch (period) {
      case "daily": return { start: startOfDay(now), end: endOfDay(now) };
      case "3days": return { start: startOfDay(now), end: endOfDay(addDays(now, 2)) };
      case "weekly": return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
      case "monthly": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "yearly": return { start: startOfYear(now), end: endOfYear(now) };
      case "custom": return { start: new Date(customStart), end: new Date(customEnd) };
    }
  }, [period, customStart, customEnd]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        const d = new Date(e.entry_date);
        return d >= periodRange.start && d <= periodRange.end;
      })
      .sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (aVal == null || bVal == null) return 0;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [entries, periodRange, sortField, sortDir]);

  const totalRevenue = filtered.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = filtered.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const balance = totalRevenue - totalExpense;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const finCategories = categories.filter((c) => c.is_revenue || c.is_expense);

  // DOAR monthly summary
  const doarData = useMemo(() => {
    const yr = now.getFullYear();
    const months = eachMonthOfInterval({ start: startOfYear(new Date(yr, 0)), end: endOfYear(new Date(yr, 0)) });
    let accumulated = 0;
    return months.map((month) => {
      const mEntries = entries.filter((e) => {
        const d = new Date(e.entry_date);
        return d.getMonth() === month.getMonth() && d.getFullYear() === yr;
      });
      const rev = mEntries.filter((e) => e.type === "revenue").reduce((s, e) => s + Number(e.amount), 0);
      const exp = mEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
      const saldo = rev - exp;
      accumulated += saldo;
      return {
        month: format(month, "MMM", { locale: ptBR }).toUpperCase(),
        receita: rev,
        despesa: exp,
        saldo,
        acumulado: accumulated,
      };
    });
  }, [entries]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const header = "Data,Título,Tipo,Categoria,Projeto,Valor\n";
    const rows = filtered.map((e) => {
      const cat = categories.find((c) => c.id === e.category_id)?.name || "";
      const proj = projects.find((p) => p.id === e.project_id)?.name || "";
      return `${e.entry_date},"${e.title}",${e.type === "revenue" ? "Receita" : "Despesa"},"${cat}","${proj}",${e.amount}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financeiro_${format(now, "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-success" />
            <div>
              <p className="text-[10px] text-muted-foreground">Receitas</p>
              <p className="text-sm font-bold text-success">{brl(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingDown className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-[10px] text-muted-foreground">Despesas</p>
              <p className="text-sm font-bold text-destructive">{brl(totalExpense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo</p>
              <p className={cn("text-sm font-bold", balance >= 0 ? "text-success" : "text-destructive")}>{brl(balance)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Lançamentos / DOAR / Relatórios */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="lancamentos" className="text-xs">Lançamentos</TabsTrigger>
            <TabsTrigger value="doar" className="text-xs">DOAR</TabsTrigger>
            <TabsTrigger value="relatorios" className="text-xs">Relatórios</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          {/* Period filter icons */}
          {periodIcons.map((p) => (
            <Tooltip key={p.key} delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPeriod(p.key)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    period === p.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {p.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent>{p.label}</TooltipContent>
            </Tooltip>
          ))}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPeriod("custom")}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-lg px-2 text-xs transition-colors",
                  period === "custom"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <CalendarRange className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Personalizado</TooltipContent>
          </Tooltip>

          {period === "custom" && (
            <div className="ml-1 flex items-center gap-1">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-32 text-xs" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-32 text-xs" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewTab === "lancamentos" && (
          <>
            {/* Add button */}
            <div className="mb-2 flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 text-xs"><Plus className="mr-1 h-3 w-3" /> Lançamento</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{editingEntry ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="number" placeholder="Valor (R$)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      <Select value={type} onValueChange={(v) => setType(v as "revenue" | "expense")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">🟢 Receita</SelectItem>
                          <SelectItem value="expense">🔴 Despesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                      {!editingEntry && recurrence === "none" && (
                        <Input type="number" placeholder="Parcelas" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
                      )}
                    </div>

                    {/* Recurrence */}
                    {!editingEntry && (
                      <div className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Repeat className="h-3.5 w-3.5" /> Recorrência
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={recurrence} onValueChange={(v) => setRecurrence(v as RecurrenceType)}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma</SelectItem>
                              <SelectItem value="daily">Diária</SelectItem>
                              <SelectItem value="weekly">Semanal</SelectItem>
                              <SelectItem value="biweekly">Quinzenal</SelectItem>
                              <SelectItem value="monthly">Mensal</SelectItem>
                              <SelectItem value="yearly">Anual</SelectItem>
                            </SelectContent>
                          </Select>
                          {recurrence !== "none" && (
                            <Input type="number" placeholder="Qtd. ocorrências" min="1" value={recurrenceCount} onChange={(e) => setRecurrenceCount(e.target.value)} className="text-xs" />
                          )}
                        </div>
                      </div>
                    )}

                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Categoria (opcional)" /></SelectTrigger>
                      <SelectContent>
                        {finCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger><SelectValue placeholder="Projeto (opcional)" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button onClick={createOrUpdateEntry} className="w-full">{editingEntry ? "Salvar Alterações" : "Salvar"}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("entry_date")}>Data <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("title")}>Título <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
                    <TableHead className="text-xs">Categoria</TableHead>
                    <TableHead className="cursor-pointer text-xs" onClick={() => toggleSort("type")}>Tipo <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
                    <TableHead className="cursor-pointer text-right text-xs" onClick={() => toggleSort("amount")}>Valor <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
                    <TableHead className="w-16 text-xs text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Sem lançamentos neste período</TableCell></TableRow>
                  )}
                  {filtered.map((e) => {
                    const cat = categories.find((c) => c.id === e.category_id);
                    return (
                      <TableRow key={e.id} className="group">
                        <TableCell className="text-xs">{format(new Date(e.entry_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-xs">{e.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{cat?.name || "—"}</TableCell>
                        <TableCell>
                          <span className={cn("rounded px-2 py-0.5 text-[10px] font-medium",
                            e.type === "revenue" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                          )}>
                            {e.type === "revenue" ? "Receita" : "Despesa"}
                          </span>
                        </TableCell>
                        <TableCell className={cn("text-right text-xs font-medium",
                          e.type === "revenue" ? "text-success" : "text-destructive"
                        )}>{brl(Number(e.amount))}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditDialog(e)} className="rounded p-1 hover:bg-muted"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                            <button onClick={() => deleteEntry(e.id)} className="rounded p-1 hover:bg-destructive/10"><Trash2 className="h-3 w-3 text-destructive" /></button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {viewTab === "doar" && (
          <div className="space-y-4">
            {/* DOAR Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Demonstração de Origens e Aplicações de Recursos — {now.getFullYear()}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={doarData} barGap={0}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="acumulado" name="Saldo Acumulado" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: "#f59e0b" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* DOAR Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Mês</TableHead>
                        <TableHead className="text-right text-xs text-success">Receita</TableHead>
                        <TableHead className="text-right text-xs text-destructive">Despesa</TableHead>
                        <TableHead className="text-right text-xs text-primary">Saldo Mês</TableHead>
                        <TableHead className="text-right text-xs text-warning">Acumulado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doarData.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell className="text-xs font-medium">{m.month}</TableCell>
                          <TableCell className="text-right text-xs text-success">{brl(m.receita)}</TableCell>
                          <TableCell className="text-right text-xs text-destructive">{brl(m.despesa)}</TableCell>
                          <TableCell className={cn("text-right text-xs font-medium", m.saldo >= 0 ? "text-primary" : "text-destructive")}>{brl(m.saldo)}</TableCell>
                          <TableCell className={cn("text-right text-xs font-medium", m.acumulado >= 0 ? "text-warning" : "text-destructive")}>{brl(m.acumulado)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Totals */}
                      <TableRow className="border-t-2 border-border font-bold">
                        <TableCell className="text-xs">TOTAL</TableCell>
                        <TableCell className="text-right text-xs text-success">{brl(doarData.reduce((s, m) => s + m.receita, 0))}</TableCell>
                        <TableCell className="text-right text-xs text-destructive">{brl(doarData.reduce((s, m) => s + m.despesa, 0))}</TableCell>
                        <TableCell className={cn("text-right text-xs", doarData.reduce((s, m) => s + m.saldo, 0) >= 0 ? "text-primary" : "text-destructive")}>
                          {brl(doarData.reduce((s, m) => s + m.saldo, 0))}
                        </TableCell>
                        <TableCell className="text-right text-xs text-warning">{brl(doarData[doarData.length - 1]?.acumulado || 0)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {viewTab === "relatorios" && (
          <div className="space-y-4" ref={reportRef}>
            {/* Report toolbar */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePrint}>
                <Printer className="mr-1 h-3 w-3" /> Imprimir
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportCSV}>
                <FileDown className="mr-1 h-3 w-3" /> Exportar CSV
              </Button>
            </div>

            {/* Report: Period summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Relatório do Período ({format(periodRange.start, "dd/MM/yyyy")} — {format(periodRange.end, "dd/MM/yyyy")})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg bg-success/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Receitas</p>
                    <p className="text-lg font-bold text-success">{brl(totalRevenue)}</p>
                    <p className="text-[10px] text-muted-foreground">{filtered.filter(e => e.type === "revenue").length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-destructive/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Total Despesas</p>
                    <p className="text-lg font-bold text-destructive">{brl(totalExpense)}</p>
                    <p className="text-[10px] text-muted-foreground">{filtered.filter(e => e.type === "expense").length} lançamentos</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Saldo Período</p>
                    <p className={cn("text-lg font-bold", balance >= 0 ? "text-success" : "text-destructive")}>{brl(balance)}</p>
                  </div>
                </div>

                {/* Top categories in the period */}
                <h3 className="text-xs font-medium mb-2 text-muted-foreground">Top Categorias (Despesa)</h3>
                <div className="space-y-1.5">
                  {(() => {
                    const catMap = new Map<string, number>();
                    filtered.filter(e => e.type === "expense").forEach(e => {
                      const name = categories.find(c => c.id === e.category_id)?.name || "Sem Categoria";
                      catMap.set(name, (catMap.get(name) || 0) + Number(e.amount));
                    });
                    const sorted = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
                    const max = sorted[0]?.[1] || 1;
                    return sorted.slice(0, 5).map(([name, val]) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="w-24 truncate text-xs">{name}</span>
                        <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                          <div className="h-full rounded bg-destructive/60" style={{ width: `${(val / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium w-24 text-right text-destructive">{brl(val)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
