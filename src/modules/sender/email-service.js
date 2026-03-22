import { getSubject } from './email-entity.js'

const maskEmail = (email) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 3)}***@${domain}`
}

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const EmailService = ({
  emailProvider,
  eventPublisher,
  emailLogRepository,
  templateService,
  fromEmail,
  log = noopLog,
}) => {
  const sendEmail = async ({ to, template, variables }) => {
    log.info('sending email', { to: maskEmail(to), template })
    const logEntry = await emailLogRepository.create({ toAddress: to, template, status: 'queued' })
    const html = await templateService.render(template, variables)
    const subject = getSubject(template)

    const result = await emailProvider.send({ to, subject, html, from: fromEmail })

    if (result.success) {
      await emailLogRepository.updateStatus(logEntry.id, 'sent')
      await eventPublisher.publish({
        id: crypto.randomUUID(),
        type: 'email.sent',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, template },
      })
      log.info('email sent successfully', { to: maskEmail(to), template })
      log.debug('event published', { type: 'email.sent' })
    } else {
      await emailLogRepository.updateStatus(logEntry.id, 'failed', result.error)
      await eventPublisher.publish({
        id: crypto.randomUUID(),
        type: 'email.failed',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, error: result.error },
      })
      log.error('email send failed', { to: maskEmail(to), error: result.error })
      log.debug('event published', { type: 'email.failed' })
    }
  }

  return { sendEmail }
}

export { EmailService }
