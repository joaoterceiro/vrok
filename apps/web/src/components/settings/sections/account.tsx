'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import { KeyRound, Loader2, Save, LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { initials } from '@/lib/utils';

interface Me {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: 'admin' | 'supervisor' | 'agent';
  status: 'available' | 'busy' | 'offline';
  lastSeenAt: string | null;
  createdAt: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.detail ?? e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const STATUS_LABEL: Record<Me['status'], string> = {
  available: 'Disponível',
  busy: 'Ocupado',
  offline: 'Offline',
};

export function AccountSection() {
  const qc = useQueryClient();
  const meQuery = useQuery<{ user: Me }>({
    queryKey: ['me'],
    queryFn: () => fetchJson('/api/me'),
  });

  const [name, setName] = React.useState('');
  const [image, setImage] = React.useState('');
  const [status, setStatus] = React.useState<Me['status']>('offline');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  React.useEffect(() => {
    if (meQuery.data?.user) {
      setName(meQuery.data.user.name ?? '');
      setImage(meQuery.data.user.image ?? '');
      setStatus(meQuery.data.user.status);
    }
  }, [meQuery.data]);

  const saveProfile = useMutation({
    mutationFn: () =>
      fetchJson('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          image: image || null,
          status,
        }),
      }),
    onSuccess: () => {
      toast.success('Perfil atualizado');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const changePassword = useMutation({
    mutationFn: () => {
      if (newPassword !== confirmPassword) {
        return Promise.reject(new Error('As senhas não coincidem'));
      }
      if (newPassword.length < 8) {
        return Promise.reject(new Error('A nova senha precisa ter ao menos 8 caracteres'));
      }
      return fetchJson('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },
    onSuccess: () => {
      toast.success('Senha atualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const revokeOthers = useMutation({
    mutationFn: () => fetchJson('/api/me/sessions', { method: 'DELETE' }),
    onSuccess: () => toast.success('Outras sessões encerradas'),
    onError: (e) => toast.error((e as Error).message),
  });

  if (meQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  const me = meQuery.data?.user;
  if (!me) return null;

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">Minha conta</h2>
        <p className="text-sm text-muted-foreground">
          Perfil, senha e gerenciamento de sessões.
        </p>
      </header>

      {/* Perfil */}
      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Perfil</h3>
        </div>

        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 text-base">
            {image ? <AvatarImage src={image} alt={name || me.email} /> : null}
            <AvatarFallback>{initials(name || me.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="truncate text-sm font-medium">{name || me.email}</div>
            <div className="truncate text-xs text-muted-foreground">{me.email}</div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] capitalize">
                {me.role}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {STATUS_LABEL[me.status]}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="image">URL do avatar</Label>
            <Input
              id="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Status</Label>
          <div className="flex flex-wrap gap-2">
            {(['available', 'busy', 'offline'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md border px-3 py-1.5 text-xs transition ${
                  status === s
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="gap-1.5">
            {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar perfil
          </Button>
        </div>
      </div>

      {/* Senha */}
      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Senha</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Use ao menos 8 caracteres. Recomendamos misturar letras, números e símbolos.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="cur">Senha atual</Label>
            <Input
              id="cur"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new">Nova senha</Label>
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="conf">Confirmar nova</Label>
            <Input
              id="conf"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => changePassword.mutate()}
            disabled={
              changePassword.isPending || !currentPassword || !newPassword || !confirmPassword
            }
            className="gap-1.5"
          >
            {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Trocar senha
          </Button>
        </div>
      </div>

      <Separator className="bg-border/60" />

      {/* Sessões */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Sessões</h3>
        <p className="text-xs text-muted-foreground">
          Encerre todas as outras sessões abertas (em outros navegadores ou dispositivos). A
          sessão atual permanece ativa.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
            className="gap-1.5"
          >
            {revokeOthers.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Encerrar outras sessões
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut({ callbackUrl: '/login' })}
            className="gap-1.5 text-rose-400 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair desta sessão
          </Button>
        </div>
      </div>
    </section>
  );
}
