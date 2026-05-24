# Compliance LGPD — 2º Ofício de Registro Civil de Jaboatão

Documento técnico de conformidade com a Lei 13.709/2018.

## Páginas legais publicadas

| URL pública | Arquivo |
|---|---|
| `/privacidade` | `apps/web/src/app/(public)/privacidade/page.tsx` |
| `/termos` | `apps/web/src/app/(public)/termos/page.tsx` |
| `/exclusao-de-dados` | `apps/web/src/app/(public)/exclusao-de-dados/page.tsx` |

## Endpoints técnicos

| Rota | Acesso | Função |
|---|---|---|
| `POST /api/lgpd/request` | público | Recebe formulário, gera protocolo `LGPD-AAAAMMDD-XXXXX`, rate-limit, hCaptcha, e-mail DPO + confirmação ao cidadão |
| `GET /api/lgpd/requests` | admin/supervisor | Lista solicitações com filtro de status |
| `GET /api/lgpd/requests/[id]` | admin/supervisor | Detalhe completo |
| `PATCH /api/lgpd/requests/[id]` | admin/supervisor | Atualiza status, registra resposta, dispara e-mail ao cidadão |
| `POST /api/lgpd/export` | admin/supervisor | Exporta JSON com todos os dados do titular (portabilidade Art. 18, V) |
| `POST /api/lgpd/erase` | admin | Anonimização irreversível (esquecimento Art. 18, VI). Requer confirmação `"ANONIMIZAR"` |

## Bibliotecas auxiliares

| Arquivo | Função |
|---|---|
| `apps/web/src/lib/rate-limit.ts` | Redis token-bucket — `rateLimit({ key, limit, windowSec })` |
| `apps/web/src/lib/captcha.ts` | hCaptcha verify — `verifyCaptcha(token, ip)` |
| `apps/web/src/lib/email.ts` | SMTP/Nodemailer (já existe) |

## Painel admin

`apps/web/src/components/settings/sections/lgpd.tsx` — Settings → LGPD

- Lista solicitações com filtros (pendente / em análise / atendida / rejeitada)
- Drawer com detalhes e formulário de resposta
- Notificação automática por e-mail ao cidadão ao salvar
- Card de ferramentas: exportar dados de qualquer titular (download JSON)
- Audit log em `events.lgpd_request_action` para cada mudança de status

## Variáveis de ambiente

Adicione ao Easypanel → Ambiente:

```bash
# Notificações LGPD
DPO_EMAIL=dpo@cartoriocentrojaboatao.com.br

# SMTP (já existente)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_FROM='Vrok DPO <dpo@cartoriocentrojaboatao.com.br>'

# hCaptcha (opcional — skipa em dev se vazio)
HCAPTCHA_SECRET=0x0000...
NEXT_PUBLIC_HCAPTCHA_SITEKEY=10000000-ffff-ffff-ffff-000000000001
```

## Fluxo completo de uma solicitação LGPD

```
Cidadão acessa /exclusao-de-dados
        ↓
Preenche formulário (rate-limit 5/hora por IP)
        ↓
POST /api/lgpd/request
        ↓
1. Valida hCaptcha (se HCAPTCHA_SECRET setado)
2. Gera protocolo LGPD-AAAAMMDD-XXXXX
3. Persiste em `events` (audit-grade imutável)
4. Envia e-mail ao DPO
5. Envia confirmação ao cidadão
        ↓
DPO recebe notificação
        ↓
Acessa /inbox?settings=lgpd
        ↓
Vê solicitação como "Pendente"
        ↓
Abre drawer, marca "Em análise"
        ↓
Investiga + redige resposta
        ↓
Salva como "Atendida" com texto + checkbox "notificar cidadão"
        ↓
Sistema envia e-mail formal de resposta para o cidadão
Audit log salvo em events.lgpd_request_action
```

## Cadastro na Meta (App Review)

Ver `docs/META_APP_REVIEW.md`.

URLs a cadastrar no painel Meta:
- Privacy: `https://chat.cartoriocentrojaboatao.com.br/privacidade`
- Terms: `https://chat.cartoriocentrojaboatao.com.br/termos`
- Data Deletion: `https://chat.cartoriocentrojaboatao.com.br/exclusao-de-dados`

## DPO (Encarregado)

- **E-mail:** dpo@cartoriocentrojaboatao.com.br
- **Telefone:** (81) 3316-2908
- **Endereço:** Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE

## Próximas evoluções (backlog)

- [ ] hCaptcha plugado no front (`_form.tsx` — adicionar widget `@hcaptcha/react-hcaptcha`)
- [ ] Botão "Anonimizar (LGPD)" no menu do contato na inbox
- [ ] Cron de retenção: deletar `events.lgpd_request` resolvidos após 90 dias
- [ ] Export como ZIP com mídias incluídas (atualmente JSON-only)
- [ ] DPO dashboard com SLA tracking (X dias restantes pra responder)
- [ ] Webhook para incidentes de segurança (Art. 48 LGPD) — relatório automático à ANPD
