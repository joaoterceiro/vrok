> O plano completo de arquitetura, design e fases de implementação do **Zora OS** vive em
> `~/.claude/plans/preciso-pranejar-a-cria-o-stateful-kazoo.md` (cópia do agente Claude Code).
>
> Este arquivo serve como ponteiro dentro do repositório.

# Resumo executivo

Plataforma single-tenant, self-hosted, de atendimento ao cliente multicanal.

- **Canais:** WhatsApp (Evolution + Cloud API oficial), Instagram Direct, Telegram, Webchat, Email
- **Funcionalidades:** inbox unificada, atribuição, filas/setores, tags, notas internas, respostas rápidas, chatbot + IA (multi-provider), disparos em massa com templates+variáveis+rate-limit+opt-out, métricas/SLA
- **Stack:** Next.js 15 (App Router, TS) + custom Socket.IO server · Drizzle/Postgres · Redis/BullMQ · MinIO · NextAuth · Docker Compose + Caddy
- **UI:** dark-only com paleta `shark`, layout chat-first responsivo (mobile/tablet/desktop), boilerplate `shadcn-chat`, configurações atrás de um único botão ⚙

# Fases

| # | Fase | Status |
|---|------|--------|
| 0 | Bootstrap (estrutura, layout, auth) | em andamento |
| 1 | Canal Evolution + inbox funcional | a fazer |
| 2 | Times, filas, atribuição | a fazer |
| 3 | Canais adicionais (Cloud/IG/TG/Webchat/Email) | a fazer |
| 4 | Chatbot + IA (multi-provider) | a fazer |
| 5 | Disparos em massa (campanhas) | a fazer |
| 6 | Métricas e SLA | a fazer |
