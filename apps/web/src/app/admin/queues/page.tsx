import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { QueuesDashboard } from './_client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Filas · Admin' };

export default async function QueuesAdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/admin/queues');
  if (session.user.role !== 'admin') redirect('/inbox');

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Filas BullMQ</h1>
            <p className="text-xs text-muted-foreground">
              Snapshot dos jobs em filas. Atualiza automaticamente a cada 3 segundos.
            </p>
          </div>
          <a
            href="/inbox"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← voltar à inbox
          </a>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">
        <QueuesDashboard />
      </div>
    </main>
  );
}
