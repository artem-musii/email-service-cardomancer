import { describe, it, expect } from 'bun:test'
import { createContainer } from '../../src/container.js'

describe('Container', () => {
  it('registers and resolves a factory', () => {
    const container = createContainer({})
    container.register('greeting', () => 'hello')
    expect(container.resolve('greeting')).toBe('hello')
  })

  it('returns same instance on repeated resolve', () => {
    const container = createContainer({})
    let count = 0
    container.register('counter', () => ++count)
    expect(container.resolve('counter')).toBe(1)
    expect(container.resolve('counter')).toBe(1)
  })

  it('applies overrides', () => {
    const container = createContainer({ overrides: { a: 99 } })
    container.register('a', () => 10)
    expect(container.resolve('a')).toBe(99)
  })

  it('throws on missing', () => {
    const container = createContainer({})
    expect(() => container.resolve('missing')).toThrow()
  })
})
