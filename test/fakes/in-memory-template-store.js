const InMemoryTemplateStore = (templates = {}) => {
  const getTemplate = async (name) => {
    const t = templates[name]
    if (!t) throw new Error(`Template not found: ${name}`)
    return t
  }
  return { getTemplate }
}

export { InMemoryTemplateStore }
