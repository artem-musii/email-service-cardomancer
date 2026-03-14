const EXCHANGE = 'email.events'

const RabbitMQPublisher = (channel) => {
  let ready = false

  const init = async () => {
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
    ready = true
  }

  const publish = async (event) => {
    if (!ready) await init()
    channel.publish(EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), { persistent: true })
  }

  return { publish, init }
}

export { RabbitMQPublisher }
