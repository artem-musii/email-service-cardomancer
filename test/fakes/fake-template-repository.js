const FakeTemplateRepository = (initial = []) => {
  const templates = new Map()
  for (const t of initial) {
    templates.set(t.id || crypto.randomUUID(), t)
  }

  const findByName = async (name) => {
    for (const t of templates.values()) {
      if (t.name === name) return t
    }
    return null
  }

  const findById = async (id) => templates.get(id) || null

  const findAll = async () => [...templates.values()]

  const create = async ({ name, html, variables = [], maxRetries = 0 }) => {
    const t = {
      id: crypto.randomUUID(),
      name,
      html,
      variables,
      maxRetries,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    templates.set(t.id, t)
    return t
  }

  const update = async (id, data) => {
    const t = templates.get(id)
    if (!t) return null
    Object.assign(t, data, { updatedAt: new Date() })
    return t
  }

  const remove = async (id) => {
    const t = templates.get(id)
    templates.delete(id)
    return t || null
  }

  return { findByName, findById, findAll, create, update, delete: remove, templates }
}

export { FakeTemplateRepository }
