'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Paperclip } from 'lucide-react';
import { useSocketEvent } from '@/hooks/use-socket';
import {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleMeta,
  ChatMessageList,
  type MessageDeliveryStatus,
} from '@/components/ui/chat';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials, formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface ThreadMessage {
  id: string;
  direction: 'in' | 'out';
  sender: 'contact' | 'user' | 'bot' | 'system';
  body: string | null;
  contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'template' | 'contact';
  attachments?: Array<{ url: string; mime: string; filename?: string }>;
  status: MessageDeliveryStatus;
  createdAt: string;
  authorName?: string | null;
  authorAvatar?: string | null;
}

interface Props {
  contactName: string | null;
  contactAvatar: string | null;
  channelLabel: string;
  messages: ThreadMessage[];
  loading?: boolean;
  /** Composer slot — gets rendered sticky at the bottom. */
  composer: React.ReactNode;
  /** Optional action toolbar rendered in the header. */
  headerActions?: React.ReactNode;
  /** Back button URL — used on mobile/tablet when stacked. */
  backHref?: string;
  /** When set, the header shows "digitando…" while another operator types. */
  conversationId?: string;
}

export function MessageThread({
  contactName,
  contactAvatar,
  channelLabel,
  messages,
  loading,
  composer,
  headerActions,
  backHref = '/inbox',
  conversationId,
}: Props) {
  const someoneTyping = useTypingIndicator(conversationId);
  return (
    <div className="flex h-full flex-col">
      {/* Header --------------------------------------------------- */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={backHref}
            aria-label="Voltar para lista"
            className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground sm:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Avatar className="h-9 w-9">
            {contactAvatar ? <AvatarImage src={contactAvatar} alt="" /> : null}
            <AvatarFallback>{initials(contactName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">
              {contactName ?? 'Sem nome'}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {someoneTyping ? (
                <span className="inline-flex items-center gap-1.5 text-brand-300">
                  <TypingDots /> digitando…
                </span>
              ) : (
                channelLabel
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">{headerActions}</div>
      </header>

      {/* Messages ------------------------------------------------- */}
      {loading ? (
        <ThreadSkeleton />
      ) : messages.length === 0 ? (
        <EmptyThread />
      ) : (
        <ChatMessageList smooth>
          {groupByDay(messages).map((group) => (
            <React.Fragment key={group.day}>
              <DayDivider label={group.label} />
              {group.messages.map((m) => (
                <MessageItem key={m.id} m={m} />
              ))}
            </React.Fragment>
          ))}
        </ChatMessageList>
      )}

      {/* Composer ------------------------------------------------- */}
      <div className="safe-bottom shrink-0 border-t border-border bg-surface px-3 py-2 md:px-4 md:py-3">
        {composer}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------

function MessageItem({ m }: { m: ThreadMessage }) {
  const variant = m.direction === 'out' ? 'sent' : m.sender === 'system' ? 'system' : 'received';
  return (
    <ChatBubble variant={variant} className={cn('animate-fade-in')}>
      {m.body && (
        <ChatBubbleMessage variant={variant}>
          {m.body}
        </ChatBubbleMessage>
      )}
      {m.attachments?.map((a, i) => (
        <Attachment key={i} url={a.url} mime={a.mime} filename={a.filename} variant={variant} />
      ))}
      <ChatBubbleMeta time={formatTime(m.createdAt)} status={m.direction === 'out' ? m.status : undefined} />
    </ChatBubble>
  );
}

function Attachment({
  url,
  mime,
  filename,
  variant,
}: {
  url: string;
  mime: string;
  filename?: string;
  variant: 'sent' | 'received' | 'system';
}) {
  if (mime.startsWith('image/')) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'block max-w-xs overflow-hidden rounded-xl',
          variant === 'sent' ? 'rounded-br-md' : 'rounded-bl-md',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename ?? 'Imagem'}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  if (mime.startsWith('audio/')) {
    return <audio src={url} controls className="max-w-xs" />;
  }
  if (mime.startsWith('video/')) {
    return <video src={url} controls className="max-w-xs rounded-xl" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md bg-surface-3 px-3 py-2 text-xs text-foreground hover:bg-surface-2"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {filename ?? 'Documento'}
    </a>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center justify-center" aria-hidden>
      <span className="rounded-full bg-surface-2 px-3 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-2 px-4 py-4 md:px-6">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            'skeleton h-10 rounded-2xl',
            i % 2 === 0 ? 'max-w-[60%] self-start rounded-bl-md' : 'max-w-[55%] self-end rounded-br-md',
          )}
        />
      ))}
    </div>
  );
}

function EmptyThread() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
        <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
      <p className="max-w-[260px] text-xs text-muted-foreground">
        Envie a primeira mensagem para começar esta conversa.
      </p>
    </div>
  );
}

function groupByDay(messages: ThreadMessage[]) {
  const groups = new Map<string, { day: string; label: string; messages: ThreadMessage[] }>();
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const day = d.toISOString().slice(0, 10);
    let label: string;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (sameDay(d, today)) label = 'Hoje';
    else if (sameDay(d, yesterday)) label = 'Ontem';
    else label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!groups.has(day)) groups.set(day, { day, label, messages: [] });
    groups.get(day)!.messages.push(m);
  }
  return Array.from(groups.values());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ----- Typing indicator helpers -------------------------------------------

/**
 * Listens to `typing:start`/`typing:stop` for the given conversation and
 * returns `true` while at least one other operator is typing. Auto-expires
 * after 5s without a refresh so a missed `typing:stop` doesn't get stuck.
 */
function useTypingIndicator(conversationId?: string): boolean {
  const [activeAt, setActiveAt] = React.useState<number | null>(null);

  useSocketEvent<{ conversationId: string }>('typing:start', (data) => {
    if (data?.conversationId === conversationId) setActiveAt(Date.now());
  });
  useSocketEvent<{ conversationId: string }>('typing:stop', (data) => {
    if (data?.conversationId === conversationId) setActiveAt(null);
  });

  React.useEffect(() => {
    if (activeAt == null) return;
    const t = window.setTimeout(() => setActiveAt(null), 5000);
    return () => window.clearTimeout(t);
  }, [activeAt]);

  return activeAt != null;
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-pulse rounded-full bg-brand-400"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  );
}
