'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Eye,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSocketEvent, useSocketRoom } from '@/hooks/use-socket';

interface CampaignRow {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'canceled';
  totalRecipients: number;
  counters: Record<string, number>;
  scheduleAt: string | null;
  startedAt: string | null;
  channel: { id: string; name: string; type: string } | null;
  template: { id: string; name: string } | null;
  audience: { id: string; name: string; contactCount: number } | null;
}

interface OptionData {
  channels: { id: string; name: string; type: string; status: string }[];
  templates: { id: string; name: string; channelType: string; variables: string[] }[];
  audiences: { id: string; name: string; contactCount: number }[];
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface DryRunResponse {
  template: { name: string; body: string; variables: string[] };
  counts: { audience: number; optedOut: number; effective: number };
  previews: Array<{
    contactId: string;
    contactLabel: string;
    rendered: string;
    vars: Record<string, string>;
  }>;
}

export function CampaignsSection() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<DryRunResponse | null>(null);

  const q = useQuery<{ campaigns: CampaignRow[] }>({
    queryKey: ['campaigns'],
    queryFn: () => fetchJson('/api/campaigns'),
    refetchInterval: 15_000,
  });

  // Realtime counters from worker.
  useSocketRoom('all');
  useSocketEvent<{
    campaignId: string;
    counters: Record<string, number>;
    status: string;
  }>('campaign:progress', () => {
    qc.invalidateQueries({ queryKey: ['campaigns'] });
  });

