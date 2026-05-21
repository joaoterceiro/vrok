'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string | null;
  memberCount: number;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface MemberRow {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  roleInTeam: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function TeamsSection() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = React.useState(false);
  const [editTeam, setEditTeam] = React.useState<TeamRow | null>(null);

  const teams = useQuery<{ teams: TeamRow[] }>({
    queryKey: ['teams'],
    queryFn: () => fetchJson('/api/teams'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Times / Setores</h2>
          <p className="text-sm text-muted-foreground">
            Agrupe atendentes por setor (vendas, suporte, financeiro). Conversas são roteadas para o time do canal.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo time
        </Button>
      </header>

      <ul className="flex flex-col gap-2">
        {(teams.data?.teams ?? []).map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
              <div>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  slug <code className="font-mono">{t.slug}</code> ·{' '}
                  <Badge variant="secondary" className="ml-1">
                    <Users className="h-3 w-3" /> {t.memberCount}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditTeam(t)}>
                Membros
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Excluir"
                onClick={() => remove.mutate(t.id)}
              >
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <CreateTeamSheet open={openCreate} onOpenChange={setOpenCreate} />
      <TeamMembersSheet
        team={editTeam}
        onClose={() => setEditTeam(null)}
      />
    </section>
  );
}

function CreateTeamSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [color, setColor] = React.useState('#fa4374');

  const create = useMutation({
    mutationFn: () =>
      fetchJson('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, color }),
      }),
    onSuccess: () => {
      toast.success('Time criado');
      qc.invalidateQueries({ queryKey: ['teams'] });
      onOpenChange(false);
      setName('');
      setSlug('');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Novo time</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              pattern="[a-z0-9_-]+"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <Label>Cor</Label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-9 cursor-pointer rounded border border-input bg-transparent"
            />
            <span className="font-mono text-xs">{color}</span>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TeamMembersSheet({ team, onClose }: { team: TeamRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!team;

  const members = useQuery({
    enabled: !!team,
    queryKey: ['team-members', team?.id],
    queryFn: () => fetchJson<{ members: MemberRow[] }>(`/api/teams/${team!.id}/members`),
  });

  const users = useQuery({
    enabled: !!team,
    queryKey: ['users'],
    queryFn: () => fetchJson<{ users: UserRow[] }>('/api/users'),
  });

  const add = useMutation({
    mutationFn: (userId: string) =>
      fetchJson(`/api/teams/${team!.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members', team?.id] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      fetchJson(`/api/teams/${team!.id}/members?userId=${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members', team?.id] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  const memberIds = new Set((members.data?.members ?? []).map((m) => m.userId));
  const available = (users.data?.users ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Membros · {team?.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-4">
          <div>
            <h4 className="section-label mb-2">Membros atuais</h4>
            {(members.data?.members ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum membro ainda.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(members.data?.members ?? []).map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span>{m.name ?? m.email}</span>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(m.userId)}>
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="section-label mb-2">Adicionar membro</h4>
            {available.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todos os usuários já estão no time.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {available.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>{u.name ?? u.email}</span>
                    <Button variant="secondary" size="sm" onClick={() => add.mutate(u.id)}>
                      Adicionar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
