import { z } from 'zod';

export const channelTypeSchema = z.enum([
  'wa_evolution',
  'wa_cloud',
  'instagram',
  'telegram',
  'webchat',
  'email',
]);

export const sendMessageInput = z.object({
  conversationId: z.string().uuid(),
  content: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().min(1).max(4096) }),
    z.object({
      type: z.literal('media'),
      mediaType: z.enum(['image', 'audio', 'video', 'document', 'sticker']),
      attachmentId: z.string().uuid(),
      caption: z.string().max(1024).optional(),
    }),
  ]),
});

export const createCampaignInput = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  channelId: z.string().uuid(),
  templateId: z.string().uuid(),
  audienceId: z.string().uuid(),
  variableMapping: z.record(z.string(), z.unknown()).default({}),
  scheduleAt: z.coerce.date().optional(),
  rateLimitPerMin: z.number().int().min(1).max(600).default(20),
  sendWindowStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  sendWindowEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export const createAudienceCsvRow = z.object({
  phone: z.string().min(8),
  name: z.string().optional(),
  email: z.string().email().optional(),
});

export const createTemplateInput = z.object({
  name: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9_]+$/, 'use snake_case, only lowercase a-z, 0-9, _'),
  channelType: channelTypeSchema,
  language: z.string().min(2).max(16).default('pt_BR'),
  category: z.enum(['marketing', 'utility', 'authentication']).default('utility'),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
  variables: z.array(z.string()).default([]),
});

export type SendMessageInput = z.infer<typeof sendMessageInput>;
export type CreateCampaignInput = z.infer<typeof createCampaignInput>;
export type CreateTemplateInput = z.infer<typeof createTemplateInput>;
