'use client';

/**
 * Botão "Conectar WhatsApp via Meta" — abre Embedded Signup popup.
 *
 * Pré-requisitos no .env:
 *   NEXT_PUBLIC_WHATSAPP_APP_ID=807898312281646
 *   NEXT_PUBLIC_WHATSAPP_CONFIGURATION_ID=1215609116730360
 *
 * Fluxo:
 *   1. Carrega Facebook JS SDK
 *   2. Usuário clica botão → FB.login com config_id + response_type=code
 *   3. Popup Meta autentica + autoriza WBA(s)
 *   4. Callback recebe {code, wabaId, phoneNumberId} via window message
 *   5. POST /api/channels/whatsapp/embedded-signup → trocamos token + criamos canal
 */
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        cb: (response: { authResponse?: { code: string }; status?: string }) => void,
        opts: {
          config_id: string;
          response_type: string;
          override_default_response_type: boolean;
          extras: { setup?: Record<string, unknown>; featureType?: string; sessionInfoVersion?: string };
        },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type SignupResult = {
  ok: boolean;
  channelId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  webhookUrl?: string;
  verifyToken?: string;
  error?: string;
  detail?: string;
};

export function EmbeddedSignupButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const APP_ID = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID;
  const CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIGURATION_ID;

  useEffect(() => {
    if (!APP_ID) return;
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    window.fbAsyncInit = function () {
      window.FB?.init({
        appId: APP_ID!,
        cookie: true,
        xfbml: true,
        version: 'v22.0',
      });
      setSdkReady(true);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
    return () => {
      delete window.fbAsyncInit;
    };
  }, [APP_ID]);

  // Listener para mensagens do popup do Embedded Signup (eventos session_info)
  useEffect(() => {
    let lastSession: Record<string, unknown> | null = null;
    function onMessage(e: MessageEvent) {
      if (e.origin !== 'https://www.facebook.com' && e.origin !== 'https://web.facebook.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          lastSession = data.data ?? null;
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function start() {
    if (!sdkReady || !window.FB || !CONFIG_ID) return;
    setResult(null);
    setLoading(true);
    window.FB.login(
      async (response) => {
        try {
          if (!response.authResponse?.code) {
            setResult({ ok: false, error: 'cancelled', detail: 'Usuário cancelou o popup' });
            setLoading(false);
            return;
          }
          const r = await fetch('/api/channels/whatsapp/embedded-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code: response.authResponse.code }),
          });
          const data = (await r.json()) as SignupResult;
          setResult(r.ok ? data : { ok: false, ...data });
        } catch (err) {
          setResult({ ok: false, error: 'network', detail: (err as Error).message });
        } finally {
          setLoading(false);
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      },
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div className="rounded-md border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
        ⚠️ Embedded Signup não configurado. Defina <code>NEXT_PUBLIC_WHATSAPP_APP_ID</code> e{' '}
        <code>NEXT_PUBLIC_WHATSAPP_CONFIGURATION_ID</code> no Ambiente.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={start}
        disabled={!sdkReady || loading}
        className="inline-flex items-center gap-2 rounded-md bg-[#1877f2] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1466cc] disabled:opacity-50 transition"
      >
        {loading ? 'Conectando…' : !sdkReady ? 'Carregando SDK Meta…' : '🟢 Conectar WhatsApp via Meta'}
      </button>

      <p className="text-xs text-muted-foreground max-w-md">
        Você será redirecionado(a) para a Meta. Faça login, escolha sua WhatsApp Business Account
        e autorize o Vrok. Os tokens são gerados automaticamente.
      </p>

      {result?.ok && (
        <div className="rounded-md border border-emerald-700 bg-emerald-950/40 p-4 text-sm text-emerald-200 space-y-1">
          ✅ <strong>Canal conectado!</strong>
          <div>Número: {result.displayPhoneNumber}</div>
          <div>Verificado como: {result.verifiedName}</div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Detalhes do webhook (cadastrar na Meta App)</summary>
            <div className="mt-2 space-y-1 font-mono">
              <div>URL: {result.webhookUrl}</div>
              <div>Verify Token: {result.verifyToken}</div>
            </div>
          </details>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-rose-700 bg-rose-950/40 p-4 text-sm text-rose-200">
          ❌ {result.error}: {result.detail}
        </div>
      )}
    </div>
  );
}
