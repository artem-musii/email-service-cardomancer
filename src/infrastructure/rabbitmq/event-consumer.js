const EXCHANGE = 'email.commands'
const QUEUE = 'email-service.email.send'

const RabbitMQConsumer = (channel, { onEmailSend }) => {
  const start = async () => {
    await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
    await channel.assertQueue(QUEUE, { durable: true })
    await channel.bindQueue(QUEUE, EXCHANGE, 'email.send')

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return
      try {
        const event = JSON.parse(msg.content.toString())
        await onEmailSend(event.payload)
        channel.ack(msg)
      } catch (e) {
        channel.nack(msg, false, false)
      }
    })
  }

  return { start }
}

export { RabbitMQConsumer }
