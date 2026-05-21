# Vrok — Checklist de validação de canais

Este documento lista o que cadastrar, como testar webhook + send, e como diagnosticar problemas em cada um dos 6 canais suportados. Use-o quando estiver onboarding um cliente novo ou validando um deploy de produção.

> **Pré-requisitos comuns**
> - Domínio público com HTTPS (Caddy + DNS apontando para a VPS)
> - `APP_URL` configurado em `.env` apontando para esse domínio (ex.: `https://vrok.cartorio.com.br`)
> - Pelo menos 1 admin no Vrok (criado via `pnpm db:seed` ou `/api/users`)

---

## 1. WhatsApp Evolution (Baileys, não-oficial)

### Credenciais necessárias
- Instância Evolution rodando (já incluída no `docker-compose.yml` deste repo)
- `EVOLUTION_API_KEY` global no `.env`

### Passos
1. ⚙ **Canais → Novo canal → WhatsApp · Evolution**
2. Nome qualquer (ex.: "Loja Centro"), nome da instância (slug minúsculo)
3. Clique **Conectar** → escaneie o QR code no app do WhatsApp do celular
4. Após pareamento, o card mostra **Conectado** com selo verde
5. **History sync** dispara automaticamente — aguarde o toast "Sincronização concluída"

### Smoke test
- Envie mensagem do celular para o número conectado → aparece na inbox em < 2s
- Responda pela UI com texto, imagem, áudio (mic), documento → chega no WhatsApp
- ⚙ **Canais → 🗑 Excluir canal** → deve remover instância upstream da Evolution

### Diagnóstico
- Se ficar em "Conectando…" sem mostrar QR: ver `docker compose logs evolution`
- Se mensagens não chegarem: ⚙ **Auditoria** → filtrar `type=channel.message_received`
- Se history sync travar: ⚙ **Canais → Sincronizar** força reinício; worker registra orphan recovery no boot

---

## 2. WhatsApp Cloud API (Meta oficial)

### Credenciais necessárias
1. **Meta App** em developers.facebook.com (tipo Business)
2. Produto **WhatsApp** adicionado ao app
3. **WABA ID** (WhatsApp Business Account ID)
4. **Phone Number ID** (do número de teste ou aprovado)
5. **Access Token** permanente (System User)
6. **Verify Token** (string aleatória que você cria — ex.: `vrok_abc123`)

### Passos
1. **Configurar webhook na Meta:**
   - URL: `https://<seu-domínio>/api/webhooks/wa-cloud`
   - Verify Token: o mesmo que você vai cadastrar no Vrok
   - Subscribe to: `messages`, `message_template_status_update`
2. **Vrok:** ⚙ **Canais → Novo canal → WhatsApp Cloud**
   - Phone Number ID
   - WABA ID
   - Access Token (criptografado em AES-GCM no banco)
   - Verify Token (idêntico ao da Meta)
3. **Validar** clicando em **Testar conexão** no card

### Smoke test
- Enviar mensagem do app pessoal pro número da Meta → aparece na inbox
- Responder texto pela UI → entrega no WhatsApp
- ⚙ **Templates → Novo → wa_cloud** → criar `hello_world` → **Submeter** → status `pending` → quando a Meta aprovar, webhook flipa pra `approved` automaticamente

### Diagnóstico
- Webhook GET handshake falha → cheque `VerifyToken` (case-sensitive)
- 401 nos POSTs → HMAC signature: confira `META_APP_SECRET` no `.env`
- Templates ficam `rejected` → ⚙ Templates → ver `rejectionReason`

---

## 3. Instagram Direct

### Credenciais necessárias
- Mesma Meta App do WA Cloud, com produto **Messenger** + **Instagram** habilitados
- **Instagram Business Account** vinculada a uma página do Facebook
- **Page Access Token** (escopos: `instagram_basic`, `instagram_manage_messages`, `pages_messaging`)
- Verify Token (string aleatória)

### Passos
1. Configurar webhook Meta: `https://<seu-domínio>/api/webhooks/instagram`
2. Subscribe to: `messages`, `messaging_postbacks`
3. Vrok: ⚙ Canais → Novo canal → Instagram → Page Access Token + Instagram Business ID + Verify Token

### Smoke test
- DM do Instagram do celular para a página → aparece na inbox
- Responder texto pela UI → chega no IG

### Diagnóstico
- Mensagens não chegam: webhook precisa estar **aprovado** no review da Meta (modo de desenvolvedor só funciona com IDs whitelisted)
- 403 no webhook GET: verify token errado

---

## 4. Telegram

### Credenciais necessárias
- Bot criado via **@BotFather** no Telegram
- **Bot Token** (string `123456:ABC...`)

### Passos
1. Vrok: ⚙ Canais → Novo canal → Telegram → cole o token
2. Vrok chama `setWebhook` no Telegram automaticamente apontando para `https://<seu-domínio>/api/webhooks/telegram/<channelId>`

