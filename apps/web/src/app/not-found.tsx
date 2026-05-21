import Link from 'next/link';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 404 page — editorial identity instead of a generic Next.js fallback.
 * Fraunces serif for the big number plus a hairline brand accent so the
 * page still feels like Vrok even outside the app shell.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link
          href="/inbox"
          className="font-display text-base font-medium tracking-tight hover:text-brand-400"
        >
          Vrok
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          404 · página não encontrada
        </span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="relative">
          <span className="font-display text-[120px] leading-none tracking-tight text-foreground sm:text-[160px]">
            404
          </span>
          <span className="absolute -bottom-1 left-1/2 h-[3px] w-16 -translate-x-1/2 bg-brand-500" />
        </div>

        <div className="max-w-md space-y-2">
          <h1 className="font-display text-xl font-medium tracking-tight">
            Esta página saiu do ar.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O link pode estar quebrado, a conversa foi resolvida, ou o canal foi removido.
            Volte à inbox e tente de novo.
          </p>
        </div>

        <Button asChild className="gap-2">
          <Link href="/inbox">
            <MessageSquare className="h-4 w-4" />
            Ir para a inbox
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground">
        Se você acha que isso é um bug, fale com o admin do workspace.
      </footer>
    </main>
  );
}
