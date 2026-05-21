'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  if (sent) {
    return (
      <div className="w-full max-w-md space-y-3 rounded-lg border border-brand-700/40 bg-brand-950/30 p-5 text-sm">
        <div className="flex items-center gap-2 text-brand-300">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium">Email enviado</span>
        </div>
        <p className="text-xs text-foreground/80">
          Se este email tem conta no Vrok, você vai receber um link para redefinir a senha.
          Verifique a caixa de spam.
        </p>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">Voltar ao login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        await fetch('/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        }).catch(() => undefined);
        setSubmitting(false);
        setSent(true);
      }}
      className="w-full max-w-md space-y-5 rounded-lg border border-border bg-surface p-6"
    >
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium tracking-tight">Redefinir senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite o email da sua conta. Enviaremos um link para criar uma nova senha.
        </p>
      </header>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com"
          required
          autoFocus
        />
      </div>

      <Button type="submit" disabled={submitting || !email} className="w-full gap-1.5">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Enviar link
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Lembrou? <Link href="/login" className="text-foreground hover:underline">Voltar ao login</Link>
      </p>
    </form>
  );
}
