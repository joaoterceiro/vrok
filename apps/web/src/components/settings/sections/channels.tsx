'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Download,
  Globe,
  Instagram,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useSocketEvent, useSocketRoom } from '@/hooks/use-socket';

type ChannelType = 'wa_evolution' | 'wa_cloud' | 'instagram' | 'telegram' | 'webchat' | 'email';
type ChannelStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type SyncStatus = 'idle' | 'queued' | 'syncing' | 'done' | 'error';

interface SyncProgress {
  contacts?: { total: number; done: number };
  messages?: { total: number; done: number };
  currentContact?: string;
}

interface ChannelRow {
  id: string;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  summary: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
  syncStatus?: SyncStatus;
  syncProgress?: SyncProgress;
  syncStartedAt?: string | null;
  syncCompletedAt?: string | null;
  syncError?: string | null;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const TYPE_META: Record<
  ChannelType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  wa_evolution: { label: 'WhatsApp · Evolution', icon: Phone, tint: 'bg-brand-500/15 text-brand-300' },
  wa_cloud: { label: 'WhatsApp · Cloud (Meta)', icon: Phone, tint: 'bg-brand-600/15 text-brand-400' },
  instagram: { label: 'Instagram Direct', icon: Instagram, tint: 'bg-pink-500/15 text-pink-300' },
  telegram: { label: 'Telegram', icon: Send, tint: 'bg-sky-500/15 text-sky-300' },
  webchat: { label: 'Webchat (widget)', icon: MessageCircle, tint: 'bg-violet-500/15 text-violet-300' },
  email: { label: 'Email (IMAP+SMTP)', icon: Mail, tint: 'bg-zinc-500/15 text-zinc-300' },
};

