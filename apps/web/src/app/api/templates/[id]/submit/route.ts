import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, messageTemplates, channels } from '@zora/db';
import { decryptConfig } from '@zora/shared/crypto';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/templates/:id/submit
 *
 * Submits a `channel_type='wa_cloud'` template to Meta's Graph API for
 * approval. Stores the returned `id` as `provider_template_id` and flips
 * status from `draft` → `pending`. Once approved, the webhook handler
 * (template_status_update) flips it to `approved`.
 *
 * Body (optional): { channelId?: string } — when omitted, picks the first
 * connected `wa_cloud` channel.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.id, id))
    .limit(1);
  if (!template) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (template.channelType !== 'wa_cloud') {
    return NextResponse.json(
      { error: 'wrong_channel_type', detail: 'Submissão Meta só vale para wa_cloud' },
      { status: 400 },
    );
  }
  if (template.status === 'pending' || template.status === 'approved') {
    return NextResponse.json(
      { error: 'already_submitted', status: template.status },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { channelId?: string };
  const channelRow = body.channelId
    ? (await db.select().from(channels).where(eq(channels.id, body.channelId)).limit(1))[0]
    : (
        await db
          .select()
          .from(channels)
          .where(eq(channels.type, 'wa_cloud'))
          .limit(1)
      )[0];

  if (!channelRow) {
    return NextResponse.json(
      { error: 'no_wa_cloud_channel', detail: 'Conecte um canal WhatsApp Cloud antes de submeter' },
      { status: 400 },
    );
  }

  const cfg = decryptConfig<{
    accessToken?: string;
    wabaId?: string;
    phoneNumberId?: string;
  }>(channelRow.config as Record<string, unknown>);

  if (!cfg.accessToken || !cfg.wabaId) {
    return NextResponse.json(
      {
        error: 'channel_misconfigured',
        detail: 'Canal Cloud sem accessToken ou wabaId — revise Configurações → Canais',
      },
      { status: 400 },
    );
  }

  // Build the Graph API payload.
  const components: Array<Record<string, unknown>> = [];

  if (template.headerType && template.headerContent) {
    const hc = template.headerContent as { text?: string; mediaUrl?: string };
    components.push({
      type: 'HEADER',
      format: template.headerType.toUpperCase(),
      ...(hc.text ? { text: hc.text } : {}),
      ...(hc.mediaUrl ? { example: { header_handle: [hc.mediaUrl] } } : {}),
    });
  }

  components.push({
    type: 'BODY',
    text: template.body,
    ...(template.variables.length > 0
      ? {
          example: {
            body_text: [template.variables.map((_, i) => `valor_exemplo_${i + 1}`)],
          },
        }
      : {}),
  });

  if (template.footer) {
    components.push({ type: 'FOOTER', text: template.footer });
  }

  if (Array.isArray(template.buttons) && template.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: template.buttons,
    });
  }

  const graphUrl = `https://graph.facebook.com/v22.0/${encodeURIComponent(cfg.wabaId)}/message_templates`;
  const res = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify({
      name: template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      language: template.language,
      category: template.category.toUpperCase(),
      components,
    }),
  });

  const responseBody = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; error_user_msg?: string };
  };

  if (!res.ok || !responseBody.id) {
    const detail =
      responseBody?.error?.error_user_msg ??
      responseBody?.error?.message ??
      `HTTP ${res.status}`;
    await db
      .update(messageTemplates)
      .set({
        status: 'rejected',
        rejectionReason: detail,
        updatedAt: new Date(),
      })
      .where(eq(messageTemplates.id, id));
    return NextResponse.json(
      { error: 'meta_rejected', detail },
      { status: 400 },
    );
  }

  await db
    .update(messageTemplates)
    .set({
      providerTemplateId: responseBody.id,
      status: 'pending',
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(messageTemplates.id, id));

  return NextResponse.json({
    ok: true,
    providerTemplateId: responseBody.id,
    status: 'pending',
  });
}
