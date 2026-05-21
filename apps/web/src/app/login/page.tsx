import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { LoginForm } from './_form';

export const metadata: Metadata = {
  title: 'Entrar',
};

// Login uses useSearchParams() to read callbackUrl — must be dynamic.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/vrok-icon.svg"
            alt="Vrok"
            width={64}
            height={60}
            priority
            className="h-14 w-auto"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            Atendimento multicanal — entre para acessar a inbox.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-lg">
          <Suspense fallback={<div className="h-64 animate-pulse rounded bg-surface-2" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Ao entrar você concorda com os termos de uso. © Vrok
        </p>
      </div>
    </main>
  );
}
