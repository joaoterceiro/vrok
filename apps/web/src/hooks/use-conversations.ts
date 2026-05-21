'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocketEvent, useSocketRoom } from './use-socket';
import type { ConversationListItem } from '@/components/inbox/conversation-list';
import type { ThreadMessage } from '@/components/inbox/message-thread';
import type { MessageDeliveryStatus } from '@/components/ui/chat';

interface ConversationsResponse {
  conversations: Array<{
    id: string;
    status: string;
    unreadCount: number;
    lastMessageAt: string | null;
    lastMessagePreview: string | null;
    slaDueAt: string | null;
    contact: {
      id: string;
      name: string | null;
      avatarUrl: string | null;
      phone: string | null;
      email: string | null;
    };
    channel: { id: string; type: ConversationListItem['channelType']; name: string };
  }>;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function useConversations(filter: 'mine' | 'unassigned' | 'team' | 'resolved' | 'all' = 'all') {
  const qc = useQueryClient();

  const query = useQuery<ConversationListItem[]>({
    queryKey: ['conversations', filter],
    queryFn: async () => {
      const data = await fetchJson<ConversationsResponse>(`/api/conversations?filter=${filter}`);
      return data.conversations.map((c) => ({
        id: c.id,
        contactName: c.contact.name,
        avatarUrl: c.contact.avatarUrl,
        channelType: c.channel.type,
        channelName: c.channel.name,
        preview: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
        status: c.status as ConversationListItem['status'],
        isOverdueSla: c.slaDueAt ? new Date(c.slaDueAt).getTime() < Date.now() : false,
      }));
    },
    refetchInterval: 60_000,
  });

  // Realtime updates: any change invalidates the list (cheap, the query is small).
  useSocketRoom('all');
  useSocketEvent(
    'conversation:new',
    () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    [qc],
  );
  useSocketEvent(
    'conversation:updated',
    () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    [qc],
  );

  return query;
}

interface ConversationDetailResponse {
  conversation: {
    id: string;
    status: 'open' | 'pending' | 'resolved' | 'snoozed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    teamId: string | null;
    assigneeId: string | null;
    unreadCount: number;
    lastMessageAt: string | null;
    contact: { name: string | null; avatarUrl: string | null; phone: string | null; email: string | null };
    channel: { type: ConversationListItem['channelType']; name: string };
  };
  messages: Array<{
    id: string;
    direction: 'in' | 'out';
    sender: 'contact' | 'user' | 'bot' | 'system';
    contentType: ThreadMessage['contentType'];
    body: string | null;
    attachments: unknown[];
    status: MessageDeliveryStatus;
    createdAt: string;
  }>;
  tags: Array<{ id: string; name: string; color: string }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorId: string | null;
    authorName: string | null;
  }>;
}

export function useConversation(id: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    enabled: !!id,
    queryKey: ['conversation', id],
    queryFn: () => fetchJson<ConversationDetailResponse>(`/api/conversations/${id}`),
  });

  useSocketRoom(id ? `conversation:${id}` : undefined);

  useSocketEvent<{
    conversationId: string;
    messageId: string;
    direction: 'in' | 'out';
    contentType: ThreadMessage['contentType'];
    body: string | null;
    sender: 'contact' | 'user' | 'bot' | 'system';
    createdAt: string;
  }>(
    'message:new',
    (msg) => {
      if (msg.conversationId !== id) return;
      qc.setQueryData(['conversation', id], (prev: ConversationDetailResponse | undefined) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.messageId)) return prev;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: msg.messageId,
              direction: msg.direction,
              sender: msg.sender,
              contentType: msg.contentType,
              body: msg.body,
              attachments: [],
              status: 'sent',
              createdAt: msg.createdAt,
            },
          ],
        };
      });
    },
    [id, qc],
  );

  useSocketEvent<{
    conversationId: string;
    messageId: string;
    status: MessageDeliveryStatus;
  }>(
    'message:status',
    (evt) => {
      if (evt.conversationId !== id) return;
      qc.setQueryData(['conversation', id], (prev: ConversationDetailResponse | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === evt.messageId ? { ...m, status: evt.status } : m,
          ),
        };
      });
    },
    [id, qc],
  );

  return query;
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; isNote?: boolean }) => {
      return fetchJson<{ message: { id: string } }>(
        `/api/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}
