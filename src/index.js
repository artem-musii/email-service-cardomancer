import { Elysia } from 'elysia'
import { loadConfig } from './config.js'
import { createLogger } from './logger.js'
import { TemplateService } from './modules/templates/template-service.js'
import { EmailService } from './modules/sender/email-service.js'
import { healthRoutes } from './infrastructure/http/routes/health-routes.js'
import { adminRoutes } from './infrastructure/http/routes/admin-routes.js'
import adminHtml from './admin/index.html'

const createApp = async ({ overrides = {}, config: configOverride } = {}) => {
  const config = configOverride || loadConfig(process.env)
  const log = createLogger('email-service', config.logLevel)

  let db = null
  let rabbitManager = null
  let templateService
  let emailLogRepository

  if (!overrides.emailProvider) {
    // Production mode: real infrastructure
    const { drizzle } = await import('drizzle-orm/bun-sql')
    const { RabbitMQConnectionManager } = await import('./infrastructure/rabbitmq/connection-manager.js')
    const { ResendProvider } = await import('./infrastructure/resend/resend-provider.js')
    const { DrizzleEmailLogRepository } = await import('./infrastructure/db/drizzle-email-log.js')
    const { DrizzleTemplateRepository } = await import('./infrastructure/db/drizzle-template-repository.js')
    const { RabbitMQPublisher } = await import('./infrastructure/rabbitmq/event-publisher.js')
    const { RabbitMQConsumer } = await import('./infrastructure/rabbitmq/event-consumer.js')

    db = drizzle(config.database.url)
    log.info('database connected')

    rabbitManager = RabbitMQConnectionManager({ url: config.rabbitmq.url, log })
    try {
      await rabbitManager.connect()
    } catch (err) {
      log.warn('rabbitmq initial connection failed, will retry in background', { err: err.message })
      rabbitManager.scheduleReconnect()
    }

    const templateRepo = DrizzleTemplateRepository(db)
    emailLogRepository = DrizzleEmailLogRepository(db)
    templateService = TemplateService({ templateRepository: templateRepo })

    const emailService = EmailService({
      emailProvider: ResendProvider({ apiKey: config.resend.apiKey, log }),
      eventPublisher: RabbitMQPublisher(rabbitManager, { log }),
      emailLogRepository,
      templateService,
      fromEmail: config.fromEmail,
      log,
    })

    const consumer = RabbitMQConsumer(rabbitManager, {
      onEmailSend: (params) => emailService.sendEmail(params),
      log,
    })
    await consumer.start()
  } else {
    // Test mode: use overrides
    const templateRepo = overrides.templateRepository
    emailLogRepository = overrides.emailLogRepository
    templateService = TemplateService({ templateRepository: templateRepo })
  }

  const app = new Elysia()
    .onBeforeHandle(({ set }) => {
      set.headers['X-Content-Type-Options'] = 'nosniff'
      set.headers['X-Frame-Options'] = 'DENY'
      set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
      set.headers['X-XSS-Protection'] = '0'
      set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    })
    .derive(({ headers }) => ({
      requestId: headers['x-request-id'] || crypto.randomUUID(),
    }))
    .onAfterHandle(({ request, set, requestId }) => {
      const url = new URL(request.url)
      if (url.pathname === '/health') return
      log.info('request', {
        method: request.method,
        path: url.pathname,
        status: set.status || 200,
        requestId,
      })
      set.headers['X-Request-ID'] = requestId
    })
    .onError(({ code, error, set, requestId }) => {
      if (code === 'VALIDATION') return
      log.error('unhandled error', {
        error: error.message,
        stack: error.stack,
        requestId: requestId || 'unknown',
      })
      set.status = 500
      return { error: 'Internal server error' }
    })

  healthRoutes(app, { db, rabbitManager })
  adminRoutes(app, { templateService, emailLogRepository, adminApiKey: config.adminApiKey, log })

  app.get('/admin', () => new Response(adminHtml))
  app.get('/admin/*', () => new Response(adminHtml))

  const server = app.listen({ port: config.port, maxRequestBodySize: 65536, idleTimeout: 30 })
  const port = server.server.port

  const shutdown = async () => {
    log.info('shutting down gracefully...')
    server.stop()
    if (rabbitManager) await rabbitManager.close()
    if (db) await db.$client.close()
    log.info('shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  return { app: server, port, shutdown, connections: { db, rabbitManager } }
}

export { createApp }

if (import.meta.main) {
  createApp()
    .then(({ port }) => {
      const log = createLogger('email-service', process.env.LOG_LEVEL || 'info')
      log.info('email service started', { port })
    })
    .catch((err) => {
      const log = createLogger('email-service', process.env.LOG_LEVEL || 'info')
      log.error('failed to start email service', { err: err.message, stack: err.stack })
      process.exit(1)
    })
}
