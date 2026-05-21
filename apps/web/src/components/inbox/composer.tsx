'use client';

import * as React from 'react';
import {
  Loader2,
  Mic,
  NotebookPen,
  Paperclip,
  Send,
  Smile,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/ui/chat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/use-socket';

export interface PendingAttachment {
  url: string;
  minioKey: string;
  mime: string;
  size: number;
  filename: string;
  /** local-only preview blob URL */
  previewUrl?: string;
}

interface ComposerProps {
  onSend?: (input: {
    body: string;
    isNote: boolean;
    attachments: PendingAttachment[];
  }) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  /**
   * When provided, the composer emits debounced `typing:start` / `typing:stop`
   * events so other operators viewing the same conversation see a "digitando…"
   * indicator in the thread header.
   */
  conversationId?: string;
}

interface QuickReply {
  id: string;
  shortcut: string;
  body: string;
}

const EMOJI_SET = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😴', '🥳',
  '👍', '👎', '🙏', '👏', '🙌', '🤝', '👌', '✌️', '🤞', '💪',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️',
  '🔥', '✨', '⭐', '🌟', '💯', '🎉', '🎊', '🚀', '✅', '⚡',
] as const;

async function fetchQuickReplies(): Promise<{ quickReplies: QuickReply[] }> {
  const res = await fetch('/api/quick-replies', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function uploadFile(file: File): Promise<PendingAttachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/media/upload', { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    url: string;
    minioKey: string;
    mime: string;
    size: number;
    filename: string;
  };
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
  return { ...data, previewUrl };
}

