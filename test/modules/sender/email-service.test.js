import { describe, it, expect } from 'bun:test'
import { EmailService } from '../../../src/modules/sender/email-service.js'
import { InMemoryEmailProvider } from '../../fakes/in-memory-email-provider.js'
import { FakeEventPublisher } from '../../fakes/fake-event-publisher.js'
import { FakeEmailLogRepository } from '../../fakes/fake-email-log-repository.js'
import { InMemoryTemplateStore } from '../../fakes/in-memory-template-store.js'
import { TemplateService } from '../../../src/modules/templates/template-service.js'

describe('EmailService', () => {
  const setup = ({ shouldFail = false } = {}) => {
    const provider = InMemoryEmailProvider({ shouldFail })
    const events = FakeEventPublisher()
    const logRepo = FakeEmailLogRepository()
    const templateStore = InMemoryTemplateStore({ 'otp-code': 'Code: {{code}}', welcome: 'Hi {{name}}' })
    const templateService = TemplateService({ templateStore })
    const service = EmailService({
      emailProvider: provider,
      eventPublisher: events,
      emailLogRepository: logRepo,
      templateService,
      fromEmail: 'noreply@test.com',
    })
    return { service, provider, events, logRepo }
  }

  it('sends email and logs success', async () => {
    const { service, provider, events, logRepo } = setup()
    await service.sendEmail({ to: 'a@b.com', template: 'otp-code', variables: { code: '123456' } })
    expect(provider.sent).toHaveLength(1)
    expect(provider.sent[0].to).toBe('a@b.com')
    expect(logRepo.logs[0].status).toBe('sent')
    expect(events.published.find((e) => e.type === 'email.sent')).toBeTruthy()
  })

  it('logs failure and publishes email.failed', async () => {
    const { service, events, logRepo } = setup({ shouldFail: true })
    await service.sendEmail({ to: 'a@b.com', template: 'otp-code', variables: { code: '123456' } })
    expect(logRepo.logs[0].status).toBe('failed')
    expect(events.published.find((e) => e.type === 'email.failed')).toBeTruthy()
  })
})
