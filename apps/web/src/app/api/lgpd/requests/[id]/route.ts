import { NextResponse } from 'next/server';
import { db, events } from '@zora/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireSession } from '@/lib/api/guards';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'resolved', 'rejected']),
  resolution: z.string().min(10).max(4000).optional(),
  notifyCitizen: z.boolean().default(true),
});

/**
 * GET /api/lgpd/requests/:id — detalhe completo
 * PATCH /api/lgpd/requests/:id — atualiza status + resposta + opcionalmente notifica cidadão
 *
 * Apenas admin + supervisor.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row || row.type !== 'lgpd_request') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ request: { id: row.id, payload: row.payload, createdAt: row.createdAt } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row || row.type !== 'lgpd_request') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const payload = { ...(row.payload as Record<string, unknown>) };
  payload.status = parsed.data.status;
  if (parsed.data.resolution) payload.resolution = parsed.data.resolution;
  if (parsed.data.status === 'resolved' || parsed.data.status === 'rejected') {
    payload.resolvedAt = new Date().toISOString();
    payload.resolvedBy = session.user.email;
  }

  await db.update(events).set({ payload }).where(eq(events.id, id));

  // Log da ação (audit trail separado)
  await db.insert(events).values({
    type: 'lgpd_request_action',
    actorType: 'user',
    actorId: session.user.id,
    payload: {
      requestId: id,
      protocol: payload.protocol,
      newStatus: parsed.data.status,
      hasResolution: Boolean(parsed.data.resolution),
      notifyCitizen: parsed.data.notifyCitizen,
      at: new Date().toISOString(),
    },
  });

  // Notifica cidadão se solicitado
  if (parsed.data.notifyCitizen && parsed.data.resolution && payload.email) {
    void sendEmail({
      to: String(payload.email),
      subject: `Resposta à sua solicitação LGPD — ${payload.protocol}`,
      text: `Olá, ${String(payload.fullName ?? '').split(' ')[0]}.

Sua solicitação foi ${parsed.data.status === 'resolved' ? 'atendida' : 'analisada'}.

Protocolo: ${payload.protocol}
Status:    ${parsed.data.status}

Resposta:
${parsed.data.resolution}

Caso não esteja satisfeito(a), você pode reclamar à ANPD (gov.br/anpd) ou
à Corregedoria-Geral de Justiça de PE (tjpe.jus.br).

— 2º Ofício de Registro Civil das Pessoas Naturais e Notas
   DPO: ${process.env.DPO_EMAIL ?? 'dpo@cartoriocentrojaboatao.com.br'}
`,
    } as never);
  }

  return NextResponse.json({ ok: true, status: parsed.data.status });
}
