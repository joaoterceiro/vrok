'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  Hash,
  History,
  Image as ImageIcon,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Mic,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials, relativeTime } from '@/lib/utils';

// ----- Types passed from the parent --------------------------------

interface Contact {
  id?: string;
  name: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  metadata?: Record<string, unknown>;
}
interface Tag {
  id: string;
  name: string;
  color: string;
}
interface Note {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
}

interface Props {
  conversationId: string;
  contactId?: string | null;
  contact: Contact | null;
  initialTags: Tag[];
  initialNotes: Note[];
}

// ----- API helpers ------------------------------------------------

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ----- localStorage persistence -----------------------------------

const PANEL_KEY = 'vrok:right-panel:open';
const DEFAULT_OPEN = ['contact', 'ai-summary', 'actions'];

function readOpenSections(): string[] {
  if (typeof window === 'undefined') return DEFAULT_OPEN;
  try {
    const raw = window.localStorage.getItem(PANEL_KEY);
    if (!raw) return DEFAULT_OPEN;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : DEFAULT_OPEN;
  } catch {
    return DEFAULT_OPEN;
  }
}

// ----- Main component ---------------------------------------------

export function ContactPanelLive({
  conversationId,
  contactId,
  contact,
  initialTags,
  initialNotes,
}: Props) {
  const [open, setOpen] = React.useState<string[]>(DEFAULT_OPEN);
  React.useEffect(() => setOpen(readOpenSections()), []);
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PANEL_KEY, JSON.stringify(open));
    }
  }, [open]);

  if (!contact) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <p className="text-sm">Selecione uma conversa para ver os detalhes.</p>
      </div>
    );
  }

  const cid = contactId ?? contact.id ?? null;
  const blocked = (contact.metadata as { blocked?: boolean } | undefined)?.blocked === true;

  return (
    <ScrollArea className="h-full">
      <ContactHero contact={contact} blocked={blocked} />

      <Accordion type="multiple" value={open} onValueChange={setOpen} className="w-full">
        <AccordionItem value="contact">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <NotebookPen className="h-3 w-3" /> Contato
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ContactDetails contact={contact} contactId={cid} blocked={blocked} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ai-summary">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Resumo IA
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <AiSummary conversationId={conversationId} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="actions">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Ações rápidas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <QuickActions conversationId={conversationId} contactId={cid} blocked={blocked} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="tags">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <TagIcon className="h-3 w-3" /> Tags
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <TagsSection conversationId={conversationId} initialTags={initialTags} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="notes">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <NotebookPen className="h-3 w-3" /> Notas internas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <NotesSection conversationId={conversationId} initialNotes={initialNotes} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="attachments">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="h-3 w-3" /> Arquivos compartilhados
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <AttachmentsSection conversationId={conversationId} active={open.includes('attachments')} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="history">
          <AccordionTrigger>
            <span className="inline-flex items-center gap-1.5">
              <History className="h-3 w-3" /> Histórico
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <HistorySection
              conversationId={conversationId}
              contactId={cid}
              active={open.includes('history')}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  );
}

// ----------------------------------------------------------------
// HERO + sections
// ----------------------------------------------------------------

function ContactHero({ contact, blocked }: { contact: Contact; blocked: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
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
      {blocked && (
        <Badge variant="destructive" className="mt-1">
          <Ban className="h-3 w-3" /> Bloqueado
        </Badge>
      )}
    </div>
  );
}