  const dryRun = useMutation({
    mutationFn: (id: string) =>
      fetchJson<DryRunResponse>(`/api/campaigns/${id}/dry-run`, { method: 'POST' }),
    onSuccess: (data, id) => {
      setPreviewingId(id);
      setPreviewData(data);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const start = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/campaigns/${id}/start`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      setPreviewingId(null);
      setPreviewData(null);
      toast.success('Campanha enfileirada');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /**
   * Confirm-before-fire: large audiences (>500) get a double prompt to
   * avoid accidental blast. Smaller campaigns just need the dry-run preview.
   */
  const confirmAndStart = (id: string, effective: number) => {
    if (effective > 500) {
      const phrase = 'DISPARAR';
      const got = window.prompt(
        `Você está prestes a disparar para ${effective} contatos. ` +
          `Digite "${phrase}" para confirmar.`,
      );
      if (got !== phrase) {
        toast.message('Disparo cancelado');
        return;
      }
    }
    start.mutate(id);
  };
  const pause = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/campaigns/${id}/pause`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/campaigns/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Campanhas</h2>
          <p className="text-sm text-muted-foreground">
            Disparos em massa com template, audiência, variáveis e rate-limit. Opt-outs são respeitados automaticamente.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova campanha
        </Button>
      </header>

      <ul className="flex flex-col gap-2">
        {(q.data?.campaigns ?? []).map((c) => {
          const counters = c.counters ?? {};
          const sent = (counters.sent ?? 0) + (counters.delivered ?? 0) + (counters.read ?? 0);
          const failed = counters.failed ?? 0;
          const optedOut = counters.opted_out ?? 0;
          const pending = counters.pending ?? 0;
          const total = c.totalRecipients;
          const progress = total > 0 ? Math.round(((sent + failed + optedOut) / total) * 100) : 0;
          return (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/15 text-amber-300">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.channel?.name ?? '—'} · {c.template?.name ?? '—'} ·{' '}
                      {c.audience?.name ?? '—'} ({c.audience?.contactCount ?? 0})
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(c.status === 'draft' || c.status === 'paused' || c.status === 'scheduled') && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => dryRun.mutate(c.id)}
                        disabled={dryRun.isPending && dryRun.variables === c.id}
                        className="gap-1.5"
                        title="Pré-visualizar antes de disparar"
                      >
                        {dryRun.isPending && dryRun.variables === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        Prévia
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => dryRun.mutate(c.id)}
                        className="gap-1.5"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Disparar
                      </Button>
                    </>
                  )}
                  {c.status === 'running' && (
                    <Button size="sm" variant="secondary" onClick={() => pause.mutate(c.id)} className="gap-1.5">
                      <Pause className="h-3.5 w-3.5" />
                      Pausar
                    </Button>
                  )}
                  {(c.status === 'running' || c.status === 'paused' || c.status === 'scheduled') && (
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(c.id)} className="gap-1.5">
                      <Square className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  )}
                  {(c.status === 'completed' || c.status === 'canceled' || c.status === 'draft') && (
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(c.id)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4 text-rose-400" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                  <Stat label="Pendentes" value={pending} />
                  <Stat label="Enviadas" value={counters.sent ?? 0} />
                  <Stat label="Entregues" value={counters.delivered ?? 0} accent="emerald" />
                  <Stat label="Lidas" value={counters.read ?? 0} accent="emerald" />
                  <Stat label="Falhas" value={failed} accent="rose" />
                  <Stat label="Opt-outs" value={optedOut} accent="amber" />
                  <span className="ml-auto">
                    Progresso: {progress}% ({sent + failed + optedOut}/{total})
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <CampaignWizard open={openCreate} onOpenChange={setOpenCreate} />

      <DryRunPreview
        open={!!previewingId && !!previewData}
        data={previewData}
        onCancel={() => {
          setPreviewingId(null);
          setPreviewData(null);
        }}
        onConfirm={() => {
          if (previewingId && previewData) {
            confirmAndStart(previewingId, previewData.counts.effective);
          }
        }}
        starting={start.isPending}
      />
    </section>
  );
}

// ----- Dry-run preview Sheet ------------------------------------------

function DryRunPreview({
  open,
  data,
  onCancel,
  onConfirm,
  starting,
}: {
  open: boolean;
  data: DryRunResponse | null;
  onCancel: () => void;
  onConfirm: () => void;
  starting: boolean;
}) {
  if (!data) return null;
  const blocked = data.counts.optedOut > 0;
  const high = data.counts.effective > 500;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onCancel()}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Pré-visualizar disparo</SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs">
            <div className="font-medium text-foreground">{data.template.name}</div>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
              {data.template.body}
            </pre>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border bg-surface px-2 py-2">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Audiência
              </div>
              <div className="font-mono text-base tabular-nums">{data.counts.audience}</div>
            </div>
            <div className="rounded-md border border-border bg-surface px-2 py-2">
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Opt-outs
              </div>
              <div className="font-mono text-base tabular-nums text-rose-400">
                −{data.counts.optedOut}
              </div>
            </div>
            <div className="rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-2">
              <div className="text-[10.5px] uppercase tracking-wider text-brand-300">
                Vão receber
              </div>
              <div className="font-mono text-base tabular-nums text-foreground">
                {data.counts.effective}
              </div>
            </div>
          </div>

          {high && (
            <div className="flex items-start gap-2 rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Audiência grande ({data.counts.effective} contatos). Confirmaremos uma segunda
                vez antes de disparar.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Prévia dos 3 primeiros
            </div>
            {data.previews.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Audiência vazia — adicione contatos antes de disparar.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.previews.map((p) => (
                  <li
                    key={p.contactId}
                    className="rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {p.contactLabel}
                      </Badge>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {p.rendered}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Voltar
            </Button>
            <Button
              onClick={onConfirm}
              disabled={starting || blocked === false ? false : false || data.counts.effective === 0}
              className="gap-1.5"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {high ? `Confirmar disparo (${data.counts.effective})` : 'Disparar agora'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'emerald' | 'rose' | 'amber' }) {
  const color =
    accent === 'emerald'
      ? 'text-brand-300'
      : accent === 'rose'
        ? 'text-rose-400'
        : accent === 'amber'
          ? 'text-amber-300'
          : 'text-foreground';
  return (
    <span className="flex items-center gap-1">
      <span className={color}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function CampaignStatusBadge({ status }: { status: CampaignRow['status'] }) {
  const map = {
    draft: { v: 'secondary' as const, l: 'Rascunho' },
    scheduled: { v: 'warning' as const, l: 'Agendada' },
    running: { v: 'success' as const, l: 'Em execução' },
    paused: { v: 'warning' as const, l: 'Pausada' },
    completed: { v: 'success' as const, l: 'Concluída' },
    canceled: { v: 'destructive' as const, l: 'Cancelada' },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.l}</Badge>;
}

// ----------------------------------------------------------------

function CampaignWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [channelId, setChannelId] = React.useState('');
  const [templateId, setTemplateId] = React.useState('');
  const [audienceId, setAudienceId] = React.useState('');
  const [rateLimit, setRateLimit] = React.useState(20);
  const [variableMapping, setVariableMapping] = React.useState<Record<string, string>>({});

  const channels = useQuery<{ channels: OptionData['channels'] }>({
    queryKey: ['channels-light'],
    queryFn: () => fetchJson('/api/channels'),
    enabled: open,
  });
  const templates = useQuery<{ templates: OptionData['templates'] }>({
    queryKey: ['templates'],
    queryFn: () => fetchJson('/api/templates'),
    enabled: open,
  });
  const audiences = useQuery<{ audiences: OptionData['audiences'] }>({
    queryKey: ['audiences'],
    queryFn: () => fetchJson('/api/audiences'),
    enabled: open,
  });

  const selectedTemplate = templates.data?.templates.find((t) => t.id === templateId);

  const create = useMutation({
    mutationFn: async () => {
      const { campaign } = await fetchJson<{ campaign: { id: string } }>('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          channelId,
          templateId,
          audienceId,
          variableMapping,
          rateLimitPerMin: rateLimit,
        }),
      });
      return campaign;
    },
    onSuccess: () => {
      toast.success('Campanha criada (rascunho). Clique em Disparar para iniciar.');
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onOpenChange(false);
      reset();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reset = () => {
    setName('');
    setChannelId('');
    setTemplateId('');
    setAudienceId('');
    setRateLimit(20);
    setVariableMapping({});
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nova campanha</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="mt-6 flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Canal</Label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              required
              className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {channels.data?.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Template</Label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
              className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {templates.data?.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.channelType})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Audiência</Label>
            <select
              value={audienceId}
              onChange={(e) => setAudienceId(e.target.value)}
              required
              className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {audiences.data?.audiences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.contactCount} contatos)
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <>
              <Separator />
              <Label className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Mapeamento de variáveis
              </Label>
              {selectedTemplate.variables.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">{`{{${v}}}`}</code>
                  <span className="text-xs text-muted-foreground">=</span>
                  <select
                    value={variableMapping[v] ?? ''}
                    onChange={(e) =>
                      setVariableMapping((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    className="h-8 flex-1 rounded-md border border-input bg-surface-2 px-2 text-xs"
                  >
                    <option value="">— (vazio)</option>
                    <option value="contact.name">contact.name</option>
                    <option value="contact.phone">contact.phone</option>
                    <option value="contact.email">contact.email</option>
                    <option value={`audience.csv.${v}`}>audience.csv.{v}</option>
                  </select>
                </div>
              ))}
            </>
          )}

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Taxa de envio (mensagens / minuto)</Label>
            <Input
              type="number"
              min={1}
              max={600}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              required
            />
            <p className="text-[10.5px] text-muted-foreground">
              Use 10-20/min para Evolution (não-oficial). 60-100 para WA Cloud verificado.
            </p>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar (rascunho)
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