### Smoke test
- Mande `/start` para o bot no app do Telegram → aparece na inbox
- Responder texto, foto, áudio pela UI → chegam no Telegram

### Diagnóstico
- Comandar `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` para ver se o webhook foi setado e se há erros
- Se receber `Conflict`: provavelmente outro processo está fazendo getUpdates (polling) — só pode existir uma forma de receber updates por bot

---

## 5. Webchat (widget JS embeddable)

### Credenciais necessárias
- Nenhuma — basta criar o canal no Vrok

### Passos
1. ⚙ Canais → Novo canal → Webchat → escolher saudação + cor (futuro)
2. Vrok gera um snippet JS único:
   ```html
   <script src="https://<seu-domínio>/api/widget/<channelId>/embed.js" defer></script>
   ```
3. Cole no `<head>` do site do cliente

### Smoke test
- Abrir o site do cliente → bolha do chat aparece no canto inferior direito
- Digitar mensagem → aparece na inbox
- Responder → aparece no widget em tempo real (Socket.IO)

### Diagnóstico
- Widget não carrega: cheque CORS no Caddy + `APP_URL`
- Widget carrega mas não conecta: F12 → console → ver se o socket.io conecta no `wss://<dominio>/socket.io`

---

## 6. Email (IMAP/SMTP)

### Credenciais necessárias
- **IMAP**: host, port (geralmente 993 SSL), usuário, senha (ou App Password p/ Gmail)
- **SMTP**: host, port (587 STARTTLS), usuário, senha
- **From address** (ex.: `atendimento@empresa.com.br`)

### Passos
1. ⚙ Canais → Novo canal → Email → preencher host/port/credenciais
2. O worker `email-poll` busca novas mensagens a cada 2 minutos (configurável via cron na queue)

### Smoke test
- Mandar email para a caixa monitorada → aparece na inbox em até 2min
- Responder pela UI → chega no email do remetente original

### Diagnóstico
- Gmail rejeita IMAP login: precisa de **App Password** (16 chars) + 2FA habilitado
- SMTP timeout: alguns provedores bloqueiam port 25 — use 587 STARTTLS ou 465 SSL
- Logs: ⚙ Auditoria → `type=email.fetched`

---

## Variáveis de ambiente — checklist

```
# Auth
AUTH_SECRET=  # gere com `openssl rand -base64 32`
APP_SECRET=   # idem — usado p/ criptografar config de canais

# URLs
APP_URL=https://vrok.cartorio.com.br
INTERNAL_APP_URL=http://app:3000  # usado pela Evolution dentro do compose
NEXTAUTH_URL=https://vrok.cartorio.com.br

# Postgres / Redis / MinIO
DATABASE_URL=postgres://zora:senha@postgres:5432/zora
REDIS_URL=redis://redis:6379
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio_strong_secret
MINIO_BUCKET=zora-media
MINIO_INTERNAL_URL=http://minio:9000  # usado p/ presigned URLs internas

# Evolution
EVOLUTION_URL=http://evolution:8080
EVOLUTION_API_KEY=change_me_evolution_global_api_key

# Meta (compartilhado entre WA Cloud + Instagram)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=vrok_<random>
WEBHOOK_ENFORCE_SIGNATURE=true  # produção sempre

# Telegram (opcional global; o bot token vai no Vrok por canal)
TELEGRAM_WEBHOOK_BASE=https://vrok.cartorio.com.br

# Email — SMTP de transactional emails (convites + reset de senha)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@empresa.com.br

# Ops
SLACK_ALERT_WEBHOOK=https://hooks.slack.com/services/...  # opcional
LOG_LEVEL=info

# LLM (fallback — pode ser sobrescrito por ⚙ LLM/IA)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
```

---

## Roteiro de smoke test end-to-end (1h)

1. Login admin → ⚙ LLM/IA → cadastrar API key Anthropic ou Groq
2. ⚙ Canais → conectar Evolution → escanear QR → aguardar history sync
3. ⚙ Agentes IA → "Usar template Triagem inicial" → atribuir ao canal Evolution
4. ⚙ Base de conhecimento → criar 1 artigo (ex.: "Horário de funcionamento")
5. Mandar mensagem do celular → bot responde citando o artigo
6. ⚙ Usuários → convidar membro → aceitar convite em janela anônima → login
7. Atribuir conversa para o novo membro → ver mudança em tempo real
8. ⚙ Templates → criar wa_cloud → submeter à Meta (se WA Cloud conectado)
9. ⚙ Campanhas → criar nova → preview (dry-run) → disparar para audiência de teste
10. ⚙ Auditoria → ver feed completo dos eventos das últimas etapas

Se todos os 10 passos passarem sem erros nos logs, o deploy está pronto para produção.
