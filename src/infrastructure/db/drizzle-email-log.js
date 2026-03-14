import { eq } from 'drizzle-orm'
import { emailLog } from './schema.js'

const DrizzleEmailLogRepository = (db) => {
  const create = async ({ toAddress, template, status = 'queued' }) => {
    const rows = await db.insert(emailLog).values({ toAddress, template, status }).returning()
    return rows[0]
  }

  const updateStatus = async (id, status, error = null) => {
    const values = { status, error }
    if (status === 'sent') values.sentAt = new Date()
    const rows = await db.update(emailLog).set(values).where(eq(emailLog.id, id)).returning()
    return rows[0]
  }

  return { create, updateStatus }
}

export { DrizzleEmailLogRepository }
