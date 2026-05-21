'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Sparkles, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type Provider = 'anthropic' | 'openai' | 'groq';
interface Snapshot {
  provider: Provider | null;
  model: string | null;
  keys: {
    anthropic: { set: boolean; suffix: string | null };
    openai: { set: boolean; suffix: string | null };
    groq: { set: boolean; suffix: string | null };
  };
  env: { anthropic: boolean; openai: boolean; groq: boolean };
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const PROVIDER_INFO: Record<Provider, { label: string; placeholder: string; docs: string }> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-…',
    docs: 'console.anthropic.com',
  },
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-…',
    docs: 'platform.openai.com/api-keys',
  },
  groq: {
    label: 'Groq',
    placeholder: 'gsk_…',
    docs: 'console.groq.com/keys',
  },
};

export function LlmSection() {
  const qc = useQueryClient();
  const snap = useQuery<Snapshot>({
    queryKey: ['settings-llm'],
    queryFn: () => fetchJson<Snapshot>('/api/settings/llm'),
  });

  const [provider, setProvider] = React.useState<Provider>('anthropic');
  const [model, setModel] = React.useState('');
  const [anthropicKey, setAnthropicKey] = React.useState('');
  const [openaiKey, setOpenaiKey] = React.useState('');
  const [groqKey, setGroqKey] = React.useState('');
  const [show, setShow] = React.useState<Record<Provider, boolean>>({
    anthropic: false,
    openai: false,
    groq: false,
  });

  React.useEffect(() => {
    if (snap.data) {
      setProvider((snap.data.provider as Provider) ?? 'anthropic');
      setModel(snap.data.model ?? '');
    }
  }, [snap.data]);

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      fetchJson('/api/settings/llm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, vars) => {
      toast.success('Configuração salva');
      // Clear the just-saved key inputs so the masked snapshot reflects DB state.
      if ('anthropicKey' in vars) setAnthropicKey('');
      if ('openaiKey' in vars) setOpenaiKey('');
      if ('groqKey' in vars) setGroqKey('');
      qc.invalidateQueries({ queryKey: ['settings-llm'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (snap.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const data = snap.data;
  if (!data) return null;

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">LLM / IA</h2>
        <p className="text-sm text-muted-foreground">
          Configure o provedor de IA usado pelos agentes e pelo resumo de conversas. As chaves
          ficam <strong>criptografadas</strong> no banco (AES-GCM). Variáveis de ambiente são
          usadas como fallback quando o campo aqui está vazio.
        </p>
      </header>

      {/* Provider + model */}
      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold">Provedor ativo</h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['anthropic', 'openai', 'groq'] as const).map((p) => {
            const active = provider === p;
            const hasKey = data.keys[p].set || data.env[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition ${
                  active
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-medium">{PROVIDER_INFO[p].label}</span>
                  {hasKey ? (
                    <Badge variant="success" className="text-[10px]">
                      pronto
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      sem chave
                    </Badge>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {data.env[p] && !data.keys[p].set && 'usando env var'}
                  {data.keys[p].set && `chave …${data.keys[p].suffix}`}
                  {!data.env[p] && !data.keys[p].set && 'nenhuma chave configurada'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="model">Modelo (opcional)</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="auto (claude-sonnet-4-5, gpt-4o-mini, llama-3.1-70b-versatile…)"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => save.mutate({ provider, model: model || null })}
              disabled={save.isPending}
              className="gap-1.5"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar provedor
            </Button>
          </div>
        </div>
      </div>

      <Separator className="bg-border/60" />

      {/* API keys per provider */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">API Keys</h3>
        </div>

        {(['anthropic', 'openai', 'groq'] as const).map((p) => {
          const info = PROVIDER_INFO[p];
          const stored = data.keys[p];
          const envOnly = data.env[p] && !stored.set;
          const stateValue = p === 'anthropic' ? anthropicKey : p === 'openai' ? openaiKey : groqKey;
          const setStateValue =
            p === 'anthropic' ? setAnthropicKey : p === 'openai' ? setOpenaiKey : setGroqKey;
          const keyField = p === 'anthropic' ? 'anthropicKey' : p === 'openai' ? 'openaiKey' : 'groqKey';
          const visible = show[p];

          return (
            <div key={p} className="space-y-1 rounded-md border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`key-${p}`} className="text-sm font-medium">
                  {info.label}
                </Label>
                <div className="flex items-center gap-2">
                  {stored.set && (
                    <Badge variant="secondary" className="text-[10px]">
                      armazenada · …{stored.suffix}
                    </Badge>
                  )}
                  {envOnly && (
                    <Badge variant="secondary" className="text-[10px]">
                      via env var
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`key-${p}`}
                    type={visible ? 'text' : 'password'}
                    value={stateValue}
                    onChange={(e) => setStateValue(e.target.value)}
                    placeholder={stored.set ? '••••••••••• (digite para substituir)' : info.placeholder}
                    autoComplete="off"
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => ({ ...s, [p]: !s[p] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={visible ? 'Ocultar' : 'Mostrar'}
                  >
                    {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={save.isPending || !stateValue}
                  onClick={() => save.mutate({ [keyField]: stateValue })}
                >
                  Salvar
                </Button>
                {stored.set && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ [keyField]: null })}
                    className="text-rose-400"
                  >
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Obtenha em <span className="font-mono">{info.docs}</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
