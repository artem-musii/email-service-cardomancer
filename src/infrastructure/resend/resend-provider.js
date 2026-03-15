import { Resend } from 'resend'

const ResendProvider = ({ apiKey }) => {
  const resend = new Resend(apiKey)

  const send = async ({ to, subject, html, from }) => {
    try {
      await resend.emails.send({ from, to, subject, html })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  return { send }
}

export { ResendProvider }
