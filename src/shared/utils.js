import { timingSafeEqual, createHmac } from 'crypto'

const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return email || 'unknown'
  const [local, domain] = email.split('@')
  return `${local.slice(0, 3)}***@${domain}`
}

const secureCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const hmac = (val) => createHmac('sha256', 'email-service-compare').update(val).digest()
  return timingSafeEqual(hmac(a), hmac(b))
}

export { maskEmail, secureCompare }
