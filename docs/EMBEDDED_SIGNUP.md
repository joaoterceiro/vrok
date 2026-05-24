# WhatsApp Embedded Signup — Cadastro Incorporado

Permite conectar WhatsApp Business sem cadastros manuais. O usuário clica
**"Conectar WhatsApp via Meta"** → popup OAuth da Meta → Vrok cria o canal
automaticamente, com tokens gerados e app já subscribed na WBA (resolve o
problema de criar templates).

## Como funciona

```
[Frontend] FB.login(config_id) ──→ popup Meta
                                       ↓
                              Usuário autoriza WBA
                                       ↓
        ┌──────────────────────────────────────────┐
        │ Callback recebe `code` short-lived       │
        └──────────────────────────────────────────┘
                                       ↓
[Frontend] POST /api/channels/whatsapp/embedded-signup { code }
                                       ↓
[Backend] 1. exchange code → access_token
          2. debug_token → extrai WABA IDs
          3. listPhoneNumbers(wabaId) → Phone Number ID
          4. subscribeAppToWaba ✅ (libera criação de templates)
          5. cria channel no DB criptografado (AES-GCM)
          6. retorna { webhookUrl, verifyToken } para configurar na Meta App
```

## Pré-requisitos

### 1. Tech Provider App configurada na Meta

A app `ormely-app-cartorio` (ID `807898312281646`) precisa estar configurada como
**Solution Partner / Tech Provider** com:
- WhatsApp product habilitado
- Embedded Signup configuration criada (gera o `WHATSAPP_CONFIGURATION_ID`)
- Domínios do app cadastrados (chat.cartoriocentrojaboatao.com.br)
- Privacy/Terms/Data Deletion URLs aprovadas

### 2. Env vars no Easypanel (Ambiente)

Server-side (já estão no compose):
```bash
WHATSAPP_APP_ID=2489558831518918
WHATSAPP_APP_SECRET=<copie de developers.facebook.com → App → Settings → Basic>
WHATSAPP_CONFIGURATION_ID=2133148960601315
WHATSAPP_CLOUD_API_ENABLED=true
```

Client-side (precisam do prefixo `NEXT_PUBLIC_`):
```bash
NEXT_PUBLIC_WHATSAPP_APP_ID=2489558831518918
NEXT_PUBLIC_WHATSAPP_CONFIGURATION_ID=2133148960601315
```

### 3. Use o componente no UI

Adicione em **Settings → Canais → Novo canal WhatsApp Cloud**:

```tsx
import { EmbeddedSignupButton } from '@/components/settings/embedded-signup-button';

// ... no form:
<EmbeddedSignupButton />
```

## Arquivos

| Arquivo | Função |
|---|---|
| `apps/web/src/lib/whatsapp-embedded.ts` | Helpers backend (token exchange, debug, subscribe) |
| `apps/web/src/app/api/channels/whatsapp/embedded-signup/route.ts` | Endpoint POST que recebe code e cria canal |
| `apps/web/src/components/settings/embedded-signup-button.tsx` | Botão React + FB SDK |

## Cadastro do Embedded Signup Configuration na Meta

1. https://developers.facebook.com/apps/807898312281646/
2. WhatsApp → Embedded Signup → **Create Configuration**
3. Preencha:
   - **Name:** Vrok Cartório Onboarding
   - **Setup type:** Tech Provider
   - **Linked CTA:** Phone number entry
   - **Phone provider:** Meta (Cloud API)
4. Salve e copie o **Configuration ID** → use em `WHATSAPP_CONFIGURATION_ID`

## Vantagens vs. cadastro manual

| | Manual | Embedded Signup |
|---|---|---|
| Tempo do cadastro | 30+ min | < 60s |
| Token permanente | precisa System User | automático |
| App subscribed na WBA | manual (bug que tivemos hoje) | automático |
| Gestão de templates via API | bloqueada sem BSP | liberada |
| UX para clientes | terrível | excelente |

## Limitações

- Funciona apenas com Tech Provider App aprovada pela Meta
- Aprovação inicial pode levar 7-14 dias (revisão Meta)
- Pode exigir verificação de Business + Privacy Policy publicada (✅ já temos)
