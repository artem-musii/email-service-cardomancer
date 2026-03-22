import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createApp } from '../../src/index.js'
import { FakeTemplateRepository } from '../fakes/fake-template-repository.js'
import { FakeEmailLogRepository } from '../fakes/fake-email-log-repository.js'
import { FakeEventPublisher } from '../fakes/fake-event-publisher.js'
import { InMemoryEmailProvider } from '../fakes/in-memory-email-provider.js'

describe('Email Flow E2E', () => {
  let app, baseUrl

  beforeAll(async () => {
    const result = await createApp({
      overrides: {
        emailProvider: InMemoryEmailProvider(),
        eventPublisher: FakeEventPublisher(),
        emailLogRepository: FakeEmailLogRepository(),
        templateRepository: FakeTemplateRepository(),
      },
      config: {
        database: { url: 'unused' },
        rabbitmq: { url: 'unused' },
        resend: { apiKey: 'unused' },
        fromEmail: 'noreply@test.com',
        adminApiKey: 'e2e-key',
        port: 0,
        logLevel: 'error',
      },
    })
    app = result.app
    baseUrl = `http://localhost:${result.port}`
  })

  afterAll(() => app?.stop())

  const adminHeaders = { 'x-admin-key': 'e2e-key', 'content-type': 'application/json' }

  it('health check returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.service).toBe('email-service')
  })

  it('creates template via admin API', async () => {
    const res = await fetch(`${baseUrl}/admin/api/templates`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'e2e-test', html: '<p>Hello {{name}}</p>', variables: ['name'], maxRetries: 0 }),
    })
    expect(res.status).toBe(200)
    const t = await res.json()
    expect(t.name).toBe('e2e-test')
  })

  it('lists templates via admin API', async () => {
    const res = await fetch(`${baseUrl}/admin/api/templates`, { headers: adminHeaders })
    expect(res.status).toBe(200)
    const list = await res.json()
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects admin requests without key', async () => {
    const res = await fetch(`${baseUrl}/admin/api/templates`)
    expect(res.status).toBe(401)
  })

  it('returns security headers', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })
})
