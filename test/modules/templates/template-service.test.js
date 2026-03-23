import { describe, it, expect } from 'bun:test'
import { TemplateService } from '../../../src/modules/templates/template-service.js'
import { FakeTemplateRepository } from '../../fakes/fake-template-repository.js'

describe('TemplateService', () => {
  const setup = (initial = []) => {
    const repo = FakeTemplateRepository(initial)
    const service = TemplateService({ templateRepository: repo })
    return { service, repo }
  }

  describe('CRUD', () => {
    it('creates a template', async () => {
      const { service } = setup()
      const t = await service.create({
        name: 'test',
        subject: 'Hello {{msg}}',
        html: '<p>{{msg}}</p>',
        variables: ['msg'],
        maxRetries: 2,
      })
      expect(t.name).toBe('test')
      expect(t.subject).toBe('Hello {{msg}}')
      expect(t.maxRetries).toBe(2)
    })

    it('gets template by name', async () => {
      const { service } = setup()
      await service.create({ name: 'test', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      const t = await service.getByName('test')
      expect(t.name).toBe('test')
    })

    it('returns null for missing template name', async () => {
      const { service } = setup()
      const t = await service.getByName('nope')
      expect(t).toBeNull()
    })

    it('gets template by id', async () => {
      const { service } = setup()
      const created = await service.create({ name: 'test2', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      const t = await service.getById(created.id)
      expect(t.name).toBe('test2')
    })

    it('lists all templates', async () => {
      const { service } = setup()
      await service.create({ name: 'a', html: '<p>a</p>', variables: [], maxRetries: 0 })
      await service.create({ name: 'b', html: '<p>b</p>', variables: [], maxRetries: 0 })
      const all = await service.getAll()
      expect(all).toHaveLength(2)
    })

    it('updates a template', async () => {
      const { service } = setup()
      const t = await service.create({ name: 'test', html: '<p>old</p>', variables: [], maxRetries: 0 })
      const updated = await service.update(t.id, { html: '<p>new</p>', maxRetries: 3 })
      expect(updated.html).toBe('<p>new</p>')
      expect(updated.maxRetries).toBe(3)
    })

    it('deletes a template', async () => {
      const { service } = setup()
      const t = await service.create({ name: 'test', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      await service.delete(t.id)
      const all = await service.getAll()
      expect(all).toHaveLength(0)
    })
  })

  describe('render', () => {
    it('renders template with variables and subject', async () => {
      const { service } = setup()
      await service.create({
        name: 'otp',
        subject: 'Your code: {{code}}',
        html: '<p>Code: {{code}}</p>',
        variables: ['code'],
        maxRetries: 0,
      })
      const result = await service.render('otp', { code: '123456' })
      expect(result.html).toBe('<p>Code: 123456</p>')
      expect(result.subject).toBe('Your code: 123456')
      expect(result.maxRetries).toBe(0)
    })

    it('returns null subject when template has no subject', async () => {
      const { service } = setup()
      await service.create({ name: 'minimal', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      const result = await service.render('minimal', {})
      expect(result.subject).toBeNull()
    })

    it('throws on missing template', async () => {
      const { service } = setup()
      await expect(service.render('nope', {})).rejects.toThrow('Template not found: nope')
    })

    it('replaces multiple variables', async () => {
      const { service } = setup()
      await service.create({
        name: 'welcome',
        html: '<p>Hi {{name}}, welcome to {{app}}</p>',
        variables: ['name', 'app'],
        maxRetries: 3,
      })
      const result = await service.render('welcome', { name: 'Alice', app: 'Acme' })
      expect(result.html).toBe('<p>Hi Alice, welcome to Acme</p>')
      expect(result.maxRetries).toBe(3)
    })
  })
})
