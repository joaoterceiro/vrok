'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { InboxShell } from '../_components/inbox-shell';
import { MessageThread, type ThreadMessage } from '@/components/inbox/message-thread';
import { Composer, type PendingAttachment } from '@/components/inbox/composer';
import { ContactPanelLive } from '@/components/inbox/contact-panel-live';
import { ConversationHeaderActions } from '@/components/inbox/conversation-header-actions';
import { useConversation } from '@/hooks/use-conversations';

const CHANNEL_LABEL: Record<string, string> = {
  wa_evolution: 'WhatsApp · Evolution',
  wa_cloud: 'WhatsApp · Cloud',
  instagram: 'Instagram Direct',
  telegram: 'Telegram',
  webchat: 'Webchat',
  email: 'Email',
};

interface SendInput {
  body: string;
  isNote: boolean;
  attachments: PendingAttachment[];
}

async function postMessage(conversationId: string, input: SendInput) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: input.body || undefined,
      isNote: input.isNote,
      attachments: input.attachments.map((a) => ({
        url: a.url,
        minioKey: a.minioKey,
        mime: a.mime,
        size: a.size,
        filename: a.filename,
      })),
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<unknown>;
}

export function ConversationPageClient({ conversationId }: { conversationId: string }) {
  const { data, isLoading, error } = useConversation(conversationId);
  const qc = useQueryClient();
  const router = useRouter();

  const send = useMutation({
    mutationFn: (input: SendInput) => postMessage(conversationId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });

  React.useEffect(() => {
    if (error && (error as { status?: number }).status === 404) {
      toast.error('Conversa não encontrada');
      router.replace('/inbox');
    }
  }, [error, router]);

  const messages: ThreadMessage[] = React.useMemo(
    () =>
      (data?.messages ?? []).map((m) => ({
        id: m.id,
        direction: m.direction,
        sender: m.sender,
        body: m.body,
        contentType: m.contentType,
        attachments: ((m.attachments ?? []) as Array<{ url: string; mime: string; filename?: string }>).map(
          (a) => ({ url: a.url, mime: a.mime, filename: a.filename }),
        ),
        status: m.status,
        createdAt: m.createdAt,
      })),
    [data?.messages],
  );

  const onSend = React.useCallback(
    async (input: SendInput) => {
      try {
        await send.mutateAsync(input);
        if (input.isNote) toast.success('Nota interna registrada');
      } catch (err) {
        toast.error(`Falha ao enviar: ${(err as Error).message}`);
      }
    },
    [send],
  );

  const conv = data?.conversation;

  return (
    <InboxShell
      hasOpenConversation
      activeConversationId={conversationId}
      thread={
        <MessageThread
          conversationId={conversationId}
          contactName={conv?.contact.name ?? null}
          contactAvatar={conv?.contact.avatarUrl ?? null}
          channelLabel={
            conv
              ? `${CHANNEL_LABEL[conv.channel.type] ?? 'Canal'}${conv.channel.name ? ` · ${conv.channel.name}` : ''}`
              : 'Canal'
          }
          messages={messages}
          loading={isLoading}
          composer={
            <Composer
              onSend={onSend}
              disabled={send.isPending}
              conversationId={conversationId}
            />
          }
          headerActions={
            conv ? (
              <ConversationHeaderActions
                conversationId={conversationId}
                status={(conv.status ?? 'open') as 'open' | 'pending' | 'resolved' | 'snoozed'}
                assigneeId={conv.assigneeId ?? null}
                teamId={conv.teamId ?? null}
                agentId={(conv as { agentId?: string | null }).agentId ?? null}
                botPausedAt={(conv as { botPausedAt?: string | null }).botPausedAt ?? null}
              />
            ) : null
          }
        />
      }
      details={
        <ContactPanelLive
          conversationId={conversationId}
          contact={conv?.contact ?? null}
          initialTags={data?.tags ?? []}
          initialNotes={data?.notes ?? []}
        />
      }
    />
  );
}
