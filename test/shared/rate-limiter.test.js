import { describe, it, expect } from 'bun:test'
import { createRateLimiter } from '../../src/shared/rate-limiter.js'

describe('Rate Limiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 })
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('127.0.0.1')
      expect(result.allowed).toBe(true)
    }
  })

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 })
    limiter.check('127.0.0.1')
    limiter.check('127.0.0.1')
    limiter.check('127.0.0.1')
    const result = limiter.check('127.0.0.1')
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('tracks different keys independently', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    expect(limiter.check('ip-a').allowed).toBe(true)
    expect(limiter.check('ip-a').allowed).toBe(false)
    expect(limiter.check('ip-b').allowed).toBe(true)
  })

  it('resets counters', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
    limiter.check('127.0.0.1')
    expect(limiter.check('127.0.0.1').allowed).toBe(false)
    limiter.reset()
    expect(limiter.check('127.0.0.1').allowed).toBe(true)
  })

  it('returns remaining count', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 })
    const result = limiter.check('127.0.0.1')
    expect(result.remaining).toBe(4)
  })
})
