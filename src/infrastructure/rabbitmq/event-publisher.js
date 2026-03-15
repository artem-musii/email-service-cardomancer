const EXCHANGE = 'email.events'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const RabbitMQPublisher = (channel, { log = noopLog } = {}) => {
  let ready = false

  const init = async () => {
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
    ready = true
    log.info('exchange initialized', { exchange: EXCHANGE })
  }

  const publish = async (event) => {
    if (!ready) await init()
    channel.publish(EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), { persistent: true })
    log.debug('event published', { type: event.type })
  }

  return { publish, init }
}

export { RabbitMQPublisher }
