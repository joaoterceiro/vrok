'use client';

import * as React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  ChartBar,
  Megaphone,
  MessageSquareText,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Tag,
  Timer,
  UserCircle,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SettingsSection } from './sections';

type SettingsGroup = {
  group: string;
  items: Array<{ id: string; label: string; icon: LucideIcon; description?: string }>;
};

const NAV: SettingsGroup[] = [
  {
    group: 'Conversas',
    items: [
      { id: 'channels', label: 'Canais', icon: Plug, description: 'WhatsApp, IG, Telegram, Email…' },
      { id: 'ai-agents', label: 'Agentes IA', icon: Sparkles, description: 'Personas com prompt e tools' },
      { id: 'knowledge', label: 'Base de conhecimento', icon: BookOpen, description: 'Artigos para os agentes' },
      { id: 'bots', label: 'Bots / Fluxos', icon: Bot, description: 'Atendimento automatizado (legado)' },
      { id: 'quick-replies', label: 'Respostas rápidas', icon: Zap, description: '/atalhos' },
    ],
  },
  {
    group: 'Atendimento',
    items: [
      { id: 'teams', label: 'Times / Setores', icon: Building2 },
      { id: 'users', label: 'Usuários', icon: Users },
      { id: 'tags', label: 'Tags', icon: Tag },
      { id: 'sla', label: 'SLA', icon: Timer },
    ],
  },
  {
    group: 'Crescimento',
    items: [
      { id: 'campaigns', label: 'Campanhas', icon: Megaphone, description: 'Disparos em massa' },
      { id: 'audiences', label: 'Audiências', icon: Boxes },
      { id: 'templates', label: 'Templates', icon: MessageSquareText },
      { id: 'opt-outs', label: 'Opt-outs', icon: ShieldCheck },
    ],
  },
  {
    group: 'Análise',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: ChartBar }],
  },
  {
    group: 'Sistema',
    items: [
      { id: 'llm', label: 'LLM / IA', icon: Sparkles, description: 'Chaves de API + modelo' },
      { id: 'audit', label: 'Auditoria', icon: ScrollText },
      { id: 'account', label: 'Conta', icon: UserCircle },
    ],
  },
];

const FLAT = NAV.flatMap((g) => g.items);

export function SettingsOverlay() {
  const [section, setSection] = React.useState<string | null>(() => readSection());

  React.useEffect(() => {
    const handler = () => setSection(readSection());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const isOpen = section !== null;

  const close = React.useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('settings');
    window.history.pushState({}, '', url.toString());
    setSection(null);
  }, []);

  const navigate = React.useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('settings', id);
    window.history.pushState({}, '', url.toString());
    setSection(id);
  }, []);

  const activeItem = FLAT.find((i) => i.id === section);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        side="full"
        className="flex flex-col gap-0 bg-background p-0 sm:max-w-none"
        hideClose
      >
        {/* Header --------------------------------------------------- */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Voltar para a inbox"
              className="md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <SheetTitle className="truncate text-base font-semibold">
              Configurações
              {activeItem && (
                <>
                  <span className="px-2 text-muted-foreground">/</span>
                  <span className="text-foreground">{activeItem.label}</span>
                </>
              )}
            </SheetTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Fechar configurações"
            className="hidden md:inline-flex"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* Body — sidebar + content -------------------------------- */}
        <div className="flex min-h-0 flex-1">
          <SettingsSidebar activeId={section} onNavigate={navigate} />
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <div className="mx-auto max-w-5xl">
              <SettingsSection sectionId={section} />
            </div>
          </main>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------
// Sidebar
// ----------------------------------------------------------------

function SettingsSidebar({
  activeId,
  onNavigate,
}: {
  activeId: string | null;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Seções de configuração"
      className="hidden h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-2 py-3 md:flex lg:w-72"
    >
      {NAV.map((group, idx) => (
        <div key={group.group}>
          {idx > 0 && <Separator className="my-2" />}
          <div className="px-3 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.group}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      active
                        ? 'bg-surface-2 text-foreground'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ----------------------------------------------------------------
function readSection(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const s = params.get('settings');
  return s && FLAT.some((i) => i.id === s) ? s : s !== null ? 'channels' : null;
}
