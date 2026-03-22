const EXCHANGE = 'email.commands'
const QUEUE = 'email-service.email.send'
const RETRY_EXCHANGE = 'email.retry'
const RETRY_QUEUE = 'email-service.email.retry'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const validateEmailMessage = (event) => {
  if (!event?.payload) return { valid: false, error: 'missing payload' }
  const { to, subject, template, variables } = event.payload
  if (!to || typeof to !== 'string') return { valid: false, error: 'missing or invalid "to"' }
  if (!subject || typeof subject !== 'string') return { valid: false, error: 'missing or invalid "subject"' }
  if (!template || typeof template !== 'string') return { valid: false, error: 'missing or invalid "template"' }
  if (!variables || typeof variables !== 'object') return { valid: false, error: 'missing or invalid "variables"' }
  return { valid: true }
}

const RabbitMQConsumer = (connectionManager, { onEmailSend, log = noopLog }) => {
  let currentChannel = null

  const setup = async (channel) => {
    currentChannel = channel
    await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true })

    await channel.assertQueue(QUEUE, {
      durable: true,
      deadLetterExchange: RETRY_EXCHANGE,
      deadLetterRoutingKey: 'email.retry',
    })
    await channel.bindQueue(QUEUE, EXCHANGE, 'email.send')

    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      deadLetterExchange: EXCHANGE,
      deadLetterRoutingKey: 'email.send',
    })
    await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, 'email.retry')

    await channel.prefetch(10)
    log.info('queue bound', { queue: QUEUE, exchange: EXCHANGE })

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return
      try {
        const event = JSON.parse(msg.content.toString())
        const validation = validateEmailMessage(event)
        if (!validation.valid) {
          log.error('invalid message, discarding', { error: validation.error })
          channel.ack(msg)
          return
        }

        const headers = msg.properties.headers || {}
        const retryCount = headers['x-retry-count'] || 0
        const emailLogId = headers['x-email-log-id'] || null
        const attempt = retryCount + 1

        log.debug('processing message', { template: event.payload.template, attempt })

        const result = await onEmailSend({
          ...event.payload,
          attempt,
          emailLogId,
        })

        if (result.retry) {
          channel.ack(msg)
          channel.publish(RETRY_EXCHANGE, 'email.retry', Buffer.from(JSON.stringify(event)), {
            persistent: true,
            expiration: String(result.delayMs),
            headers: {
              'x-retry-count': attempt,
              'x-email-log-id': result.emailLogId,
            },
          })
          log.info('message scheduled for retry', { attempt, delayMs: result.delayMs })
        } else {
          channel.ack(msg)
          log.info('message processed', { template: event.payload.template, success: result.success })
        }
      } catch (e) {
        channel.nack(msg, false, true)
        log.error('message processing failed, requeued', { error: e.message })
      }
    })

    log.info('consumer started', { queue: QUEUE })
  }

  const start = async () => {
    const channel = connectionManager.getChannel()
    if (channel) await setup(channel)
    connectionManager.registerConsumer({ restart: setup })
  }

  return { start }
}

export { RabbitMQConsumer, validateEmailMessage }
