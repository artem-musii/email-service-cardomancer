import sgMail from '@sendgrid/mail'

const SendGridProvider = ({ apiKey }) => {
  sgMail.setApiKey(apiKey)

  const send = async ({ to, subject, html, from }) => {
    try {
      await sgMail.send({ to, from, subject, html })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  return { send }
}

export { SendGridProvider }
