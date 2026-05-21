'use client';

import * as React from 'react';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelsSection } from './sections/channels';
import { UsersSection } from './sections/users';
import { TeamsSection } from './sections/teams';
import { TagsSection } from './sections/tags';
import { QuickRepliesSection } from './sections/quick-replies';
import { BotsSection } from './sections/bots';
import { AiAgentsSection } from './sections/ai-agents';
import { LlmSection } from './sections/llm';
import { AccountSection } from './sections/account';
import { AuditSection } from './sections/audit';
import { KnowledgeSection } from './sections/knowledge';
import { TemplatesSection } from './sections/templates';
import { AudiencesSection } from './sections/audiences';
import { CampaignsSection } from './sections/campaigns';
import { OptOutsSection } from './sections/opt-outs';
import { DashboardSection } from './sections/dashboard';
import { SlaSection } from './sections/sla';

/**
 * Section renderer — wired sections expose real CRUD; the rest fall back to
 * a polished "in construction" placeholder for the upcoming phases.
 */
export function SettingsSection({ sectionId }: { sectionId: string | null }) {
  if (!sectionId) return <Welcome />;
  switch (sectionId) {
    case 'channels':
      return <ChannelsSection />;
    case 'users':
      return <UsersSection />;
    case 'teams':
      return <TeamsSection />;
    case 'tags':
      return <TagsSection />;
    case 'quick-replies':
      return <QuickRepliesSection />;
    case 'bots':
      return <BotsSection />;
    case 'ai-agents':
      return <AiAgentsSection />;
    case 'llm':
      return <LlmSection />;
    case 'account':
      return <AccountSection />;
    case 'audit':
      return <AuditSection />;
    case 'knowledge':
      return <KnowledgeSection />;
    case 'templates':
      return <TemplatesSection />;
    case 'audiences':
      return <AudiencesSection />;
    case 'campaigns':
      return <CampaignsSection />;
    case 'opt-outs':
      return <OptOutsSection />;
    case 'dashboard':
      return <DashboardSection />;
    case 'sla':
      return <SlaSection />;
    default: {
      const meta = META[sectionId] ?? META.channels;
      return <SectionPlaceholder title={meta.title} description={meta.description} />;
    }
  }
}

function Welcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <h2 className="font-display text-2xl font-medium tracking-tight">Configurações</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Escolha uma seção na barra lateral para começar.
      </p>
    </div>
  );
}

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
        <Construction className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-medium">Em construção</h3>
        <p className="max-w-sm text-xs text-muted-foreground">
          Esta seção será implementada nas próximas fases do roadmap. A estrutura, layout e
          paleta já estão prontas para receber os componentes funcionais.
        </p>
        <Button variant="outline" size="sm" disabled>
          Em breve
        </Button>
      </div>
    </section>
  );
}

const META: Record<string, { title: string; description: string }> = {
  channels: {
    title: 'Canais',
    description:
      'Conecte e gerencie suas instâncias de WhatsApp (Evolution / Cloud), Instagram Direct, Telegram, Webchat e Email.',
  },
  bots: {
    title: 'Bots e Fluxos',
    description: 'Crie fluxos de atendimento automatizado com triagem por IA e handoff humano.',
  },
  'ai-agents': {
    title: 'Agentes IA',
    description:
      'Crie agentes com persona, prompt e ferramentas. Atribua por canal ou defina um agente padrão.',
  },
  knowledge: {
    title: 'Base de conhecimento',
    description:
      'Artigos curados que alimentam a ferramenta search_kb dos agentes IA.',
  },
  llm: {
    title: 'LLM / IA',
    description:
      'Provedor, modelo e chaves de API usadas pelos agentes e pelo resumo de conversas.',
  },
  'quick-replies': {
    title: 'Respostas rápidas',
    description: 'Atalhos do tipo /ola, /endereco que aparecem no composer quando o atendente digita "/".',
  },
  teams: {
    title: 'Times / Setores',
    description: 'Vendas, suporte, financeiro… cada time pode ter sua própria fila e regras de SLA.',
  },
  users: {
    title: 'Usuários',
    description: 'Adicione atendentes, supervisores e administradores. Defina permissões e times.',
  },
  tags: {
    title: 'Tags',
    description: 'Etiquetas para classificar contatos e conversas (VIP, lead frio, em garantia…).',
  },
  sla: {
    title: 'SLA',
    description: 'Regras de tempo de primeira resposta e resolução, por canal e prioridade.',
  },
  campaigns: {
    title: 'Campanhas',
    description:
      'Disparos em massa com template, audiência, variáveis personalizadas, agendamento e relatório em tempo real.',
  },
  audiences: {
    title: 'Audiências',
    description: 'Listas de contatos manuais, importadas de CSV ou geradas por filtros dinâmicos.',
  },
  templates: {
    title: 'Templates de mensagem',
    description:
      'Templates aprovados (Meta HSM) e livres (Evolution) com placeholders, botões, header e footer.',
  },
  'opt-outs': {
    title: 'Opt-outs',
    description:
      'Contatos que pediram para não receber mais comunicados (LGPD). Bloqueia disparos automaticamente.',
  },
  dashboard: {
    title: 'Dashboard',
    description: 'TMA, TME, conversas resolvidas, performance por atendente, canal e time.',
  },
  audit: {
    title: 'Auditoria',
    description: 'Log de eventos do sistema — acessos, alterações em conversas, configurações.',
  },
  account: {
    title: 'Minha conta',
    description: 'Perfil, idioma, notificações, senha, sessões ativas.',
  },
};
