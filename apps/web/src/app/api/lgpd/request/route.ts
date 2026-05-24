import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, events } from '@zora/db';
import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rate-limit';
import { verifyCaptcha } from '@/lib/captcha';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  fullName: z.string().min(3).max(120),
  cpf: z.string().min(11).max(14),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional().default(''),
  requestType: z.enum(['access', 'correct', 'delete', 'portability', 'consent_revoke', 'other']),
  details: z.string().min(20).max(2000),
  hcaptchaToken: z.string().optional(),
});

const REQUEST_LABELS: Record<string, string> = {
  access: 'Acessar meus dados',
  correct: 'Corrigir dados',
  delete: 'Excluir/anonimizar dados',
  portability: 'Portabilidade',
  consent_revoke: 'Revogar consentimento',
  other: 'Outra solicitação',
};

/**
 * POST /api/lgpd/request
 *
 * Endpoint público — registra solicitação de direito LGPD vinda do formulário
 * em /exclusao-de-dados. Pipeline:
 *   1. Rate-limit por IP (5 req/hora)
 *   2. Verifica hCaptcha
 *   3. Valida schema
 *   4. Gera protocolo único LGPD-AAAAMMDD-XXXXX
 *   5. Persiste como event imutável (audit-grade)
 *   6. Envia e-mail ao DPO + confirmação ao cidadão
 */
export async function POST(req: Request) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ua = h.get('user-agent') ?? 'unknown';

  // 1. Rate-limit
  const rl = await rateLimit({ key: `lgpd:${ip}`, limit: 5, windowSec: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `Muitas solicitações. Tente novamente em ${Math.ceil(rl.resetIn / 60)} minutos.`,
      },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }

  // 2. Parse body primeiro pra extrair captcha token
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 3. Verifica hCaptcha (skip em dev sem HCAPTCHA_SECRET)
  const captcha = await verifyCaptcha(data.hcaptchaToken ?? '', ip);
  if (!captcha.ok) {
    return NextResponse.json(
      { error: 'captcha_failed', detail: captcha.error },
      { status: 400 },
    );
  }

  // 4. Protocolo único
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  const protocol = `LGPD-${today}-${rand}`;
  const receivedAt = new Date();

  // 5. Persiste como event imutável
  await db.insert(events).values({
    type: 'lgpd_request',
    actorType: 'public',
    actorId: null,
    payload: {
      protocol,
      requestType: data.requestType,
      fullName: data.fullName,
      cpfMasked: maskCpf(data.cpf),
      cpfHash: hashCpf(data.cpf),
      email: data.email,
      phone: data.phone,
      details: data.details,
      ip,
      userAgent: ua,
      status: 'pending',
      receivedAt: receivedAt.toISOString(),
    },
  });

  // 6. Notificações (best-effort — não bloqueia se falhar)
  const dpo = process.env.DPO_EMAIL ?? 'dpo@cartoriocentrojaboatao.com.br';
  const label = REQUEST_LABELS[data.requestType] ?? data.requestType;

  // E-mail ao DPO
  void sendEmail({
    to: dpo,
    subject: `[LGPD] Nova solicitação ${protocol} — ${label}`,
    text: `Nova solicitação LGPD recebida via formulário público.

Protocolo: ${protocol}
Tipo:      ${label}
Recebida:  ${receivedAt.toLocaleString('pt-BR', { timeZone: 'America/Recife' })}

Solicitante:
  Nome:    ${data.fullName}
  CPF:     ${maskCpf(data.cpf)}
  E-mail:  ${data.email}
  Tel:     ${data.phone || '(não informado)'}
  IP:      ${ip}

Detalhes:
${data.details}

----
Prazo legal de resposta: 15 dias úteis (LGPD Art. 19).
Acesse o painel administrativo para responder:
https://chat.cartoriocentrojaboatao.com.br/inbox?settings=lgpd
`,
  } as never);

  // E-mail de confirmação ao cidadão
  void sendEmail({
    to: data.email,
    subject: `Recebemos sua solicitação LGPD — ${protocol}`,
    text: `Olá, ${data.fullName.split(' ')[0]}.

Recebemos sua solicitação ao 2º Ofício de Registro Civil de Jaboatão.

Protocolo: ${protocol}
Tipo:      ${label}
Recebida:  ${receivedAt.toLocaleString('pt-BR', { timeZone: 'America/Recife' })}

Nosso Encarregado de Dados (DPO) analisará seu pedido e responderá em até
15 dias úteis para este e-mail (${data.email}).

Lembrando: registros públicos lavrados em livros (nascimento, casamento,
óbito, averbações) são imutáveis e perpétuos por força da Lei 6.015/73 — não
podem ser excluídos, apenas retificados via procedimento próprio.

Em caso de dúvidas urgentes:
  Telefone: (81) 3316-2908
  Presencial: Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE
  Horário: Seg-Sex 8h às 16h

— 2º Ofício de Registro Civil das Pessoas Naturais e Notas
   Oficial Titular: Taisa Tiaen
   DPO: ${dpo}
`,
  } as never);

  console.log(`[LGPD] Nova solicitação ${protocol} (${data.requestType}) de ${data.email}`);

  return NextResponse.json({ ok: true, protocol });
}

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

function hashCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(digits).digest('hex');
}
