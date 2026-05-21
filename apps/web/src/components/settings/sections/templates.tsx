'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, MessageSquareText, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type ChannelType = 'wa_evolution' | 'wa_cloud' | 'instagram' | 'telegram' | 'webchat' | 'email';

interface Template {
  id: string;
  name: string;
  channelType: ChannelType;
  language: string;
  category: string;
  body: string;
  variables: string[];
  providerTemplateId: string | null;
  status: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function TemplatesSection() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = React.useState(false);

  const q = useQuery<{ templates: Template[] }>({
    queryKey: ['templates'],
    queryFn: () => fetchJson('/api/templates'),
  });

  const del = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const submitMeta = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/templates/${id}/submit`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Enviado à Meta para aprovação');
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Templates de mensagem</h2>
          <p className="text-sm text-muted-foreground">
            Use <code>{`{{nome}}`}</code> para placeholders. WA Cloud requer aprovação Meta (cole o ID).
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo template
        </Button>
      </header>

      <ul className="flex flex-col gap-2">
        {(q.data?.templates ?? []).map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-500/15 text-brand-300">
                <MessageSquareText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate text-sm font-medium">
                  <code className="font-mono">{t.name}</code>
                  <Badge variant="secondary">{t.channelType}</Badge>
                  <Badge variant={t.status === 'approved' ? 'success' : 'warning'}>{t.status}</Badge>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.body}</div>
                {t.variables.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10.5px]">
                    {t.variables.map((v) => (
                      <code key={v} className="rounded bg-surface-2 px-1.5 py-0.5">
                        {`{{${v}}}`}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {t.channelType === 'wa_cloud' &&
                (t.status === 'draft' || t.status === 'rejected') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => submitMeta.mutate(t.id)}
                    disabled={submitMeta.isPending && submitMeta.variables === t.id}
                    className="gap-1.5"
                    title="Submeter à Meta para aprovação"
                  >
                    {submitMeta.isPending && submitMeta.variables === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Submeter
                  </Button>
                )}
              <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => del.mutate(t.id)}>
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <CreateSheet open={openCreate} onOpenChange={setOpenCreate} />
    </section>
  );
}

function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [channelType, setChannelType] = React.useState<ChannelType>('wa_evolution');
  const [body, setBody] = React.useState('Olá {{nome}}, sua oferta de {{produto}} expira em {{dias}} dias.');
  const [providerTemplateId, setProviderTemplateId] = React.useState('');

  const create = useMutation({
    mutationFn: () =>
      fetchJson('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          channelType,
          body,
          providerTemplateId: providerTemplateId || undefined,
        }),
      }),
    onSuccess: () => {
      toast.success('Template criado');
      qc.invalidateQueries({ queryKey: ['templates'] });
      onOpenChange(false);
      setName('');
      setProviderTemplateId('');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Novo template</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Nome (snake_case)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              pattern="[a-z0-9_]+"
              required
              minLength={2}
              placeholder="comunicado_promocao"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Canal</Label>
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as ChannelType)}
              className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm"
            >
              <option value="wa_evolution">WhatsApp Evolution</option>
              <option value="wa_cloud">WhatsApp Cloud (Meta)</option>
              <option value="instagram">Instagram</option>
              <option value="telegram">Telegram</option>
              <option value="webchat">Webchat</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Corpo da mensagem</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              required
              className="rounded-md border border-input bg-surface-2 px-3 py-2 text-sm"
            />
            <p className="text-[10.5px] text-muted-foreground">
              Detectamos placeholders <code>{`{{var}}`}</code> automaticamente.
            </p>
          </div>
          {channelType === 'wa_cloud' && (
            <div className="flex flex-col gap-1.5">
              <Label>Provider Template ID (Meta) — opcional</Label>
              <Input
                value={providerTemplateId}
                onChange={(e) => setProviderTemplateId(e.target.value)}
                placeholder="ex.: 123456789012345"
              />
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Criar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
