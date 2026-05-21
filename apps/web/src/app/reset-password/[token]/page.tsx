import { ResetPasswordForm } from './_form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Redefinir senha' };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-display text-base font-medium tracking-tight">Vrok</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Redefinir senha
        </span>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <ResetPasswordForm token={token} />
      </div>
    </main>
  );
}
