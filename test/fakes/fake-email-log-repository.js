const FakeEmailLogRepository = () => {
  const logs = []

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
    const log = {
      id: crypto.randomUUID(),
      toAddress,
      subject,
      template,
      status,
      error: null,
      attempt,
      maxRetries,
      variables,
      fromEmail,
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    logs.push(log)
    return log
  }

  const updateStatus = async (id, status, error = null) => {
    const log = logs.find((l) => l.id === id)
    if (log) {
      log.status = status
      log.error = error
      log.updatedAt = new Date()
      if (status === 'sent') log.sentAt = new Date()
    }
    return log
  }

  const updateAttempt = async (id, attempt) => {
    const log = logs.find((l) => l.id === id)
    if (log) {
      log.attempt = attempt
      log.status = 'queued'
      log.error = null
      log.updatedAt = new Date()
    }
    return log
  }

  const findById = async (id) => logs.find((l) => l.id === id) || null

  const findAll = async ({ page = 1, limit = 50, status, template, to, from, to_date } = {}) => {
    let filtered = [...logs]
    if (status) filtered = filtered.filter((l) => l.status === status)
    if (template) filtered = filtered.filter((l) => l.template === template)
    if (to) filtered = filtered.filter((l) => l.toAddress.includes(to))
    if (from) filtered = filtered.filter((l) => l.createdAt >= new Date(from))
    if (to_date) filtered = filtered.filter((l) => l.createdAt <= new Date(to_date))
    const total = filtered.length
    const offset = (page - 1) * limit
    return { data: filtered.slice(offset, offset + limit), total, page, limit }
  }

  return { create, updateStatus, updateAttempt, findById, findAll, logs }
}

export { FakeEmailLogRepository }
