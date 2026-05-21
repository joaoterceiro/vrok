'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface SlaRule {
  id: string;
  name: string;
  priority: number;
  match: { channelType?: string; teamId?: string; priority?: string };
  firstResponseMinutes: number;
  resolutionMinutes: number;
  isActive: boolean;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function SlaSection() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const rules = useQuery<{ rules: SlaRule[] }>({
    queryKey: ['sla'],
    queryFn: () => fetchJson('/api/sla'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/sla/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sla'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">SLA</h2>
          <p className="text-sm text-muted-foreground">
            Tempo limite de primeira resposta e resolução. Aplicado a novas conversas conforme prioridade da regra.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova regra
        </Button>
      </header>

      {(rules.data?.rules ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
          <Timer className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm">Nenhuma regra de SLA configurada — conversas não recebem prazo automático.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(rules.data?.rules ?? []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {r.name}
                  <Badge variant="secondary">prio {r.priority}</Badge>
                  {r.isActive ? (
                    <Badge variant="success">Ativa</Badge>
                  ) : (
                    <Badge variant="secondary">Inativa</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Primeira resposta: {r.firstResponseMinutes}min · Resolução: {r.resolutionMinutes}min
                  {Object.keys(r.match ?? {}).length > 0 &&
                    ` · match: ${JSON.stringify(r.match)}`}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label="Excluir">
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CreateSheet open={open} onOpenChange={setOpen} />
    </section>
  );
}

function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('SLA padrão');
  const [priority, setPriority] = React.useState(0);
  const [firstResponseMinutes, setFRM] = React.useState(30);
  const [resolutionMinutes, setRM] = React.useState(1440);
  const [channelType, setChannelType] = React.useState('');

  const create = useMutation({
    mutationFn: () => {
      const match: Record<string, unknown> = {};
      if (channelType) match.channelType = channelType;
      return fetchJson('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          priority,
          match,
          firstResponseMinutes,
          resolutionMinutes,
          isActive: true,
        }),
      });
    },
    onSuccess: () => {
      toast.success('Regra criada');
      qc.invalidateQueries({ queryKey: ['sla'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nova regra de SLA</SheetTitle>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Prioridade</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={0}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Canal (opcional)</Label>
              <select
                value={channelType}
                onChange={(e) => setChannelType(e.target.value)}
                className="h-10 rounded-md border border-input bg-surface-2 px-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="wa_evolution">WA Evolution</option>
                <option value="wa_cloud">WA Cloud</option>
                <option value="instagram">Instagram</option>
                <option value="telegram">Telegram</option>
                <option value="webchat">Webchat</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Primeira resposta (min)</Label>
              <Input
                type="number"
                value={firstResponseMinutes}
                onChange={(e) => setFRM(Number(e.target.value))}
                min={1}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Resolução (min)</Label>
              <Input
                type="number"
                value={resolutionMinutes}
                onChange={(e) => setRM(Number(e.target.value))}
                min={1}
                required
              />
            </div>
          </div>
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
