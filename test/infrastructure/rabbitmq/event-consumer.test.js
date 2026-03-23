import { describe, it, expect } from 'bun:test'
import { validateEmailMessage } from '../../../src/infrastructure/rabbitmq/event-consumer.js'

describe('validateEmailMessage', () => {
  it('returns valid for correct message', () => {
    const event = { payload: { to: 'a@b.com', subject: 'Hi', template: 'otp', variables: { code: '1' } } }
    expect(validateEmailMessage(event)).toEqual({ valid: true })
  })

  it('fails on missing payload', () => {
    expect(validateEmailMessage({})).toEqual({ valid: false, error: 'missing payload' })
    expect(validateEmailMessage(null)).toEqual({ valid: false, error: 'missing payload' })
  })

  it('fails on missing to', () => {
    const event = { payload: { subject: 'Hi', template: 'otp', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('allows missing subject (resolved from template)', () => {
    const event = { payload: { to: 'a@b.com', template: 'otp', variables: {} } }
    expect(validateEmailMessage(event)).toEqual({ valid: true })
  })

  it('fails on invalid subject type', () => {
    const event = { payload: { to: 'a@b.com', subject: 123, template: 'otp', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('allows optional fromName', () => {
    const event = { payload: { to: 'a@b.com', fromName: 'Cardomancer', template: 'otp', variables: {} } }
    expect(validateEmailMessage(event)).toEqual({ valid: true })
  })

  it('fails on invalid fromName type', () => {
    const event = { payload: { to: 'a@b.com', fromName: 123, template: 'otp', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('fails on missing template', () => {
    const event = { payload: { to: 'a@b.com', subject: 'Hi', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('fails on missing variables', () => {
    const event = { payload: { to: 'a@b.com', subject: 'Hi', template: 'otp' } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })
})
