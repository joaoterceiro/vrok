/**
 * Socket.IO event contracts shared between server (Next custom server + worker
 * publishing via Redis pub/sub) and client (browser).
 */
export type SocketEvents = {
  'conversation:new': { conversationId: string; channelId: string; contactId: string };
  'conversation:updated': {
    conversationId: string;
    fields: Partial<{
      status: string;
      assigneeId: string | null;
      teamId: string | null;
      unreadCount: number;
      lastMessagePreview: string;
      lastMessageAt: string;
    }>;
  };
  'message:new': {
    conversationId: string;
    messageId: string;
    direction: 'in' | 'out';
    contentType: string;
    body: string | null;
    sender: 'contact' | 'user' | 'bot' | 'system';
    createdAt: string;
  };
  'message:status': {
    conversationId: string;
    messageId: string;
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  };
  'typing:start': { conversationId: string; userId?: string; contactId?: string };
  'typing:stop': { conversationId: string; userId?: string; contactId?: string };
  'presence:update': { userId: string; status: 'available' | 'busy' | 'offline' };
  'campaign:progress': {
    campaignId: string;
    counters: Record<string, number>;
    status: string;
  };
};

export type SocketEventName = keyof SocketEvents;

/** Redis pub/sub channel naming. */
export const REDIS_CHANNELS = {
  socketBroadcast: 'zora:socket',
} as const;

export const SOCKET_ROOMS = {
  conversation: (id: string) => `conversation:${id}`,
  team: (id: string) => `team:${id}`,
  user: (id: string) => `user:${id}`,
  all: 'all',
} as const;
