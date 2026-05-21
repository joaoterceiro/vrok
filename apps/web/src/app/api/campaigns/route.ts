import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  campaigns,
  channels,
  messageTemplates,
  audiences,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      totalRecipients: campaigns.totalRecipients,
      counters: campaigns.counters,
      scheduleAt: campaigns.scheduleAt,
      startedAt: campaigns.startedAt,
      completedAt: campaigns.completedAt,
      createdAt: campaigns.createdAt,
      channel: { id: channels.id, name: channels.name, type: channels.type },
      template: { id: messageTemplates.id, name: messageTemplates.name },
      audience: { id: audiences.id, name: audiences.name, contactCount: audiences.contactCount },
    })
    .from(campaigns)
    .leftJoin(channels, eq(channels.id, campaigns.channelId))
    .leftJoin(messageTemplates, eq(messageTemplates.id, campaigns.templateId))
    .leftJoin(audiences, eq(audiences.id, campaigns.audienceId))
    .orderBy(desc(campaigns.createdAt))
    .limit(200);
  return NextResponse.json({ campaigns: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  channelId: z.string().uuid(),
  templateId: z.string().uuid(),
  audienceId: z.string().uuid(),
  variableMapping: z.record(z.string(), z.unknown()).default({}),
  scheduleAt: z.coerce.date().nullable().optional(),
  rateLimitPerMin: z.number().int().min(1).max(600).default(20),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const i = parsed.data;

  const [created] = await db
    .insert(campaigns)
    .values({
      name: i.name,
      description: i.description ?? null,
      channelId: i.channelId,
      templateId: i.templateId,
      audienceId: i.audienceId,
      variableMapping: i.variableMapping,
      scheduleAt: i.scheduleAt ?? null,
      rateLimitPerMin: i.rateLimitPerMin,
      status: 'draft',
      createdById: session.user.id,
    })
    .returning();
  return NextResponse.json({ campaign: created });
}
