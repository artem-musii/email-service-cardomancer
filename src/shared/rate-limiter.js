const createRateLimiter = ({ windowMs = 60_000, maxRequests = 60 } = {}) => {
  const buckets = new Map()

  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key)
    }
  }, windowMs)
  cleanup.unref()

  return {
    check(key) {
      const now = Date.now()
      let bucket = buckets.get(key)
      if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs }
        buckets.set(key, bucket)
      }
      bucket.count++
      if (bucket.count > maxRequests) {
        return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
      }
      return { allowed: true, remaining: maxRequests - bucket.count }
    },
    reset() {
      buckets.clear()
    },
  }
}

export { createRateLimiter }
