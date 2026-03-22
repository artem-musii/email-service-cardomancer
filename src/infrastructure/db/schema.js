import { pgTable, pgEnum, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'

const statusEnum = pgEnum('email_status', ['queued', 'sent', 'failed'])

const emailLog = pgTable('email_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  toAddress: varchar('to_address', { length: 255 }).notNull(),
  template: varchar('template', { length: 100 }).notNull(),
  status: statusEnum('status').default('queued').notNull(),
  error: text('error'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export { statusEnum, emailLog }
