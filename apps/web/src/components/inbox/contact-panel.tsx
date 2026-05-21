'use client';

import * as React from 'react';
import { Mail, Phone, Tag as TagIcon, History, CheckCircle, Clock, Hash } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { initials } from '@/lib/utils';

export interface ContactPanelProps {
  contact: {
    name: string | null;
    avatarUrl: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  notes?: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
  conversationHistoryCount?: number;
}

export function ContactPanel({ contact, tags = [], notes = [], conversationHistoryCount }: ContactPanelProps) {
  if (!contact) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <p className="text-sm">Selecione uma conversa para ver os detalhes.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 px-4 py-5">
        {/* Identity ----------------------------------- */}
        <section className="flex flex-col items-center gap-2 text-center">
          <Avatar className="h-16 w-16">
            {contact.avatarUrl ? <AvatarImage src={contact.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-base">{initials(contact.name)}</AvatarFallback>
          </Avatar>
          <h3 className="text-base font-semibold leading-tight">{contact.name ?? 'Sem nome'}</h3>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            {contact.phone && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone className="h-3 w-3" /> {contact.phone}
              </span>
            )}
            {contact.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {contact.email}
              </span>
            )}
          </div>
        </section>

        {/* Actions ----------------------------------- */}
        <section className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" /> Resolver
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Adiar
          </Button>
        </section>

        <Separator />

        {/* Tags ------------------------------------- */}
        <PanelSection title="Tags" icon={TagIcon}>
          {tags.length === 0 ? (
            <Empty message="Sem tags. Clique para adicionar." />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="border border-border"
                  style={{ borderColor: t.color, color: t.color }}
                >
                  <Hash className="h-3 w-3" /> {t.name}
                </Badge>
              ))}
            </div>
          )}
        </PanelSection>

        <Separator />

        {/* Notes ------------------------------------ */}
        <PanelSection title="Notas internas">
          {notes.length === 0 ? (
            <Empty message="Nenhuma nota interna." />
          ) : (
            <ul className="flex flex-col gap-2">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-amber-900/40 bg-amber-950/30 px-2.5 py-2 text-xs text-amber-100"
                >
                  <p className="leading-relaxed">{n.body}</p>
                  <span className="mt-1 block text-[10px] text-amber-300/70">
                    — {n.authorName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelSection>

        <Separator />

        {/* History ---------------------------------- */}
        <PanelSection title="Histórico" icon={History}>
          <p className="text-xs text-muted-foreground">
            {conversationHistoryCount ?? 0} conversa(s) anterior(es).
          </p>
        </PanelSection>
      </div>
    </ScrollArea>
  );
}

// ----------------------------------------------------------------

function PanelSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="section-label flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-xs text-muted-foreground/80">{message}</p>;
}
