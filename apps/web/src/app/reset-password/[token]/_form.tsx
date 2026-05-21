'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Status = 'loading' | 'ok' | 'invalid' | 'expired' | 'already_used';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Status>('loading');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (r.ok) setStatus('ok');
        else if (body?.error === 'expired') setStatus('expired');
        else if (body?.error === 'already_used') setStatus('already_used');
        else setStatus('invalid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Validando link…
      </div>
    );
  }

  if (status !== 'ok') {
    return (
      <div className="w-full max-w-md space-y-3 rounded-lg border border-rose-700/40 bg-rose-950/30 p-5 text-sm text-rose-200">
        <div className="flex items-center gap-2 text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            {status === 'expired'
              ? 'Este link expirou'
              : status === 'already_used'
                ? 'Este link já foi utilizado'
                : 'Link inválido'}
          </span>
        </div>
        <p className="text-xs text-rose-200/80">
          Solicite um novo link em <a href="/login" className="underline">/login</a>.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-md space-y-3 rounded-lg border border-brand-700/40 bg-brand-950/30 p-5 text-sm">
        <div className="flex items-center gap-2 text-brand-300">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium">Senha redefinida</span>
        </div>
        <p className="text-xs text-foreground/80">
          Use a nova senha para entrar.
        </p>
        <Button className="w-full" onClick={() => router.push('/login')}>
          Ir para o login
        </Button>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    if (password !== confirm) return setError('As senhas não coincidem');
    if (password.length < 8) return setError('A senha precisa ter ao menos 8 caracteres');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'invalid');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="w-full max-w-md space-y-5 rounded-lg border border-border bg-surface p-6"
    >
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-medium tracking-tight">Nova senha</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma senha com ao menos 8 caracteres.
        </p>
      </header>

      <div className="space-y-1">
        <Label htmlFor="pwd">Nova senha</Label>
        <Input
          id="pwd"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          minLength={8}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="conf">Confirme a senha</Label>
        <Input
          id="conf"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />
      </div>

      {error && <div className="text-xs text-rose-400">{error}</div>}

      <Button type="submit" disabled={submitting || !password} className="w-full gap-1.5">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Redefinir senha
      </Button>
    </form>
  );
}
