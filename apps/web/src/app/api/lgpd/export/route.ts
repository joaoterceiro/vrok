import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, or } from 'drizzle-orm';
import {
  db,
  contacts,
  contactIdentities,
  conversations,
  messages,
  notes,
  events,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  contactId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
});

/**
 * POST /api/lgpd/export
 *
 * Direito de portabilidade (LGPD Art. 18, V).
 * Retorna JSON com TODOS os dados que armazenamos sobre o titular informado.
 * Admin + supervisor apenas.
 *
 * Body: { contactId?, email?, phone? } — pelo menos um identificador.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.contactId && !parsed.data.email && !parsed.data.phone)) {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'Forneça contactId, email ou phone.' },
      { status: 400 },
    );
  }

  // Localiza o contato
  let contact = parsed.data.contactId
    ? (await db.select().from(contacts).where(eq(contacts.id, parsed.data.contactId)).limit(1))[0]
    : undefined;

  if (!contact) {
    const conditions = [];
    if (parsed.data.email) conditions.push(eq(contacts.email, parsed.data.email));
    if (parsed.data.phone) conditions.push(eq(contacts.phone, parsed.data.phone));
    if (conditions.length > 0) {
      contact = (await db.select().from(contacts).where(or(...conditions)).limit(1))[0];
    }
  }

  if (!contact) {
    return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });
  }

  // Coleta todos os dados relacionados
  const [identities, convs, notesRows] = await Promise.all([
    db.select().from(contactIdentities).where(eq(contactIdentities.contactId, contact.id)),
    db.select().from(conversations).where(eq(conversations.contactId, contact.id)),
    (async () => {
      const convIds = (
        await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, contact!.id))
      ).map((c) => c.id);
      if (convIds.length === 0) return [];
      return db
        .select()
        .from(notes)
        .where(or(...convIds.map((cid) => eq(notes.conversationId, cid))));
    })(),
  ]);

  const conversationIds = convs.map((c) => c.id);
  const allMessages =
    conversationIds.length === 0
      ? []
      : await db
          .select()
          .from(messages)
          .where(or(...conversationIds.map((cid) => eq(messages.conversationId, cid))));

  // Audit log da exportação
  await db.insert(events).values({
    type: 'lgpd_data_export',
    actorType: 'user',
    actorId: session.user.id,
    payload: {
      contactId: contact.id,
      contactName: contact.name,
      requestedBy: session.user.email,
      messageCount: allMessages.length,
      conversationCount: convs.length,
      at: new Date().toISOString(),
    },
  });

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.user.email,
    legalBasis: 'LGPD Art. 18, V — direito de portabilidade',
    titular: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      instagramId: contact.instagramId,
      telegramId: contact.telegramId,
      avatarUrl: contact.avatarUrl,
      metadata: contact.metadata,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    },
    identidadesMultiCanal: identities,
    conversas: convs.map((c) => ({
      id: c.id,
      channelId: c.channelId,
      status: c.status,
      priority: c.priority,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
    })),
    mensagens: allMessages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      sender: m.sender,
      body: m.body,
      contentType: m.contentType,
      status: m.status,
      createdAt: m.createdAt,
    })),
    notasInternas: notesRows,
    contagem: {
      conversas: convs.length,
      mensagens: allMessages.length,
      notas: notesRows.length,
      identidades: identities.length,
    },
    aviso:
      'Este pacote contém apenas dados não-registrais (atendimento digital). ' +
      'Atos públicos lavrados em livros oficiais (nascimento, casamento, óbito, ' +
      'averbações) não fazem parte desta exportação por se tratarem de registros ' +
      'públicos imutáveis e perpétuos (Lei 6.015/73).',
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="lgpd-export-${contact.id}-${Date.now()}.json"`,
    },
  });
}
