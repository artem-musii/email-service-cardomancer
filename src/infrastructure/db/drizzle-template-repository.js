import { eq } from 'drizzle-orm'
import { emailTemplates } from './schema.js'

const DrizzleTemplateRepository = (db) => {
  const findByName = async (name) => {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name))
    return rows[0] || null
  }

  const findById = async (id) => {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id))
    return rows[0] || null
  }

  const findAll = async () => {
    return db.select().from(emailTemplates).orderBy(emailTemplates.name)
  }

  const create = async ({ name, subject, fromName, html, variables = [], maxRetries = 0 }) => {
    const rows = await db
      .insert(emailTemplates)
      .values({ name, subject, fromName, html, variables, maxRetries })
      .returning()
    return rows[0]
  }

  const update = async (id, data) => {
    const rows = await db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning()
    return rows[0] || null
  }

  const remove = async (id) => {
    const rows = await db.delete(emailTemplates).where(eq(emailTemplates.id, id)).returning()
    return rows[0] || null
  }

  return { findByName, findById, findAll, create, update, delete: remove }
}

export { DrizzleTemplateRepository }
