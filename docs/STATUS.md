# Vrok — Mapa de Status (2026-05-18)

Auditoria do que está pronto, parcial ou ausente para alcançar 100% funcional.
Legenda: ✅ pronto · 🟡 parcial / não validado e2e · 🔴 ausente · 🚧 placeholder

---

## 1. Canais (6 planejados)

| Canal | Adapter | Webhook | Send | Histórico | Status real |
|---|---|---|---|---|---|
| **WhatsApp Evolution** | ✅ | ✅ + HMAC | ✅ (texto, mídia, áudio) | ✅ via `findChats` | **funcional** — validado |
| **WhatsApp Cloud (Meta)** | ✅ | ✅ + HMAC | ✅ texto + template | n/a (Meta não expõe) | 🟡 nunca testado e2e — precisa app Meta real |
| **Instagram Direct** | ✅ | ✅ | ✅ | n/a | 🟡 mesma situação |
| **Telegram** | ✅ | ✅ `setWebhook` | ✅ | n/a | 🟡 precisa bot token + ngrok/tunnel |
| **Webchat widget** | ✅ adapter | n/a | ✅ | n/a | 🟡 widget JS existe (`/api/widget/[id]/embed.js`); precisa testar embed em página externa |
| **Email IMAP/SMTP** | ✅ adapter | poll worker | ✅ via SMTP | via IMAP fetch | 🟡 `emailPoll` worker existe; nunca testado contra Gmail/Outlook real |

**O que falta:** smoke test end-to-end de cada canal não-Evolution com credenciais reais.

---

## 2. Inbox / Conversas

| Recurso | Status |
|---|---|
| Lista de conversas + filtros (Minhas/Não atribuídas/Time/Resolvidas/Todas) | ✅ |
| Thread com bolhas, status (sent/delivered/read), grupos por dia | ✅ |
| Composer com tiptap, slash commands, anexos, áudio, emoji picker | ✅ |
| Painel direito (6 acordeões: Contato, Resumo IA, Ações, Tags, Notas, Anexos, Histórico) | ✅ |
| **Busca por nome/telefone** (campo no topo da lista) | ✅ — filtro client-side já funcional |
| Atribuição manual + transferência entre times | ✅ |
| Quick replies (/) | ✅ |
| Resolver / Adiar / Reabrir | ✅ |
| **Bloquear contato** (+ opt-out automático) | ✅ |
| Mesclar contato duplicado | 🔴 ausente (botão mencionado no plano não implementado) |
| Pre-fill snooze date custom | 🔴 só presets 1h/24h |
| Tipping indicator (`typing:start/stop`) | 🟡 evento declarado, não emitido pela UI |
| Presença online/busy/offline | 🟡 schema existe, sem UI ativa |
| Paginação cursor-based (`/api/conversations`) | 🟡 hardcode `limit(500)` ainda em algumas queries |

---

## 3. Bots / Agentes IA

| Recurso | Status |
|---|---|
| Tabela `ai_agents` + 4 templates (Triagem, FAQ, Pré-venda, Pós-venda CSAT) | ✅ |
| Atribuição por canal + override por conversa + agente padrão | ✅ |
| Worker `runAgent` com idempotency lock (Redis SETNX) | ✅ |
| Tool: `handoff` | ✅ funcional |
| Tool: `search_kb` | 🔴 declarado nos templates, **não existe knowledge base** |
| Tool: `create_task` | 🔴 não existe sistema de tarefas |
| Pausar/Trocar agente no header da conversa | ✅ |
| **Resumo IA** no painel direito | ✅ com cache |
| **Transcrição de áudio** (Whisper) | ✅ Groq + OpenAI fallback |
| Settings → LLM/IA (provider + 3 API keys criptografadas) | ✅ |
| Editor visual de fluxos (node-based) | 🔴 só JSON cru no `bot_flows` legacy |

**O que falta crítico:** **knowledge base** (`search_kb`) e **sistema de tarefas** (`create_task`) — sem eles os templates Pré-venda e Pós-venda têm a ferramenta desabilitada na prática.

---

## 4. Campanhas / Disparos em massa

