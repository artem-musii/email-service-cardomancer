import { describe, it, expect } from 'bun:test'
import { TemplateService } from '../../../src/modules/templates/template-service.js'
import { InMemoryTemplateStore } from '../../fakes/in-memory-template-store.js'

describe('TemplateService', () => {
  it('renders template with variables', async () => {
    const store = InMemoryTemplateStore({ 'otp-code': '<p>Your code: {{code}}</p>' })
    const service = TemplateService({ templateStore: store })
    const html = await service.render('otp-code', { code: '123456' })
    expect(html).toBe('<p>Your code: 123456</p>')
  })

  it('throws on missing template', async () => {
    const store = InMemoryTemplateStore({})
    const service = TemplateService({ templateStore: store })
    await expect(service.render('nope', {})).rejects.toThrow()
  })

  it('replaces multiple variables', async () => {
    const store = InMemoryTemplateStore({ 'welcome': '<p>Hi {{name}}, welcome to {{app}}</p>' })
    const service = TemplateService({ templateStore: store })
    const html = await service.render('welcome', { name: 'Alice', app: 'Cardomancer' })
    expect(html).toBe('<p>Hi Alice, welcome to Cardomancer</p>')
  })
})
