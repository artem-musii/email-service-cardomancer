const EXCHANGE = 'email.events'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const RabbitMQPublisher = (connectionManager, { exchange = EXCHANGE, type = 'topic', log = noopLog } = {}) => {
  let ready = false

  const init = async () => {
    const channel = connectionManager.getChannel()
    if (!channel) throw new Error('RabbitMQ channel not available')
    await channel.assertExchange(exchange, type, { durable: true })
    ready = true
    log.info('exchange initialized', { exchange })
  }

  const publish = async (event) => {
    const channel = connectionManager.getChannel()
    if (!channel) {
      log.warn('rabbitmq not connected, event dropped', { type: event.type })
      return
    }
    if (!ready) await init()
    channel.publish(exchange, event.type, Buffer.from(JSON.stringify(event)), { persistent: true })
    log.debug('event published', { type: event.type })
  }

  const reset = () => {
    ready = false
  }

  return { publish, init, reset }
}

export { RabbitMQPublisher }
