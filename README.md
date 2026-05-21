# Zora OS

Plataforma de atendimento ao cliente multicanal — single-tenant, self-hosted.

Unifica conversas de **WhatsApp (Evolution API + Cloud API oficial)**, **Instagram Direct**, **Telegram**, **Webchat** e **Email** em uma inbox única, com filas/setores, atribuição de atendentes, chatbot com IA, disparos em massa (campanhas) e métricas/SLA.

## Stack

- **App:** Next.js 15 (App Router, TypeScript) + custom server (Socket.IO)
- **UI:** Tailwind CSS + shadcn/ui + shadcn-chat — **dark only**, paleta `shark`
- **DB:** PostgreSQL + Drizzle ORM
- **Queue/Cache/PubSub:** Redis + BullMQ
- **Storage:** MinIO (S3-compatible)
- **Auth:** NextAuth/Auth.js
- **Deploy:** Docker Compose + Caddy (TLS automático)

## Desenvolvimento

```bash
# 1. Pré-requisitos: Node 20+, pnpm 9+, Docker
cp .env.example .env       # preencher chaves

# 2. Subir infra
docker compose up -d postgres redis minio evolution caddy

# 3. Instalar dependências e migrar banco
pnpm install
pnpm db:migrate
pnpm db:seed               # cria admin@zora.local / admin

# 4. Subir app e worker
pnpm dev
```

App: http://localhost:3000 → login → cai direto na inbox de chat.

## Estrutura

```
apps/
  web/         # Next.js (UI + API routes + Socket.IO)
  worker/      # BullMQ workers (inbound, outbound, media, bot, campaigns)
packages/
  db/          # Drizzle schema + migrations
  shared/      # Tipos, zod schemas, ChannelAdapter interface
docker-compose.yml
Caddyfile
```

Veja o plano completo em [docs/PLAN.md](docs/PLAN.md).