export function ChannelsSection() {
  const qc = useQueryClient();
  const [creatorOpen, setCreatorOpen] = React.useState<ChannelType | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [connectResult, setConnectResult] = React.useState<ConnectResult | null>(null);

  const channelsQuery = useQuery<{ channels: ChannelRow[] }>({
    queryKey: ['settings', 'channels'],
    queryFn: () => fetchJson('/api/channels'),
    refetchInterval: 10_000,
  });

  const connect = useMutation({
    mutationFn: (id: string) => fetchJson<ConnectResult>(`/api/channels/${id}/connect`, { method: 'POST' }),
    onSuccess: (data) => {
      setConnectResult(data);
      qc.invalidateQueries({ queryKey: ['settings', 'channels'] });
    },
    onError: (err) => toast.error(`Falha ao conectar: ${(err as Error).message}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Canal removido');
      qc.invalidateQueries({ queryKey: ['settings', 'channels'] });
    },
    onError: (err) => toast.error(`Falha: ${(err as Error).message}`),
  });

  const syncNow = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/channels/${id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incremental: false }),
      }),
    onSuccess: () => {
      toast.success('Importação do histórico enfileirada');
      qc.invalidateQueries({ queryKey: ['settings', 'channels'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Live progress: workers publish `channel:sync-progress` and `channel:status`
  // to the `all` room — we listen and just invalidate so the card re-renders
  // with fresh DB state (kept simple — no client-side merging).
  useSocketRoom('all');
  useSocketEvent('channel:sync-progress', () => {
    qc.invalidateQueries({ queryKey: ['settings', 'channels'] });
  });
  useSocketEvent('channel:status', () => {
    qc.invalidateQueries({ queryKey: ['settings', 'channels'] });
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Canais</h2>
          <p className="text-sm text-muted-foreground">
            Conecte WhatsApp, Instagram, Telegram, Webchat e Email. As mensagens caem na inbox unificada.
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo canal
        </Button>
      </header>

      {channelsQuery.isLoading ? (
        <SkeletonList />
      ) : !channelsQuery.data || channelsQuery.data.channels.length === 0 ? (
        <EmptyState onCreate={() => setPickerOpen(true)} />
      ) : (
        <ul className="flex flex-col gap-2">
          {channelsQuery.data.channels.map((c) => (
            <ChannelRowCard
              key={c.id}
              row={c}
              onConnect={() => connect.mutate(c.id)}
              onDelete={() => {
                if (confirm(`Remover o canal "${c.name}"? Mensagens já recebidas continuam na inbox.`)) {
                  remove.mutate(c.id);
                }
              }}
              onSync={() => syncNow.mutate(c.id)}
              connecting={connect.isPending && connect.variables === c.id}
              deleting={remove.isPending && remove.variables === c.id}
              syncing={syncNow.isPending && syncNow.variables === c.id}
            />
          ))}
        </ul>
      )}

      <TypePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(t) => {
          setPickerOpen(false);
          setCreatorOpen(t);
        }}
      />

      <ChannelCreator
        type={creatorOpen}
        onClose={() => setCreatorOpen(null)}
        onCreated={(id) => {
          setCreatorOpen(null);
          qc.invalidateQueries({ queryKey: ['settings', 'channels'] });
          connect.mutate(id);
        }}
      />

      <ConnectResultSheet result={connectResult} onClose={() => setConnectResult(null)} />
    </section>
  );
}

// ----------------------------------------------------------------

function ChannelRowCard({
  row,
  onConnect,
  onDelete,
  onSync,
  connecting,
  deleting,
  syncing,
}: {
  row: ChannelRow;
  onConnect: () => void;
  onDelete: () => void;
  onSync: () => void;
  connecting: boolean;
  deleting: boolean;
  syncing: boolean;
}) {
  const meta = TYPE_META[row.type];
  const Icon = meta.icon;
  const showSync = row.type === 'wa_evolution' && row.status === 'connected';
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-md ${meta.tint}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{row.name}</span>
              <StatusBadge status={row.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              {meta.label} · {row.summary ?? '—'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showSync && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onSync}
              disabled={syncing || row.syncStatus === 'syncing'}
              className="gap-1.5"
              title={
                row.syncStatus === 'queued'
                  ? 'Importação travada? Clique para forçar reinício'
                  : 'Importar histórico de conversas e mensagens'
              }
            >
              {syncing || row.syncStatus === 'syncing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Sincronizar
            </Button>
          )}
          <Button
            variant={row.status === 'connected' ? 'secondary' : 'default'}
            size="sm"
            onClick={onConnect}
            disabled={connecting || deleting}
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : row.status === 'connected' ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            {row.status === 'connected' ? 'Reconectar' : 'Conectar'}
          </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Excluir canal"
          title="Excluir canal"
          onClick={onDelete}
          disabled={connecting || deleting}
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-rose-400" />
          )}
        </Button>
        </div>
      </div>
      <SyncBanner row={row} />
    </li>
  );
}

function SyncBanner({ row }: { row: ChannelRow }) {
  const s = row.syncStatus;
  if (!s || s === 'idle') return null;

  if (s === 'queued') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importação enfileirada — aguardando worker…
      </div>
    );
  }

  if (s === 'syncing') {
    const c = row.syncProgress?.contacts;
    const m = row.syncProgress?.messages;
    const contactsPct = c && c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
    return (
      <div className="space-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Importando histórico…
          </span>
          {row.syncProgress?.currentContact && (
            <span className="truncate text-muted-foreground">
              {row.syncProgress.currentContact}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${contactsPct}%` }}
          />
        </div>
        <div className="flex justify-between gap-3 text-[10.5px] tabular-nums text-muted-foreground">
          <span>
            Contatos: {c?.done ?? 0} / {c?.total ?? 0}
          </span>
          <span>
            Mensagens importadas: {m?.done ?? 0}
            {m?.total && m.total > (m?.done ?? 0) ? ` / ${m.total}` : ''}
          </span>
        </div>
      </div>
    );
  }

  if (s === 'done') {
    const c = row.syncProgress?.contacts;
    const m = row.syncProgress?.messages;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-brand-700/30 bg-brand-950/20 px-3 py-2 text-xs text-brand-100">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Histórico importado · {c?.done ?? 0} contatos, {m?.done ?? 0} mensagens
        </span>
        {row.syncCompletedAt && (
          <span className="text-muted-foreground">
            {new Date(row.syncCompletedAt).toLocaleString('pt-BR')}
          </span>
        )}
      </div>
    );
  }

  if (s === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Falha na importação</div>
          {row.syncError && <div className="truncate text-muted-foreground">{row.syncError}</div>}
        </div>
      </div>
    );
  }

  return null;
}

