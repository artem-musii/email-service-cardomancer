import { Elysia } from 'elysia'
import { loadConfig } from './config.js'
import { createContainer } from './container.js'
import { TemplateService } from './modules/templates/template-service.js'
import { EmailService } from './modules/sender/email-service.js'
import { healthRoutes } from './infrastructure/http/routes/health-routes.js'

const createApp = async ({ overrides = {}, config: configOverride } = {}) => {
  const config = configOverride || loadConfig(process.env)
  const container = createContainer({ overrides })

  if (!overrides.emailProvider) {
    const { default: postgres } = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const amqplib = await import('amqplib')
    const { SendGridProvider } = await import('./infrastructure/sendgrid/sendgrid-provider.js')
    const { DrizzleEmailLogRepository } = await import('./infrastructure/db/drizzle-email-log.js')
    const { FileTemplateStore } = await import('./infrastructure/templates/file-template-store.js')
    const { RabbitMQPublisher } = await import('./infrastructure/rabbitmq/event-publisher.js')
    const { RabbitMQConsumer } = await import('./infrastructure/rabbitmq/event-consumer.js')

    const client = postgres(config.database.url)
    const db = drizzle(client)
    const rabbitConn = await amqplib.connect(config.rabbitmq.url)
    const rabbitChannel = await rabbitConn.createChannel()

    container.register('templateStore', () => FileTemplateStore(new URL('../../templates', import.meta.url).pathname))
    container.register('emailProvider', () => SendGridProvider({ apiKey: config.sendgrid.apiKey }))
    container.register('emailLogRepository', () => DrizzleEmailLogRepository(db))
    container.register('eventPublisher', () => RabbitMQPublisher(rabbitChannel))

    const templateService = TemplateService({ templateStore: container.resolve('templateStore') })
    const emailService = EmailService({
      emailProvider: container.resolve('emailProvider'),
      eventPublisher: container.resolve('eventPublisher'),
      emailLogRepository: container.resolve('emailLogRepository'),
      templateService,
      fromEmail: config.fromEmail
    })

    const consumer = RabbitMQConsumer(rabbitChannel, {
      onEmailSend: ({ to, template, variables }) => emailService.sendEmail({ to, template, variables })
    })
    await consumer.start()
  }

  const app = new Elysia()
  healthRoutes(app)
  const server = app.listen(config.port)

  return { app: server, port: server.server.port }
}

export { createApp }

if (import.meta.main) {
  createApp().then(({ port }) => console.log(`Email service running on port ${port}`))
}
