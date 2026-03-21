const EXCHANGE = 'email.commands'
const QUEUE = 'email-service.email.send'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const RabbitMQConsumer = (channel, { onEmailSend, log = noopLog }) => {
  const start = async () => {
    await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
    await channel.assertQueue(QUEUE, { durable: true })
    await channel.bindQueue(QUEUE, EXCHANGE, 'email.send')
    await channel.prefetch(10)
    log.info('queue bound', { queue: QUEUE, exchange: EXCHANGE })

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return
      try {
        const event = JSON.parse(msg.content.toString())
        log.debug('message received', { type: event.type })
        await onEmailSend(event.payload)
        channel.ack(msg)
        log.info('message processed successfully', { type: event.type })
      } catch (e) {
        channel.nack(msg, false, true)
        log.error('message processing failed, requeued', { error: e.message })
      }
    })

    log.info('consumer started', { queue: QUEUE })
  }

  return { start }
}

export { RabbitMQConsumer }
