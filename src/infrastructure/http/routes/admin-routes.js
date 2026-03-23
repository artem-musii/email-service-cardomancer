import { Elysia } from 'elysia'
import { secureCompareAny, parseBasicAuth } from '../../../shared/utils.js'
import { createRateLimiter } from '../../../shared/rate-limiter.js'

const getClientIp = (headers) => headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || 'unknown'

const authenticateRequest = (headers, adminApiKeys) => {
  const key = headers['x-admin-key']
  if (key) return secureCompareAny(key, adminApiKeys)
  const password = parseBasicAuth(headers['authorization'])
  if (password) return secureCompareAny(password, adminApiKeys)
  return false
}

const adminRoutes = (app, { templateService, emailLogRepository, adminApiKeys, _log }) => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 })

  const adminApp = new Elysia({ prefix: '/admin/api' })
    .onBeforeHandle(({ headers, set }) => {
      const ip = getClientIp(headers)
      const result = limiter.check(ip)
      if (!result.allowed) {
        set.status = 429
        set.headers['Retry-After'] = String(result.retryAfter)
        return { error: 'Too many requests', retryAfter: result.retryAfter }
      }

      if (!authenticateRequest(headers, adminApiKeys)) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
    })

    // Templates CRUD
    .get('/templates', async () => {
      return templateService.getAll()
    })

    .get('/templates/:id', async ({ params, set }) => {
      const t = await templateService.getById(params.id)
      if (!t) {
        set.status = 404
        return { error: 'Not found' }
      }
      return t
    })

    .post('/templates', async ({ body, set }) => {
      const { name, subject, fromName, html, variables, maxRetries } = body || {}
      if (!name || typeof name !== 'string' || !html || typeof html !== 'string') {
        set.status = 400
        return { error: 'name and html are required strings' }
      }
      return templateService.create({
        name,
        subject: typeof subject === 'string' ? subject : undefined,
        fromName: typeof fromName === 'string' ? fromName : undefined,
        html,
        variables: Array.isArray(variables) ? variables : [],
        maxRetries: typeof maxRetries === 'number' ? maxRetries : 0,
      })
    })

    .put('/templates/:id', async ({ params, body, set: _set }) => {
      const allowed = {}
      if (body.name !== undefined) allowed.name = body.name
      if (body.subject !== undefined) allowed.subject = body.subject
      if (body.fromName !== undefined) allowed.fromName = body.fromName
      if (body.html !== undefined) allowed.html = body.html
      if (body.variables !== undefined) allowed.variables = body.variables
      if (body.maxRetries !== undefined) allowed.maxRetries = body.maxRetries
      return templateService.update(params.id, allowed)
    })

    .delete('/templates/:id', async ({ params }) => {
      return templateService.delete(params.id)
    })

    // Email Logs
    .get('/logs', async ({ query }) => {
      const page = parseInt(query.page || '1', 10)
      const limit = Math.min(parseInt(query.limit || '50', 10), 100)
      return emailLogRepository.findAll({
        page,
        limit,
        status: query.status,
        template: query.template,
        to: query.to,
        from: query.from,
        to_date: query.to_date,
      })
    })

    .get('/logs/:id', async ({ params, set }) => {
      const log = await emailLogRepository.findById(params.id)
      if (!log) {
        set.status = 404
        return { error: 'Not found' }
      }
      return log
    })

  app.use(adminApp)

  return app
}

export { adminRoutes }
