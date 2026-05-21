'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Hash, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TagRow {
  id: string;
  name: string;
  color: string;
  scope: 'conversation' | 'contact';
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function TagsSection() {
  const qc = useQueryClient();
  const tags = useQuery<{ tags: TagRow[] }>({
    queryKey: ['tags'],
    queryFn: () => fetchJson('/api/tags'),
  });

  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState('#71717a');

  const create = useMutation({
    mutationFn: () =>
      fetchJson('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, scope: 'conversation' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      setName('');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">Tags</h2>
        <p className="text-sm text-muted-foreground">
          Etiquetas para categorizar conversas e contatos.
        </p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Input
          placeholder="Nome da tag (ex.: VIP)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded border border-input bg-transparent"
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          <Plus className="h-4 w-4" /> Criar
        </Button>
      </form>

      <ul className="flex flex-wrap gap-2">
        {(tags.data?.tags ?? []).map((t) => (
          <li key={t.id} className="group inline-flex">
            <Badge
              variant="secondary"
              className="border"
              style={{ borderColor: t.color, color: t.color }}
            >
              <Hash className="h-3 w-3" /> {t.name}
              <button
                onClick={() => remove.mutate(t.id)}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center text-muted-foreground opacity-60 hover:text-rose-400 hover:opacity-100"
                aria-label="Excluir"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
