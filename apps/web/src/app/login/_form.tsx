'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/inbox';

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        toast.error('Credenciais inválidas. Verifique e tente novamente.');
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <a
            href="/forgot-password"
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Esqueci minha senha
          </a>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={submitting} className="mt-2">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Entrar
      </Button>

      <div className="flex items-center gap-3 pt-2">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => signIn('google', { callbackUrl })}
        >
          Continuar com Google
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => signIn('microsoft-entra-id', { callbackUrl })}
        >
          Continuar com Microsoft
        </Button>
      </div>
    </form>
  );
}