function ContactDetails({
  contact,
  contactId,
  blocked,
}: {
  contact: Contact;
  contactId: string | null;
  blocked: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(contact.name ?? '');
  const [phone, setPhone] = React.useState(contact.phone ?? '');
  const [email, setEmail] = React.useState(contact.email ?? '');
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() === '' ? null : name.trim(),
          phone: phone.trim() === '' ? null : phone.trim(),
          email: email.trim() === '' ? null : email.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success('Contato atualizado');
      qc.invalidateQueries({ queryKey: ['conversation'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setEditing(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!contactId) {
    return <p className="text-xs text-muted-foreground/80">Sem contato vinculado.</p>;
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <Row label="Nome" value={contact.name ?? '—'} />
        <Row label="Telefone" value={contact.phone ?? '—'} mono />
        <Row label="Email" value={contact.email ?? '—'} />
        {blocked && (
          <p className="text-xs text-rose-300">
            Contato bloqueado — opt-out global ativo.
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="mt-2 w-full gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Editar contato
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-2"
    >
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Telefone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 font-mono" />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8" />
      </div>
      <div className="flex justify-end gap-1.5 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'truncate font-mono tabular-nums text-foreground' : 'truncate text-foreground'}>
        {value}
      </span>
    </div>
  );
}

// ----- Quick actions ----------------------------------------------

function QuickActions({
  conversationId,
  contactId,
  blocked,
}: {
  conversationId: string;
  contactId: string | null;
  blocked: boolean;
}) {
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const block = useMutation({
    mutationFn: () =>
      fetchJson(`/api/contacts/${contactId}/block`, {
        method: blocked ? 'DELETE' : 'POST',
      }),
    onSuccess: () => {
      toast.success(blocked ? 'Contato desbloqueado' : 'Contato bloqueado');
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const Btn = ({ icon: Icon, label, onClick, danger, disabled }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'inline-flex items-center justify-start gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 ' +
        (danger ? 'text-rose-300 hover:text-rose-200' : 'text-foreground')
      }
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Btn icon={CheckCircle2} label="Resolver" onClick={() => patch.mutate({ status: 'resolved' })} />
      <Btn
        icon={Clock}
        label="Adiar 1h"
        onClick={() =>
          patch.mutate({ snoozedUntil: new Date(Date.now() + 60 * 60_000).toISOString() })
        }
      />
      <Btn icon={AlertTriangle} label="Urgente" onClick={() => patch.mutate({ priority: 'urgent' })} />
      <Btn
        icon={MessageSquare}
        label="Pendente"
        onClick={() => patch.mutate({ status: 'pending' })}
      />
      <Btn
        icon={Share2}
        label="Compartilhar"
        onClick={() => {
          const url = `${window.location.origin}/inbox/${conversationId}`;
          void navigator.clipboard.writeText(url);
          toast.success('Link copiado');
        }}
      />
      <Btn
        icon={Ban}
        label={blocked ? 'Desbloquear' : 'Bloquear'}
        onClick={() => block.mutate()}
        danger={!blocked}
        disabled={!contactId || block.isPending}
      />
    </div>
  );
}

// ----- Tags -------------------------------------------------------

function TagsSection({
  conversationId,
  initialTags,
}: {
  conversationId: string;
  initialTags: Tag[];
}) {
  const qc = useQueryClient();
  const allTagsQuery = useQuery<{ tags: Tag[] }>({
    queryKey: ['tags'],
    queryFn: () => fetchJson('/api/tags'),
    staleTime: 5 * 60_000,
  });

  const attach = useMutation({
    mutationFn: (tagId: string) =>
      fetchJson(`/api/conversations/${conversationId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });
  const detach = useMutation({
    mutationFn: (tagId: string) =>
      fetchJson(`/api/conversations/${conversationId}/tags?tagId=${tagId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });

  const attached = new Set(initialTags.map((t) => t.id));
  const available = (allTagsQuery.data?.tags ?? []).filter((t) => !attached.has(t.id));

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        {initialTags.length === 0 ? (
          <p className="text-xs text-muted-foreground/80">Sem tags.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {initialTags.map((t) => (
              <Badge
                key={t.id}
                variant="secondary"
                className="border"
                style={{ borderColor: t.color, color: t.color }}
              >
                <Hash className="h-3 w-3" /> {t.name}
                <button
                  onClick={() => detach.mutate(t.id)}
                  className="ml-1 inline-flex h-3 w-3 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Remover"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Adicionar tag">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {available.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem tags disponíveis.</div>
            ) : (
              available.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => attach.mutate(t.id)}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ----- Notes ------------------------------------------------------

function NotesSection({
  conversationId,
  initialNotes,
}: {
  conversationId: string;
  initialNotes: Note[];
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState('');

  const add = useMutation({
    mutationFn: (body: string) =>
      fetchJson<{ note: Note }>(`/api/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      setDraft('');
    },
  });
  const remove = useMutation({
    mutationFn: (noteId: string) =>
      fetchJson(`/api/conversations/${conversationId}/notes?noteId=${noteId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) add.mutate(draft.trim());
        }}
        className="flex flex-col gap-1.5"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nota interna…"
          className="h-9 bg-amber-950/30 placeholder:text-amber-300/40"
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!draft.trim() || add.isPending}
          className="self-end"
        >
          Adicionar nota
        </Button>
      </form>

      {initialNotes.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">Nenhuma nota interna.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {initialNotes.map((n) => (
            <li
              key={n.id}
              className="group flex items-start gap-2 rounded-md border border-amber-900/40 bg-amber-950/30 px-2.5 py-2 text-xs text-amber-100"
            >
              <div className="min-w-0 flex-1">
                <p className="leading-relaxed">{n.body}</p>
                <span className="mt-1 block text-[10px] text-amber-300/70">
                  — {n.authorName ?? 'Anônimo'} · {relativeTime(n.createdAt)}
                </span>
              </div>
              <button
                onClick={() => remove.mutate(n.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remover nota"
              >
                <Trash2 className="h-3 w-3 text-amber-200/60 hover:text-rose-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----- Shared attachments (lazy) ----------------------------------

interface AttachmentResp {
  counts: Record<'image' | 'audio' | 'video' | 'document' | 'other', number>;
  items: Record<'image' | 'audio' | 'video' | 'document' | 'other', Array<{
    messageId: string;
    url: string;
    mime: string;
    filename?: string;
    size?: number;
    caption?: string | null;
    createdAt: string;
    direction: 'in' | 'out';
  }>>;
}

function AttachmentsSection({
  conversationId,
  active,
}: {
  conversationId: string;
  active: boolean;
}) {
  const q = useQuery<AttachmentResp>({
    enabled: active,
    queryKey: ['conversation', conversationId, 'attachments'],
    queryFn: () => fetchJson(`/api/conversations/${conversationId}/attachments`),
    staleTime: 60_000,
  });

  if (!active && !q.data) {
    return <p className="text-xs text-muted-foreground/80">Expanda para ver…</p>;
  }
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
      </div>
    );
  }
  const data = q.data;
  if (!data) return null;
  const total =
    data.counts.image + data.counts.audio + data.counts.video + data.counts.document + data.counts.other;
  if (total === 0) {
    return <p className="text-xs text-muted-foreground/80">Nenhuma mídia trocada nesta conversa.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-[10.5px] text-muted-foreground">
        {data.counts.image > 0 && (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="h-3 w-3" /> {data.counts.image} fotos
          </span>
        )}
        {data.counts.audio > 0 && (
          <span className="inline-flex items-center gap-1">
            <Mic className="h-3 w-3" /> {data.counts.audio} áudios
          </span>
        )}
        {data.counts.video > 0 && (
          <span className="inline-flex items-center gap-1">
            <Video className="h-3 w-3" /> {data.counts.video} vídeos
          </span>
        )}
        {data.counts.document > 0 && (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> {data.counts.document} docs
          </span>
        )}
      </div>

      {data.items.image.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {data.items.image.slice(0, 12).map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square overflow-hidden rounded bg-surface-2"
              title={a.filename ?? ''}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {data.items.document.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.items.document.slice(0, 8).map((a) => (
            <li key={a.url}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1.5 text-xs hover:bg-surface-3"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.filename ?? 'Documento'}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {data.items.audio.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.items.audio.slice(0, 5).map((a) => (
            <li key={a.url} className="rounded-md bg-surface-2 px-2 py-1.5">
              <div className="mb-1 text-[10.5px] text-muted-foreground">
                {a.direction === 'in' ? '↘ recebido' : '↗ enviado'} · {relativeTime(a.createdAt)}
              </div>
              <audio src={a.url} controls className="h-7 w-full" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----- History (timeline + related conversations) -----------------

interface TimelineEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string | null; name: string | null; email: string | null } | null;
}
interface RelatedConvo {
  id: string;
  status: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  channel: { id: string; type: string; name: string };
}

function HistorySection({
  conversationId,
  contactId,
  active,
}: {
  conversationId: string;
  contactId: string | null;
  active: boolean;
}) {
  const timeline = useQuery<{ events: TimelineEvent[] }>({
    enabled: active,
    queryKey: ['conversation', conversationId, 'timeline'],
    queryFn: () => fetchJson(`/api/conversations/${conversationId}/timeline`),
    staleTime: 30_000,
  });
  const related = useQuery<{ total: number; openInOtherChannels: number; conversations: RelatedConvo[] }>({
    enabled: active && !!contactId,
    queryKey: ['contact', contactId, 'related', conversationId],
    queryFn: () =>
      fetchJson(`/api/contacts/${contactId}/related-conversations?exclude=${conversationId}`),
    staleTime: 30_000,
  });

  if (!active) {
    return <p className="text-xs text-muted-foreground/80">Expanda para ver…</p>;
  }

  return (
    <div className="space-y-3">
      <section className="space-y-1.5">
        <h5 className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          Eventos da conversa
        </h5>
        {timeline.isLoading ? (
          <p className="text-xs text-muted-foreground/70">Carregando…</p>
        ) : (timeline.data?.events ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground/80">Sem eventos.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(timeline.data?.events ?? []).slice(0, 12).map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <TimelineDot type={e.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground/90">{describeEvent(e)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.actor?.name ?? e.actor?.email ?? 'sistema'} · {relativeTime(e.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {contactId && (
        <section className="space-y-1.5">
          <h5 className="flex items-center justify-between text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <span>Conversas anteriores</span>
            {related.data && (
              <span className="font-mono normal-case tracking-normal">
                {related.data.total} total · {related.data.openInOtherChannels} abertas
              </span>
            )}
          </h5>
          {related.isLoading ? (
            <p className="text-xs text-muted-foreground/70">Carregando…</p>
          ) : (related.data?.conversations ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground/80">Sem outras conversas.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {(related.data?.conversations ?? []).slice(0, 10).map((c) => (
                <li key={c.id}>
                  <a
                    href={`/inbox/${c.id}`}
                    className="flex flex-col gap-0.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs hover:bg-surface-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium">{c.channel.name}</span>
                      <Badge variant="secondary" className="ml-1 shrink-0">
                        {c.status}
                      </Badge>
                    </div>
                    {c.lastMessagePreview && (
                      <span className="truncate text-muted-foreground">{c.lastMessagePreview}</span>
                    )}
                    {c.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {relativeTime(c.lastMessageAt)}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TimelineDot({ type }: { type: string }) {
  const color = type.startsWith('bot')
    ? 'bg-violet-400'
    : type.startsWith('message.failed')
      ? 'bg-rose-500'
      : type.startsWith('conversation')
        ? 'bg-primary'
        : 'bg-muted-foreground';
  return <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

function describeEvent(e: TimelineEvent): string {
  switch (e.type) {
    case 'message.incoming':
      return 'Mensagem recebida';
    case 'message.failed':
      return `Falha no envio${e.payload.error ? ` — ${String(e.payload.error)}` : ''}`;
    case 'bot.reply':
      return 'Bot respondeu';
    case 'bot.handoff':
      return `Bot transferiu para humano${e.payload.reason ? ` — ${String(e.payload.reason)}` : ''}`;
    case 'conversation.updated': {
      const fields = (e.payload.fields as Record<string, unknown>) ?? {};
      const parts = Object.entries(fields).map(([k, v]) => `${k}=${String(v ?? '∅')}`);
      return `Conversa atualizada${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }
    default:
      return e.type;
  }
}

// ----- AI summary -------------------------------------------------

interface SummaryData {
  tldr: string;
  status: string;
  openQuestions: string[];
  nextStep: string;
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'urgent';
}
interface SummaryGetResponse {
  cached: { summary: SummaryData; generatedAt: string; messageCount: number; provider: string } | null;
  messageCount: number;
  stale: boolean;
}
interface SummaryPostResponse {
  summary: SummaryData;
  generatedAt: string;
  cached: boolean;
  provider?: string;
}

const SENTIMENT_STYLE: Record<SummaryData['sentiment'], { label: string; cls: string }> = {
  positive: { label: 'Positivo', cls: 'bg-emerald-500/15 text-emerald-300' },
  neutral: { label: 'Neutro', cls: 'bg-shark-700 text-shark-200' },
  frustrated: { label: 'Frustrado', cls: 'bg-amber-500/15 text-amber-300' },
  urgent: { label: 'Urgente', cls: 'bg-rose-500/15 text-rose-300' },
};

function AiSummary({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();

  const cachedQuery = useQuery<SummaryGetResponse>({
    queryKey: ['ai-summary', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/summarize`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const generate = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await fetch(
        `/api/conversations/${conversationId}/summarize${force ? '?force=1' : ''}`,
        { method: 'POST', credentials: 'include' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      return body as SummaryPostResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-summary', conversationId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (cachedQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }

  const data = cachedQuery.data?.cached;
  const isStale = cachedQuery.data?.stale ?? false;
  const messageCount = cachedQuery.data?.messageCount ?? 0;

  if (!data) {
    return (
      <div className="space-y-2 text-xs">
        <p className="leading-relaxed text-muted-foreground">
          Gere um resumo rápido da conversa para entender o contexto sem ler toda a thread.
        </p>
        <Button
          onClick={() => generate.mutate(false)}
          disabled={generate.isPending || messageCount === 0}
          size="sm"
          className="w-full gap-1.5"
        >
          {generate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {messageCount === 0 ? 'Sem mensagens ainda' : 'Gerar resumo'}
        </Button>
      </div>
    );
  }

  const sentiment = SENTIMENT_STYLE[data.summary.sentiment];

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sentiment.cls}`}>
          {sentiment.label}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => generate.mutate(true)}
          disabled={generate.isPending}
          className="h-7 gap-1 px-2 text-[11px]"
          title="Regenerar resumo"
        >
          {generate.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          Atualizar
        </Button>
      </div>

      <p className="leading-relaxed text-foreground">{data.summary.tldr}</p>

      {data.summary.status && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </div>
          <p className="leading-relaxed text-foreground/90">{data.summary.status}</p>
        </div>
      )}

      {data.summary.openQuestions.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Em aberto
          </div>
          <ul className="mt-1 space-y-1 text-foreground/90">
            {data.summary.openQuestions.map((q, i) => (
              <li key={i} className="leading-relaxed">
                • {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-brand-500/30 bg-brand-500/5 p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-300">
          Próximo passo
        </div>
        <p className="mt-0.5 leading-relaxed text-foreground">{data.summary.nextStep}</p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {new Date(data.generatedAt).toLocaleString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
          })}{' '}
          · {data.provider}
        </span>
        {isStale && (
          <span className="text-amber-400">desatualizado — clique em Atualizar</span>
        )}
      </div>
    </div>
  );
}
