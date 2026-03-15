import { describe, it, expect } from 'bun:test'
import { loadConfig } from '../../src/config.js'

describe('loadConfig', () => {
  it('returns config from env', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost/email_db',
      RABBITMQ_URL: 'amqp://localhost',
      RESEND_API_KEY: 're_test_123',
      FROM_EMAIL: 'noreply@test.com',
      PORT: '3002'
    }
    const config = loadConfig(env)
    expect(config.database.url).toBe('postgres://localhost/email_db')
    expect(config.resend.apiKey).toBe('re_test_123')
    expect(config.fromEmail).toBe('noreply@test.com')
  })

  it('throws on missing required field', () => {
    expect(() => loadConfig({})).toThrow()
  })
})
