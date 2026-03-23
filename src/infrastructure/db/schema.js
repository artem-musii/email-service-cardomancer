import { pgTable, pgEnum, uuid, varchar, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'

const statusEnum = pgEnum('email_status', ['queued', 'sent', 'failed'])

const emailLog = pgTable(
  'email_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    toAddress: varchar('to_address', { length: 255 }).notNull(),
    subject: varchar('subject', { length: 500 }),
    template: varchar('template', { length: 100 }).notNull(),
    status: statusEnum('status').default('queued').notNull(),
    error: text('error'),
    attempt: integer('attempt').default(1).notNull(),
    maxRetries: integer('max_retries').default(0).notNull(),
    variables: jsonb('variables'),
    fromEmail: varchar('from_email', { length: 255 }),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_email_log_status_created').on(table.status, table.createdAt),
    index('idx_email_log_template').on(table.template),
    index('idx_email_log_to_address').on(table.toAddress),
  ],
)

const emailTemplates = pgTable('email_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).unique().notNull(),
  subject: varchar('subject', { length: 500 }),
  fromName: varchar('from_name', { length: 255 }),
  html: text('html').notNull(),
  variables: text('variables').array().notNull().default([]),
  maxRetries: integer('max_retries').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export { statusEnum, emailLog, emailTemplates }