function StatusBadge({ status }: { status: ChannelStatus }) {
  const map = {
    connected: { variant: 'success' as const, label: 'Conectado' },
    connecting: { variant: 'warning' as const, label: 'Conectando…' },
    disconnected: { variant: 'secondary' as const, label: 'Desconectado' },
    error: { variant: 'destructive' as const, label: 'Erro' },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function SkeletonList() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="skeleton h-10 w-10 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
      <WifiOff className="h-8 w-8 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Nenhum canal conectado ainda</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Comece conectando um canal de mensagem para receber e enviar mensagens.
        </p>
      </div>
      <Button onClick={onCreate} className="gap-1.5">
        <Plus className="h-4 w-4" /> Conectar canal
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------

function TypePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (type: ChannelType) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Conectar canal</SheetTitle>
        </SheetHeader>
        <div className="mt-6 grid grid-cols-1 gap-2">
          {(Object.entries(TYPE_META) as [ChannelType, (typeof TYPE_META)[ChannelType]][]).map(
            ([type, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  onClick={() => onPick(type)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-md ${meta.tint}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium">{meta.label}</span>
                </button>
              );
            },
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------

function ChannelCreator({
  type,
  onClose,
  onCreated,
}: {
  type: ChannelType | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const isOpen = !!type;
  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{type ? TYPE_META[type].label : ''}</SheetTitle>
        </SheetHeader>
        {type && <CreatorForm type={type} onCreated={onCreated} onCancel={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function CreatorForm({
  type,
  onCreated,
  onCancel,
}: {
  type: ChannelType;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(TYPE_META[type].label);

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetchJson<{ channel: { id: string } }>('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: ({ channel }) => {
      toast.success('Canal criado');
      onCreated(channel.id);
    },
    onError: (err) => toast.error(`Falha: ${(err as Error).message}`),
  });

  const commonFields = (
    <div className="flex flex-col gap-1.5">
      <Label>Nome do canal</Label>
      <Input value={name} onChange={(e) => setName(e.target.value)} required />
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget as HTMLFormElement);
        const payload = buildPayload(type, name, fd);
        create.mutate(payload);
      }}
      className="mt-6 flex flex-col gap-4"
    >
      {commonFields}
      <Separator />
      {renderTypeFields(type)}
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
        </Button>
      </div>
    </form>
  );
}

function renderTypeFields(type: ChannelType): React.ReactNode {
  switch (type) {
    case 'wa_evolution':
      return (
        <>
          <FormRow
            name="instanceName"
            label="Nome da instância"
            placeholder="zora-main"
            required
            help="Identificador único na Evolution. Use letras minúsculas, números, _ ou -."
          />
          <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-[11px] text-muted-foreground">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              A <strong>API Key</strong> da Evolution já está configurada no servidor
              (<code className="font-mono">EVOLUTION_API_KEY</code>). Após criar, o QR code
              aparece automaticamente para você escanear.
            </span>
          </div>
        </>
      );
    case 'wa_cloud':
      return (
        <>
          <FormRow name="phoneNumberId" label="Phone Number ID" required />
          <FormRow name="wabaId" label="WABA ID" required={false} />
          <FormRow name="accessToken" label="Access Token (Bearer)" type="password" required />
          <FormRow name="verifyToken" label="Verify Token (webhook)" required />
          <FormRow name="appSecret" label="App Secret (opcional)" type="password" required={false} />
        </>
      );
    case 'instagram':
      return (
        <>
          <FormRow name="igBusinessAccountId" label="Instagram Business ID" required />
          <FormRow name="accessToken" label="Access Token" type="password" required />
          <FormRow name="verifyToken" label="Verify Token" required />
          <FormRow name="appSecret" label="App Secret (opcional)" type="password" required={false} />
        </>
      );
    case 'telegram':
      return (
        <>
          <FormRow name="botToken" label="Bot Token (@BotFather)" type="password" required />
          <FormRow name="webhookSecret" label="Webhook secret (opcional)" required={false} />
        </>
      );
    case 'webchat':
      return (
        <>
          <FormRow name="greeting" label="Saudação" placeholder="Olá! Como podemos ajudar?" required={false} />
          <FormRow name="primaryColor" label="Cor primária" type="color" required={false} />
        </>
      );
    case 'email':
      return (
        <>
          <FormRow name="fromAddress" label="Email remetente" type="email" required />
          <FormRow name="fromName" label="Nome remetente" required={false} />
          <Label className="mt-3 block text-[10.5px] uppercase tracking-wider text-muted-foreground">SMTP (envio)</Label>
          <FormRow name="smtpHost" label="Host" placeholder="smtp.gmail.com" required />
          <div className="grid grid-cols-2 gap-2">
            <FormRow name="smtpPort" label="Porta" placeholder="587" required />
            <FormRow name="smtpSecure" label="TLS?" placeholder="false|true" required />
          </div>
          <FormRow name="smtpUser" label="Usuário" required />
          <FormRow name="smtpPassword" label="Senha" type="password" required />
          <Label className="mt-3 block text-[10.5px] uppercase tracking-wider text-muted-foreground">IMAP (recebimento)</Label>
          <FormRow name="imapHost" label="Host" placeholder="imap.gmail.com" required />
          <div className="grid grid-cols-2 gap-2">
            <FormRow name="imapPort" label="Porta" placeholder="993" required />
            <FormRow name="imapSecure" label="TLS?" placeholder="true|false" required />
          </div>
          <FormRow name="imapUser" label="Usuário" required />
          <FormRow name="imapPassword" label="Senha" type="password" required />
        </>
      );
  }
}

function FormRow({
  name,
  label,
  type = 'text',
  placeholder,
  required = true,
  help,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label} {required && <span className="text-muted-foreground/60">*</span>}
      </Label>
      <Input name={name} type={type} required={required} placeholder={placeholder} />
      {help && <p className="text-[10.5px] text-muted-foreground">{help}</p>}
    </div>
  );
}

function buildPayload(type: ChannelType, name: string, fd: FormData): Record<string, unknown> {
  const get = (k: string) => String(fd.get(k) ?? '').trim();
  switch (type) {
    case 'wa_evolution': {
      const ak = get('apiKey');
      return {
        type,
        name,
        instanceName: get('instanceName'),
        // Optional: backend falls back to EVOLUTION_API_KEY when omitted.
        ...(ak ? { apiKey: ak } : {}),
      };
    }
    case 'wa_cloud':
      return {
        type,
        name,
        phoneNumberId: get('phoneNumberId'),
        wabaId: get('wabaId') || undefined,
        accessToken: get('accessToken'),
        verifyToken: get('verifyToken'),
        appSecret: get('appSecret') || undefined,
      };
    case 'instagram':
      return {
        type,
        name,
        igBusinessAccountId: get('igBusinessAccountId'),
        accessToken: get('accessToken'),
        verifyToken: get('verifyToken'),
        appSecret: get('appSecret') || undefined,
      };
    case 'telegram':
      return {
        type,
        name,
        botToken: get('botToken'),
        webhookSecret: get('webhookSecret') || undefined,
      };
    case 'webchat':
      return {
        type,
        name,
        greeting: get('greeting') || undefined,
        primaryColor: get('primaryColor') || undefined,
      };
    case 'email':
      return {
        type,
        name,
        fromAddress: get('fromAddress'),
        fromName: get('fromName') || undefined,
        smtp: {
          host: get('smtpHost'),
          port: Number(get('smtpPort')),
          secure: get('smtpSecure') === 'true',
          user: get('smtpUser'),
          password: get('smtpPassword'),
        },
        imap: {
          host: get('imapHost'),
          port: Number(get('imapPort')),
          secure: get('imapSecure') !== 'false',
          user: get('imapUser'),
          password: get('imapPassword'),
        },
      };
  }
}

// ----------------------------------------------------------------

interface ConnectResult {
  qrCode?: string;
  pairingCode?: string;
  alreadyConnected?: boolean;
  webhookUrl?: string;
  manual?: boolean;
  instructions?: string;
  embedSnippet?: string;
  widgetUrl?: string;
  ok?: boolean;
  polling?: string;
}

function ConnectResultSheet({
  result,
  onClose,
}: {
  result: ConnectResult | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!result} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Próximos passos</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-4">
          {result?.alreadyConnected && (
            <div className="flex items-start gap-2 rounded-md border border-brand-700/40 bg-brand-950/30 p-3 text-sm text-brand-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Esta instância já está pareada com um WhatsApp. Mensagens devem fluir
                normalmente. Se quiser reconectar com outro número, abra a Evolution e
                faça logout primeiro.
              </span>
            </div>
          )}

          {result?.qrCode && (
            <>
              <div className="rounded-xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.qrCode.startsWith('data:') ? result.qrCode : `data:image/png;base64,${result.qrCode}`}
                  alt="QR code"
                  className="h-64 w-full object-contain"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>1.</strong> Abra o WhatsApp no celular &middot;{' '}
                <strong>2.</strong> Menu → Aparelhos conectados &middot;{' '}
                <strong>3.</strong> Conectar um aparelho &middot;{' '}
                <strong>4.</strong> Aponte a câmera para o QR acima.
              </p>
            </>
          )}

          {/* Empty state — nothing was returned. Most likely the Evolution
              instance is in a weird state (booting, errored, or v3+ schema).
              Show a debug hint with the raw payload toggle. */}
          {!result?.qrCode &&
            !result?.pairingCode &&
            !result?.alreadyConnected &&
            !result?.webhookUrl &&
            !result?.manual &&
            !result?.embedSnippet &&
            !result?.polling && (
              <div className="space-y-2 rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-200">
                <p className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    A Evolution não retornou QR code nem indicou conexão. Causas
                    comuns: instância está inicializando (espere ~5s e clique{' '}
                    <strong>Reconectar</strong>), token global no servidor está incorreto,
                    ou a versão da Evolution tem outro formato de resposta.
                  </span>
                </p>
                <p>
                  Confira o painel da Evolution em{' '}
                  <code className="font-mono">http://localhost:8080/manager</code> com a
                  mesma API key para validar o estado da instância.
                </p>
              </div>
            )}

          {result?.pairingCode && (
            <Snippet label="Código de pareamento" value={result.pairingCode} />
          )}

          {result?.webhookUrl && (
            <Snippet label="URL do webhook" value={result.webhookUrl} />
          )}

          {result?.manual && (
            <div className="rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-200">
              {result.instructions}
            </div>
          )}

          {result?.embedSnippet && (
            <>
              <Snippet label="Snippet de embed (cole no site)" value={result.embedSnippet} multiline />
              {result.widgetUrl && (
                <a
                  href={result.widgetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Abrir widget standalone → {result.widgetUrl}
                </a>
              )}
            </>
          )}

          {result?.polling && (
            <p className="text-xs text-muted-foreground">IMAP poll configurado · {result.polling}.</p>
          )}

          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Snippet({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="overflow-x-auto rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[11px]">
        {multiline ? <pre className="whitespace-pre-wrap">{value}</pre> : <code>{value}</code>}
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => toast.success('Copiado'));
        }}
        className="text-[11px] text-primary hover:underline"
      >
        Copiar
      </button>
    </div>
  );
}
