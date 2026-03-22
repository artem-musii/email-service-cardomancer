import { Elysia } from 'elysia'
import { secureCompare } from '../../../shared/utils.js'

const adminRoutes = (app, { templateService, emailLogRepository, adminApiKey, _log }) => {
  const adminApp = new Elysia({ prefix: '/admin/api' })
    .onBeforeHandle(({ headers, set }) => {
      const key = headers['x-admin-key']
      if (!key || !secureCompare(key, adminApiKey)) {
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
      const { name, html, variables, maxRetries } = body || {}
      if (!name || typeof name !== 'string' || !html || typeof html !== 'string') {
        set.status = 400
        return { error: 'name and html are required strings' }
      }
      return templateService.create({
        name,
        html,
        variables: Array.isArray(variables) ? variables : [],
        maxRetries: typeof maxRetries === 'number' ? maxRetries : 0,
      })
    })

    .put('/templates/:id', async ({ params, body, set: _set }) => {
      const allowed = {}
      if (body.name !== undefined) allowed.name = body.name
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
