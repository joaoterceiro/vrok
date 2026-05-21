import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, channels } from '@zora/db';
import { encryptConfig, encryptString } from '@zora/shared';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await db
    .select({
      id: channels.id,
      type: channels.type,
      name: channels.name,
      status: channels.status,
      defaultTeamId: channels.defaultTeamId,
      lastConnectedAt: channels.lastConnectedAt,
      createdAt: channels.createdAt,
      config: channels.config,
      syncStatus: channels.syncStatus,
      syncProgress: channels.syncProgress,
      syncStartedAt: channels.syncStartedAt,
      syncCompletedAt: channels.syncCompletedAt,
      syncError: channels.syncError,
    })
    .from(channels)
    .orderBy(channels.createdAt);

  return NextResponse.json({
    channels: rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      status: r.status,
      defaultTeamId: r.defaultTeamId,
      lastConnectedAt: r.lastConnectedAt,
      createdAt: r.createdAt,
      summary: summarize(r.type, r.config as Record<string, unknown>),
      syncStatus: r.syncStatus,
      syncProgress: r.syncProgress,
      syncStartedAt: r.syncStartedAt,
      syncCompletedAt: r.syncCompletedAt,
      syncError: r.syncError,
    })),
  });
}

function summarize(type: string, config: Record<string, unknown>): string | null {
  if (type === 'wa_evolution') return (config.instanceName as string) ?? null;
  if (type === 'wa_cloud') return (config.phoneNumberId as string) ?? null;
  if (type === 'instagram') return (config.igBusinessAccountId as string) ?? null;
  if (type === 'telegram') return 'Bot conectado';
  if (type === 'webchat') return 'Widget público';
  if (type === 'email') return typeof config.fromAddress === 'string' ? config.fromAddress : null;
  return null;
}

const evolutionInput = z.object({
  type: z.literal('wa_evolution'),
  name: z.string().min(2).max(120),
  instanceName: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/i),
  /** Opcional: se omitido, usamos EVOLUTION_API_KEY do servidor. */
  apiKey: z.string().min(8).optional(),
  defaultTeamId: z.string().uuid().nullable().optional(),
});

const waCloudInput = z.object({
  type: z.literal('wa_cloud'),
  name: z.string().min(2).max(120),
  phoneNumberId: z.string().min(2),
  wabaId: z.string().optional(),
  accessToken: z.string().min(10),
  verifyToken: z.string().min(6),
  appSecret: z.string().optional(),
  defaultTeamId: z.string().uuid().nullable().optional(),
});

const instagramInput = z.object({
  type: z.literal('instagram'),
  name: z.string().min(2).max(120),
  igBusinessAccountId: z.string().min(2),
  accessToken: z.string().min(10),
  verifyToken: z.string().min(6),
  appSecret: z.string().optional(),
  defaultTeamId: z.string().uuid().nullable().optional(),
});

const telegramInput = z.object({
  type: z.literal('telegram'),
  name: z.string().min(2).max(120),
  botToken: z.string().min(20),
  webhookSecret: z.string().min(8).optional(),
  defaultTeamId: z.string().uuid().nullable().optional(),
});

const webchatInput = z.object({
  type: z.literal('webchat'),
  name: z.string().min(2).max(120),
  greeting: z.string().max(280).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  defaultTeamId: z.string().uuid().nullable().optional(),
});

const emailInput = z.object({
  type: z.literal('email'),
  name: z.string().min(2).max(120),
  fromAddress: z.string().email(),
  fromName: z.string().max(120).optional(),
  smtp: z.object({
    host: z.string().min(2),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    user: z.string().min(1),
    password: z.string().min(1),
  }),
  imap: z.object({
    host: z.string().min(2),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    user: z.string().min(1),
    password: z.string().min(1),
  }),
  defaultTeamId: z.string().uuid().nullable().optional(),
});

const createSchema = z.discriminatedUnion('type', [
  evolutionInput,
  waCloudInput,
  instagramInput,
  telegramInput,
  webchatInput,
  emailInput,
]);

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const config = buildConfig(input);

  const [created] = await db
    .insert(channels)
    .values({
      type: input.type,
      name: input.name,
      config,
      status: input.type === 'webchat' ? 'connected' : 'disconnected',
      defaultTeamId: input.defaultTeamId ?? null,
    })
    .returning({ id: channels.id, name: channels.name, type: channels.type, status: channels.status });

  return NextResponse.json({ channel: created });
}

function buildConfig(input: z.infer<typeof createSchema>): Record<string, unknown> {
  switch (input.type) {
    case 'wa_evolution': {
      // Fallback to the server-wide EVOLUTION_API_KEY so the operator doesn't
      // need to paste secrets in the UI when self-hosting.
      const apiKey = input.apiKey ?? process.env.EVOLUTION_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Evolution API key não configurada. Defina EVOLUTION_API_KEY no servidor ou informe no form.',
        );
      }
      return encryptConfig(
        { instanceName: input.instanceName, apiKey },
        ['apiKey'],
      );
    }
    case 'wa_cloud':
      return encryptConfig(
        {
          phoneNumberId: input.phoneNumberId,
          wabaId: input.wabaId,
          accessToken: input.accessToken,
          verifyToken: input.verifyToken,
          appSecret: input.appSecret,
        },
        ['accessToken', 'verifyToken', 'appSecret'],
      );
    case 'instagram':
      return encryptConfig(
        {
          igBusinessAccountId: input.igBusinessAccountId,
          accessToken: input.accessToken,
          verifyToken: input.verifyToken,
          appSecret: input.appSecret,
        },
        ['accessToken', 'verifyToken', 'appSecret'],
      );
    case 'telegram':
      return encryptConfig(
        { botToken: input.botToken, webhookSecret: input.webhookSecret },
        ['botToken', 'webhookSecret'],
      );
    case 'webchat':
      return {
        widgetTheme: {
          primary: input.primaryColor ?? '#fa4374',
          greeting: input.greeting ?? 'Olá! Como podemos ajudar?',
        },
      };
    case 'email':
      return {
        fromAddress: input.fromAddress,
        fromName: input.fromName,
        smtp: {
          host: input.smtp.host,
          port: input.smtp.port,
          secure: input.smtp.secure,
          user: encryptString(input.smtp.user),
          password: encryptString(input.smtp.password),
        },
        imap: {
          host: input.imap.host,
          port: input.imap.port,
          secure: input.imap.secure,
          user: encryptString(input.imap.user),
          password: encryptString(input.imap.password),
        },
      };
  }
}
