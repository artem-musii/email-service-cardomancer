import amqplib from 'amqplib'

const RabbitMQConnectionManager = ({ url, log }) => {
  let connection = null
  let channel = null
  let closed = false
  let reconnecting = false
  let reconnectDelay = 1000
  const publishers = []
  const consumers = []

  const connect = async () => {
    connection = await amqplib.connect(url)
    channel = await connection.createChannel()

    connection.on('error', (err) => {
      if (log) log.error('rabbitmq connection error', { err: err.message })
    })
    connection.on('close', () => {
      channel = null
      connection = null
      if (!closed) scheduleReconnect()
    })
    channel.on('error', (err) => {
      if (log) log.error('rabbitmq channel error', { err: err.message })
    })
    channel.on('close', () => {
      channel = null
      if (!closed) scheduleReconnect()
    })

    reconnectDelay = 1000
    reconnecting = false
    for (const publisher of publishers) publisher.reset()
    for (const consumer of consumers) {
      try {
        await consumer.restart(channel)
      } catch (err) {
        if (log) log.error('consumer restart failed', { err: err.message })
      }
    }
    if (log) log.info('rabbitmq connected')
  }

  const scheduleReconnect = () => {
    if (closed || reconnecting) return
    reconnecting = true
    const delay = reconnectDelay
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    if (log) log.warn('rabbitmq reconnecting', { delay })
    setTimeout(async () => {
      if (closed) return
      try {
        await connect()
      } catch (err) {
        if (log) log.error('rabbitmq reconnect failed', { err: err.message })
        scheduleReconnect()
      }
    }, delay)
  }

  const getChannel = () => channel
  const isConnected = () => channel !== null && connection !== null
  const registerPublisher = (publisher) => publishers.push(publisher)
  const registerConsumer = (consumer) => consumers.push(consumer)

  const close = async () => {
    closed = true
    try {
      await channel?.close()
    } catch (_e) {
      /* ignore */
    }
    channel = null
    try {
      await connection?.close()
    } catch (_e) {
      /* ignore */
    }
    connection = null
  }

  return { connect, getChannel, isConnected, registerPublisher, registerConsumer, scheduleReconnect, close }
}

export { RabbitMQConnectionManager }
