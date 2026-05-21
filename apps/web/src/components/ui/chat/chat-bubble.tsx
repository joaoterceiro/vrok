'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, CheckCheck, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const chatBubbleVariants = cva('flex max-w-[78%] flex-col gap-1', {
  variants: {
    variant: {
      sent: 'self-end items-end',
      received: 'self-start items-start',
      system: 'self-center items-center max-w-[90%]',
    },
  },
  defaultVariants: { variant: 'received' },
});

export interface ChatBubbleProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof chatBubbleVariants> {}

export const ChatBubble = React.forwardRef<HTMLDivElement, ChatBubbleProps>(
  ({ className, variant, children, ...props }, ref) => (
    <div ref={ref} className={cn(chatBubbleVariants({ variant }), className)} {...props}>
      {children}
    </div>
  ),
);
ChatBubble.displayName = 'ChatBubble';

// ---- Avatar slot ---------------------------------------------

interface ChatBubbleAvatarProps {
  src?: string;
  fallback?: string;
  className?: string;
}

export function ChatBubbleAvatar({ src, fallback, className }: ChatBubbleAvatarProps) {
  return (
    <Avatar className={cn('h-7 w-7', className)}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>{fallback ?? '?'}</AvatarFallback>
    </Avatar>
  );
}

// ---- Message slot --------------------------------------------

const chatBubbleMessageVariants = cva(
  'relative whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
  {
    variants: {
      variant: {
        sent: 'rounded-br-md bg-surface-3 text-foreground',
        received: 'rounded-bl-md bg-surface-2 text-foreground',
        system: 'rounded-md bg-amber-950/40 px-3 py-1.5 text-xs text-amber-200',
      },
    },
    defaultVariants: { variant: 'received' },
  },
);

export interface ChatBubbleMessageProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof chatBubbleMessageVariants> {
  isLoading?: boolean;
}

export const ChatBubbleMessage = React.forwardRef<HTMLDivElement, ChatBubbleMessageProps>(
  ({ className, variant, isLoading, children, ...props }, ref) => (
    <div ref={ref} className={cn(chatBubbleMessageVariants({ variant }), className)} {...props}>
      {isLoading ? (
        <span className="inline-flex items-center gap-1" aria-label="digitando">
          <span className="inline-block h-1.5 w-1.5 animate-typing-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-typing-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-typing-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
        </span>
      ) : (
        children
      )}
    </div>
  ),
);
ChatBubbleMessage.displayName = 'ChatBubbleMessage';

// ---- Timestamp + status --------------------------------------

export type MessageDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export function ChatBubbleStatus({
  status,
  className,
}: {
  status?: MessageDeliveryStatus;
  className?: string;
}) {
  if (!status) return null;
  const map = {
    queued: { Icon: Clock, label: 'enviando', cls: 'text-muted-foreground' },
    sent: { Icon: Check, label: 'enviada', cls: 'text-muted-foreground' },
    delivered: { Icon: CheckCheck, label: 'entregue', cls: 'text-muted-foreground' },
    read: { Icon: CheckCheck, label: 'lida', cls: 'text-brand-400' },
    failed: { Icon: AlertCircle, label: 'falhou', cls: 'text-rose-400' },
  } as const;
  const { Icon, label, cls } = map[status];
  return (
    <span className={cn('inline-flex items-center', cls, className)} aria-label={label} title={label}>
      <Icon className="h-3 w-3" />
    </span>
  );
}

export function ChatBubbleMeta({
  time,
  status,
  className,
}: {
  time: string;
  status?: MessageDeliveryStatus;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1 text-[10.5px] text-muted-foreground tabular-nums',
        className,
      )}
    >
      <span>{time}</span>
      <ChatBubbleStatus status={status} />
    </div>
  );
}
