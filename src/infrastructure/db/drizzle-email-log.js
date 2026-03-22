import { eq, desc, and, like, gte, lte, sql } from 'drizzle-orm'
import { emailLog } from './schema.js'

const DrizzleEmailLogRepository = (db) => {
  const create = async ({
    toAddress,
    subject,
    template,
    status = 'queued',
    attempt = 1,
    maxRetries = 0,
    variables,
    fromEmail,
  }) => {
    const rows = await db
      .insert(emailLog)
      .values({ toAddress, subject, template, status, attempt, maxRetries, variables, fromEmail })
      .returning()
    return rows[0]
  }

  const updateStatus = async (id, status, error = null) => {
    const values = { status, error, updatedAt: new Date() }
    if (status === 'sent') values.sentAt = new Date()
    const rows = await db.update(emailLog).set(values).where(eq(emailLog.id, id)).returning()
    return rows[0]
  }

  const updateAttempt = async (id, attempt) => {
    const rows = await db
      .update(emailLog)
      .set({ attempt, status: 'queued', error: null, updatedAt: new Date() })
      .where(eq(emailLog.id, id))
      .returning()
    return rows[0]
  }

  const findById = async (id) => {
    const rows = await db.select().from(emailLog).where(eq(emailLog.id, id))
    return rows[0] || null
  }

  const findAll = async ({ page = 1, limit = 50, status, template, to, from, to_date } = {}) => {
    const conditions = []
    if (status) conditions.push(eq(emailLog.status, status))
    if (template) conditions.push(eq(emailLog.template, template))
    if (to) conditions.push(like(emailLog.toAddress, `%${to}%`))
    if (from) conditions.push(gte(emailLog.createdAt, new Date(from)))
    if (to_date) conditions.push(lte(emailLog.createdAt, new Date(to_date)))

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const offset = (page - 1) * limit

    const [data, countResult] = await Promise.all([
      db.select().from(emailLog).where(where).orderBy(desc(emailLog.createdAt)).limit(limit).offset(offset),
      db
        .select({ count: sql`count(*)::int` })
        .from(emailLog)
        .where(where),
    ])

    return { data, total: countResult[0]?.count || 0, page, limit }
  }

  return { create, updateStatus, updateAttempt, findById, findAll }
}

export { DrizzleEmailLogRepository }
