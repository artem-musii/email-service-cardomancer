const escapeHtml = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const TemplateService = ({ templateRepository }) => {
  const create = async ({ name, subject, fromName, html, variables = [], maxRetries = 0 }) => {
    return templateRepository.create({ name, subject, fromName, html, variables, maxRetries })
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
    let subject = template.subject || null
    for (const [key, value] of Object.entries(variables)) {
      const escaped = escapeHtml(value)
      html = html.replaceAll(`{{${key}}}`, escaped)
      if (subject) subject = subject.replaceAll(`{{${key}}}`, escaped)
    }
    return { html, subject, fromName: template.fromName || null, maxRetries: template.maxRetries }
  }

  return { create, getByName, getById, getAll, update, delete: remove, render }
}

export { TemplateService }
