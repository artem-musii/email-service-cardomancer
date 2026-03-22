import { describe, it, expect } from 'bun:test'
import { loadConfig } from '../../src/config.js'

describe('loadConfig', () => {
  it('returns config from env', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost/email_db',
      RABBITMQ_URL: 'amqp://localhost',
      RESEND_API_KEY: 're_test_123',
      FROM_EMAIL: 'noreply@test.com',
      PORT: '3002',
      ADMIN_API_KEY: 'secret',
    }
    const config = loadConfig(env)
    expect(config.database.url).toBe('postgres://localhost/email_db')
    expect(config.resend.apiKey).toBe('re_test_123')
    expect(config.fromEmail).toBe('noreply@test.com')
  })

  it('throws on missing required field', () => {
    expect(() => loadConfig({})).toThrow()
  })

  it('throws when ADMIN_API_KEY is missing', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost/email_db',
      RABBITMQ_URL: 'amqp://localhost',
      RESEND_API_KEY: 're_test_123',
      FROM_EMAIL: 'noreply@test.com',
    }
    expect(() => loadConfig(env)).toThrow('ADMIN_API_KEY')
  })

  it('includes adminApiKey in config', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost/email_db',
      RABBITMQ_URL: 'amqp://localhost',
      RESEND_API_KEY: 're_test_123',
      FROM_EMAIL: 'noreply@test.com',
      ADMIN_API_KEY: 'secret-key',
    }
    const config = loadConfig(env)
    expect(config.adminApiKey).toBe('secret-key')
  })
})
