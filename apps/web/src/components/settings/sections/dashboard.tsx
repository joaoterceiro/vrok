'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Download,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface MetricsResponse {
  period: { days: number };
  totals: {
    open_count: number;
    pending_count: number;
    resolved_count: number;
    overdue_sla: number;
    in_msgs: number;
    out_msgs: number;
    avg_tma_sec: number | null;
    contacts_count: number;
  } | null;
  byDay: Array<{ day: string; in_count: number; out_count: number }>;
  byChannel: Array<{ name: string; type: string; total: number; in_count: number; out_count: number }>;
  byAgent: Array<{ user_id: string; name: string | null; email: string; assigned: number; resolved: number; sent: number }>;
  campaignStats: {
    total_campaigns: number;
    running: number;
    completed: number;
    sent_count: number;
    optouts: number;
  } | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function DashboardSection() {
  const [days, setDays] = React.useState(14);
  const q = useQuery<MetricsResponse>({
    queryKey: ['metrics', days],
    queryFn: () => fetchJson(`/api/metrics?days=${days}`),
    refetchInterval: 30_000,
  });

  const totals = q.data?.totals;
  const maxDayVolume = Math.max(1, ...(q.data?.byDay ?? []).map((d) => d.in_count + d.out_count));

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Métricas de atendimento e campanhas dos últimos {days} dias. Atualiza a cada 30s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-surface-2 px-2 text-xs"
          >
            <option value={1}>Últimas 24h</option>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/metrics/export?days=${days}`} download>
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </a>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Em aberto" value={totals?.open_count ?? 0} icon={MessageSquare} />
        <KpiCard label="Pendentes" value={totals?.pending_count ?? 0} icon={Clock} accent="warning" />
        <KpiCard label="Resolvidas" value={totals?.resolved_count ?? 0} icon={CheckCircle2} accent="success" />
        <KpiCard
          label="SLA estourado"
          value={totals?.overdue_sla ?? 0}
          icon={AlertTriangle}
          accent={(totals?.overdue_sla ?? 0) > 0 ? 'danger' : undefined}
        />
        <KpiCard label="Msgs recebidas" value={totals?.in_msgs ?? 0} icon={ArrowDown} />
        <KpiCard label="Msgs enviadas" value={totals?.out_msgs ?? 0} icon={ArrowUp} />
        <KpiCard
          label="TMA médio"
          value={formatDuration(totals?.avg_tma_sec ?? null)}
          icon={Clock}
          isText
        />
        <KpiCard label="Contatos únicos" value={totals?.contacts_count ?? 0} icon={Users} />
      </div>

      <Separator />

      <section className="space-y-3">
        <h3 className="section-label">Volume por dia (recebidas / enviadas)</h3>
        <div className="rounded-lg border border-border bg-surface p-4">
          {(q.data?.byDay ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados ainda.</p>
          ) : (
            <div className="flex h-32 items-end gap-1">
              {(q.data?.byDay ?? []).map((d) => {
                const total = d.in_count + d.out_count;
                const h = (total / maxDayVolume) * 100;
                return (
                  <div
                    key={d.day}
                    className="group flex flex-1 flex-col items-center justify-end gap-1"
                    title={`${d.day}: ${d.in_count} in / ${d.out_count} out`}
                  >
                    <div className="flex w-full flex-col justify-end" style={{ height: '100%' }}>
                      <div
                        className="w-full rounded-t bg-brand-500/80 transition-all group-hover:bg-brand-400"
                        style={{ height: `${(d.out_count / maxDayVolume) * 100}%` }}
                      />
                      <div
                        className="w-full bg-surface-3 transition-all group-hover:bg-surface-3/80"
                        style={{ height: `${(d.in_count / maxDayVolume) * 100}%` }}
                      />
                    </div>
                    <span className="text-[9px] tabular-nums text-muted-foreground">
                      {d.day.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h3 className="section-label">Por canal</h3>
          <div className="rounded-lg border border-border bg-surface p-4">
            <ChannelDonut data={q.data?.byChannel ?? []} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="section-label">Por atendente</h3>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Atendente</th>
                  <th className="px-3 py-2 text-right font-medium">Atribuídas</th>
                  <th className="px-3 py-2 text-right font-medium">Resolvidas</th>
                  <th className="px-3 py-2 text-right font-medium">Msgs</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.byAgent ?? []).map((a) => (
                  <tr key={a.user_id} className="border-t border-border">
                    <td className="px-3 py-2 truncate">{a.name ?? a.email}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.assigned}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.resolved}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Separator />

      <section className="space-y-3">
        <h3 className="section-label">Campanhas</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Total" value={q.data?.campaignStats?.total_campaigns ?? 0} />
          <KpiCard label="Em execução" value={q.data?.campaignStats?.running ?? 0} accent="success" />
          <KpiCard label="Concluídas" value={q.data?.campaignStats?.completed ?? 0} />
          <KpiCard label="Msgs entregues" value={q.data?.campaignStats?.sent_count ?? 0} />
          <KpiCard label="Opt-outs" value={q.data?.campaignStats?.optouts ?? 0} accent="warning" />
        </div>
      </section>
    </section>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  isText,
}: {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: 'success' | 'warning' | 'danger';
  isText?: boolean;
}) {
  const color =
    accent === 'success'
      ? 'text-brand-300'
      : accent === 'warning'
        ? 'text-amber-300'
        : accent === 'danger'
          ? 'text-rose-400'
          : 'text-foreground';
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5" />}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${color}`}>
        {isText ? value : value.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

// ----- Charts (zero-dependency SVG) ---------------------------------------

const SLICE_COLORS = [
  'hsl(78 95% 57%)', // brand-500
  'hsl(78 95% 45%)', // brand-600
  'hsl(280 75% 60%)',
  'hsl(200 85% 60%)',
  'hsl(340 75% 60%)',
  'hsl(35 85% 60%)',
];

/**
 * Donut chart for `byChannel` distribution. Pure SVG, no library.
 */
export function ChannelDonut({
  data,
}: {
  data: Array<{ name: string; total: number; type: string }>;
}) {
  const total = data.reduce((s, d) => s + d.total, 0);
  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">Sem mensagens no período.</p>
    );
  }
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" width="120" height="120" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(240 4% 17%)" strokeWidth="12" />
        {data.map((d, i) => {
          const frac = d.total / total;
          const stroke = c * frac;
          const el = (
            <circle
              key={d.name}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth="12"
              strokeDasharray={`${stroke} ${c - stroke}`}
              strokeDashoffset={-offset}
            />
          );
          offset += stroke;
          return el;
        })}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 fill-foreground text-[14px] font-semibold tabular-nums"
          transform="rotate(90 50 50)"
        >
          {total}
        </text>
      </svg>
      <ul className="flex-1 space-y-1 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
            />
            <span className="flex-1 truncate text-foreground">{d.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round((d.total / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Horizontal funnel for campaign delivery — sent → delivered → read → failed.
 */
export function CampaignFunnel({
  sent,
  delivered,
  read,
  failed,
}: {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}) {
  const max = Math.max(1, sent);
  const rows: Array<{ label: string; n: number; color: string }> = [
    { label: 'Enviadas', n: sent, color: 'bg-brand-600' },
    { label: 'Entregues', n: delivered, color: 'bg-brand-500' },
    { label: 'Lidas', n: read, color: 'bg-brand-400' },
    { label: 'Falhas', n: failed, color: 'bg-rose-500' },
  ];
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
            {r.label}
          </span>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-2">
            <div
              className={`h-full ${r.color} transition-all`}
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums">{r.n}</span>
        </div>
      ))}
    </div>
  );
}
