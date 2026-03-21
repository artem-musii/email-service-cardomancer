import { Resend } from 'resend'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const ResendProvider = ({ apiKey, log = noopLog }) => {
  const resend = new Resend(apiKey)

  const send = async ({ to, subject, html, from }) => {
    try {
      log.debug('calling Resend API')
      const { data, error } = await resend.emails.send({ from, to, subject, html })
      if (error) {
        log.error('Resend API error', { error: error.message, name: error.name })
        return { success: false, error: error.message }
      }
      log.debug('Resend API success', { emailId: data?.id })
      return { success: true }
    } catch (e) {
      log.error('Resend API exception', { error: e.message })
      return { success: false, error: e.message }
    }
  }

  return { send }
}

export { ResendProvider }
