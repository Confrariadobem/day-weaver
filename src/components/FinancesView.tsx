import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowUpDown, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type PeriodFilter = "daily" | "weekly" | "monthly";
type SortField = "title" | "amount" | "entry_date" | "type";
type SortDir = "asc" | "desc";

export default function FinancesView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Tables<"financial_entries">[]>([]);
  const [projects, setProjects] = useState<Tables<"projects">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("monthly");
  const [sortField, setSortField] = useState<SortField>("entry_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);

  // New entry form
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"revenue" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [installments, setInstallments] = useState("1");

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

  const createEntry = async () => {
    if (!title.trim() || !amount || !user) return;
    const numInstallments = Math.max(1, parseInt(installments) || 1);
    const baseAmount = parseFloat(amount);
    const installmentGroup = numInstallments > 1 ? crypto.randomUUID() : null;
    const baseDate = new Date(entryDate);

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
    setTitle(""); setAmount(""); setInstallments("1"); setCategoryId(""); setProjectId("");
    setDialogOpen(false);
    fetchData();
  };

  const now = new Date();
  const periodRange = useMemo(() => {
    if (period === "daily") return { start: startOfDay(now), end: endOfDay(now) };
    if (period === "weekly") return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) };
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }, [period]);

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

  return (
    <div className="flex h-full flex-col p-4">
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <TrendingUp className="h-5 w-5 text-success" />
          <div><p className="text-xs text-muted-foreground">Receitas</p><p className="text-lg font-bold text-success">R$ {totalRevenue.toFixed(2)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <TrendingDown className="h-5 w-5 text-destructive" />
          <div><p className="text-xs text-muted-foreground">Despesas</p><p className="text-lg font-bold text-destructive">R$ {totalExpense.toFixed(2)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <Wallet className="h-5 w-5 text-primary" />
          <div><p className="text-xs text-muted-foreground">Saldo</p><p className={cn("text-lg font-bold", balance >= 0 ? "text-success" : "text-destructive")}>R$ {balance.toFixed(2)}</p></div>
        </CardContent></Card>
      </div>

      {/* Controls */}
      <div className="mb-3 flex items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Diário</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="monthly">Mensal</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="ml-auto h-8 text-xs"><Plus className="mr-1 h-3 w-3" /> Lançamento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Select value={type} onValueChange={(v) => setType(v as "revenue" | "expense")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Receita</SelectItem>
                    <SelectItem value="expense">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                <Input type="number" placeholder="Parcelas" min="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
              </div>
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
              <Button onClick={createEntry} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("entry_date")}>Data <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("title")}>Título <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("type")}>Tipo <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("amount")}>Valor <ArrowUpDown className="ml-1 inline h-3 w-3" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs">{format(new Date(e.entry_date), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-xs">{e.title}</TableCell>
                <TableCell><span className={cn("rounded px-2 py-0.5 text-[10px] font-medium", e.type === "revenue" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{e.type === "revenue" ? "Receita" : "Despesa"}</span></TableCell>
                <TableCell className={cn("text-right text-xs font-medium", e.type === "revenue" ? "text-success" : "text-destructive")}>R$ {Number(e.amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
