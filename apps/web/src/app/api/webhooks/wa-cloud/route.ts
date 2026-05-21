import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, channels, messageTemplates } from '@zora/db';
import { getAdapter, handleMetaSubscribe } from '@zora/shared/channels';
import { queues } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET handles the Meta subscription handshake (`?hub.mode=subscribe&...`).
 * We try each `wa_cloud` channel in turn until one returns ok with its
 * verify token.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rows = await db.select().from(channels).where(eq(channels.type, 'wa_cloud'));
  for (const c of rows) {
    const r = handleMetaSubscribe(url, c.config);
    if (r.ok) return new Response(r.challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Template approval/rejection lifecycle events arrive on the SAME webhook
  // but without `phone_number_id`. Handle them first so they don't get
  // dropped by the phone-id router below.
  const templateEvent = extractTemplateStatusUpdate(body);
  if (templateEvent) {
    await applyTemplateStatusUpdate(templateEvent);
    return NextResponse.json({ ok: true, handled: 'template_status_update' });
  }

  // WA Cloud payloads contain entry[].changes[].value.metadata.phone_number_id —
  // we use it to find the matching channel.
  const phoneId = extractPhoneId(body);
  if (!phoneId) return NextResponse.json({ ok: true, reason: 'no phone_number_id' });

  const rows = await db.select().from(channels).where(eq(channels.type, 'wa_cloud'));
  const channel = rows.find(
    (c) => ((c.config as { phoneNumberId?: string })?.phoneNumberId ?? '') === phoneId,
  );
  if (!channel) return NextResponse.json({ ok: true, reason: 'no matching channel' });

  const adapter = getAdapter('wa_cloud');
  const ok = await adapter.verifyWebhook(req as unknown as Request, channel.config);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await queues.inbound.add(
    'wa-cloud',
    { channelId: channel.id, payload: body },
    { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 1000 },
  );
  return NextResponse.json({ ok: true });
}

function extractPhoneId(body: unknown): string | null {
  const root = body as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> };
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.value?.metadata?.phone_number_id;
      if (id) return id;
    }
  }
  return null;
}

// ---- Template approval webhook ------------------------------------------

interface TemplateStatusEvent {
  event: string; // APPROVED | REJECTED | PENDING | FLAGGED | DISABLED
  templateId: string;
  templateName?: string;
  language?: string;
  reason?: string | null;
}

function extractTemplateStatusUpdate(body: unknown): TemplateStatusEvent | null {
  const root = body as {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          event?: string;
          message_template_id?: number | string;
          message_template_name?: string;
          message_template_language?: string;
          reason?: string;
        };
      }>;
    }>;
  };
  for (const entry of root?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'message_template_status_update') continue;
      const v = change.value;
      if (!v?.event || v.message_template_id == null) continue;
      return {
        event: String(v.event).toUpperCase(),
        templateId: String(v.message_template_id),
        templateName: v.message_template_name,
        language: v.message_template_language,
        reason: v.reason ?? null,
      };
    }
  }
  return null;
}

async function applyTemplateStatusUpdate(evt: TemplateStatusEvent): Promise<void> {
  const status =
    evt.event === 'APPROVED'
      ? 'approved'
      : evt.event === 'REJECTED' || evt.event === 'FLAGGED' || evt.event === 'DISABLED'
        ? 'rejected'
        : 'pending';

  await db
    .update(messageTemplates)
    .set({
      status,
      rejectionReason: status === 'rejected' ? evt.reason ?? null : null,
      updatedAt: new Date(),
    })
    .where(eq(messageTemplates.providerTemplateId, evt.templateId));
}
