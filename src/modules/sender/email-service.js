import { maskEmail } from '../../shared/utils.js'
import { calculateRetryDelay, shouldRetry as checkRetry } from './retry-policy.js'

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
  const formatFrom = (name) => (name ? `${name} <${fromEmail}>` : fromEmail)

  const sendEmail = async ({
    to,
    subject,
    fromName,
    template,
    variables,
    retryPolicy,
    attempt = 1,
    emailLogId = null,
  }) => {
    log.info('sending email', { to: maskEmail(to), template, attempt })

    const {
      html,
      subject: templateSubject,
      fromName: templateFromName,
      maxRetries: templateMaxRetries,
    } = await templateService.render(template, variables)

    const resolvedSubject = subject || templateSubject || template
    const resolvedFrom = formatFrom(fromName || templateFromName)
    const maxRetries = retryPolicy?.maxRetries ?? templateMaxRetries
    const baseDelayMs = retryPolicy?.baseDelayMs ?? 1000

    let logEntry
    if (emailLogId) {
      logEntry = await emailLogRepository.updateAttempt(emailLogId, attempt)
    } else {
      logEntry = await emailLogRepository.create({
        toAddress: to,
        subject: resolvedSubject,
        template,
        status: 'queued',
        attempt,
        maxRetries,
        variables,
        fromEmail: resolvedFrom,
      })
    }

    const result = await emailProvider.send({ to, subject: resolvedSubject, html, from: resolvedFrom })

    if (result.success) {
      await emailLogRepository.updateStatus(logEntry.id, 'sent')
      await eventPublisher.publish({
        id: crypto.randomUUID(),
        type: 'email.sent',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, template },
      })
      log.info('email sent', { to: maskEmail(to), template })
      return { success: true, retry: false }
    }

    const retry = checkRetry({ attempt, maxRetries })
    await emailLogRepository.updateStatus(logEntry.id, retry ? 'queued' : 'failed', result.error)

    if (!retry) {
      await eventPublisher.publish({
        id: crypto.randomUUID(),
        type: 'email.failed',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, template, error: result.error, attempt, maxRetries },
      })
      log.error('email failed permanently', { to: maskEmail(to), template, attempt, maxRetries })
    } else {
      log.warn('email failed, will retry', { to: maskEmail(to), template, attempt, maxRetries })
    }

    return {
      success: false,
      retry,
      delayMs: calculateRetryDelay({ attempt, baseDelayMs }),
      attempt,
      emailLogId: logEntry.id,
    }
  }

  return { sendEmail }
}

export { EmailService }
