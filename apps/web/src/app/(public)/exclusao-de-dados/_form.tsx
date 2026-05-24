'use client';

/**
 * Formulário público de requisição LGPD.
 * POST /api/lgpd/request — registra a solicitação no DB e dispara e-mail ao DPO.
 */
import { useState } from 'react';

type RequestType = 'access' | 'correct' | 'delete' | 'portability' | 'consent_revoke' | 'other';

const TYPES: Array<{ value: RequestType; label: string }> = [
  { value: 'access', label: 'Acessar meus dados' },
  { value: 'correct', label: 'Corrigir dados incorretos' },
  { value: 'delete', label: 'Excluir/anonimizar dados (não-registrais)' },
  { value: 'portability', label: 'Portabilidade (exportar meus dados)' },
  { value: 'consent_revoke', label: 'Revogar consentimento (parar de receber mensagens)' },
  { value: 'other', label: 'Outra solicitação' },
];

export function LgpdRequestForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; protocol?: string; message?: string }>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      fullName: String(fd.get('fullName') || ''),
      cpf: String(fd.get('cpf') || ''),
      email: String(fd.get('email') || ''),
      phone: String(fd.get('phone') || ''),
      requestType: String(fd.get('requestType') || '') as RequestType,
      details: String(fd.get('details') || ''),
      hcaptchaToken: 'skip', // placeholder — substituir por hCaptcha em produção
    };

    try {
      const r = await fetch('/api/lgpd/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        setResult({ ok: true, protocol: data.protocol });
        (e.target as HTMLFormElement).reset();
      } else {
        setResult({ ok: false, message: data.error || 'Erro ao enviar.' });
      }
    } catch {
      setResult({ ok: false, message: 'Falha de rede. Tente novamente ou use o e-mail do DPO.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="not-prose mt-4 space-y-4 rounded-xl border border-border bg-surface p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome completo *" name="fullName" required minLength={3} placeholder="Maria da Silva" />
        <Field label="CPF *" name="cpf" required placeholder="000.000.000-00" />
        <Field label="E-mail *" name="email" type="email" required placeholder="voce@exemplo.com" />
        <Field label="Telefone (com DDD)" name="phone" placeholder="(81) 99999-9999" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tipo de solicitação *</label>
        <select
          name="requestType"
          required
          defaultValue=""
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="" disabled>Selecione…</option>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Detalhes da solicitação *</label>
        <textarea
          name="details"
          required
          minLength={20}
          rows={5}
          placeholder="Descreva detalhadamente o que deseja. Quanto mais informação, mais rápido conseguiremos te atender."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Mínimo 20 caracteres. Não inclua senhas ou códigos de segurança.
        </p>
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-4">
        <p>
          Ao enviar, você autoriza o tratamento dos dados deste formulário (nome, CPF, e-mail,
          telefone) apenas para responder à sua solicitação LGPD. Esses dados serão excluídos 90
          dias após conclusão do atendimento.
        </p>
        <p className="mt-2">
          Em até 15 dias úteis, nosso Encarregado (DPO) responderá ao e-mail informado. Para
          casos urgentes, ligue (81) 3316-2908.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-500 px-4 py-3 text-sm font-semibold text-background hover:bg-brand-400 disabled:opacity-50 transition"
      >
        {submitting ? 'Enviando…' : 'Enviar solicitação'}
      </button>

      {result?.ok && (
        <div className="rounded-md border border-emerald-700 bg-emerald-950/40 p-4 text-sm text-emerald-200">
          ✅ Solicitação registrada com sucesso!<br />
          Protocolo: <strong>{result.protocol}</strong><br />
          Verifique seu e-mail nos próximos minutos para confirmação.
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-rose-700 bg-rose-950/40 p-4 text-sm text-rose-200">
          ❌ {result.message}<br />
          Em caso de problema persistente, envie diretamente para dpo@cartoriocentrojaboatao.com.br
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        minLength={minLength}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />
    </div>
  );
}
