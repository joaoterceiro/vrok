'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface Preview {
  email?: string;
  role?: string;
  note?: string | null;
  expiresAt?: string;
  error?: string;
}

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) setPreview({ error: body?.error ?? 'unknown' });
        else setPreview(body);
      })
      .catch(() => setPreview({ error: 'network' }));
  }, [token]);

  if (!preview) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando convite…
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="w-full max-w-md space-y-3 rounded-lg border border-rose-700/40 bg-rose-950/30 p-5 text-sm text-rose-200">
        <div className="flex items-center gap-2 text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            {preview.error === 'expired'
              ? 'Convite expirado'
              : preview.error === 'already_used'
                ? 'Convite já utilizado'
                : 'Convite inválido'}
          </span>
        </div>
        <p className="text-xs text-rose-200/80">
          Peça ao admin do workspace para gerar um novo link.
        </p>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter ao menos 8 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'invalid');

      // Auto-login then redirect to inbox.
      const result = await signIn('credentials', {
        email: preview.email!,
        password,
        redirect: false,
      });
      if (result?.error) {
        // Account created but auto-login failed — fall back to login page.
        router.push('/login?accepted=1');
        return;
      }
      router.push('/inbox');
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
        <h1 className="font-display text-2xl font-medium tracking-tight">Você foi convidado</h1>
        <p className="text-sm text-muted-foreground">
          Crie sua conta para acessar o workspace.
        </p>
      </header>

      <div className="space-y-2 rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Email</span>
          <span className="font-mono">{preview.email}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Papel</span>
          <Badge variant="secondary" className="capitalize">
            {preview.role}
          </Badge>
        </div>
        {preview.note && (
          <div className="border-t border-border pt-2 text-muted-foreground">{preview.note}</div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Seu nome</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Maria Souza"
          required
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pwd">Defina uma senha</Label>
        <Input
          id="pwd"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
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
          required
          minLength={8}
        />
      </div>

      {error && <div className="text-xs text-rose-400">{error}</div>}

      <Button type="submit" disabled={submitting || !name || !password} className="w-full gap-1.5">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Criar conta e entrar
      </Button>
    </form>
  );
}
