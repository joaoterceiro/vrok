'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Loader2, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Provider = 'anthropic' | 'openai' | 'groq';
interface BotFlow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  definition: { systemPrompt?: string };
  llmConfig: { provider?: Provider; model?: string; handoffKeywords?: string[] };
  createdAt: string;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function BotsSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<BotFlow | 'new' | null>(null);

  const flowsQuery = useQuery<{ bots: BotFlow[] }>({
    queryKey: ['bots'],
    queryFn: () => fetchJson('/api/bots'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetchJson(`/api/bots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bots'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/bots/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bots'] }),
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Bots e fluxos</h2>
          <p className="text-sm text-muted-foreground">
            Atendimento inicial automatizado com LLM. Apenas um fluxo fica ativo por vez (Fase 4).
          </p>
        </div>
        <Button onClick={() => setEditing('new')} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo bot
        </Button>
      </header>

      {flowsQuery.isLoading ? (
        <Skeleton />
      ) : (flowsQuery.data?.bots ?? []).length === 0 ? (
        <EmptyState onCreate={() => setEditing('new')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {flowsQuery.data!.bots.map((f) => (
            <li
              key={f.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/15 text-violet-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{f.name}</span>
                    {f.isActive ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(f.llmConfig?.provider ?? 'anthropic')}
                    {f.llmConfig?.model ? ` · ${f.llmConfig.model}` : ''}
                    {f.description ? ` · ${f.description}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={f.isActive ? 'secondary' : 'default'}
                  onClick={() => toggle.mutate({ id: f.id, isActive: !f.isActive })}
                  className="gap-1.5"
                >
                  <Power className="h-3.5 w-3.5" />
                  {f.isActive ? 'Desativar' : 'Ativar'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditing(f)}>
                  Editar
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)} aria-label="Excluir">
                  <Trash2 className="h-4 w-4 text-rose-400" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BotEditor
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['bots'] });
        }}
      />
    </section>
  );
}

function Skeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 2 }).map((_, i) => (
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
      <Bot className="h-8 w-8 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Sem bots configurados</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Crie um bot para que ele responda novas conversas usando o LLM configurado. Ele faz handoff
          para humano quando necessário.
        </p>
      </div>
      <Button onClick={onCreate} className="gap-1.5">
        <Plus className="h-4 w-4" /> Criar bot
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------

function BotEditor({
  target,
  onClose,
  onSaved,
}: {
  target: BotFlow | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!target;
  const isNew = target === 'new';
  const existing = target && target !== 'new' ? target : null;

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [systemPrompt, setSystemPrompt] = React.useState(DEFAULT_PROMPT);
  const [provider, setProvider] = React.useState<Provider>('anthropic');
  const [model, setModel] = React.useState('');
  const [handoffKeywords, setHandoffKeywords] = React.useState('atendente humano, falar com humano, humano');
  const [isActive, setIsActive] = React.useState(false);

  React.useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setSystemPrompt(existing.definition?.systemPrompt ?? DEFAULT_PROMPT);
      setProvider((existing.llmConfig?.provider as Provider) ?? 'anthropic');
      setModel(existing.llmConfig?.model ?? '');
      setHandoffKeywords((existing.llmConfig?.handoffKeywords ?? []).join(', '));
      setIsActive(existing.isActive);
    } else if (isNew) {
      setName('Assistente inicial');
      setDescription('Triagem automática em todas as novas conversas');
      setSystemPrompt(DEFAULT_PROMPT);
      setProvider('anthropic');
      setModel('');
      setHandoffKeywords('atendente humano, falar com humano, humano');
      setIsActive(true);
    }
  }, [existing, isNew]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        description: description || undefined,
        systemPrompt,
        provider,
        model: model || undefined,
        handoffKeywords: handoffKeywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        isActive,
      };
      if (existing) {
        return fetchJson(`/api/bots/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      return fetchJson('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(existing ? 'Bot atualizado' : 'Bot criado');
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{existing ? `Editar — ${existing.name}` : 'Novo bot'}</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
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

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>System prompt</Label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              required
              className="rounded-md border border-input bg-surface-2 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="text-[10.5px] text-muted-foreground">
              O assistente verá esse prompt antes de cada turno. Já vem com ferramenta{' '}
              <code className="font-mono">handoff(reason)</code> disponível.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Provider</Label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="h-10 rounded-md border border-input bg-surface-2 px-3 text-sm"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
                <option value="groq">Groq (Llama)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Modelo (opcional)</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_MODEL[provider]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Handoff keywords (vírgula)</Label>
            <Input
              value={handoffKeywords}
              onChange={(e) => setHandoffKeywords(e.target.value)}
              placeholder="atendente humano, suporte humano, urgente"
            />
            <p className="text-[10.5px] text-muted-foreground">
              Se o cliente usar uma dessas palavras, a conversa é transferida sem chamar o LLM.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
            <span>Ativar este bot agora (desativa outros)</span>
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
              {existing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const DEFAULT_PROMPT = `Você é um assistente de atendimento ao cliente amigável, claro e objetivo.

Regras:
- Responda em português do Brasil, em até 3 frases.
- Se a pergunta exigir contexto que você não tem (ex.: dados internos, conta do cliente), peça desculpas e use a ferramenta \`handoff\` com uma razão curta.
- Se o cliente expressar frustração, transfira imediatamente via handoff.
- Nunca prometa prazos ou descontos. Nunca compartilhe links externos.
- Quando responder, seja específico — evite frases genéricas.`;

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.1-70b-versatile',
};
