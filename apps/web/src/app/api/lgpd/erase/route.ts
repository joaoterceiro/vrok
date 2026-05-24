import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import {
  db,
  contacts,
  contactIdentities,
  conversations,
  messages,
  notes,
  events,
  optOuts,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';
import { randomUUID, createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  contactId: z.string().uuid(),
  reason: z.string().min(10).max(500),
  protocol: z.string().min(5).max(50).optional(),
  /** Confirmação dupla obrigatória — usuário precisa digitar "ANONIMIZAR" */
  confirmation: z.literal('ANONIMIZAR'),
});

/**
 * POST /api/lgpd/erase
 *
 * Direito ao esquecimento (LGPD Art. 18, VI).
 * Anonimiza IRREVERSIVELMENTE dados não-registrais do contato:
 *   - Nome → "Titular Anonimizado #<hash>"
 *   - Phone/email/instagramId/telegramId → null
 *   - Mensagens → body substituído por "[mensagem anonimizada por solicitação LGPD]"
 *   - Mídias → preservadas mas links removidos (worker faz cleanup MinIO depois)
 *   - Notas internas → preservadas mas anonimizadas
 *   - Adiciona em opt_outs para impedir contato futuro
 *
 * IMPORTANTE: registros públicos lavrados em livros NÃO são afetados (Lei 6.015/73).
 * IDs, timestamps e metadados estatísticos são preservados para integridade
 * referencial e auditoria — mas SEM nenhuma informação que identifique o titular.
 *
 * Admin apenas.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden', detail: 'Apenas admin pode anonimizar.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }
  const { contactId, reason, protocol } = parsed.data;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) {
    return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });
  }

  const anonTag = createHash('sha256')
    .update(contact.id + (process.env.APP_SECRET ?? ''))
    .digest('hex')
    .slice(0, 10);
  const anonName = `Titular Anonimizado #${anonTag}`;
  const erasedAt = new Date();

  // Pega contagens ANTES da anonimização para auditoria
  const convRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.contactId, contactId));
  const convIds = convRows.map((c) => c.id);

  // Anonimiza contato
  await db
    .update(contacts)
    .set({
      name: anonName,
      phone: null,
      email: null,
      instagramId: null,
      telegramId: null,
      avatarUrl: null,
      metadata: { anonymized: true, anonymizedAt: erasedAt.toISOString() },
      updatedAt: erasedAt,
    })
    .where(eq(contacts.id, contactId));

  // Remove identidades cross-channel
  await db.delete(contactIdentities).where(eq(contactIdentities.contactId, contactId));

  // Anonimiza mensagens
  let messageCount = 0;
  if (convIds.length > 0) {
    const result = await db
      .update(messages)
      .set({
        body: '[mensagem anonimizada por solicitação LGPD]',
        attachments: [],
      })
      .where(or(...convIds.map((cid) => eq(messages.conversationId, cid))))
      .returning({ id: messages.id });
    messageCount = result.length;
  }

  // Anonimiza notas internas (preserva metadado de quem escreveu)
  let noteCount = 0;
  if (convIds.length > 0) {
    const result = await db
      .update(notes)
      .set({ body: '[nota anonimizada por solicitação LGPD]' })
      .where(or(...convIds.map((cid) => eq(notes.conversationId, cid))))
      .returning({ id: notes.id });
    noteCount = result.length;
  }

  // Opt-out para impedir contato futuro
  try {
    await db.insert(optOuts).values({
      contactId: contactId,
      channelType: 'all' as never,
      reason: 'LGPD Art. 18, VI — eliminação solicitada',
      source: 'manual' as never,
    });
  } catch {
    // já pode existir — ignora
  }

  // Audit imutável
  await db.insert(events).values({
    type: 'lgpd_erasure',
    actorType: 'user',
    actorId: session.user.id,
    payload: {
      auditId: randomUUID(),
      contactId,
      anonTag,
      protocol: protocol ?? null,
      reason,
      requestedBy: session.user.email,
      conversationCount: convIds.length,
      messageCount,
      noteCount,
      erasedAt: erasedAt.toISOString(),
      irreversible: true,
    },
  });

  return NextResponse.json({
    ok: true,
    anonTag,
    counts: {
      conversations: convIds.length,
      messages: messageCount,
      notes: noteCount,
    },
    note: 'Anonimização concluída e irreversível. Registros públicos em livros NÃO foram afetados.',
  });
}
