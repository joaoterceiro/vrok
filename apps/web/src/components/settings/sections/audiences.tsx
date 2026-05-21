'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes, Loader2, Plus, Trash2, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface AudienceRow {
  id: string;
  name: string;
  description: string | null;
  source: 'manual' | 'csv' | 'filter';
  contactCount: number;
  lastBuiltAt: string | null;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function AudiencesSection() {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = React.useState(false);
  const [importTo, setImportTo] = React.useState<AudienceRow | null>(null);

  const q = useQuery<{ audiences: AudienceRow[] }>({
    queryKey: ['audiences'],
    queryFn: () => fetchJson('/api/audiences'),
    refetchInterval: 10_000,
  });

  const del = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/audiences/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audiences'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Audiências</h2>
          <p className="text-sm text-muted-foreground">
            Listas de contatos para campanhas. Importe via CSV ou crie manualmente.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova audiência
        </Button>
      </header>

      <ul className="flex flex-col gap-2">
        {(q.data?.audiences ?? []).map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-500/15 text-violet-300">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {a.name}
                  <Badge variant="secondary">
                    <Users className="h-3 w-3" /> {a.contactCount}
                  </Badge>
                  <Badge variant="secondary">{a.source}</Badge>
                </div>
                {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setImportTo(a)} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Importar CSV
              </Button>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(a.id)} aria-label="Excluir">
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <CreateSheet open={openCreate} onOpenChange={setOpenCreate} />
      <ImportSheet audience={importTo} onClose={() => setImportTo(null)} />
    </section>
  );
}

function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');

  const create = useMutation({
    mutationFn: () =>
      fetchJson('/api/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined, source: 'csv' }),
      }),
    onSuccess: () => {
      toast.success('Audiência criada');
      qc.invalidateQueries({ queryKey: ['audiences'] });
      onOpenChange(false);
      setName('');
      setDescription('');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nova audiência</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
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

function ImportSheet({ audience, onClose }: { audience: AudienceRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [csvText, setCsvText] = React.useState('phone,name,produto,dias\n+5511987654321,Maria Souza,Plano Pro,3');
  const [result, setResult] = React.useState<{ added: number; skipped: number; total: number } | null>(null);

  const importMut = useMutation({
    mutationFn: async () => {
      const rows = parseCsv(csvText);
      return fetchJson<{ added: number; skipped: number; total: number }>(
        `/api/audiences/${audience!.id}/import`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        },
      );
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['audiences'] });
      toast.success(`${data.added} contatos importados (${data.skipped} ignorados)`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={!!audience} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Importar CSV — {audience?.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Cole o conteúdo CSV. Colunas: <code>phone</code> ou <code>email</code> são obrigatórias.
            Demais colunas viram variáveis (<code>{`{{produto}}`}</code>, <code>{`{{dias}}`}</code>) para os
            templates.
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            className="rounded-md border border-input bg-surface-2 px-3 py-2 font-mono text-xs"
          />
          <Button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending}
            className="gap-1.5 self-end"
          >
            {importMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Importar
          </Button>

          {result && (
            <div className="rounded-md border border-brand-700/40 bg-brand-950/30 px-3 py-2 text-xs text-brand-200">
              ✓ {result.added} contatos importados · {result.skipped} ignorados · total da audiência:{' '}
              {result.total}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0]!.split(',').map((c) => c.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
