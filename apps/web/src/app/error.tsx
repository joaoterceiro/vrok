'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Global error boundary. Replaces the default Next.js generic stack-trace
 * dump in production. Logs the error so it shows up in the docker logs
 * (Pino picks them up via the console transport) and gives the user a
 * recovery action.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[ui:error-boundary]', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

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
          500 · erro inesperado
        </span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="relative">
          <span className="font-display text-[120px] leading-none tracking-tight text-foreground sm:text-[160px]">
            500
          </span>
          <span className="absolute -bottom-1 left-1/2 h-[3px] w-16 -translate-x-1/2 bg-brand-500" />
        </div>

        <div className="max-w-md space-y-2">
          <h1 className="font-display text-xl font-medium tracking-tight">Algo quebrou aqui.</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O erro foi registrado no servidor. Tente novamente em alguns segundos. Se persistir,
            avise o admin do workspace.
          </p>
          {error.digest && (
            <p className="font-mono text-[11px] text-muted-foreground">
              Código: <span className="text-foreground">{error.digest}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={reset} variant="secondary" className="gap-1.5">
            <RotateCcw className="h-4 w-4" />
            Tentar de novo
          </Button>
          <Button asChild className="gap-1.5">
            <Link href="/inbox">
              Voltar à inbox
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground">
        Se conseguir reproduzir, descreva os passos para o admin acelerar a investigação.
      </footer>
    </main>
  );
}
