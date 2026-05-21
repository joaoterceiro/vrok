'use client';

import * as React from 'react';
import { Inbox, Bell, Settings, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SettingsOverlay } from '@/components/settings/settings-overlay';
import { useSocketStatus } from '@/hooks/use-socket';

type RailItem = {
  id: 'inbox' | 'notifications';
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

interface AppShellProps {
  /** Currently active rail item — used to highlight the button. */
  activeRail?: RailItem['id'];
  /** Conversation pane (left). May be empty on mobile when a conversation is open. */
  list?: React.ReactNode;
  /** Thread pane (center). Required. */
  thread: React.ReactNode;
  /** Optional contact details pane (right) — collapsible on desktop, sheet on mobile/tablet. */
  details?: React.ReactNode;
  /** Whether a conversation is currently open (controls mobile view). */
  hasOpenConversation?: boolean;
  /** Active user, for the avatar dropdown. */
  user?: { name: string | null; email: string | null; image: string | null };
  /** Notification badge count. */
  notificationCount?: number;
}

const railItems: RailItem[] = [
  { id: 'inbox', href: '/inbox', label: 'Inbox', icon: Inbox },
  { id: 'notifications', href: '/inbox?notif=1', label: 'Notificações', icon: Bell },
];

export function AppShell({
  activeRail = 'inbox',
  list,
  thread,
  details,
  hasOpenConversation,
  user,
  notificationCount,
}: AppShellProps) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* ===== Trilho lateral (desktop) — fixo à esquerda, 60px ===== */}
      <aside
        aria-label="Navegação principal"
        className="hidden h-full w-[60px] shrink-0 flex-col items-center justify-between border-r border-border bg-surface py-3 md:flex"
      >
        <div className="flex flex-col items-center gap-1">
          <div className="relative">
            <BrandMark />
            <ConnectionDot />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {railItems.map((item) => (
              <RailLink
                key={item.id}
                item={item}
                active={activeRail === item.id}
                badge={item.id === 'notifications' ? notificationCount : undefined}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <SettingsButton />
          <UserMenu user={user} />
        </div>
      </aside>

      {/* ===== Painéis principais ===== */}
      <div className="flex h-full min-w-0 flex-1">
        {/* Lista de conversas (esquerda) ----------------- */}
        <div
          className={cn(
            'h-full w-full shrink-0 border-r border-border bg-surface sm:w-[320px] lg:w-[360px] xl:w-[380px]',
            // mobile: esconder lista quando conversa está aberta + espaço para a bottom-tab bar
            hasOpenConversation ? 'hidden sm:flex' : 'flex',
            'flex-col pb-14 md:pb-0',
          )}
        >
          {list}
        </div>

        {/* Thread (centro) ------------------------------- */}
        <main
          className={cn(
            'h-full min-w-0 flex-1 flex-col bg-background',
            hasOpenConversation ? 'flex' : 'hidden sm:flex',
            // Reserva espaço para a bottom-tab bar quando a thread está aberta no mobile
            'pb-14 md:pb-0',
          )}
        >
          {thread}
        </main>

        {/* Painel direito (detalhes) — só ≥ lg ----------- */}
        {details && (
          <aside
            aria-label="Detalhes do contato"
            className="hidden h-full w-[320px] shrink-0 border-l border-border bg-surface lg:flex lg:flex-col"
          >
            {details}
          </aside>
        )}
      </div>

      {/* ===== Bottom tab bar (mobile, < md) ===== */}
      <nav
        aria-label="Navegação inferior"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-around border-t border-border bg-surface md:hidden"
      >
        {railItems.map((item) => (
          <RailLink
            key={item.id}
            item={item}
            active={activeRail === item.id}
            badge={item.id === 'notifications' ? notificationCount : undefined}
            variant="bottom"
          />
        ))}
        <SettingsButton variant="bottom" />
        <UserMenu user={user} variant="bottom" />
      </nav>

      {/* ===== Settings overlay (sheet controlado por ?settings=) ===== */}
      <SettingsOverlay />
    </div>
  );
}

// ----------------------------------------------------------------
// Pieces
// ----------------------------------------------------------------

function BrandMark() {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-lg"
      aria-label="Vrok"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vrok-icon.svg" alt="Vrok" className="h-7 w-7" />
    </div>
  );
}

function RailLink({
  item,
  active,
  badge,
  variant = 'side',
}: {
  item: RailItem;
  active?: boolean;
  badge?: number;
  variant?: 'side' | 'bottom';
}) {
  const Icon = item.icon;
  const button = (
    <a
      href={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative inline-flex items-center justify-center rounded-md transition-colors',
        variant === 'side' ? 'h-11 w-11' : 'h-12 w-12',
        active ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon className="h-5 w-5" />
      {badge && badge > 0 ? (
        <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </a>
  );
  if (variant === 'bottom') return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SettingsButton({ variant = 'side' }: { variant?: 'side' | 'bottom' }) {
  const handleClick = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('settings', 'channels');
    window.history.pushState({}, '', url.toString());
    // Dispatch a popstate so any subscribers update (Next.js useSearchParams listens to navigation).
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const btn = (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label="Configurações"
      className={cn(variant === 'bottom' ? 'h-12 w-12' : 'h-11 w-11')}
    >
      <Settings className="h-5 w-5" />
    </Button>
  );
  if (variant === 'bottom') return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right">Configurações</TooltipContent>
    </Tooltip>
  );
}

function UserMenu({
  user,
  variant = 'side',
}: {
  user?: AppShellProps['user'];
  variant?: 'side' | 'bottom';
}) {
  const fallback = (user?.name ?? user?.email ?? '?').slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center rounded-full ring-offset-background transition-shadow hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring',
            variant === 'bottom' ? 'h-9 w-9' : 'h-9 w-9',
          )}
          aria-label="Conta"
        >
          <Avatar>
            <AvatarFallback className="bg-surface-3 text-[11px] text-foreground">
              {fallback}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={variant === 'bottom' ? 'top' : 'right'} align="end">
        <DropdownMenuLabel>{user?.name ?? user?.email ?? 'Convidado'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openSettings('account')}>Minha conta</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            // NextAuth v5 — signOut() handles the POST + CSRF + redirect.
            void signOut({ callbackUrl: '/login' });
          }}
          className="text-rose-400 focus:text-rose-400"
        >
          <LogOut className="h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function openSettings(section: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('settings', section);
  window.history.pushState({}, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ----------------------------------------------------------------
// Realtime connection indicator
// ----------------------------------------------------------------

/**
 * Tiny status dot on the rail BrandMark. Green = connected, amber pulsing
 * = reconnecting, red = disconnected. Only renders when the connection
 * is NOT healthy so the rail stays clean in the happy path.
 */
function ConnectionDot() {
  const status = useSocketStatus();
  if (status === 'connected') return null;
  const cls =
    status === 'connecting'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-rose-500 animate-pulse';
  const label =
    status === 'connecting' ? 'Reconectando ao tempo real…' : 'Sem conexão tempo real';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={cn(
            'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface',
            cls,
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
