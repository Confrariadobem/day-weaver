import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Pencil, Trash2, ChevronLeft, ChevronRight, X, UserPlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface TeamPermission {
  memberId: string;
  module: string;
  canView: boolean;
  canEdit: boolean;
}

interface Team {
  id: string;
  name: string;
  leader: string;
  members: TeamMember[];
  invitedBy: string;
  invitedAt: string;
  permissions: TeamPermission[];
}

const MODULES_FOR_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "finances", label: "Fluxo de Caixa" },
  { key: "investments", label: "Investimentos" },
  { key: "projects", label: "Projetos" },
  { key: "doar", label: "Doar" },
  { key: "indicators", label: "Indicadores" },
];

const ITEMS_PER_PAGE = 5;

// ─── Component ──────────────────────────────────────────────────────────────

export default function TeamsSection() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formName, setFormName] = useState("");
  const [formLeader, setFormLeader] = useState("");
  const [formMembers, setFormMembers] = useState<TeamMember[]>([]);
  const [formInvitedBy, setFormInvitedBy] = useState("");
  const [formPermissions, setFormPermissions] = useState<TeamPermission[]>([]);

  // New user quick modal
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("");

  // All known users
  const [knownUsers, setKnownUsers] = useState<TeamMember[]>([
    { id: "u1", name: "Você (Admin)", role: "Administrador" },
  ]);

  // ─── Filtering & pagination ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter(t => t.name.toLowerCase().includes(q) || t.leader.toLowerCase().includes(q));
  }, [teams, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ─── Open / Close ───────────────────────────────────────────────────────

  const openNew = () => {
    setEditingTeam(null);
    setFormName("");
    setFormLeader("");
    setFormMembers([]);
    setFormInvitedBy("");
    setFormPermissions([]);
    setDialogOpen(true);
  };

  const openEdit = (team: Team) => {
    setEditingTeam(team);
    setFormName(team.name);
    setFormLeader(team.leader);
    setFormMembers([...team.members]);
    setFormInvitedBy(team.invitedBy);
    setFormPermissions([...team.permissions]);
    setDialogOpen(true);
  };

  // ─── Save ───────────────────────────────────────────────────────────────

  const save = () => {
    if (!formName.trim()) return;
    const team: Team = {
      id: editingTeam?.id || crypto.randomUUID(),
      name: formName.trim(),
      leader: formLeader,
      members: formMembers,
      invitedBy: formInvitedBy,
      invitedAt: editingTeam?.invitedAt || new Date().toISOString(),
      permissions: formPermissions,
    };
    if (editingTeam) {
      setTeams(prev => prev.map(t => t.id === editingTeam.id ? team : t));
    } else {
      setTeams(prev => [...prev, team]);
    }
    setDialogOpen(false);
  };

  const deleteTeam = (id: string) => {
    setTeams(prev => prev.filter(t => t.id !== id));
  };

  // ─── Member toggle ──────────────────────────────────────────────────────

  const toggleMember = (user: TeamMember) => {
    const exists = formMembers.find(m => m.id === user.id);
    if (exists) {
      setFormMembers(prev => prev.filter(m => m.id !== user.id));
      setFormPermissions(prev => prev.filter(p => p.memberId !== user.id));
    } else {
      setFormMembers(prev => [...prev, user]);
      const newPerms = MODULES_FOR_PERMISSIONS.map(mod => ({
        memberId: user.id,
        module: mod.key,
        canView: true,
        canEdit: false,
      }));
      setFormPermissions(prev => [...prev, ...newPerms]);
    }
  };

  // ─── Permission toggle ─────────────────────────────────────────────────

  const togglePermission = (memberId: string, module: string, field: "canView" | "canEdit") => {
    setFormPermissions(prev => prev.map(p => {
      if (p.memberId === memberId && p.module === module) {
        if (field === "canEdit" && !p.canEdit) {
          return { ...p, canView: true, canEdit: true };
        }
        if (field === "canView" && p.canView && p.canEdit) {
          return { ...p, canView: false, canEdit: false };
        }
        return { ...p, [field]: !p[field] };
      }
      return p;
    }));
  };

  const setPermNone = (memberId: string, module: string) => {
    setFormPermissions(prev => prev.map(p =>
      p.memberId === memberId && p.module === module ? { ...p, canView: false, canEdit: false } : p
    ));
  };

  // ─── Add quick user ────────────────────────────────────────────────────

  const addQuickUser = () => {
    if (!newUserName.trim()) return;
    const newUser: TeamMember = {
      id: crypto.randomUUID(),
      name: newUserName.trim(),
      role: newUserRole.trim() || "Membro",
    };
    setKnownUsers(prev => [...prev, newUser]);
    toggleMember(newUser);
    setNewUserName("");
    setNewUserRole("");
    setNewUserOpen(false);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar equipe..."
            className="pl-9 h-9 text-sm rounded-lg"
          />
        </div>
        <Button size="sm" className="gap-1.5 text-xs bg-primary hover:bg-primary/90" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> Nova Equipe
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold">Nome da Equipe</TableHead>
              <TableHead className="text-xs font-semibold">Líder</TableHead>
              <TableHead className="text-xs font-semibold text-center">Membros</TableHead>
              <TableHead className="text-xs font-semibold">Convidado por</TableHead>
              <TableHead className="text-xs font-semibold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                  Nenhuma equipe cadastrada
                </TableCell>
              </TableRow>
            ) : paginated.map(team => (
              <TableRow key={team.id} className="group hover:bg-muted/20">
                <TableCell className="text-xs font-medium">{team.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{team.leader || "—"}</TableCell>
                <TableCell className="text-xs text-center">{team.members.length}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{team.invitedBy || "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(team)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTeam(team.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} equipe(s)</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>{page} / {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Team Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingTeam ? "Editar Equipe" : "Nova Equipe"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="dados" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="w-full grid grid-cols-2 h-8">
              <TabsTrigger value="dados" className="text-xs">Dados</TabsTrigger>
              <TabsTrigger value="permissoes" className="text-xs">Permissões</TabsTrigger>
            </TabsList>

            {/* ── Tab Dados ── */}
            <TabsContent value="dados" className="flex-1 overflow-auto mt-3 space-y-4 pr-1">
              <div>
                <Label className="text-xs">Nome da Equipe</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1 text-sm rounded-lg" placeholder="Ex: Operações" />
              </div>

              <div>
                <Label className="text-xs">Líder</Label>
                <Select value={formLeader} onValueChange={setFormLeader}>
                  <SelectTrigger className="mt-1 h-9 text-sm rounded-lg"><SelectValue placeholder="Selecione o líder" /></SelectTrigger>
                  <SelectContent>
                    {knownUsers.map(u => (
                      <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Members multi-select */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Membros</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-primary" onClick={() => setNewUserOpen(true)}>
                    <UserPlus className="h-3 w-3" /> Novo usuário
                  </Button>
                </div>
                <div className="rounded-lg border border-border max-h-40 overflow-auto">
                  {knownUsers.map(user => {
                    const selected = formMembers.some(m => m.id === user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => toggleMember(user)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors",
                          selected && "bg-primary/5"
                        )}
                      >
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{user.name}</p>
                          <p className="text-[10px] text-muted-foreground">{user.role}</p>
                        </div>
                        <Checkbox checked={selected} className="pointer-events-none" />
                      </button>
                    );
                  })}
                </div>
                {formMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formMembers.map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {m.name}
                        <X className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" onClick={() => toggleMember(m)} />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Convidado por */}
              <div>
                <Label className="text-xs">Convidado por</Label>
                <div className="flex gap-2 mt-1">
                  <Select value={formInvitedBy} onValueChange={setFormInvitedBy}>
                    <SelectTrigger className="h-9 text-sm rounded-lg flex-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {knownUsers.map(u => (
                        <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    readOnly
                    value={editingTeam?.invitedAt ? new Date(editingTeam.invitedAt).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR")}
                    className="h-9 text-sm rounded-lg w-28 text-muted-foreground"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── Tab Permissões ── */}
            <TabsContent value="permissoes" className="flex-1 overflow-auto mt-3 pr-1">
              {formMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Adicione membros na aba "Dados" para configurar permissões.</p>
              ) : (
                <div className="space-y-4">
                  {formMembers.map(member => (
                    <div key={member.id} className="space-y-1">
                      <p className="text-xs font-semibold flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        {member.name}
                      </p>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20">
                              <TableHead className="text-[10px] font-semibold py-1.5">Módulo</TableHead>
                              <TableHead className="text-[10px] font-semibold text-center py-1.5 w-14">Ver</TableHead>
                              <TableHead className="text-[10px] font-semibold text-center py-1.5 w-14">Editar</TableHead>
                              <TableHead className="text-[10px] font-semibold text-center py-1.5 w-14">Nenhum</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {MODULES_FOR_PERMISSIONS.map(mod => {
                              const perm = formPermissions.find(p => p.memberId === member.id && p.module === mod.key);
                              const isNone = !(perm?.canView || perm?.canEdit);
                              return (
                                <TableRow key={mod.key}>
                                  <TableCell className="text-[11px] py-1.5">{mod.label}</TableCell>
                                  <TableCell className="text-center py-1.5">
                                    <Checkbox
                                      checked={perm?.canView || false}
                                      onCheckedChange={() => togglePermission(member.id, mod.key, "canView")}
                                      className="h-3.5 w-3.5"
                                    />
                                  </TableCell>
                                  <TableCell className="text-center py-1.5">
                                    <Checkbox
                                      checked={perm?.canEdit || false}
                                      onCheckedChange={() => togglePermission(member.id, mod.key, "canEdit")}
                                      className="h-3.5 w-3.5"
                                    />
                                  </TableCell>
                                  <TableCell className="text-center py-1.5">
                                    <Checkbox
                                      checked={isNone}
                                      onCheckedChange={() => setPermNone(member.id, mod.key)}
                                      className="h-3.5 w-3.5"
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/20">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs gap-1.5" onClick={save} disabled={!formName.trim()}>
              {editingTeam ? "Salvar" : "Criar Equipe"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Quick New User Dialog ─────────────────────────────────────────── */}
      <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Novo Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="mt-1 text-sm rounded-lg" placeholder="Nome completo" />
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Input value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="mt-1 text-sm rounded-lg" placeholder="Ex: Gerente, Analista..." />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/20">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setNewUserOpen(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs" onClick={addQuickUser} disabled={!newUserName.trim()}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
