const REQUIRED = ['DATABASE_URL', 'RABBITMQ_URL', 'RESEND_API_KEY', 'FROM_EMAIL']

const loadConfig = (env) => {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`)
  }
  return {
    database: { url: env.DATABASE_URL },
    rabbitmq: { url: env.RABBITMQ_URL },
    resend: { apiKey: env.RESEND_API_KEY },
    fromEmail: env.FROM_EMAIL,
    port: parseInt(env.PORT || '3002', 10),
    logLevel: env.LOG_LEVEL || 'info'
  }
}

export { loadConfig }
