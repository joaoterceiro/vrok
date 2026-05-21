import { ForgotPasswordForm } from './_form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Esqueci a senha' };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-display text-base font-medium tracking-tight">Vrok</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Esqueci a senha
        </span>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
