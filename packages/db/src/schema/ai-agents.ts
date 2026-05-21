import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  boolean,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { channels } from './channels';

/**
 * AI agents — replaces the old `bot_flows` model. Each agent is a named
 * persona with a system prompt, LLM config, and a set of enabled tools.
 *
 * Agents come in two flavors:
 *   - Templates (`is_template=true`): curated defaults shipped with the
 *     product (Triagem, FAQ, Pré-venda, etc). Read-only; users clone them
 *     to create their own.
 *   - User agents (`is_template=false`): created/edited by org users.
 *
 * Routing precedence when an inbound message arrives:
 *   1. Conversation-level override (`conversations.agent_id`)
 *   2. Channel assignment (`agent_assignments`) by `priority DESC`
 *   3. Org default (`ai_agents.is_default=true`)
 *   4. No agent → message stays in pending for humans
 */
export const aiAgents = pgTable(
  'ai_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Display name shown in galleries and dropdowns. */
    name: varchar('name', { length: 120 }).notNull(),
    /** URL-safe identifier for templates (e.g. `triagem`, `faq`). Null for user-created. */
    slug: varchar('slug', { length: 64 }),
    /** One-line description for the gallery card. */
    description: text('description'),
    /** Optional avatar (emoji or URL) for chat bubbles + gallery. */
    avatar: varchar('avatar', { length: 255 }),
    /** Structured persona — tone, language, name the bot uses, etc. */
    persona: jsonb('persona').$type<{
      tone?: string;
      language?: string;
      identity?: string;
    }>().notNull().default({}),
    /** Main system prompt fed to the LLM. */
    systemPrompt: text('system_prompt').notNull(),
    /** Optional first message sent on new conversations. */
    greeting: text('greeting'),
    /** Provider/model/temperature/etc. */
    llmConfig: jsonb('llm_config').$type<{
      provider?: 'anthropic' | 'openai' | 'groq';
      model?: string;
      temperature?: number;
      maxTokens?: number;
      handoffKeywords?: string[];
    }>().notNull().default({}),
    /** Enabled tools: `handoff`, `search_kb`, `create_task`, etc. */
    toolsEnabled: text('tools_enabled').array().notNull().default(sql`'{}'::text[]`),
    /** True for shipped templates (read-only in UI). */
    isTemplate: boolean('is_template').notNull().default(false),
    /** True for the org-wide fallback agent. At most one. */
    isDefault: boolean('is_default').notNull().default(false),
    /** When false, agent is disabled everywhere regardless of assignments. */
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    slugUq: uniqueIndex('ai_agents_slug_uq').on(t.slug),
    templateIdx: index('ai_agents_template_idx').on(t.isTemplate),
  }),
);

/**
 * N:N — which channels each agent answers for, with a priority for
 * deterministic resolution when multiple agents target the same channel
 * (highest priority wins).
 */
export const agentAssignments = pgTable(
  'agent_assignments',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.channelId] }),
    channelIdx: index('agent_assignments_channel_idx').on(t.channelId, t.priority),
  }),
);

export const aiAgentsRelations = relations(aiAgents, ({ many }) => ({
  assignments: many(agentAssignments),
}));

export const agentAssignmentsRelations = relations(agentAssignments, ({ one }) => ({
  agent: one(aiAgents, { fields: [agentAssignments.agentId], references: [aiAgents.id] }),
  channel: one(channels, { fields: [agentAssignments.channelId], references: [channels.id] }),
}));
