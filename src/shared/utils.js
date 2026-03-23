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

const secureCompareAny = (value, keys) => keys.some((k) => secureCompare(value, k))

const parseBasicAuth = (header) => {
  if (!header || !header.startsWith('Basic ')) return null
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString()
    const idx = decoded.indexOf(':')
    return idx === -1 ? null : decoded.slice(idx + 1)
  } catch {
    return null
  }
}

export { maskEmail, secureCompare, secureCompareAny, parseBasicAuth }
