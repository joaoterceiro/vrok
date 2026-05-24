# Meta App Review — Submissão de produção

Documenta como sair de **Development Mode** e publicar a app `ormely-app-cartorio`
para qualquer cidadão poder mandar mensagem ao número do cartório.

## Pré-requisitos (✅ já atendidos)

- [x] WBA verificada (`business_verification_status: verified`)
- [x] Display name aprovado ("Serventia do Registro Civil das Pessoas Naturais 2 Distrito de Jaboatão")
- [x] WhatsApp Business Account `869181022790717` ativa
- [x] App `ormely-app-cartorio` subscribed à WBA real
- [x] System User Token com `whatsapp_business_messaging` e `whatsapp_business_management`
- [x] Webhook configurado e respondendo (`/api/webhooks/wa-cloud`)

## URLs LGPD a cadastrar na App

Acesse: https://developers.facebook.com/apps/1732498437633195/app-settings/basic/

Preencha os 3 campos no painel **"Configurações Básicas"**:

| Campo | Valor |
|---|---|
| **URL da Política de Privacidade** | `https://chat.cartoriocentrojaboatao.com.br/privacidade` |
| **URL dos Termos de Serviço** | `https://chat.cartoriocentrojaboatao.com.br/termos` |
| **URL de Exclusão de Dados do Usuário** | `https://chat.cartoriocentrojaboatao.com.br/exclusao-de-dados` |
| **Categoria** | Empresas e páginas |
| **Subcategoria** | Atendimento ao cliente |
| **Ícone do App (1024×1024)** | Logo do cartório |
| **Site do App** | `https://cartoriocentrojaboatao.com.br` |

Clique **Salvar alterações**.

## Verificação do Business

Se ainda não verificou o Business Manager:

1. https://business.facebook.com → Settings → **Segurança do negócio**
2. **Iniciar verificação** → preencher dados do CNPJ
3. Enviar comprovante (Cartão CNPJ ou Contrato Social)
4. Aguardar 2-7 dias úteis

## Submissão para Review

Após Business verificado + URLs LGPD preenchidas:

1. https://developers.facebook.com/apps/1732498437633195/app-review/permissions/
2. Selecione as permissões usadas:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
3. Para cada permissão, descreva caso de uso:
   - **Como você está utilizando essa permissão?**
     > "Atendimento oficial do cartório de registro civil via WhatsApp Business — recepção de pedidos de certidões, agendamentos, esclarecimentos sobre serviços notariais."
   - **Forneça etapas para testar:**
     > 1. Envie mensagem para +55 81 3016-2808<br>
     > 2. O bot Áurea recebe e responde via API<br>
     > 3. Cidadão pode escalar para atendente humano
4. **Submeter para análise**

Prazo médio: 3-7 dias úteis.

## Após aprovação

A app sai de Development Mode. Qualquer número WhatsApp pode mandar mensagem
para `+55 81 3016-2808` sem precisar estar pré-cadastrado.

## Limitações até a aprovação

- Apenas números cadastrados em `WhatsApp → API Setup → "Para"` recebem/enviam
- Limit de 250 conversas/dia (free tier)
- Templates funcionam normalmente para esses números cadastrados
