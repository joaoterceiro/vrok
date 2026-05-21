import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { channelType } from './enums';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }),
    avatarUrl: text('avatar_url'),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 255 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    phoneIdx: index('contacts_phone_idx').on(t.phone),
    emailIdx: index('contacts_email_idx').on(t.email),
  }),
);

export const contactIdentities = pgTable(
  'contact_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channelType: channelType('channel_type').notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    uniqByChannel: uniqueIndex('contact_identities_channel_external_uq').on(
      t.channelType,
      t.externalId,
    ),
    contactIdx: index('contact_identities_contact_idx').on(t.contactId),
  }),
);

export const contactsRelations = relations(contacts, ({ many }) => ({
  identities: many(contactIdentities),
}));

export const contactIdentitiesRelations = relations(contactIdentities, ({ one }) => ({
  contact: one(contacts, { fields: [contactIdentities.contactId], references: [contacts.id] }),
}));
