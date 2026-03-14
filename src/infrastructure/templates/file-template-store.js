import { readFile } from 'fs/promises'
import { join } from 'path'

const FileTemplateStore = (templatesDir) => {
  const getTemplate = async (name) => {
    const path = join(templatesDir, `${name}.html`)
    return readFile(path, 'utf8')
  }
  return { getTemplate }
}

export { FileTemplateStore }
