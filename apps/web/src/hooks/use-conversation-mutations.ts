'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface PatchInput {
  status?: 'open' | 'pending' | 'resolved' | 'snoozed';
  assigneeId?: string | null;
  teamId?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  snoozedUntil?: string | null;
}

async function patchConversation(id: string, input: PatchInput): Promise<unknown> {
  const res = await fetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function useConversationMutation(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchInput) => patchConversation(conversationId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
