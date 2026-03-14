import { getSubject } from './email-entity.js'

const EmailService = ({ emailProvider, eventPublisher, emailLogRepository, templateService, fromEmail }) => {
  const sendEmail = async ({ to, template, variables }) => {
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
        payload: { emailId: logEntry.id, to, template }
      })
    } else {
      await emailLogRepository.updateStatus(logEntry.id, 'failed', result.error)
      await eventPublisher.publish({
        id: crypto.randomUUID(),
        type: 'email.failed',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, error: result.error }
      })
    }
  }

  return { sendEmail }
}

export { EmailService }
