# Vrok — Deploy no Easypanel

## Passo a passo

### 1. Publicar as imagens no GitHub Container Registry

```bash
# Mova o workflow para o diretório padrão do GitHub Actions:
mkdir -p .github/workflows
mv deploy/docker-publish.yml .github/workflows/

# Refresh do token gh com permissão para workflows (uma vez só):
gh auth refresh -s workflow

git add .github/workflows/docker-publish.yml
git commit -m "ci: publish docker images to ghcr.io"
git push
```

A primeira run vai demorar ~5min e publica:

- `ghcr.io/joaoterceiro/vrok-web:latest`
- `ghcr.io/joaoterceiro/vrok-worker:latest`

Verifique em **Github → Profile → Packages**.

Se o repo do GitHub for **privado**, as imagens herdam visibilidade privada por
padrão. Crie um **Personal Access Token** com escopo `read:packages` em
**Github → Settings → Developer settings → Tokens (classic)**.

---

### 2. Configurar o Easypanel

1. **Easypanel → Settings → Registry → Add**
   - Type: GitHub Container Registry
   - Username: seu user GitHub
   - Password: PAT criado acima

2. **Projects → Create Project → `vrok`**

3. **Project → Environment → adicione cada variável:**

   ```
   APP_URL              https://vrok.seudominio.com
   AUTH_SECRET          $(openssl rand -base64 32)
   APP_SECRET           $(openssl rand -base64 32)
   POSTGRES_PASSWORD    <senha forte>
   MINIO_ROOT_PASSWORD  <≥ 8 chars>
   EVOLUTION_API_KEY    <string qualquer>
   META_VERIFY_TOKEN    <string qualquer>

   # opcionais — também configuráveis pela UI depois
   ANTHROPIC_API_KEY    sk-ant-...
   OPENAI_API_KEY       sk-...
   GROQ_API_KEY         gsk_...
   SLACK_ALERT_WEBHOOK  https://hooks.slack.com/...
   ```

4. **Project → Create Service → Compose**
   Cole o conteúdo de `deploy/easypanel.yml`.

5. **Cada serviço → Domains:**
   - `app` → porta `3000` → `vrok.seudominio.com` (HTTPS ON)
   - `minio` → porta `9001` → `minio.seudominio.com` (opcional, console)
   - `evolution` → porta `8080` → `evo.seudominio.com` (opcional)

6. **Deploy** e aguarde todos os healthchecks ficarem verdes.

---

### 3. Migrations + seed inicial

Logo após o primeiro deploy, rode as migrations + seed do admin:

```bash
# Easypanel → app → Console
pnpm --filter @zora/db push --force
pnpm --filter @zora/db tsx src/seed.ts        # cria admin@vrok.local / vrok123
pnpm --filter @zora/db tsx src/seed-agents.ts # 4 templates de agente IA
```

Acesse `https://vrok.seudominio.com` e faça login com **admin@vrok.local / vrok123**.
Imediatamente troque a senha em ⚙ → Minha conta.

---

### 4. Webhook DNS para canais oficiais

| Canal | URL para configurar no provider |
|---|---|
| WA Cloud (Meta) | `https://vrok.seudominio.com/api/webhooks/wa-cloud` |
| Instagram (Meta) | `https://vrok.seudominio.com/api/webhooks/instagram` |
| Telegram | (automático — o Vrok chama `setWebhook` no boot do canal) |

Veja `docs/CHANNELS_CHECKLIST.md` para credenciais + smoke test.

---

## Troubleshooting

**Imagens não puxam:**
- Cheque o registry no Easypanel (Settings → Registry → Test)
- Veja se o workflow `docker-publish.yml` rodou: github.com/joaoterceiro/vrok/actions

**App não conecta no Postgres:**
- Espera o healthcheck. Easypanel mostra status verde quando OK.
- Cheque logs: `Easypanel → app → Logs`

**Webhook Meta retorna 401:**
- `META_VERIFY_TOKEN` no Easypanel precisa ser **idêntico** ao cadastrado na Meta App.

**Evolution não pareia:**
- A imagem `evoapicloud/evolution-api:latest` já vem com Baileys novo, mas se o WhatsApp atualizar a v de protocol você precisa atualizar `CONFIG_SESSION_PHONE_VERSION`.
- Cole no `Evolution → Environment`:
  ```
  CONFIG_SESSION_PHONE_VERSION=<nova versão WA>
  ```

**MinIO 403 em upload:**
- Volume não persistiu nos restarts. Verifique `Easypanel → Volumes → minio-data` está montado.
