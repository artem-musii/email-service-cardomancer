import { describe, it, expect } from 'bun:test'
import { calculateRetryDelay, shouldRetry } from '../../../src/modules/sender/retry-policy.js'

describe('retry-policy', () => {
  describe('calculateRetryDelay', () => {
    it('returns baseDelay for attempt 1', () => {
      expect(calculateRetryDelay({ attempt: 1, baseDelayMs: 1000 })).toBe(1000)
    })

    it('doubles delay for each attempt', () => {
      expect(calculateRetryDelay({ attempt: 2, baseDelayMs: 1000 })).toBe(2000)
      expect(calculateRetryDelay({ attempt: 3, baseDelayMs: 1000 })).toBe(4000)
      expect(calculateRetryDelay({ attempt: 4, baseDelayMs: 1000 })).toBe(8000)
    })

    it('caps delay at 60 seconds', () => {
      expect(calculateRetryDelay({ attempt: 10, baseDelayMs: 1000 })).toBe(60000)
    })

    it('uses custom baseDelay', () => {
      expect(calculateRetryDelay({ attempt: 1, baseDelayMs: 500 })).toBe(500)
      expect(calculateRetryDelay({ attempt: 2, baseDelayMs: 500 })).toBe(1000)
    })
  })

  describe('shouldRetry', () => {
    it('returns true when attempt <= maxRetries', () => {
      expect(shouldRetry({ attempt: 1, maxRetries: 3 })).toBe(true)
      expect(shouldRetry({ attempt: 3, maxRetries: 3 })).toBe(true)
    })

    it('returns false when attempt > maxRetries', () => {
      expect(shouldRetry({ attempt: 4, maxRetries: 3 })).toBe(false)
    })

    it('returns false when maxRetries is 0', () => {
      expect(shouldRetry({ attempt: 1, maxRetries: 0 })).toBe(false)
    })
  })
})