| Recurso | Status |
|---|---|
| Schema completo (campaigns, campaign_messages, audiences, templates, opt_outs) | ✅ |
| Workers `campaignDispatcher` + `campaignSend` com rate-limit por canal | ✅ |
| UI: lista de templates, audiências, campanhas, opt-outs | ✅ |
| Audiência CSV upload | ✅ (`/api/audiences/[id]/import`) |
| Audiência filtro/segmento dinâmico | 🟡 schema existe, UI ainda manual |
| Wizard de nova campanha (canal → template → audiência → variáveis → agendamento) | 🟡 existe mas não validado e2e |
| **Dry-run** com preview dos 3 primeiros | 🔴 não implementado |
| Confirmação dupla acima de 500 contatos | 🔴 não implementado |
| Janela horária por canal (ex: WA só 08h–20h) | 🔴 não implementado |
| Detecção de duplicidade (mesmo template/contato em N horas) | 🔴 não implementado |
| Relatório em tempo real (Socket.IO push de progresso) | 🟡 worker emite eventos, UI não os consome |
| Exportar CSV do relatório | 🔴 |
| Submissão de template ao WA Cloud (Meta approval) | 🔴 só CRUD local, não chama Meta |
| Botão Pausar / Retomar / Cancelar | ✅ endpoints existem |

**Crítico para uso real:** dry-run, confirmação dupla, janela horária, relatório em tempo real.

---

## 5. Times / Usuários / Permissões

| Recurso | Status |
|---|---|
| CRUD times | ✅ |
| CRUD usuários (admin cria + define role) | ✅ |
| Roles: admin/supervisor/agent | ✅ definido no schema + guards |
| Atribuição round-robin de conversas | 🟡 helper `autoAssignIfNeeded` existe, não testado em produção |
| Auditoria de eventos (acessos, mudanças) | 🚧 placeholder "em construção" |
| Convite por email (signup invite link) | 🔴 admin precisa criar usuário manualmente |
| Reset de senha / esqueci minha senha | 🔴 ausente |
| SSO Google/Microsoft | 🟡 código existe (`auth.ts`); precisa variáveis de env válidas |

---

## 6. SLA + Métricas + Dashboard

| Recurso | Status |
|---|---|
| Schema `sla_rules` + worker que aplica due dates | ✅ |
| UI Settings → SLA com CRUD | ✅ |
| Indicador pulsante quando SLA estoura | 🟡 due_at calculado, UI mostra mas não há alerta |
| Snapshots agregados (`metrics_snapshots`) — TMA, TME, conversas resolvidas | ✅ worker `computeMetrics` |
| Dashboard com filtros + charts | 🟡 query funciona, gráficos ainda crus (apenas números) |
| Exportar CSV de métricas | ✅ `/api/metrics/export` |
| Métricas de campanhas integradas no dashboard | 🔴 |

---

## 7. Tempo real (Socket.IO)

| Recurso | Status |
|---|---|
| Custom server Next + Socket.IO + Redis adapter | ✅ |
| JWT auth no handshake + room ACL | ✅ |
| Eventos: `message:new`, `conversation:updated`, `message:status` | ✅ |
| `typing:start/stop` | 🟡 declarado, não emitido |
| `presence:update` | 🟡 declarado, não emitido |
| `campaign:progress` | 🟡 worker emite, UI não escuta |
| Reconexão com backoff exponencial | ✅ ioredis default |
| Indicador visual de conexão (verde/amarelo/vermelho) | 🔴 ausente |

---

## 8. Auth / Onboarding

| Recurso | Status |
|---|---|
| Login email+senha | ✅ |
| Sessão JWT compartilhada com Socket.IO | ✅ |
| Logout | 🟡 botão existe mas usa `console.log` placeholder em `app-shell.tsx:260` — **bug crítico** |
| Signup público | 🔴 não existe |
| Esqueci minha senha | 🔴 |
| 2FA | 🔴 |
| Convite de novo membro do time | 🔴 |
| SSO Google | 🟡 código pronto, faltam env vars |
| SSO Microsoft | 🟡 idem |

---

## 9. Configurações (Settings overlay)

Todas as 14 seções têm implementação real (CRUD com queries) **exceto**:

| Seção | Status |
|---|---|
| Channels | ✅ 867 loc, full CRUD + Evolution connect |
| Bots / Fluxos (legado) | ✅ |
| Agentes IA (novo) | ✅ |
| Quick replies | ✅ |
| Teams | ✅ |
| Users | ✅ |
| Tags | ✅ |
| SLA | ✅ |
| Campaigns | ✅ |
| Audiences | ✅ |
| Templates | ✅ |
| Opt-outs | ✅ |
| Dashboard | ✅ |
| LLM / IA | ✅ |
| **Auditoria** | 🚧 placeholder "em construção" |
| **Conta** (perfil/senha/sessões) | 🚧 placeholder "em construção" |

---

## 10. Ops / Observabilidade

| Recurso | Status |
|---|---|
| `/api/health` rico (DB + Redis + MinIO + Evolution) | ✅ |
| `/admin/queues` (Bull Board nativo) com retry/delete por job | ✅ |
| Script `scripts/backup.sh` (pg_dump diário) | ✅ |
| Pino logs estruturados | ✅ |
| `correlation_id` por job | ✅ (Fase 8) |
| DLQ configurada nas filas | ✅ |
| Alerting (Slack/PagerDuty quando algo quebra) | 🔴 |
| Monitoramento de métricas (Prometheus/Grafana) | 🔴 |
| Trace distribuído | 🔴 |

