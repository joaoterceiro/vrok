'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { Send, MessageCircle, X } from 'lucide-react';

interface WidgetMessage {
  id: string;
  body: string;
  from: 'visitor' | 'agent' | 'system';
  at: string;
}

interface Props {
  channelId: string;
  greeting: string;
  primary: string;
}

const STORAGE_VISITOR_KEY = (channelId: string) => `zora-widget-visitor-${channelId}`;

export function WidgetClient({ channelId, greeting, primary }: Props) {
  const [open, setOpen] = React.useState(true);
  const [text, setText] = React.useState('');
  const [messages, setMessages] = React.useState<WidgetMessage[]>([
    { id: 'sys', body: greeting, from: 'system', at: new Date().toISOString() },
  ]);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [identified, setIdentified] = React.useState(false);

  const visitorIdRef = React.useRef<string>('');
  React.useEffect(() => {
    const key = STORAGE_VISITOR_KEY(channelId);
    let id = localStorage.getItem(key);
    if (!id) {
      id = `vis-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(key, id);
    }
    visitorIdRef.current = id;
    // load previously identified profile
    const cached = localStorage.getItem(`${key}-profile`);
    if (cached) {
      try {
        const j = JSON.parse(cached);
        setName(j.name ?? '');
        setEmail(j.email ?? '');
        if (j.name || j.email) setIdentified(true);
      } catch {
        /* noop */
      }
    }
  }, [channelId]);

  // Connect Socket.IO once visitor id is known.
  const socketRef = React.useRef<Socket | null>(null);
  React.useEffect(() => {
    if (!visitorIdRef.current) return;
    const room = `webchat:${channelId}:${visitorIdRef.current}`;
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join', room);
    socket.on('message:new', (m: { body: string; messageId: string; direction: string; createdAt: string }) => {
      if (m.direction === 'out') {
        setMessages((prev) =>
          prev.find((p) => p.id === m.messageId)
            ? prev
            : [...prev, { id: m.messageId, body: m.body, from: 'agent', at: m.createdAt }],
        );
      }
    });
    return () => {
      socket.emit('leave', room);
      socket.disconnect();
    };
  }, [channelId]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    const tmpId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tmpId, body, from: 'visitor', at: new Date().toISOString() }]);
    try {
      await fetch(`/api/widget/${channelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: visitorIdRef.current, name, email, text: body }),
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tmpId ? { ...m, body: `${m.body} (não enviado)` } : m,
        ),
      );
    }
  };

  const onIdentify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name && !email) return;
    localStorage.setItem(`${STORAGE_VISITOR_KEY(channelId)}-profile`, JSON.stringify({ name, email }));
    setIdentified(true);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
        style={{ backgroundColor: primary }}
        aria-label="Abrir chat"
      >
        <MessageCircle className="h-5 w-5 text-white" />
      </button>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header
        className="flex items-center justify-between border-b border-border px-4 py-3"
        style={{ background: primary, color: 'white' }}
      >
        <h1 className="text-sm font-semibold">Suporte</h1>
        <button onClick={() => setOpen(false)} aria-label="Minimizar">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.from === 'visitor'
                  ? 'self-end max-w-[80%] rounded-2xl rounded-br-md bg-surface-3 px-3 py-2 text-sm'
                  : m.from === 'agent'
                    ? 'self-start max-w-[80%] rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2 text-sm'
                    : 'self-center rounded-full bg-surface-2 px-3 py-1 text-[11px] text-muted-foreground'
              }
            >
              {m.body}
            </div>
          ))}
        </div>
      </div>

      {!identified && (
        <form onSubmit={onIdentify} className="border-t border-border bg-surface px-3 py-2">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Para receber atualizações, identifique-se:
          </p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="h-8 flex-1 rounded border border-input bg-surface-2 px-2 text-xs"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="h-8 flex-1 rounded border border-input bg-surface-2 px-2 text-xs"
            />
            <button
              type="submit"
              className="h-8 rounded px-3 text-xs font-medium text-white"
              style={{ backgroundColor: primary }}
            >
              Enviar
            </button>
          </div>
        </form>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite sua mensagem…"
          className="h-9 flex-1 rounded-full border border-input bg-surface-2 px-3 text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
          style={{ backgroundColor: primary }}
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
