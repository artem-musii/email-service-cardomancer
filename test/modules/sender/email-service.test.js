import { describe, it, expect } from 'bun:test'
import { EmailService } from '../../../src/modules/sender/email-service.js'
import { InMemoryEmailProvider } from '../../fakes/in-memory-email-provider.js'
import { FakeEventPublisher } from '../../fakes/fake-event-publisher.js'
import { FakeEmailLogRepository } from '../../fakes/fake-email-log-repository.js'
import { FakeTemplateRepository } from '../../fakes/fake-template-repository.js'
import { TemplateService } from '../../../src/modules/templates/template-service.js'

describe('EmailService', () => {
  const setup = async ({ shouldFail = false } = {}) => {
    const provider = InMemoryEmailProvider({ shouldFail })
    const events = FakeEventPublisher()
    const logRepo = FakeEmailLogRepository()
    const templateRepo = FakeTemplateRepository()
    const templateService = TemplateService({ templateRepository: templateRepo })
    await templateRepo.create({
      name: 'otp-code',
      subject: 'Your verification code',
      html: 'Code: {{code}}',
      variables: ['code'],
      maxRetries: 0,
    })
    await templateRepo.create({
      name: 'welcome',
      subject: 'Welcome {{name}}',
      html: 'Hi {{name}}',
      variables: ['name'],
      maxRetries: 3,
    })
    const service = EmailService({
      emailProvider: provider,
      eventPublisher: events,
      emailLogRepository: logRepo,
      templateService,
      fromEmail: 'noreply@test.com',
    })
    return { service, provider, events, logRepo }
  }

  it('sends email and logs success with subject', async () => {
    const { service, provider, events, logRepo } = await setup()
    const result = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Your code',
      template: 'otp-code',
      variables: { code: '123456' },
    })
    expect(result.success).toBe(true)
    expect(result.retry).toBe(false)
    expect(provider.sent).toHaveLength(1)
    expect(provider.sent[0].subject).toBe('Your code')
    expect(logRepo.logs[0].status).toBe('sent')
    expect(logRepo.logs[0].subject).toBe('Your code')
    expect(events.published.find((e) => e.type === 'email.sent')).toBeTruthy()
  })

  it('formats from with caller fromName', async () => {
    const { service, provider, logRepo } = await setup()
    await service.sendEmail({
      to: 'a@b.com',
      subject: 'Hi',
      fromName: 'Cardomancer',
      template: 'otp-code',
      variables: { code: '123456' },
    })
    expect(provider.sent[0].from).toBe('Cardomancer <noreply@test.com>')
    expect(logRepo.logs[0].fromEmail).toBe('Cardomancer <noreply@test.com>')
  })

  it('formats from with template fromName when caller omits it', async () => {
    const provider = InMemoryEmailProvider()
    const logRepo = FakeEmailLogRepository()
    const templateRepo = FakeTemplateRepository()
    const templateService = TemplateService({ templateRepository: templateRepo })
    await templateRepo.create({
      name: 'branded',
      subject: 'Hi',
      fromName: 'MyApp',
      html: '<p>hi</p>',
      variables: [],
      maxRetries: 0,
    })
    const svc = EmailService({
      emailProvider: provider,
      eventPublisher: FakeEventPublisher(),
      emailLogRepository: logRepo,
      templateService,
      fromEmail: 'noreply@test.com',
    })
    await svc.sendEmail({ to: 'a@b.com', template: 'branded', variables: {} })
    expect(provider.sent[0].from).toBe('MyApp <noreply@test.com>')
  })

  it('uses plain fromEmail when no fromName provided', async () => {
    const { service, provider } = await setup()
    await service.sendEmail({
      to: 'a@b.com',
      subject: 'Hi',
      template: 'otp-code',
      variables: { code: '123456' },
    })
    expect(provider.sent[0].from).toBe('noreply@test.com')
  })

  it('uses template subject when caller omits subject', async () => {
    const { service, provider, logRepo } = await setup()
    const result = await service.sendEmail({
      to: 'a@b.com',
      template: 'otp-code',
      variables: { code: '123456' },
    })
    expect(result.success).toBe(true)
    expect(provider.sent[0].subject).toBe('Your verification code')
    expect(logRepo.logs[0].subject).toBe('Your verification code')
  })

  it('uses template name as fallback when neither caller nor template has subject', async () => {
    const { service, provider, logRepo } = await setup()
    const templateRepo = FakeTemplateRepository()
    const templateService = TemplateService({ templateRepository: templateRepo })
    await templateRepo.create({ name: 'no-subject', html: '<p>hi</p>', variables: [], maxRetries: 0 })
    const svc = EmailService({
      emailProvider: provider,
      eventPublisher: FakeEventPublisher(),
      emailLogRepository: logRepo,
      templateService,
      fromEmail: 'noreply@test.com',
    })
    const result = await svc.sendEmail({
      to: 'a@b.com',
      template: 'no-subject',
      variables: {},
    })
    expect(result.success).toBe(true)
    expect(provider.sent[0].subject).toBe('no-subject')
  })

  it('logs failure and publishes email.failed when no retries', async () => {
    const { service, events, logRepo } = await setup({ shouldFail: true })
    const result = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Your code',
      template: 'otp-code',
      variables: { code: '123456' },
    })
    expect(result.success).toBe(false)
    expect(result.retry).toBe(false)
    expect(logRepo.logs[0].status).toBe('failed')
    expect(events.published.find((e) => e.type === 'email.failed')).toBeTruthy()
  })

  it('returns retry=true when template has maxRetries and attempt <= maxRetries', async () => {
    const { service, logRepo } = await setup({ shouldFail: true })
    const result = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 1,
    })
    expect(result.success).toBe(false)
    expect(result.retry).toBe(true)
    expect(result.delayMs).toBe(1000)
    expect(result.emailLogId).toBeDefined()
    expect(logRepo.logs[0].status).toBe('queued')
  })

  it('caller retryPolicy overrides template default', async () => {
    const { service } = await setup({ shouldFail: true })
    const result = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Your code',
      template: 'otp-code',
      variables: { code: '123456' },
      retryPolicy: { maxRetries: 2, baseDelayMs: 500 },
      attempt: 1,
    })
    expect(result.retry).toBe(true)
    expect(result.delayMs).toBe(500)
  })

  it('updates existing log on retry via emailLogId', async () => {
    const { service, logRepo } = await setup({ shouldFail: true })
    const first = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 1,
    })
    await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 2,
      emailLogId: first.emailLogId,
    })
    expect(logRepo.logs).toHaveLength(1)
    expect(logRepo.logs[0].attempt).toBe(2)
  })

  it('gives up after maxRetries exceeded', async () => {
    const { service, events, logRepo } = await setup({ shouldFail: true })
    const first = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 1,
    })
    await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 2,
      emailLogId: first.emailLogId,
    })
    await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 3,
      emailLogId: first.emailLogId,
    })
    const final = await service.sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      template: 'welcome',
      variables: { name: 'Alice' },
      attempt: 4,
      emailLogId: first.emailLogId,
    })
    expect(final.retry).toBe(false)
    expect(logRepo.logs[0].status).toBe('failed')
    expect(events.published.find((e) => e.type === 'email.failed')).toBeTruthy()
  })
})
