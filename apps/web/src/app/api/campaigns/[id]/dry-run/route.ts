import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import {
  db,
  campaigns,
  audienceContacts,
  contacts,
  messageTemplates,
  optOuts,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/campaigns/:id/dry-run
 *
 * Renders the template against the first 3 audience contacts and returns
 * the resolved messages — without sending anything. Also reports counts:
 * total audience, opted-out (will be skipped), and the effective send size.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  if (!campaign) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Load the template.
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.id, campaign.templateId))
    .limit(1);
  if (!template) return NextResponse.json({ error: 'template_missing' }, { status: 400 });

  // Sample contacts from the audience (first 3).
  const sample = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      email: contacts.email,
      metadata: contacts.metadata,
    })
    .from(audienceContacts)
    .innerJoin(contacts, eq(contacts.id, audienceContacts.contactId))
    .where(eq(audienceContacts.audienceId, campaign.audienceId))
    .limit(3);

  // Counts: audience total, opted-out, effective.
  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(audienceContacts)
    .where(eq(audienceContacts.audienceId, campaign.audienceId));

  const [{ optedOut }] = await db
    .select({ optedOut: sql<number>`COUNT(DISTINCT ${optOuts.contactId})::int` })
    .from(optOuts)
    .innerJoin(audienceContacts, eq(audienceContacts.contactId, optOuts.contactId))
    .where(eq(audienceContacts.audienceId, campaign.audienceId));

  const mapping = (campaign.variableMapping as Record<string, string>) ?? {};
  const previews = sample.map((c) => {
    const vars = resolveVars(template.variables ?? [], mapping, {
      'contact.name': c.name ?? '',
      'contact.phone': c.phone ?? '',
      'contact.email': c.email ?? '',
    });
    return {
      contactId: c.id,
      contactLabel: c.name ?? c.phone ?? c.email ?? '—',
      rendered: renderTemplate(template.body, vars),
      vars,
    };
  });

  return NextResponse.json({
    template: { name: template.name, body: template.body, variables: template.variables },
    counts: {
      audience: Number(total) || 0,
      optedOut: Number(optedOut) || 0,
      effective: Math.max(0, (Number(total) || 0) - (Number(optedOut) || 0)),
    },
    previews,
  });
}

function resolveVars(
  templateVars: string[],
  mapping: Record<string, string>,
  contactFields: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of templateVars) {
    const source = mapping[name];
    if (!source) {
      out[name] = '';
      continue;
    }
    // Supports `contact.*` placeholders today; audience-CSV resolution
    // happens in campaignSend with per-row data.
    out[name] = contactFields[source] ?? `«${source}»`;
  }
  return out;
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
