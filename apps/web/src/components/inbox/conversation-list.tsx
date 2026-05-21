'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, Filter, Plus, Inbox as InboxIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVirtualizer } from '@tanstack/react-virtual';
import { initials, relativeTime } from '@/lib/utils';

export type ConversationFilter = 'mine' | 'unassigned' | 'team' | 'resolved' | 'all';

export interface ConversationListItem {
  id: string;
  contactName: string | null;
  avatarUrl: string | null;
  channelType: 'wa_evolution' | 'wa_cloud' | 'instagram' | 'telegram' | 'webchat' | 'email';
  /** Human-readable channel/instance name (e.g. "WhatsApp · Loja Centro"). */
  channelName?: string | null;
  preview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  status: 'open' | 'pending' | 'resolved' | 'snoozed';
  isOverdueSla?: boolean;
}

interface Props {
  conversations: ConversationListItem[];
  activeId?: string | null;
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  loading?: boolean;
}

const FILTERS: Array<{ id: ConversationFilter; label: string }> = [
  { id: 'mine', label: 'Minhas' },
  { id: 'unassigned', label: 'Não atribuídas' },
  { id: 'team', label: 'Time' },
  { id: 'resolved', label: 'Resolvidas' },
  { id: 'all', label: 'Todas' },
];

export function ConversationList({
  conversations,
  activeId,
  filter,
  onFilterChange,
  loading,
}: Props) {
  const [search, setSearch] = React.useState('');

  const visible = React.useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contactName?.toLowerCase().includes(q) || c.preview?.toLowerCase().includes(q),
    );
  }, [conversations, search]);

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border bg-surface px-3 pb-3 pt-3 md:px-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-medium tracking-tight">Conversas</h2>
          <Button size="icon" variant="ghost" aria-label="Nova conversa" className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, telefone…"
            className="h-9 bg-surface-2 pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar conversas"
          />
        </div>

        <div className="-mx-1 flex items-center gap-1 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                filter === f.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <ScrollArea className="flex-1">
          <ListSkeleton />
        </ScrollArea>
      ) : visible.length === 0 ? (
        <div className="flex-1">
          <EmptyState filter={filter} />
        </div>
      ) : visible.length < 50 ? (
        <ScrollArea className="flex-1">
          <ul className="flex flex-col">
            {visible.map((c) => (
              <ConversationRow key={c.id} item={c} active={activeId === c.id} />
            ))}
          </ul>
        </ScrollArea>
      ) : (
        <VirtualConversationList
          items={visible}
          activeId={activeId}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------

function ConversationRow({ item, active }: { item: ConversationListItem; active?: boolean }) {
  const channelMark = CHANNEL_DOT[item.channelType];
  return (
    <li>
      <Link
        href={`/inbox/${item.id}`}
        className={cn(
          'group relative flex items-start gap-3 border-l-2 px-3 py-3 transition-colors md:px-4',
          active
            ? 'border-l-primary bg-surface-2'
            : 'border-l-transparent hover:bg-surface-2/60',
        )}
        aria-current={active ? 'page' : undefined}
      >
        <div className="relative">
          <Avatar className="h-10 w-10">
            {item.avatarUrl ? <AvatarImage src={item.avatarUrl} alt="" /> : null}
            <AvatarFallback>{initials(item.contactName)}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface',
              channelMark,
            )}
            aria-label={item.channelName ?? CHANNEL_LABEL[item.channelType]}
            title={
              item.channelName
                ? `${CHANNEL_LABEL[item.channelType]} · ${item.channelName}`
                : CHANNEL_LABEL[item.channelType]
            }
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'truncate text-sm',
                item.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-foreground/90',
              )}
            >
              {item.contactName ?? 'Sem nome'}
            </span>
            {item.lastMessageAt && (
              <span
                className={cn(
                  'shrink-0 text-[10.5px] tabular-nums',
                  item.unreadCount > 0 ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {relativeTime(item.lastMessageAt)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {item.preview ?? <span className="italic">Sem mensagens ainda</span>}
            </p>
            {item.unreadCount > 0 && (
              <span className="ml-2 inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1">
            {item.channelName && (
              <span className="inline-flex h-4 items-center gap-1 rounded-full bg-surface-2 px-1.5 text-[10px] font-medium text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', channelMark)} />
                {item.channelName}
              </span>
            )}
            {item.isOverdueSla && (
              <span className="inline-flex h-4 items-center rounded-full bg-rose-500/15 px-1.5 text-[10px] font-medium text-rose-400">
                SLA estourado
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-3 py-3 md:px-4">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ filter }: { filter: ConversationFilter }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
        <InboxIcon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <p className="font-display text-base font-medium tracking-tight text-foreground">
        {filter === 'mine'
          ? 'Nenhuma conversa atribuída'
          : filter === 'unassigned'
            ? 'Nada na fila'
            : filter === 'resolved'
              ? 'Nada por aqui'
              : 'Nenhuma conversa ainda'}
      </p>
      <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">
        {filter === 'mine'
          ? 'Quando uma conversa for atribuída a você, ela aparecerá aqui.'
          : filter === 'unassigned'
            ? 'Conversas que ninguém pegou aparecem aqui em tempo real.'
            : filter === 'resolved'
              ? 'Conversas finalizadas ficam guardadas neste filtro.'
              : 'Conecte um canal em ⚙ Canais para começar a receber mensagens.'}
      </p>
    </div>
  );
}

// Channel color dots — small reminder of channel identity.
const CHANNEL_DOT: Record<ConversationListItem['channelType'], string> = {
  wa_evolution: 'bg-brand-500',
  wa_cloud: 'bg-brand-600',
  instagram: 'bg-gradient-to-br from-pink-500 to-orange-400',
  telegram: 'bg-sky-500',
  webchat: 'bg-violet-500',
  email: 'bg-zinc-400',
};
const CHANNEL_LABEL: Record<ConversationListItem['channelType'], string> = {
  wa_evolution: 'WhatsApp (Evolution)',
  wa_cloud: 'WhatsApp Cloud',
  instagram: 'Instagram',
  telegram: 'Telegram',
  webchat: 'Webchat',
  email: 'Email',
};

// ----- Virtualized list (used at > 50 items) ------------------------------

/**
 * Renders only the conversation rows visible in the viewport. Each row is
 * estimated at 76px (avatar + 2 lines + channel chip + padding); the
 * virtualizer measures real heights and corrects on the fly. Keeps memory
 * + DOM flat regardless of inbox size — important for orgs with thousands
 * of historical chats.
 */
function VirtualConversationList({
  items,
  activeId,
}: {
  items: ConversationListItem[];
  activeId?: string | null;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <ul
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]!;
          return (
            <div
              key={item.id}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className="absolute left-0 right-0 top-0"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <ConversationRow item={item} active={activeId === item.id} />
            </div>
          );
        })}
      </ul>
    </div>
  );
}
