const MAX_DELAY_MS = 60000

const calculateRetryDelay = ({ attempt, baseDelayMs = 1000 }) => {
  return Math.min(baseDelayMs * Math.pow(2, attempt - 1), MAX_DELAY_MS)
}

const shouldRetry = ({ attempt, maxRetries }) => {
  return maxRetries > 0 && attempt <= maxRetries
}

export { calculateRetryDelay, shouldRetry }
