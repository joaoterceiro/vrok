'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface QRRow {
  id: string;
  shortcut: string;
  body: string;
  teamId: string | null;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function QuickRepliesSection() {
  const qc = useQueryClient();
  const list = useQuery<{ quickReplies: QRRow[] }>({
    queryKey: ['quick-replies'],
    queryFn: () => fetchJson('/api/quick-replies'),
  });

  const [shortcut, setShortcut] = React.useState('');
  const [body, setBody] = React.useState('');

  const create = useMutation({
    mutationFn: () =>
      fetchJson('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut, body }),
      }),
    onSuccess: () => {
      toast.success('Resposta rápida criada');
      qc.invalidateQueries({ queryKey: ['quick-replies'] });
      setShortcut('');
      setBody('');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/quick-replies/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">Respostas rápidas</h2>
        <p className="text-sm text-muted-foreground">
          Atalhos do tipo <code>/ola</code> que aparecem quando o atendente digita <code>/</code> no composer.
        </p>
      </header>

      <form
        className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-[140px_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (shortcut.trim() && body.trim()) create.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label>Atalho</Label>
          <Input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value.toLowerCase())}
            placeholder="ola"
            pattern="[a-z0-9_-]+"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Mensagem</Label>
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Olá! Como posso ajudar?"
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Criar
          </Button>
        </div>
      </form>

      <ul className="flex flex-col gap-2">
        {(list.data?.quickReplies ?? []).map((q) => (
          <li
            key={q.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-mono text-brand-400">/{q.shortcut}</div>
              <div className="mt-0.5 text-sm text-foreground/90">{q.body}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir"
              onClick={() => remove.mutate(q.id)}
            >
              <Trash2 className="h-4 w-4 text-rose-400" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
