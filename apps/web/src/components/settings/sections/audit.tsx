'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuditEvent {
  id: string;
  type: string;
  conversationId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface Response {
  events: AuditEvent[];
  types: string[];
}

async function fetchJson<T>(input: string): Promise<T> {
  const res = await fetch(input, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.round(s / 60);
  if (m < 60) return RELATIVE_TIME.format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return RELATIVE_TIME.format(-h, 'hour');
  const d = Math.round(h / 24);
  return RELATIVE_TIME.format(-d, 'day');
}

const TYPE_COLOR: Record<string, string> = {
  'bot.': 'bg-brand-500/15 text-brand-300',
  'agent.': 'bg-brand-500/15 text-brand-300',
  'conversation.': 'bg-shark-700 text-shark-200',
  'message.': 'bg-shark-700 text-shark-200',
  'campaign.': 'bg-amber-500/15 text-amber-300',
  'auth.': 'bg-rose-500/15 text-rose-300',
};
function typeColor(t: string) {
  for (const [prefix, cls] of Object.entries(TYPE_COLOR)) {
    if (t.startsWith(prefix)) return cls;
  }
  return 'bg-shark-700 text-shark-200';
}

export function AuditSection() {
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');

  const q = useQuery<Response>({
    queryKey: ['audit', typeFilter],
    queryFn: () =>
      fetchJson<Response>(
        `/api/audit?limit=100${typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : ''}`,
      ),
    refetchInterval: 15_000,
  });

  const events = q.data?.events ?? [];
  const visible = search.trim()
    ? events.filter((e) => {
        const blob = JSON.stringify(e).toLowerCase();
        return blob.includes(search.toLowerCase());
      })
    : events;

  const types = q.data?.types ?? [];

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">Auditoria</h2>
        <p className="text-sm text-muted-foreground">
          Log de eventos do sistema — acessos, mudanças em conversas, bot, campanhas,
          configurações. Mostra os 100 mais recentes; atualiza a cada 15s.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            type="search"
            placeholder="Buscar em evento, payload, usuário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
          <Filter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] transition ${
              typeFilter == null
                ? 'bg-foreground text-background'
                : 'bg-surface-2 text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {types.slice(0, 8).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition ${
                typeFilter === t
                  ? 'bg-foreground text-background'
                  : 'bg-surface-2 text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando eventos…
        </div>
      ) : visible.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {visible.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${typeColor(e.type)}`}
                    >
                      {e.type}
                    </span>
                    {e.userName || e.userEmail ? (
                      <span className="text-xs text-foreground">
                        {e.userName ?? e.userEmail}
                      </span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">sistema</span>
                    )}
                    {e.conversationId && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        conv #{e.conversationId.slice(0, 8)}
                      </Badge>
                    )}
                  </div>
                  {Object.keys(e.payload).length > 0 && (
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(e.payload).slice(0, 240)}
                    </pre>
                  )}
                </div>
                <time className="shrink-0 font-mono text-[10px] text-muted-foreground" dateTime={e.createdAt}>
                  {timeAgo(e.createdAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
        <ShieldCheck className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium">Nenhum evento</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Quando ações forem realizadas (conversas atribuídas, campanhas disparadas, bots
          respondendo), elas aparecerão aqui.
        </p>
      </div>
    </div>
  );
}