export function Composer({ onSend, placeholder, disabled, conversationId }: ComposerProps) {
  const [value, setValue] = React.useState('');
  const socket = useSocket();
  const typingRef = React.useRef({ active: false, idleTimer: 0 });

  // Emit `typing:start` once when the user begins typing, then `typing:stop`
  // 3s after the last keystroke (or when the input clears).
  React.useEffect(() => {
    if (!conversationId) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      if (typingRef.current.active) {
        socket.emit('typing:stop', { conversationId });
        typingRef.current.active = false;
      }
      return;
    }
    if (!typingRef.current.active) {
      socket.emit('typing:start', { conversationId });
      typingRef.current.active = true;
    }
    window.clearTimeout(typingRef.current.idleTimer);
    typingRef.current.idleTimer = window.setTimeout(() => {
      if (typingRef.current.active) {
        socket.emit('typing:stop', { conversationId });
        typingRef.current.active = false;
      }
    }, 3000);
    return () => {
      window.clearTimeout(typingRef.current.idleTimer);
    };
  }, [value, conversationId, socket]);

  // Send `typing:stop` on unmount (conversation change) so the indicator
  // doesn't get stuck for the other operator.
  React.useEffect(() => {
    return () => {
      if (conversationId && typingRef.current.active) {
        socket.emit('typing:stop', { conversationId });
      }
    };
  }, [conversationId, socket]);
  const [isNote, setIsNote] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [showQuick, setShowQuick] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Audio recording state
  const [recording, setRecording] = React.useState(false);
  const [recordSeconds, setRecordSeconds] = React.useState(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordChunksRef = React.useRef<Blob[]>([]);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const quickReplies = useQuery({
    queryKey: ['quick-replies'],
    queryFn: fetchQuickReplies,
    staleTime: 60_000,
  });

  // Slash command popover
  const slashQuery = React.useMemo(() => {
    if (!value.startsWith('/')) return null;
    const cut = value.split(/\s/)[0] ?? '';
    return cut.slice(1).toLowerCase();
  }, [value]);

  const matches = React.useMemo(() => {
    if (slashQuery === null) return [];
    const all = quickReplies.data?.quickReplies ?? [];
    return all.filter((qr) => qr.shortcut.toLowerCase().startsWith(slashQuery)).slice(0, 6);
  }, [slashQuery, quickReplies.data]);

  React.useEffect(() => {
    setShowQuick(matches.length > 0);
    setHighlight(0);
  }, [matches.length]);

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !disabled && !sending && !uploading;

  const submit = React.useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend?.({ body: value.trim(), isNote, attachments });
      setValue('');
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      setAttachments([]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [canSend, isNote, onSend, value, attachments]);

  // File picker
  const handleFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newAttachments: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        try {
          const a = await uploadFile(file);
          newAttachments.push(a);
        } catch (err) {
          toast.error(`Falha em ${file.name}: ${(err as Error).message}`);
        }
      }
      setAttachments((prev) => [...prev, ...newAttachments].slice(0, 10));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => {
      const out = prev.filter((a) => a.minioKey !== key);
      const removed = prev.find((a) => a.minioKey === key);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return out;
    });
  };

  // Quick reply apply
  const applyQuickReply = (qr: QuickReply) => {
    setValue(qr.body);
    setShowQuick(false);
    textareaRef.current?.focus();
  };

  // Audio recording
  const startRecording = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: mime });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: mime });
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecordSeconds(0);
        setUploading(true);
        try {
          const a = await uploadFile(file);
          setAttachments((prev) => [...prev, a]);
        } catch (err) {
          toast.error(`Falha ao enviar áudio: ${(err as Error).message}`);
        } finally {
          setUploading(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      toast.error(`Microfone bloqueado: ${(err as Error).message}`);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    if (recorderRef.current && recording) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
      recordChunksRef.current = [];
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setRecording(false);
      setRecordSeconds(0);
    }
  };

  const insertEmoji = (e: string) => {
    setValue((v) => v + e);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showQuick && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const pick = matches[highlight];
        if (pick) applyQuickReply(pick);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowQuick(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative">
      {/* Slash-command popover */}
      {showQuick && matches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-full max-w-md overflow-hidden rounded-lg border border-border bg-popover shadow-xl animate-fade-in">
          <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Respostas rápidas — ↑↓ navega · Tab/Enter aplica · Esc fecha
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {matches.map((qr, i) => (
              <li key={qr.id}>
                <button
                  type="button"
                  onClick={() => applyQuickReply(qr)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
                    i === highlight ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                  )}
                >
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-brand-300">
                    /{qr.shortcut}
                  </span>
                  <span className="line-clamp-2 flex-1 text-xs text-foreground/90">{qr.body}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={cn(
          'flex w-full flex-col gap-2 rounded-xl border bg-surface-2 px-2 py-1.5 transition-colors focus-within:ring-2 focus-within:ring-ring/40 md:px-3 md:py-2',
          isNote ? 'border-amber-700/50 bg-amber-950/30' : 'border-border',
        )}
      >
        {isNote && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
            <NotebookPen className="h-3 w-3" />
            <span>Nota interna — só visível para a equipe</span>
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {attachments.map((a) => (
              <AttachmentChip key={a.minioKey} att={a} onRemove={() => removeAttachment(a.minioKey)} />
            ))}
          </div>
        )}

        {/* Recording overlay replaces the textarea */}
        {recording ? (
          <div className="flex h-10 items-center gap-3 px-1">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
            </span>
            <span className="text-sm font-medium tabular-nums text-foreground">
              Gravando · {formatRecord(recordSeconds)}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-rose-400"
                    aria-label="Cancelar gravação"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Descartar áudio</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                    aria-label="Parar e enviar"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Parar (e anexar)</TooltipContent>
              </Tooltip>
            </span>
          </div>
        ) : (
          <ChatInput
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              placeholder ??
              (isNote ? 'Escreva uma nota interna…' : 'Digite uma mensagem  ·  / atalhos  ·  Enter envia')
            }
            disabled={disabled || sending}
            aria-label={isNote ? 'Nota interna' : 'Mensagem'}
          />
        )}

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(e) => void handleFilesPicked(e.target.files)}
            />
            <ToolbarButton
              label="Anexar arquivo"
              icon={Paperclip}
              onClick={() => fileInputRef.current?.click()}
              disabled={recording || uploading}
              loading={uploading}
            />
            <EmojiPicker open={emojiOpen} onOpenChange={setEmojiOpen} onPick={insertEmoji} disabled={recording} />
            <ToolbarButton
              label={recording ? 'Gravando…' : 'Gravar áudio'}
              icon={Mic}
              onClick={startRecording}
              active={recording}
              disabled={recording || uploading}
            />
            <ToolbarButton
              label="Respostas rápidas (/)"
              icon={Zap}
              onClick={() => {
                setValue('/');
                setShowQuick(true);
                textareaRef.current?.focus();
              }}
              disabled={recording}
            />
            <ToolbarButton
              label={isNote ? 'Voltar para mensagem' : 'Nota interna'}
              icon={NotebookPen}
              onClick={() => setIsNote((v) => !v)}
              active={isNote}
              disabled={recording}
            />
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label="Enviar mensagem"
            className={cn('h-8 gap-1.5 px-3', isNote && 'bg-amber-600 hover:bg-amber-600/90')}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isNote ? 'Anotar' : 'Enviar'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  active,
  disabled,
  loading,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            active && 'text-amber-300',
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function EmojiPicker({
  open,
  onOpenChange,
  onPick,
  disabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (e: string) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Emoji"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Smile className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Emoji</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" className="w-72 p-2">
        <div className="grid grid-cols-10 gap-1">
          {EMOJI_SET.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-base hover:bg-surface-2"
            >
              {e}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AttachmentChip({
  att,
  onRemove,
}: {
  att: PendingAttachment;
  onRemove: () => void;
}) {
  const isImage = att.mime.startsWith('image/');
  const isAudio = att.mime.startsWith('audio/');
  return (
    <div className="group relative flex max-w-[200px] items-center gap-2 rounded-lg border border-border bg-surface-3 p-1.5 pr-7 text-xs">
      {isImage && att.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={att.previewUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-2 text-base">
          {isAudio ? '🎤' : att.mime.startsWith('video/') ? '🎬' : '📎'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{att.filename}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {formatBytes(att.size)}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-surface-2 hover:text-rose-400"
        aria-label="Remover anexo"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function formatRecord(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
