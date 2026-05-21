'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCcw, Trash2, RotateCcw, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface QueueSnapshot {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  paused: boolean;
}

interface FailedJob {
  id: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function QueuesDashboard() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const queues = useQuery<{ queues: QueueSnapshot[]; timestamp: string }>({
    queryKey: ['admin-queues'],
    queryFn: () => fetchJson('/api/admin/queues'),
    refetchInterval: 3000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {queues.data?.timestamp
            ? `Última atualização: ${new Date(queues.data.timestamp).toLocaleTimeString()}`
            : '—'}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['admin-queues'] })}
          className="gap-1.5"
        >
          <RefreshCcw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Fila</th>
              <th className="px-3 py-2 text-right">Aguardando</th>
              <th className="px-3 py-2 text-right">Ativos</th>
              <th className="px-3 py-2 text-right">Concluídos</th>
              <th className="px-3 py-2 text-right">Falhas</th>
              <th className="px-3 py-2 text-right">Atrasados</th>
              <th className="px-3 py-2 text-right">Pausados</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(queues.data?.queues ?? []).map((q) => (
              <React.Fragment key={q.name}>
                <tr className="border-t border-border bg-surface hover:bg-surface-2/40">
                  <td className="px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{q.name}</span>
                      {q.paused && <Badge variant="secondary">pausada</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {q.counts.waiting}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {q.counts.active > 0 ? (
                      <span className="text-brand-300">{q.counts.active}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {q.counts.completed}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {q.counts.failed > 0 ? (
                      <span className="text-rose-400">{q.counts.failed}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {q.counts.delayed}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {q.counts.paused}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {q.counts.failed > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpanded((prev) => (prev === q.name ? null : q.name))
                        }
                        className="gap-1"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            expanded === q.name ? 'rotate-180' : ''
                          }`}
                        />
                        Ver falhas
                      </Button>
                    )}
                  </td>
                </tr>
                {expanded === q.name && (
                  <tr className="border-t border-border bg-surface-2/40">
                    <td colSpan={8} className="px-4 py-3">
                      <FailedJobsTable queueName={q.name} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {queues.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {queues.error && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-rose-400">
                  {(queues.error as Error).message}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FailedJobsTable({ queueName }: { queueName: string }) {
  const qc = useQueryClient();
  const jobs = useQuery<{ jobs: FailedJob[] }>({
    queryKey: ['admin-queues', queueName, 'failed'],
    queryFn: () =>
      fetchJson(`/api/admin/queues/${encodeURIComponent(queueName)}/jobs?state=failed&limit=25`),
    refetchInterval: 5000,
  });

  const retry = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/admin/queues/${queueName}/jobs/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Job re-enfileirado');
      qc.invalidateQueries({ queryKey: ['admin-queues'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/admin/queues/${queueName}/jobs/${id}/retry`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Job removido');
      qc.invalidateQueries({ queryKey: ['admin-queues'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (jobs.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando jobs falhos…
      </div>
    );
  }
  if (!jobs.data?.jobs.length) {
    return <p className="text-xs text-muted-foreground">Nenhum job falho.</p>;
  }

  return (
    <ul className="space-y-2">
      {jobs.data.jobs.map((j) => (
        <li
          key={j.id}
          className="rounded-md border border-border bg-surface px-3 py-2 text-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono">
                <span className="text-foreground">{j.name}</span>
                <span className="text-muted-foreground">#{j.id}</span>
                <span className="text-muted-foreground">
                  tentativas: {j.attemptsMade}
                </span>
              </div>
              {j.failedReason && (
                <p className="mt-1 text-rose-400 line-clamp-3">{j.failedReason}</p>
              )}
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
                {JSON.stringify(j.data, null, 0).slice(0, 240)}
              </pre>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => retry.mutate(j.id)}
                disabled={retry.isPending}
                aria-label="Re-tentar"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove.mutate(j.id)}
                disabled={remove.isPending}
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
