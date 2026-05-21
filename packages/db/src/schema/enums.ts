import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'supervisor', 'agent']);
export const userStatus = pgEnum('user_status', ['available', 'busy', 'offline']);

export const channelType = pgEnum('channel_type', [
  'wa_evolution',
  'wa_cloud',
  'instagram',
  'telegram',
  'webchat',
  'email',
]);
export const channelStatus = pgEnum('channel_status', [
  'connecting',
  'connected',
  'disconnected',
  'error',
]);

export const conversationStatus = pgEnum('conversation_status', [
  'open',
  'pending',
  'resolved',
  'snoozed',
]);
export const conversationPriority = pgEnum('conversation_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

export const messageDirection = pgEnum('message_direction', ['in', 'out']);
export const messageSender = pgEnum('message_sender', ['contact', 'user', 'bot', 'system']);
export const messageContentType = pgEnum('message_content_type', [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'location',
  'contact',
  'template',
]);
export const messageStatus = pgEnum('message_status', [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
]);

export const tagScope = pgEnum('tag_scope', ['contact', 'conversation']);

export const templateCategory = pgEnum('template_category', ['marketing', 'utility', 'authentication']);
export const templateStatus = pgEnum('template_status', ['draft', 'pending', 'approved', 'rejected']);

export const audienceSource = pgEnum('audience_source', ['manual', 'csv', 'filter']);

export const campaignStatus = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'canceled',
]);

export const campaignMessageStatus = pgEnum('campaign_message_status', [
  'pending',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'opted_out',
]);

export const optOutSource = pgEnum('opt_out_source', ['keyword', 'manual', 'link']);
