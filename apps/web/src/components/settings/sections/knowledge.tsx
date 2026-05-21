'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface Article {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  isPublished: boolean;
  updatedAt: string;
  body?: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function KnowledgeSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<Article | 'new' | null>(null);
  const [search, setSearch] = React.useState('');

  const articlesQuery = useQuery<{ articles: Article[] }>({
    queryKey: ['kb', 'list'],
    queryFn: () => fetchJson('/api/kb'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/kb/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const visible = (articlesQuery.data?.articles ?? []).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.summary?.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Base de conhecimento</h2>
          <p className="text-sm text-muted-foreground">
            Artigos curados que os agentes IA podem citar quando a ferramenta{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">search_kb</code>{' '}
            está ativa. Use Markdown ou texto simples no corpo.
          </p>
        </div>
        <Button onClick={() => setEditing('new')} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo artigo
        </Button>
      </header>

      <div className="relative">
        <Input
          type="search"
          placeholder="Buscar por título, resumo, tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>

      {articlesQuery.isLoading ? (
        <Skeleton />
      ) : visible.length === 0 ? (
        <EmptyState onCreate={() => setEditing('new')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                onClick={() => setEditing(a)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{a.title}</span>
                  {!a.isPublished && <Badge variant="secondary">rascunho</Badge>}
                  {a.tags.slice(0, 3).map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                {a.summary && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.summary}</p>
                )}
              </button>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                  Editar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Excluir "${a.title}"?`)) remove.mutate(a.id);
                  }}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4 text-rose-400" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ArticleEditor
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['kb'] });
        }}
      />
    </section>
  );
}

function ArticleEditor({
  target,
  onClose,
  onSaved,
}: {
  target: Article | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!target;
  const existing = target && target !== 'new' ? target : null;

  const [title, setTitle] = React.useState('');
  const [summary, setSummary] = React.useState('');
  const [body, setBody] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [published, setPublished] = React.useState(true);

  // Load full article when editing (the list query only returns summaries).
  const detail = useQuery<{ article: Article }>({
    queryKey: ['kb', 'detail', existing?.id],
    queryFn: () => fetchJson(`/api/kb/${existing!.id}`),
    enabled: open && !!existing,
  });

  React.useEffect(() => {
    if (!open) return;
    if (existing && detail.data?.article) {
      const a = detail.data.article;
      setTitle(a.title);
      setSummary(a.summary ?? '');
      setBody(a.body ?? '');
      setTags(a.tags.join(', '));
      setPublished(a.isPublished);
    } else if (!existing) {
      setTitle('');
      setSummary('');
      setBody('');
      setTags('');
      setPublished(true);
    }
  }, [open, existing?.id, detail.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        summary: summary.trim() || null,
        body,
        tags: tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        isPublished: published,
      };
      return existing
        ? fetchJson(`/api/kb/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : fetchJson('/api/kb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
    },
    onSuccess: () => {
      toast.success(existing ? 'Artigo atualizado' : 'Artigo criado');
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? 'Editar artigo' : 'Novo artigo'}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-4">
          <div className="space-y-1">
            <Label htmlFor="kb-title">Título</Label>
            <Input
              id="kb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Como funciona a troca de planos"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="kb-summary">Resumo (1-2 frases)</Label>
            <Input
              id="kb-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Aparece como snippet quando o agente cita o artigo."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="kb-body">Corpo</Label>
            <textarea
              id="kb-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              required
              className="w-full rounded-md border border-input bg-surface-2 px-3 py-2 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Escreva passo a passo, com clareza. O agente usa esse texto para responder."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="kb-tags">Tags (separadas por vírgula)</Label>
            <Input
              id="kb-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="planos, billing, faq"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 rounded border-input bg-surface-2"
            />
            Publicado (visível para agentes IA e atendentes)
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !title || !body}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Skeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="skeleton h-4 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
        <BookOpen className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium">Sem artigos ainda</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Crie o primeiro artigo (FAQ, política, processo). Os agentes IA com{' '}
          <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">search_kb</code>{' '}
          habilitado vão consultar essa base ao responder dúvidas.
        </p>
      </div>
      <Button onClick={onCreate} variant="secondary" className="gap-1.5">
        <Plus className="h-4 w-4" /> Criar primeiro artigo
      </Button>
    </div>
  );
}
