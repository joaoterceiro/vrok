'use client';

/**
 * Settings → LGPD
 * Painel admin para gerenciar solicitações LGPD vindas do formulário público
 * e disparar exportação/anonimização manualmente.
 */
import { useEffect, useState } from 'react';

type Status = 'pending' | 'in_progress' | 'resolved' | 'rejected';

interface LgpdRequest {
  id: string;
  protocol: string;
  requestType: string;
  fullName: string;
  cpfMasked: string;
  email: string;
  phone: string;
  details: string;
  status: Status;
  receivedAt: string;
  resolvedAt?: string;
  resolution?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendente',
  in_progress: 'Em análise',
  resolved: 'Atendida',
  rejected: 'Rejeitada',
};

const STATUS_COLOR: Record<Status, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-700',
  in_progress: 'bg-blue-500/15 text-blue-300 border-blue-700',
  resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-700',
  rejected: 'bg-rose-500/15 text-rose-300 border-rose-700',
};

const TYPE_LABEL: Record<string, string> = {
  access: 'Acesso',
  correct: 'Correção',
  delete: 'Exclusão',
  portability: 'Portabilidade',
  consent_revoke: 'Revogar consentimento',
  other: 'Outra',
};

export function LgpdSection() {
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [items, setItems] = useState<LgpdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<LgpdRequest | null>(null);

  async function reload() {
    setLoading(true);
    const r = await fetch(`/api/lgpd/requests?status=${filter}`, { credentials: 'include' });
    const data = await r.json();
    setItems(data.requests || []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Solicitações LGPD</h2>
          <p className="text-xs text-muted-foreground">
            Direitos exercidos via formulário público. Prazo legal: 15 dias úteis.
          </p>
        </div>
        <div className="flex gap-1 rounded-md bg-surface-2 p-1 text-xs">
          {(['all', 'pending', 'in_progress', 'resolved', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded px-3 py-1.5 transition ${
                filter === s ? 'bg-surface text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'Todas' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-sm font-medium">Nenhuma solicitação {filter !== 'all' ? `(${STATUS_LABEL[filter]})` : ''}.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Cidadãos solicitam em{' '}
            <a href="/exclusao-de-dados" target="_blank" className="underline">
              /exclusao-de-dados
            </a>
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Protocolo</th>
                <th className="px-4 py-2 text-left">Solicitante</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Recebida</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3 font-mono text-xs">{r.protocol}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.fullName}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{TYPE_LABEL[r.requestType] ?? r.requestType}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.receivedAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs ${STATUS_COLOR[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setOpen(r)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <RequestDrawer
          item={open}
          onClose={() => setOpen(null)}
          onUpdated={() => {
            setOpen(null);
            void reload();
          }}
        />
      )}

      <DataToolsCard />
    </div>
  );
}

function RequestDrawer({
  item,
  onClose,
  onUpdated,
}: {
  item: LgpdRequest;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [resolution, setResolution] = useState(item.resolution ?? '');
  const [status, setStatus] = useState<Status>(item.status);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await fetch(`/api/lgpd/requests/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status, resolution, notifyCitizen: notify }),
    });
    setSaving(false);
    if (r.ok) onUpdated();
    else alert('Erro ao salvar.');
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative ml-auto h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{item.protocol}</p>
            <h3 className="text-lg font-semibold">{item.fullName}</h3>
            <p className="text-xs text-muted-foreground">
              CPF: {item.cpfMasked} · {item.email} · {item.phone || 'sem telefone'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </header>

        <section className="mb-4 space-y-2">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">Tipo</h4>
          <p className="text-sm">{TYPE_LABEL[item.requestType]}</p>
        </section>

        <section className="mb-4">
          <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Detalhes</h4>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs">
            {item.details}
          </pre>
        </section>

        <section className="mb-4">
          <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </section>

        <section className="mb-4">
          <label className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
            Resposta ao cidadão
          </label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Descreva a resposta detalhada que será enviada por e-mail ao cidadão…"
          />
        </section>

        <section className="mb-4 flex items-center gap-2">
          <input
            id="notify"
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <label htmlFor="notify" className="text-sm">
            Enviar resposta por e-mail para <strong>{item.email}</strong>
          </label>
        </section>

        <footer className="flex gap-2 border-t border-border pt-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || resolution.length < 10}
            className="flex-1 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-background hover:bg-brand-400 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar resposta'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DataToolsCard() {
  const [contactInput, setContactInput] = useState('');
  const [exporting, setExporting] = useState(false);

  async function exportData() {
    if (!contactInput.trim()) return;
    setExporting(true);
    const body = contactInput.includes('@')
      ? { email: contactInput.trim() }
      : { phone: contactInput.trim() };
    const r = await fetch('/api/lgpd/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lgpd-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const err = await r.json();
      alert(`Erro: ${err.error}`);
    }
    setExporting(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="mb-1 text-sm font-semibold">Ferramentas administrativas</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Exportar (portabilidade) e anonimizar (esquecimento) dados de um contato específico.
      </p>
      <div className="flex gap-2">
        <input
          value={contactInput}
          onChange={(e) => setContactInput(e.target.value)}
          placeholder="e-mail ou telefone do titular"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={exportData}
          disabled={exporting}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {exporting ? 'Exportando…' : '📦 Exportar dados'}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        💡 Para anonimizar (erase), abra o contato na inbox → menu ⋮ → "Anonimizar (LGPD)" (admin only).
      </p>
    </div>
  );
}
