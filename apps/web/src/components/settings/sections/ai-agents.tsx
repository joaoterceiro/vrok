'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Loader2, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Provider = 'anthropic' | 'openai' | 'groq';

interface Agent {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  avatar: string | null;
  persona: Record<string, unknown>;
  systemPrompt: string;
  greeting: string | null;
  llmConfig: { provider?: Provider; model?: string; temperature?: number; maxTokens?: number; handoffKeywords?: string[] };
  toolsEnabled: string[];
  isTemplate: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  assignedChannels?: number;
}

interface Channel {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface Assignment {
  channelId: string;
  priority: number;
  channelName: string | null;
  channelType: string | null;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function AiAgentsSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<Agent | 'new' | null>(null);
  const [cloneFrom, setCloneFrom] = React.useState<Agent | null>(null);

  const agentsQuery = useQuery<{ agents: Agent[] }>({
    queryKey: ['ai-agents'],
    queryFn: () => fetchJson('/api/ai-agents'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/ai-agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-agents'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/ai-agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      }),
    onSuccess: () => {
      toast.success('Agente definido como padrão');
      qc.invalidateQueries({ queryKey: ['ai-agents'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const templates = (agentsQuery.data?.agents ?? []).filter((a) => a.isTemplate);
  const userAgents = (agentsQuery.data?.agents ?? []).filter((a) => !a.isTemplate);

  return (
    <section className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-medium tracking-tight">Agentes IA</h2>
          <p className="text-sm text-muted-foreground">
            Crie agentes com personas próprias e atribua a canais específicos. O agente padrão
            responde quando nenhum agente está atribuído ao canal.
          </p>
        </div>
        <Button onClick={() => setEditing('new')} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo agente
        </Button>
      </header>

      {agentsQuery.isLoading ? (
        <Skeleton />
      ) : (
        <>
          {/* User-created agents */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Meus agentes
              </h3>
              <span className="text-xs text-muted-foreground">({userAgents.length})</span>
            </div>
            {userAgents.length === 0 ? (
              <EmptyState onCreate={() => setEditing('new')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {userAgents.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    onEdit={() => setEditing(a)}
                    onDelete={() => remove.mutate(a.id)}
                    onMakeDefault={() => setDefault.mutate(a.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <Separator className="bg-border/60" />

          {/* Templates gallery */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Templates prontos
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {templates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  agent={tpl}
                  onUse={() => setCloneFrom(tpl)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <AgentEditor
        target={editing}
        cloneFrom={cloneFrom}
        onClose={() => {
          setEditing(null);
          setCloneFrom(null);
        }}
        onSaved={() => {
          setEditing(null);
          setCloneFrom(null);
          qc.invalidateQueries({ queryKey: ['ai-agents'] });
        }}
      />
    </section>
  );
}

// ----------------------------------------------------------------

function AgentRow({
  agent,
  onEdit,
  onDelete,
  onMakeDefault,
}: {
  agent: Agent;
  onEdit: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-500/15 text-lg">
          {agent.avatar ?? <Bot className="h-5 w-5 text-brand-400" />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{agent.name}</span>
            {agent.isDefault && (
              <Badge variant="default" className="gap-1">
                <Star className="h-3 w-3" /> Padrão
              </Badge>
            )}
            {!agent.isActive && <Badge variant="secondary">Inativo</Badge>}
            {(agent.assignedChannels ?? 0) > 0 && (
              <Badge variant="secondary">
                {agent.assignedChannels} canal{agent.assignedChannels === 1 ? '' : 'is'}
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {agent.llmConfig?.provider ?? 'anthropic'}
            {agent.llmConfig?.model ? ` · ${agent.llmConfig.model}` : ''}
            {agent.description ? ` · ${agent.description}` : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!agent.isDefault && (
          <Button size="sm" variant="ghost" onClick={onMakeDefault} className="gap-1">
            <Star className="h-3.5 w-3.5" /> Definir padrão
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Excluir">
          <Trash2 className="h-4 w-4 text-rose-400" />
        </Button>
      </div>
    </li>
  );
}

function TemplateCard({ agent, onUse }: { agent: Agent; onUse: () => void }) {
  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-brand-500/40 hover:bg-surface-2/60">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-xl">
          {agent.avatar ?? '🤖'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-medium">{agent.name}</h4>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              template
            </Badge>
          </div>
          {agent.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {agent.description}
            </p>
          )}
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={onUse} className="self-end gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Usar template
      </Button>
    </div>
  );
}

function Skeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
        >
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
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
      <Bot className="h-8 w-8 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Nenhum agente criado</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Clone um template abaixo para começar, ou crie um agente do zero.
        </p>
      </div>
      <Button onClick={onCreate} variant="secondary" className="gap-1.5">
        <Plus className="h-4 w-4" /> Criar do zero
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------

function AgentEditor({
  target,
  cloneFrom,
  onClose,
  onSaved,
}: {
  target: Agent | 'new' | null;
  cloneFrom: Agent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!target || !!cloneFrom;
  const existing = target && target !== 'new' ? target : null;
  const source = existing ?? cloneFrom;

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [avatar, setAvatar] = React.useState('');
  const [systemPrompt, setSystemPrompt] = React.useState('');
  const [greeting, setGreeting] = React.useState('');
  const [provider, setProvider] = React.useState<Provider>('anthropic');
  const [model, setModel] = React.useState('');
  const [temperature, setTemperature] = React.useState(0.4);
  const [handoffKeywords, setHandoffKeywords] = React.useState('atendente humano, falar com humano, humano');
  const [selectedChannels, setSelectedChannels] = React.useState<Set<string>>(new Set());

  const channelsQuery = useQuery<{ channels: Channel[] }>({
    queryKey: ['channels'],
    queryFn: () => fetchJson('/api/channels'),
    enabled: open,
  });

  const assignmentsQuery = useQuery<{ assignments: Assignment[] }>({
    queryKey: ['ai-agent-assignments', existing?.id],
    queryFn: () => fetchJson(`/api/ai-agents/${existing!.id}`),
    enabled: open && !!existing,
  });

  // Hydrate form from source (existing or template clone).
  React.useEffect(() => {
    if (!open) return;
    if (source) {
      setName(cloneFrom ? `${source.name} (cópia)` : source.name);
      setDescription(source.description ?? '');
      setAvatar(source.avatar ?? '');
      setSystemPrompt(source.systemPrompt);
      setGreeting(source.greeting ?? '');
      setProvider(source.llmConfig?.provider ?? 'anthropic');
      setModel(source.llmConfig?.model ?? '');
      setTemperature(source.llmConfig?.temperature ?? 0.4);
      setHandoffKeywords((source.llmConfig?.handoffKeywords ?? []).join(', '));
    } else {
      setName('');
      setDescription('');
      setAvatar('');
      setSystemPrompt('Você é um atendente virtual. Responda em português do Brasil, em até 2 frases. Quando o assunto for complexo, use a ferramenta `handoff`.');
      setGreeting('');
      setProvider('anthropic');
      setModel('');
      setTemperature(0.4);
      setHandoffKeywords('atendente humano, falar com humano, humano');
    }
    // existing agent's channel assignments are loaded async below.
    if (!existing) setSelectedChannels(new Set());
  }, [open, source?.id, cloneFrom?.id]);

  React.useEffect(() => {
    if (assignmentsQuery.data) {
      setSelectedChannels(new Set(assignmentsQuery.data.assignments.map((a) => a.channelId)));
    }
  }, [assignmentsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description: description || null,
        avatar: avatar || null,
        systemPrompt,
        greeting: greeting || null,
        llmConfig: {
          provider,
          ...(model ? { model } : {}),
          temperature,
          handoffKeywords: handoffKeywords
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        toolsEnabled: ['handoff'],
        ...(cloneFrom && !existing ? { fromTemplateId: cloneFrom.id } : {}),
      };
      const agent = existing
        ? await fetchJson<{ agent: Agent }>(`/api/ai-agents/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetchJson<{ agent: Agent }>(`/api/ai-agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      // Push channel assignments.
      await fetchJson(`/api/ai-agents/${agent.agent.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: Array.from(selectedChannels), priority: 0 }),
      });
      return agent;
    },
    onSuccess: () => {
      toast.success(existing ? 'Agente atualizado' : 'Agente criado');
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleChannel = (id: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? 'Editar agente' : cloneFrom ? `Clonar de "${cloneFrom.name}"` : 'Novo agente'}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div className="space-y-1">
              <Label htmlFor="avatar">Avatar</Label>
              <Input
                id="avatar"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="🤖"
                className="text-center text-xl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Triagem inicial"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que esse agente faz?"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="greeting">Saudação inicial (opcional)</Label>
            <Input
              id="greeting"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Olá! Como posso ajudar?"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="prompt">System prompt</Label>
            <textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed focus:border-brand-500 focus:outline-none"
            />
          </div>

          <Separator className="bg-border/60" />

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Provedor</Label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="model">Modelo</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="temp">Temperatura</Label>
              <Input
                id="temp"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="handoff">Palavras de handoff (separadas por vírgula)</Label>
            <Input
              id="handoff"
              value={handoffKeywords}
              onChange={(e) => setHandoffKeywords(e.target.value)}
            />
          </div>

          <Separator className="bg-border/60" />

          <div className="space-y-2">
            <Label>Canais atribuídos</Label>
            <p className="text-xs text-muted-foreground">
              Esse agente responde mensagens recebidas nos canais marcados abaixo. Sem nenhum
              canal selecionado, o agente fica disponível apenas via override por conversa ou como
              padrão da organização.
            </p>
            <div className="flex flex-wrap gap-2">
              {(channelsQuery.data?.channels ?? []).map((ch) => {
                const selected = selectedChannels.has(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => toggleChannel(ch.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition ${
                      selected
                        ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                        : 'border-border bg-surface text-muted-foreground hover:border-border-strong'
                    }`}
                  >
                    {ch.name}
                  </button>
                );
              })}
              {(channelsQuery.data?.channels ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Nenhum canal cadastrado ainda.
                </span>
              )}
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !systemPrompt}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
