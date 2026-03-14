const TemplateService = ({ templateStore }) => {
  const render = async (name, variables) => {
    let template = await templateStore.getTemplate(name)
    for (const [key, value] of Object.entries(variables)) {
      template = template.replaceAll(`{{${key}}}`, value)
    }
    return template
  }
  return { render }
}

export { TemplateService }
