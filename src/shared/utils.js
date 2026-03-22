import { timingSafeEqual } from 'crypto'

const maskEmail = (email) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 3)}***@${domain}`
}

const secureCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export { maskEmail, secureCompare }
