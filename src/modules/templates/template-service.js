const TemplateService = ({ templateRepository }) => {
  const create = async ({ name, html, variables = [], maxRetries = 0 }) => {
    return templateRepository.create({ name, html, variables, maxRetries })
  }

  const getByName = async (name) => {
    return templateRepository.findByName(name)
  }

  const getById = async (id) => {
    return templateRepository.findById(id)
  }

  const getAll = async () => {
    return templateRepository.findAll()
  }

  const update = async (id, data) => {
    return templateRepository.update(id, data)
  }

  const remove = async (id) => {
    return templateRepository.delete(id)
  }

  const render = async (name, variables) => {
    const template = await templateRepository.findByName(name)
    if (!template) throw new Error(`Template not found: ${name}`)
    let html = template.html
    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, String(value))
    }
    return { html, maxRetries: template.maxRetries }
  }

  return { create, getByName, getById, getAll, update, delete: remove, render }
}

export { TemplateService }
