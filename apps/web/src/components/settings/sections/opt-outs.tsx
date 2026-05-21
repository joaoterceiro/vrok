'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/utils';

interface OptOutRow {
  id: string;
  contactId: string;
  channelType: string | null;
  source: 'keyword' | 'manual' | 'link';
  reason: string | null;
  createdAt: string;
  contact: { name: string | null; phone: string | null; email: string | null } | null;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function OptOutsSection() {
  const qc = useQueryClient();
  const q = useQuery<{ optOuts: OptOutRow[] }>({
    queryKey: ['opt-outs'],
    queryFn: () => fetchJson('/api/opt-outs'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/opt-outs?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opt-outs'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">Opt-outs</h2>
        <p className="text-sm text-muted-foreground">
          Contatos que pediram para não receber mais comunicados (LGPD). Detectados automaticamente
          quando a mensagem é apenas <code>SAIR</code>, <code>PARAR</code>, <code>CANCELAR</code>, etc.
          Bloqueados em todas as campanhas.
        </p>
      </header>

      {(q.data?.optOuts ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm">Nenhum opt-out registrado.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(q.data?.optOuts ?? []).map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {o.contact?.name ?? '—'}
                  {o.contact?.phone && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {o.contact.phone}
                    </span>
                  )}
                  <Badge variant="secondary">{o.channelType ?? 'todos canais'}</Badge>
                  <Badge variant={o.source === 'manual' ? 'warning' : 'secondary'}>{o.source}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {relativeTime(o.createdAt)}
                  {o.reason && ` · ${o.reason}`}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(o.id)} aria-label="Remover">
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
