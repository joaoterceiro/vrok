'use client';

import * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import {
  ConversationList,
  type ConversationFilter,
} from '@/components/inbox/conversation-list';
import { useConversations } from '@/hooks/use-conversations';

interface Props {
  thread: React.ReactNode;
  details?: React.ReactNode;
  hasOpenConversation: boolean;
  activeConversationId?: string;
}

export function InboxShell({ thread, details, hasOpenConversation, activeConversationId }: Props) {
  // Default to "Todas" so imported chats show up on first load — "Minhas"
  // filters by assignee and looks empty for users who haven't claimed any.
  const [filter, setFilter] = React.useState<ConversationFilter>('all');
  const { data: conversations, isLoading } = useConversations(filter);

  return (
    <AppShell
      activeRail="inbox"
      hasOpenConversation={hasOpenConversation}
      list={
        <ConversationList
          conversations={conversations ?? []}
          activeId={activeConversationId}
          filter={filter}
          onFilterChange={setFilter}
          loading={isLoading}
        />
      }
      thread={thread}
      details={details}
    />
  );
}
