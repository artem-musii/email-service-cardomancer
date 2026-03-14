const FakeEmailLogRepository = () => {
  const logs = []
  const create = async (entry) => {
    const log = { id: crypto.randomUUID(), ...entry, createdAt: new Date() }
    logs.push(log)
    return log
  }
  const updateStatus = async (id, status, error = null) => {
    const log = logs.find((l) => l.id === id)
    if (log) { log.status = status; log.error = error; if (status === 'sent') log.sentAt = new Date() }
    return log
  }
  return { create, updateStatus, logs }
}

export { FakeEmailLogRepository }