---

## 11. Testes / CI

| Recurso | Status |
|---|---|
| Vitest config | ✅ 1 arquivo de teste (`evolution.test.ts`) — só smoke |
| Playwright config + 3 specs | ✅ smoke (health, login, inbox redirect) |
| GitHub Actions CI | ✅ workflow `ci.yml` |
| Cobertura > 50% | 🔴 hoje é < 5% |
| Tests dos workers (jobs) | 🔴 |
| Tests dos webhook handlers | 🔴 |
| Tests e2e de campanha completa | 🔴 |
| Lighthouse CI | 🔴 |
| Chromatic/Percy visual regression | 🔴 |

---

## 12. Detalhes que matam credibilidade

| Item | Status |
|---|---|
| Logo Vrok (SVG dark + icon) | ✅ |
| Favicon | ✅ `vrok-icon.svg` |
| Página 404 com identidade Vrok | ✅ (refatorada hoje) |
| Página 500 / erro genérico | 🔴 não customizada |
| Loading skeleton 3-pane | ✅ (refatorado hoje) |
| Empty states contextualizados | ✅ inbox, mas faltam em Settings vazias |
| Meta tags (Open Graph, Twitter card) | 🟡 só title + description |
| Robots.txt / sitemap | 🔴 (não relevante p/ app autenticado) |

---

## 13. Mobile / Responsividade

| Recurso | Status |
|---|---|
| Layout 1-pane no mobile (lista → thread navegação stack) | 🟡 estrutura existe (`AppShell` tem prop `hasOpenConversation`), nunca foi testado em device real |
| Bottom-tab bar em vez de trilho lateral | 🔴 não implementado — hoje o trilho fica visível em todas as larguras |
| Touch targets ≥ 44px | 🟡 maioria OK, alguns ícones `h-8 w-8` borderline |
| `safe-area-inset-bottom` no composer | ✅ `.safe-bottom` definida |
| Teclado virtual não cobre composer | 🟡 precisa testar em iOS Safari |
| Playwright matrix 3 viewports | 🟡 config existe, specs ainda mínimas |

---

# Priorização — o que falta para "100% pronto pra produção"

## 🔴 Bloqueadores reais

1. **Logout quebrado** (`app-shell.tsx:260` — placeholder `console.log`)
2. **Knowledge Base** (sem ela, agentes IA não conseguem responder dúvidas com base nos docs da empresa)
3. **Smoke test e2e de cada canal não-Evolution** (Cloud, Instagram, Telegram, Webchat, Email)
4. **Wizard de campanha com dry-run + relatório em tempo real**
5. **Submissão de template ao WA Cloud** (sem isso campanhas oficiais ficam impossíveis)
6. **Auditoria + Conta** (placeholders "em construção")
7. **Convite + Reset de senha** (signup admin-only é OK, mas reset é crítico)

## 🟡 Alto valor, próximos sprints

8. Indicador de "digitando…" + presença
9. Mesclar contatos duplicados
10. Janela horária + duplicidade em campanhas
11. Mobile bottom-tab bar (responsividade real)
12. Charts no Dashboard
13. Indicador de status da conexão Socket.IO

## 🟢 Polish / não-bloqueante

14. Alerting (Slack webhook quando job falha)
15. Lighthouse CI + Chromatic
16. Coverage de testes > 50%
17. Página 500 customizada
18. 2FA

---

# Estimativa de esforço para 100%

| Bucket | Esforço | Justificativa |
|---|---|---|
| Bloqueadores reais (1-7) | **3–4 semanas** | Logout (1h), KB (1 semana), e2e channels (1 semana), Wizard campanha + relatório (1 semana), templates Meta (3 dias), audit+conta (3 dias), convite+reset (2 dias) |
| Alto valor (8-13) | **2–3 semanas** | Cada item ~2-3 dias |
| Polish (14-18) | **1–2 semanas** | Pode rodar em paralelo |

**Total estimado: ~6–9 semanas** para de "MVP+ funcional hoje" → "produção real para empresa pagante".

---

# O que já é melhor que a média

- Multi-instância WhatsApp + history sync robusto ✅
- LLM stack com keys via UI + cache ✅
- Resumo IA + transcrição de áudio (rivais não têm) ✅
- Bull Board nativo + correlation_id ✅
- HMAC + UNIQUE idempotency + path traversal sanitization ✅
- Identidade visual sólida (SF Pro + lime brand + dark-only) ✅
