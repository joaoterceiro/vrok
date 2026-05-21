'use client';

import * as React from 'react';
import {
  Bot,
  CheckCircle2,
  Clock,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  UserPlus,
  Users,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConversationMutation } from '@/hooks/use-conversation-mutations';
import { initials } from '@/lib/utils';

interface Props {
  conversationId: string;
  status: 'open' | 'pending' | 'resolved' | 'snoozed';
  assigneeId: string | null;
  teamId: string | null;
  agentId: string | null;
  botPausedAt: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  avatar: string | null;
  isTemplate: boolean;
  isDefault: boolean;
  isActive: boolean;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  status: string;
  role: string;
  isActive: boolean;
}
interface TeamRow {
  id: string;
  name: string;
  color: string;
}

async function fetchJson<T>(input: string): Promise<T> {
  const res = await fetch(input, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function ConversationHeaderActions({
  conversationId,
  status,
  assigneeId,
  teamId,
  agentId,
  botPausedAt,
}: Props) {
  const session = useSession();
  const qc = useQueryClient();
  const mutation = useConversationMutation(conversationId);
  const isPending = mutation.isPending;

  const agents = useQuery({
    queryKey: ['ai-agents'],
    queryFn: () => fetchJson<{ agents: AgentRow[] }>('/api/ai-agents'),
    staleTime: 60_000,
  });

  const agentMutation = useMutation({
    mutationFn: (input: { agentId?: string | null; paused?: boolean }) =>
      fetch(`/api/conversations/${conversationId}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });

  const runAgent = (input: Parameters<typeof agentMutation.mutateAsync>[0], label: string) =>
    agentMutation
      .mutateAsync(input)
      .then(() => toast.success(label))
      .catch((e) => toast.error(`Falha: ${(e as Error).message}`));

  const isPaused = !!botPausedAt;

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson<{ users: UserRow[] }>('/api/users'),
    staleTime: 60_000,
  });
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => fetchJson<{ teams: TeamRow[] }>('/api/teams'),
    staleTime: 60_000,
  });

  const run = (input: Parameters<typeof mutation.mutateAsync>[0], label: string) =>
    mutation
      .mutateAsync(input)
      .then(() => toast.success(label))
      .catch((e) => toast.error(`Falha: ${(e as Error).message}`));

  const myId = session.data?.user?.id;
  const claimable = !assigneeId && !!myId;

  return (
    <>
      {/* Claim (self-assign) when unassigned */}
      {claimable && (
        <Button
          variant="default"
          size="sm"
          onClick={() => run({ assigneeId: myId! }, 'Conversa atribuída a você')}
          disabled={isPending}
          className="gap-1.5"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Atender</span>
        </Button>
      )}

      {/* Assign / Transfer */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Atribuir" disabled={isPending}>
            <Users className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Atribuir a atendente</DropdownMenuLabel>
          {users.data?.users
            ?.filter((u) => u.isActive)
            .slice(0, 12)
            .map((u) => (
              <DropdownMenuItem
                key={u.id}
                onSelect={() => run({ assigneeId: u.id }, `Atribuída a ${u.name ?? u.email}`)}
                className="gap-2"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[10px]">
                  {initials(u.name ?? u.email)}
                </span>
                <span className="truncate">{u.name ?? u.email}</span>
                {u.id === assigneeId && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-brand-400" />}
              </DropdownMenuItem>
            ))}
          <DropdownMenuItem onSelect={() => run({ assigneeId: null }, 'Conversa liberada')}>
            <XCircle className="h-3.5 w-3.5" /> Remover atribuição
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Transferir para time</DropdownMenuLabel>
          {teams.data?.teams?.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onSelect={() => run({ teamId: t.id, assigneeId: null }, `Transferida para ${t.name}`)}
              className="gap-2"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
              {t.id === teamId && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-brand-400" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status quick-actions */}
      {status !== 'resolved' ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => run({ status: 'resolved' }, 'Conversa resolvida')}
          aria-label="Resolver"
          disabled={isPending}
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => run({ status: 'open' }, 'Conversa reaberta')}
          aria-label="Reabrir"
          disabled={isPending}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais opções" disabled={isPending}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run({ status: 'pending' }, 'Marcada como pendente')}>
            <Clock className="h-3.5 w-3.5" /> Pendente
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              run(
                {
                  snoozedUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
                },
                'Adiada por 1h',
              )
            }
          >
            <Clock className="h-3.5 w-3.5" /> Adiar 1h
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              run(
                {
                  snoozedUntil: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
                },
                'Adiada por 24h',
              )
            }
          >
            <Clock className="h-3.5 w-3.5" /> Adiar 24h
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => run({ priority: 'urgent' }, 'Prioridade alta marcada')}>
            Marcar urgente
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-brand-400" /> Agente IA
          </DropdownMenuLabel>

          {isPaused ? (
            <DropdownMenuItem
              onSelect={() => runAgent({ paused: false }, 'Bot retomado')}
            >
              <Play className="h-3.5 w-3.5" /> Retomar bot
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => runAgent({ paused: true }, 'Bot pausado nesta conversa')}
            >
              <Pause className="h-3.5 w-3.5" /> Pausar bot
            </DropdownMenuItem>
          )}

          {agents.data?.agents
            ?.filter((a) => !a.isTemplate && a.isActive)
            .map((a) => (
              <DropdownMenuItem
                key={a.id}
                onSelect={() =>
                  runAgent({ agentId: a.id }, `Agente trocado para ${a.name}`)
                }
                className="gap-2"
              >
                <span className="text-base leading-none">{a.avatar ?? '🤖'}</span>
                <span className="truncate">{a.name}</span>
                {a.id === agentId && (
                  <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-brand-400" />
                )}
              </DropdownMenuItem>
            ))}

          {agentId && (
            <DropdownMenuItem
              onSelect={() => runAgent({ agentId: null }, 'Voltou ao agente padrão do canal')}
            >
              <Bot className="h-3.5 w-3.5" /> Usar padrão do canal
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
