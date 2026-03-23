const REQUIRED = ['DATABASE_URL', 'RABBITMQ_URL', 'RESEND_API_KEY', 'FROM_EMAIL', 'ADMIN_API_KEY']

const loadConfig = (env) => {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`)
  }
  const adminApiKeys = env.ADMIN_API_KEY.split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  if (adminApiKeys.length === 0) throw new Error('ADMIN_API_KEY must contain at least one key')
  return {
    database: { url: env.DATABASE_URL },
    rabbitmq: { url: env.RABBITMQ_URL },
    resend: { apiKey: env.RESEND_API_KEY },
    fromEmail: env.FROM_EMAIL,
    adminApiKeys,
    port: parseInt(env.PORT || '3002', 10),
    logLevel: env.LOG_LEVEL || 'info',
    corsOrigin: env.CORS_ORIGIN || '',
  }
}

export { loadConfig }
