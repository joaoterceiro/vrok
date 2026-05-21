'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Loader2, Mail, Plus, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { initials } from '@/lib/utils';

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
  status: 'available' | 'busy' | 'offline';
  isActive: boolean;
  lastSeenAt: string | null;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function UsersSection() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = React.useState(false);
  const [openInvite, setOpenInvite] = React.useState(false);
  const usersQuery = useQuery<{ users: UserRow[] }>({
    queryKey: ['users'],
    queryFn: () => fetchJson('/api/users'),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserRow> }) =>
      fetchJson(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            Administradores, supervisores e atendentes que acessam a plataforma.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setOpenInvite(true)} className="gap-1.5">
            <Mail className="h-4 w-4" /> Convidar
          </Button>
          <Button onClick={() => setOpenCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo usuário
          </Button>
        </div>
      </header>

      <InviteSheet open={openInvite} onOpenChange={setOpenInvite} />

      {usersQuery.isLoading ? (
        <Skeleton />
      ) : (
        <ul className="flex flex-col gap-2">
          {(usersQuery.data?.users ?? []).map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-xs">
                  {initials(u.name ?? u.email)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 truncate text-sm font-medium">
                    {u.name ?? u.email}
                    {!u.isActive && <Badge variant="destructive">inativo</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={u.role}
                  onChange={(e) =>
                    patch.mutate({
                      id: u.id,
                      body: { role: e.target.value as UserRow['role'] },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-surface-2 px-2 text-xs"
                >
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="agent">Atendente</option>
                </select>
                <Button
                  variant={u.isActive ? 'ghost' : 'secondary'}
                  size="sm"
                  onClick={() => patch.mutate({ id: u.id, body: { isActive: !u.isActive } })}
                >
                  {u.isActive ? 'Desativar' : 'Reativar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateUserSheet open={openCreate} onOpenChange={setOpenCreate} />
    </section>
  );
}

function Skeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CreateUserSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'supervisor' | 'agent'>('agent');

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ user: UserRow }>('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, role }),
      }),
    onSuccess: () => {
      toast.success('Usuário criado');
      qc.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
      setEmail('');
      setName('');
      setPassword('');
    },
    onError: (e) => toast.error(`Falha: ${(e as Error).message}`),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Novo usuário</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-name">Nome</Label>
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-password">Senha temporária</Label>
            <Input id="u-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-role">Papel</Label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm"
            >
              <option value="agent">Atendente</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
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

// ----- Invite sheet ----------------------------------------------------

interface InviteResult {
  inviteUrl: string;
  delivery: 'smtp' | 'console';
  expiresAt: string;
}

function InviteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'supervisor' | 'agent'>('agent');
  const [note, setNote] = React.useState('');
  const [result, setResult] = React.useState<InviteResult | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      fetchJson<InviteResult>('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, note: note || undefined }),
      }),
    onSuccess: (data) => {
      setResult(data);
      if (data.delivery === 'smtp') {
        toast.success(`Convite enviado para ${email}`);
      } else {
        toast.message('SMTP não configurado — copie o link manualmente');
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  React.useEffect(() => {
    if (!open) {
      setEmail('');
      setRole('agent');
      setNote('');
      setResult(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Convidar membro</SheetTitle>
        </SheetHeader>

        {result ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-brand-700/40 bg-brand-950/30 p-3 text-xs text-foreground/90">
              {result.delivery === 'smtp'
                ? `Convite enviado por email. Link válido até ${new Date(result.expiresAt).toLocaleString('pt-BR')}.`
                : 'Email não configurado. Compartilhe o link abaixo com o convidado.'}
            </div>
            <div className="space-y-1">
              <Label>Link do convite</Label>
              <div className="flex items-center gap-2">
                <Input value={result.inviteUrl} readOnly className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(result.inviteUrl);
                    toast.success('Link copiado');
                  }}
                  aria-label="Copiar link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
            className="mt-6 space-y-4"
          >
            <div className="space-y-1">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="novo.atendente@empresa.com"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-role">Papel</Label>
              <select
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="h-10 w-full rounded-md border border-input bg-surface-2 px-3 text-sm"
              >
                <option value="agent">Atendente</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-note">Mensagem (opcional)</Label>
              <textarea
                id="inv-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Bem-vinda ao time! Crie sua conta aqui."
                className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O convite expira em 7 dias e só pode ser usado uma vez.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={invite.isPending || !email} className="gap-1.5">
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar convite
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
