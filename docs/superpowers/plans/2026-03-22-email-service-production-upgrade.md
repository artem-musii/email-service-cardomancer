# Email Service Production Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite email-service into a production-grade, multi-tenant email platform with DB-backed templates, admin panel, configurable retry, and full quality gates.

**Architecture:** Hexagonal architecture (modules/ + infrastructure/) with DI container. RabbitMQ for async email processing with dead-letter retry. React admin panel served via Bun HTML imports. Matches auth-service production standards.

**Tech Stack:** Bun, Elysia, Drizzle ORM (bun-sql), RabbitMQ (amqplib), Resend, React 19, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-22-email-service-production-upgrade-design.md`

---

## Task 1: Quality Gates — ESLint, Prettier, Husky

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.lintstagedrc`
- Create: `.husky/pre-commit`
- Modify: `package.json`

- [ ] **Step 1: Install dev dependencies**

```bash
bun add -d @eslint/js eslint globals prettier husky lint-staged @types/amqplib
```

- [ ] **Step 2: Create ESLint config**

Create `eslint.config.js`:
```js
import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, Bun: 'readonly', crypto: 'readonly' },
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  { ignores: ['node_modules/', 'drizzle/'] },
]
```

- [ ] **Step 3: Create Prettier config**

Create `.prettierrc`:
```json
{
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

- [ ] **Step 4: Create lint-staged config**

Create `.lintstagedrc`:
```json
{
  "*.js": ["prettier --write", "eslint --fix"],
  "*.{tsx,ts}": ["prettier --write"]
}
```

- [ ] **Step 5: Initialize Husky and create pre-commit hook**

```bash
bunx husky init
```

Write `.husky/pre-commit`:
```bash
bunx lint-staged
```

- [ ] **Step 6: Add scripts to package.json**

Add to `package.json` scripts:
```json
{
  "lint": "eslint src/ test/ --ignore-pattern '*.tsx'",
  "lint:fix": "eslint src/ test/ --fix --ignore-pattern '*.tsx'",
  "format": "prettier --write \"src/**/*.{js,tsx}\" \"test/**/*.js\"",
  "format:check": "prettier --check \"src/**/*.{js,tsx}\" \"test/**/*.js\"",
  "check": "bun run lint && bun run format:check && bun run test",
  "prepare": "husky"
}
```

- [ ] **Step 7: Format existing codebase**

```bash
bun run format
bun run lint:fix
```

- [ ] **Step 8: Verify quality gates pass**

```bash
bun run check
```

Expected: All lint, format, and test checks pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add ESLint, Prettier, Husky quality gates"
```

---

## Task 2: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run format:check
      - run: bun test

  deploy:
    needs: check
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deploy
        run: |
          curl --silent --show-error --fail --request GET \
            "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
            --header "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add CI/CD pipeline with Coolify deploy"
```

---

## Task 3: Shared Utils + Config Update

**Files:**
- Create: `src/shared/utils.js`
- Modify: `src/config.js`
- Modify: `test/modules/config.test.js`

- [ ] **Step 1: Write config test for ADMIN_API_KEY**

Add test to `test/modules/config.test.js`:
```js
it('throws when ADMIN_API_KEY is missing', () => {
  const env = {
    DATABASE_URL: 'postgres://localhost/email_db',
    RABBITMQ_URL: 'amqp://localhost',
    RESEND_API_KEY: 're_test_123',
    FROM_EMAIL: 'noreply@test.com',
  }
  expect(() => loadConfig(env)).toThrow('ADMIN_API_KEY')
})

it('includes adminApiKey in config', () => {
  const env = {
    DATABASE_URL: 'postgres://localhost/email_db',
    RABBITMQ_URL: 'amqp://localhost',
    RESEND_API_KEY: 're_test_123',
    FROM_EMAIL: 'noreply@test.com',
    ADMIN_API_KEY: 'secret-key',
  }
  const config = loadConfig(env)
  expect(config.adminApiKey).toBe('secret-key')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test test/modules/config.test.js
```

Expected: FAIL — `adminApiKey` not in config, ADMIN_API_KEY not required.

- [ ] **Step 3: Update config.js**

```js
const REQUIRED = ['DATABASE_URL', 'RABBITMQ_URL', 'RESEND_API_KEY', 'FROM_EMAIL', 'ADMIN_API_KEY']

const loadConfig = (env) => {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`)
  }
  return {
    database: { url: env.DATABASE_URL },
    rabbitmq: { url: env.RABBITMQ_URL },
    resend: { apiKey: env.RESEND_API_KEY },
    fromEmail: env.FROM_EMAIL,
    adminApiKey: env.ADMIN_API_KEY,
    port: parseInt(env.PORT || '3002', 10),
    logLevel: env.LOG_LEVEL || 'info',
  }
}

export { loadConfig }
```

- [ ] **Step 4: Fix existing config test (add ADMIN_API_KEY to valid env)**

Update the `returns config from env` test to include `ADMIN_API_KEY: 'secret'` in the env object.

- [ ] **Step 5: Create shared utils**

Create `src/shared/utils.js`:
```js
import { timingSafeEqual } from 'crypto'

const maskEmail = (email) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 3)}***@${domain}`
}

const secureCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export { maskEmail, secureCompare }
```

- [ ] **Step 6: Run tests**

```bash
bun test test/modules/config.test.js
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/utils.js src/config.js test/modules/config.test.js
git commit -m "feat: add ADMIN_API_KEY to config, add shared utils"
```

---

## Task 4: Database Schema + Migration

**Files:**
- Modify: `src/infrastructure/db/schema.js`
- Modify: `package.json` (remove `postgres` dep, already uses drizzle)

- [ ] **Step 1: Update Drizzle schema**

Rewrite `src/infrastructure/db/schema.js`:
```js
import { pgTable, pgEnum, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

const statusEnum = pgEnum('email_status', ['queued', 'sent', 'failed'])

const emailLog = pgTable('email_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  toAddress: varchar('to_address', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 500 }),
  template: varchar('template', { length: 100 }).notNull(),
  status: statusEnum('status').default('queued').notNull(),
  error: text('error'),
  attempt: integer('attempt').default(1).notNull(),
  maxRetries: integer('max_retries').default(0).notNull(),
  variables: jsonb('variables'),
  fromEmail: varchar('from_email', { length: 255 }),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

const emailTemplates = pgTable('email_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).unique().notNull(),
  html: text('html').notNull(),
  variables: text('variables').array().notNull().default([]),
  maxRetries: integer('max_retries').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export { statusEnum, emailLog, emailTemplates }
```

- [ ] **Step 2: Generate migration**

```bash
bun run db:generate
```

Review the generated SQL to confirm it adds the new columns and creates `email_templates`.

- [ ] **Step 3: Create seed migration**

Manually create a SQL file in `src/infrastructure/db/migrations/` after the generated migration. Read the contents of `templates/otp-code.html` and `templates/welcome.html` and insert them:

```sql
INSERT INTO email_templates (name, html, variables, max_retries)
VALUES
  ('otp-code', '<full HTML from otp-code.html>', ARRAY['code'], 0),
  ('welcome', '<full HTML from welcome.html>', ARRAY['name', 'app'], 3)
ON CONFLICT (name) DO NOTHING;
```

Add the corresponding entry to the migrations meta journal so drizzle-kit tracks it.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/db/schema.js src/infrastructure/db/migrations/
git commit -m "feat: add email_templates table, extend email_log schema"
```

---

## Task 5: Test Fakes

**Files:**
- Create: `test/fakes/fake-template-repository.js`
- Modify: `test/fakes/fake-email-log-repository.js`

- [ ] **Step 1: Create FakeTemplateRepository**

Create `test/fakes/fake-template-repository.js`:
```js
const FakeTemplateRepository = (initial = []) => {
  const templates = new Map()
  for (const t of initial) {
    templates.set(t.id || crypto.randomUUID(), t)
  }

  const findByName = async (name) => {
    for (const t of templates.values()) {
      if (t.name === name) return t
    }
    return null
  }

  const findById = async (id) => templates.get(id) || null

  const findAll = async () => [...templates.values()]

  const create = async ({ name, html, variables = [], maxRetries = 0 }) => {
    const t = {
      id: crypto.randomUUID(),
      name,
      html,
      variables,
      maxRetries,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    templates.set(t.id, t)
    return t
  }

  const update = async (id, data) => {
    const t = templates.get(id)
    if (!t) return null
    Object.assign(t, data, { updatedAt: new Date() })
    return t
  }

  const remove = async (id) => {
    const t = templates.get(id)
    templates.delete(id)
    return t || null
  }

  return { findByName, findById, findAll, create, update, delete: remove, templates }
}

export { FakeTemplateRepository }
```

- [ ] **Step 2: Update FakeEmailLogRepository**

Rewrite `test/fakes/fake-email-log-repository.js`:
```js
const FakeEmailLogRepository = () => {
  const logs = []

  const create = async ({ toAddress, subject, template, status = 'queued', attempt = 1, maxRetries = 0, variables, fromEmail }) => {
    const log = {
      id: crypto.randomUUID(),
      toAddress,
      subject,
      template,
      status,
      error: null,
      attempt,
      maxRetries,
      variables,
      fromEmail,
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    logs.push(log)
    return log
  }

  const updateStatus = async (id, status, error = null) => {
    const log = logs.find((l) => l.id === id)
    if (log) {
      log.status = status
      log.error = error
      log.updatedAt = new Date()
      if (status === 'sent') log.sentAt = new Date()
    }
    return log
  }

  const updateAttempt = async (id, attempt) => {
    const log = logs.find((l) => l.id === id)
    if (log) {
      log.attempt = attempt
      log.status = 'queued'
      log.error = null
      log.updatedAt = new Date()
    }
    return log
  }

  const findById = async (id) => logs.find((l) => l.id === id) || null

  const findAll = async ({ page = 1, limit = 50, status, template, to, from, to_date } = {}) => {
    let filtered = [...logs]
    if (status) filtered = filtered.filter((l) => l.status === status)
    if (template) filtered = filtered.filter((l) => l.template === template)
    if (to) filtered = filtered.filter((l) => l.toAddress.includes(to))
    if (from) filtered = filtered.filter((l) => l.createdAt >= new Date(from))
    if (to_date) filtered = filtered.filter((l) => l.createdAt <= new Date(to_date))
    const total = filtered.length
    const offset = (page - 1) * limit
    return { data: filtered.slice(offset, offset + limit), total, page, limit }
  }

  return { create, updateStatus, updateAttempt, findById, findAll, logs }
}

export { FakeEmailLogRepository }
```

- [ ] **Step 3: Commit**

```bash
git add test/fakes/fake-template-repository.js test/fakes/fake-email-log-repository.js
git commit -m "feat: add FakeTemplateRepository, extend FakeEmailLogRepository"
```

---

## Task 6: Template Service (TDD)

**Files:**
- Modify: `src/modules/templates/template-service.js`
- Modify: `test/modules/templates/template-service.test.js`

- [ ] **Step 1: Write failing tests**

Rewrite `test/modules/templates/template-service.test.js`:
```js
import { describe, it, expect } from 'bun:test'
import { TemplateService } from '../../../src/modules/templates/template-service.js'
import { FakeTemplateRepository } from '../../fakes/fake-template-repository.js'

describe('TemplateService', () => {
  const setup = (initial = []) => {
    const repo = FakeTemplateRepository(initial)
    const service = TemplateService({ templateRepository: repo })
    return { service, repo }
  }

  describe('CRUD', () => {
    it('creates a template', async () => {
      const { service } = setup()
      const t = await service.create({ name: 'test', html: '<p>{{msg}}</p>', variables: ['msg'], maxRetries: 2 })
      expect(t.name).toBe('test')
      expect(t.maxRetries).toBe(2)
    })

    it('gets template by name', async () => {
      const { service } = setup()
      await service.create({ name: 'test', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      const t = await service.getByName('test')
      expect(t.name).toBe('test')
    })

    it('returns null for missing template name', async () => {
      const { service } = setup()
      const t = await service.getByName('nope')
      expect(t).toBeNull()
    })

    it('gets template by id', async () => {
      const { service } = setup()
      const created = await service.create({ name: 'test2', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      const t = await service.getById(created.id)
      expect(t.name).toBe('test2')
    })

    it('lists all templates', async () => {
      const { service } = setup()
      await service.create({ name: 'a', html: '<p>a</p>', variables: [], maxRetries: 0 })
      await service.create({ name: 'b', html: '<p>b</p>', variables: [], maxRetries: 0 })
      const all = await service.getAll()
      expect(all).toHaveLength(2)
    })

    it('updates a template', async () => {
      const { service } = setup()
      const t = await service.create({ name: 'test', html: '<p>old</p>', variables: [], maxRetries: 0 })
      const updated = await service.update(t.id, { html: '<p>new</p>', maxRetries: 3 })
      expect(updated.html).toBe('<p>new</p>')
      expect(updated.maxRetries).toBe(3)
    })

    it('deletes a template', async () => {
      const { service } = setup()
      const t = await service.create({ name: 'test', html: '<p>hi</p>', variables: [], maxRetries: 0 })
      await service.delete(t.id)
      const all = await service.getAll()
      expect(all).toHaveLength(0)
    })
  })

  describe('render', () => {
    it('renders template with variables', async () => {
      const { service } = setup()
      await service.create({ name: 'otp', html: '<p>Code: {{code}}</p>', variables: ['code'], maxRetries: 0 })
      const result = await service.render('otp', { code: '123456' })
      expect(result.html).toBe('<p>Code: 123456</p>')
      expect(result.maxRetries).toBe(0)
    })

    it('throws on missing template', async () => {
      const { service } = setup()
      await expect(service.render('nope', {})).rejects.toThrow('Template not found: nope')
    })

    it('replaces multiple variables', async () => {
      const { service } = setup()
      await service.create({ name: 'welcome', html: '<p>Hi {{name}}, welcome to {{app}}</p>', variables: ['name', 'app'], maxRetries: 3 })
      const result = await service.render('welcome', { name: 'Alice', app: 'Acme' })
      expect(result.html).toBe('<p>Hi Alice, welcome to Acme</p>')
      expect(result.maxRetries).toBe(3)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/modules/templates/template-service.test.js
```

Expected: FAIL — TemplateService API changed.

- [ ] **Step 3: Implement TemplateService**

Rewrite `src/modules/templates/template-service.js`:
```js
const TemplateService = ({ templateRepository }) => {
  const create = async ({ name, html, variables = [], maxRetries = 0 }) => {
    return templateRepository.create({ name, html, variables, maxRetries })
  }

  const getByName = async (name) => {
    return templateRepository.findByName(name)
  }

  const getById = async (id) => {
    return templateRepository.findById(id)
  }

  const getAll = async () => {
    return templateRepository.findAll()
  }

  const update = async (id, data) => {
    return templateRepository.update(id, data)
  }

  const remove = async (id) => {
    return templateRepository.delete(id)
  }

  const render = async (name, variables) => {
    const template = await templateRepository.findByName(name)
    if (!template) throw new Error(`Template not found: ${name}`)
    let html = template.html
    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, String(value))
    }
    return { html, maxRetries: template.maxRetries }
  }

  return { create, getByName, getById, getAll, update, delete: remove, render }
}

export { TemplateService }
```

- [ ] **Step 4: Run tests**

```bash
bun test test/modules/templates/template-service.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/templates/template-service.js test/modules/templates/template-service.test.js
git commit -m "feat: rewrite TemplateService with DB-backed CRUD + render"
```

---

## Task 7: Retry Policy (TDD)

**Files:**
- Create: `src/modules/sender/retry-policy.js`
- Create: `test/modules/sender/retry-policy.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/modules/sender/retry-policy.test.js`:
```js
import { describe, it, expect } from 'bun:test'
import { calculateRetryDelay, shouldRetry } from '../../../src/modules/sender/retry-policy.js'

describe('retry-policy', () => {
  describe('calculateRetryDelay', () => {
    it('returns baseDelay for attempt 1', () => {
      expect(calculateRetryDelay({ attempt: 1, baseDelayMs: 1000 })).toBe(1000)
    })

    it('doubles delay for each attempt', () => {
      expect(calculateRetryDelay({ attempt: 2, baseDelayMs: 1000 })).toBe(2000)
      expect(calculateRetryDelay({ attempt: 3, baseDelayMs: 1000 })).toBe(4000)
      expect(calculateRetryDelay({ attempt: 4, baseDelayMs: 1000 })).toBe(8000)
    })

    it('caps delay at 60 seconds', () => {
      expect(calculateRetryDelay({ attempt: 10, baseDelayMs: 1000 })).toBe(60000)
    })

    it('uses custom baseDelay', () => {
      expect(calculateRetryDelay({ attempt: 1, baseDelayMs: 500 })).toBe(500)
      expect(calculateRetryDelay({ attempt: 2, baseDelayMs: 500 })).toBe(1000)
    })
  })

  describe('shouldRetry', () => {
    it('returns true when attempt <= maxRetries', () => {
      expect(shouldRetry({ attempt: 1, maxRetries: 3 })).toBe(true)
      expect(shouldRetry({ attempt: 3, maxRetries: 3 })).toBe(true)
    })

    it('returns false when attempt > maxRetries', () => {
      expect(shouldRetry({ attempt: 4, maxRetries: 3 })).toBe(false)
    })

    it('returns false when maxRetries is 0', () => {
      expect(shouldRetry({ attempt: 1, maxRetries: 0 })).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/modules/sender/retry-policy.test.js
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement retry-policy**

Create `src/modules/sender/retry-policy.js`:
```js
const MAX_DELAY_MS = 60000

const calculateRetryDelay = ({ attempt, baseDelayMs = 1000 }) => {
  return Math.min(baseDelayMs * Math.pow(2, attempt - 1), MAX_DELAY_MS)
}

const shouldRetry = ({ attempt, maxRetries }) => {
  return maxRetries > 0 && attempt <= maxRetries
}

export { calculateRetryDelay, shouldRetry }
```

- [ ] **Step 4: Run tests**

```bash
bun test test/modules/sender/retry-policy.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/sender/retry-policy.js test/modules/sender/retry-policy.test.js
git commit -m "feat: add retry policy with exponential backoff"
```

---

## Task 8: Email Service Rewrite (TDD)

**Files:**
- Modify: `src/modules/sender/email-service.js`
- Delete: `src/modules/sender/email-entity.js`
- Modify: `test/modules/sender/email-service.test.js`

- [ ] **Step 1: Write failing tests**

Rewrite `test/modules/sender/email-service.test.js`:
```js
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
    await templateRepo.create({ name: 'otp-code', html: 'Code: {{code}}', variables: ['code'], maxRetries: 0 })
    await templateRepo.create({ name: 'welcome', html: 'Hi {{name}}', variables: ['name'], maxRetries: 3 })
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
    const second = await service.sendEmail({
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
    // Simulate attempts 2, 3
    await service.sendEmail({ to: 'a@b.com', subject: 'Welcome', template: 'welcome', variables: { name: 'Alice' }, attempt: 2, emailLogId: first.emailLogId })
    await service.sendEmail({ to: 'a@b.com', subject: 'Welcome', template: 'welcome', variables: { name: 'Alice' }, attempt: 3, emailLogId: first.emailLogId })
    // Attempt 4 — should give up (maxRetries=3, attempt 4 > 3)
    const final = await service.sendEmail({ to: 'a@b.com', subject: 'Welcome', template: 'welcome', variables: { name: 'Alice' }, attempt: 4, emailLogId: first.emailLogId })
    expect(final.retry).toBe(false)
    expect(logRepo.logs[0].status).toBe('failed')
    expect(events.published.find((e) => e.type === 'email.failed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/modules/sender/email-service.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement EmailService**

Rewrite `src/modules/sender/email-service.js`:
```js
import { maskEmail } from '../../shared/utils.js'
import { calculateRetryDelay, shouldRetry as checkRetry } from './retry-policy.js'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const EmailService = ({ emailProvider, eventPublisher, emailLogRepository, templateService, fromEmail, log = noopLog }) => {
  const sendEmail = async ({ to, subject, template, variables, retryPolicy, attempt = 1, emailLogId = null }) => {
    log.info('sending email', { to: maskEmail(to), template, attempt })

    const { html, maxRetries: templateMaxRetries } = await templateService.render(template, variables)

    const maxRetries = retryPolicy?.maxRetries ?? templateMaxRetries
    const baseDelayMs = retryPolicy?.baseDelayMs ?? 1000

    let logEntry
    if (emailLogId) {
      logEntry = await emailLogRepository.updateAttempt(emailLogId, attempt)
    } else {
      logEntry = await emailLogRepository.create({
        toAddress: to,
        subject,
        template,
        status: 'queued',
        attempt,
        maxRetries,
        variables,
        fromEmail,
      })
    }

    const result = await emailProvider.send({ to, subject, html, from: fromEmail })

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
```

- [ ] **Step 4: Delete email-entity.js**

```bash
rm src/modules/sender/email-entity.js
```

- [ ] **Step 5: Run tests**

```bash
bun test test/modules/sender/email-service.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/sender/ test/modules/sender/email-service.test.js
git commit -m "feat: rewrite EmailService with retry logic and caller subject"
```

---

## Task 9: RabbitMQ Connection Manager

**Files:**
- Create: `src/infrastructure/rabbitmq/connection-manager.js`

**Note:** No dedicated unit tests — the connection manager requires a real RabbitMQ connection to test meaningfully. It is validated through the E2E test and manual testing. The same pattern is used in auth-service without unit tests.

- [ ] **Step 1: Implement connection manager**

Port from auth-service (`/Users/artemmusii/Desktop/Projects/auth-service/src/infrastructure/rabbitmq/connection-manager.js`) with consumer restart support:

Create `src/infrastructure/rabbitmq/connection-manager.js`:
```js
import amqplib from 'amqplib'

const RabbitMQConnectionManager = ({ url, log }) => {
  let connection = null
  let channel = null
  let closed = false
  let reconnectDelay = 1000
  const publishers = []
  const consumers = []

  const connect = async () => {
    connection = await amqplib.connect(url)
    channel = await connection.createChannel()

    connection.on('error', (err) => {
      if (log) log.error('rabbitmq connection error', { err: err.message })
    })
    connection.on('close', () => {
      channel = null
      connection = null
      if (!closed) scheduleReconnect()
    })
    channel.on('error', (err) => {
      if (log) log.error('rabbitmq channel error', { err: err.message })
    })
    channel.on('close', () => {
      channel = null
      if (!closed) scheduleReconnect()
    })

    reconnectDelay = 1000
    for (const publisher of publishers) publisher.reset()
    for (const consumer of consumers) {
      try {
        await consumer.restart(channel)
      } catch (err) {
        if (log) log.error('consumer restart failed', { err: err.message })
      }
    }
    if (log) log.info('rabbitmq connected')
  }

  const scheduleReconnect = () => {
    if (closed) return
    const delay = reconnectDelay
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    if (log) log.warn('rabbitmq reconnecting', { delay })
    setTimeout(async () => {
      if (closed) return
      try {
        await connect()
      } catch (err) {
        if (log) log.error('rabbitmq reconnect failed', { err: err.message })
        scheduleReconnect()
      }
    }, delay)
  }

  const getChannel = () => channel
  const isConnected = () => channel !== null && connection !== null
  const registerPublisher = (publisher) => publishers.push(publisher)
  const registerConsumer = (consumer) => consumers.push(consumer)

  const close = async () => {
    closed = true
    try { await channel?.close() } catch (_e) { /* ignore */ }
    channel = null
    try { await connection?.close() } catch (_e) { /* ignore */ }
    connection = null
  }

  return { connect, getChannel, isConnected, registerPublisher, registerConsumer, scheduleReconnect, close }
}

export { RabbitMQConnectionManager }
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/rabbitmq/connection-manager.js
git commit -m "feat: add RabbitMQ connection manager with auto-reconnect"
```

---

## Task 10: Event Consumer with Validation + Retry (TDD)

**Files:**
- Modify: `src/infrastructure/rabbitmq/event-consumer.js`
- Create: `test/infrastructure/rabbitmq/event-consumer.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/infrastructure/rabbitmq/event-consumer.test.js`:
```js
import { describe, it, expect } from 'bun:test'
import { validateEmailMessage } from '../../../src/infrastructure/rabbitmq/event-consumer.js'

describe('validateEmailMessage', () => {
  it('returns valid for correct message', () => {
    const event = { payload: { to: 'a@b.com', subject: 'Hi', template: 'otp', variables: { code: '1' } } }
    expect(validateEmailMessage(event)).toEqual({ valid: true })
  })

  it('fails on missing payload', () => {
    expect(validateEmailMessage({})).toEqual({ valid: false, error: 'missing payload' })
    expect(validateEmailMessage(null)).toEqual({ valid: false, error: 'missing payload' })
  })

  it('fails on missing to', () => {
    const event = { payload: { subject: 'Hi', template: 'otp', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('fails on missing subject', () => {
    const event = { payload: { to: 'a@b.com', template: 'otp', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('fails on missing template', () => {
    const event = { payload: { to: 'a@b.com', subject: 'Hi', variables: {} } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })

  it('fails on missing variables', () => {
    const event = { payload: { to: 'a@b.com', subject: 'Hi', template: 'otp' } }
    expect(validateEmailMessage(event).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/infrastructure/rabbitmq/event-consumer.test.js
```

Expected: FAIL — `validateEmailMessage` not exported.

- [ ] **Step 3: Rewrite event consumer**

Rewrite `src/infrastructure/rabbitmq/event-consumer.js`:
```js
const EXCHANGE = 'email.commands'
const QUEUE = 'email-service.email.send'
const RETRY_EXCHANGE = 'email.retry'
const RETRY_QUEUE = 'email-service.email.retry'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const validateEmailMessage = (event) => {
  if (!event?.payload) return { valid: false, error: 'missing payload' }
  const { to, subject, template, variables } = event.payload
  if (!to || typeof to !== 'string') return { valid: false, error: 'missing or invalid "to"' }
  if (!subject || typeof subject !== 'string') return { valid: false, error: 'missing or invalid "subject"' }
  if (!template || typeof template !== 'string') return { valid: false, error: 'missing or invalid "template"' }
  if (!variables || typeof variables !== 'object') return { valid: false, error: 'missing or invalid "variables"' }
  return { valid: true }
}

const RabbitMQConsumer = (connectionManager, { onEmailSend, log = noopLog }) => {
  let currentChannel = null

  const setup = async (channel) => {
    currentChannel = channel
    await channel.assertExchange(EXCHANGE, 'direct', { durable: true })
    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true })

    await channel.assertQueue(QUEUE, {
      durable: true,
      deadLetterExchange: RETRY_EXCHANGE,
      deadLetterRoutingKey: 'email.retry',
    })
    await channel.bindQueue(QUEUE, EXCHANGE, 'email.send')

    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      deadLetterExchange: EXCHANGE,
      deadLetterRoutingKey: 'email.send',
    })
    await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, 'email.retry')

    await channel.prefetch(10)
    log.info('queue bound', { queue: QUEUE, exchange: EXCHANGE })

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return
      try {
        const event = JSON.parse(msg.content.toString())
        const validation = validateEmailMessage(event)
        if (!validation.valid) {
          log.error('invalid message, discarding', { error: validation.error })
          channel.ack(msg)
          return
        }

        const headers = msg.properties.headers || {}
        const retryCount = headers['x-retry-count'] || 0
        const emailLogId = headers['x-email-log-id'] || null
        const attempt = retryCount + 1

        log.debug('processing message', { template: event.payload.template, attempt })

        const result = await onEmailSend({
          ...event.payload,
          attempt,
          emailLogId,
        })

        if (result.retry) {
          // Ack original, publish to retry queue with delay
          channel.ack(msg)
          channel.publish(RETRY_EXCHANGE, 'email.retry', Buffer.from(JSON.stringify(event)), {
            persistent: true,
            expiration: String(result.delayMs),
            headers: {
              'x-retry-count': attempt,
              'x-email-log-id': result.emailLogId,
            },
          })
          log.info('message scheduled for retry', { attempt, delayMs: result.delayMs })
        } else {
          channel.ack(msg)
          log.info('message processed', { template: event.payload.template, success: result.success })
        }
      } catch (e) {
        channel.nack(msg, false, true)
        log.error('message processing failed, requeued', { error: e.message })
      }
    })

    log.info('consumer started', { queue: QUEUE })
  }

  const start = async () => {
    const channel = connectionManager.getChannel()
    if (channel) await setup(channel)
    connectionManager.registerConsumer({ restart: setup })
  }

  return { start }
}

export { RabbitMQConsumer, validateEmailMessage }
```

- [ ] **Step 4: Run tests**

```bash
bun test test/infrastructure/rabbitmq/event-consumer.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/rabbitmq/event-consumer.js test/infrastructure/rabbitmq/event-consumer.test.js
git commit -m "feat: rewrite consumer with message validation and retry routing"
```

---

## Task 11: Event Publisher (adapt for connection manager)

**Files:**
- Modify: `src/infrastructure/rabbitmq/event-publisher.js`

- [ ] **Step 1: Rewrite publisher**

```js
const EXCHANGE = 'email.events'

const noop = () => {}
const noopLog = { debug: noop, info: noop, warn: noop, error: noop }

const RabbitMQPublisher = (connectionManager, { exchange = EXCHANGE, type = 'topic', log = noopLog } = {}) => {
  let ready = false

  const init = async () => {
    const channel = connectionManager.getChannel()
    if (!channel) throw new Error('RabbitMQ channel not available')
    await channel.assertExchange(exchange, type, { durable: true })
    ready = true
    log.info('exchange initialized', { exchange })
  }

  const publish = async (event) => {
    const channel = connectionManager.getChannel()
    if (!channel) {
      log.warn('rabbitmq not connected, event dropped', { type: event.type })
      return
    }
    if (!ready) await init()
    channel.publish(exchange, event.type, Buffer.from(JSON.stringify(event)), { persistent: true })
    log.debug('event published', { type: event.type })
  }

  const reset = () => {
    ready = false
  }

  return { publish, init, reset }
}

export { RabbitMQPublisher }
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/rabbitmq/event-publisher.js
git commit -m "feat: adapt event publisher for connection manager"
```

---

## Task 12: Email Log Repository (extend)

**Files:**
- Modify: `src/infrastructure/db/drizzle-email-log.js`

**Note:** No dedicated unit tests — DB repositories require a real database. Validated through admin-routes integration tests (Task 15) and E2E test (Task 19).

- [ ] **Step 1: Extend repository**

Rewrite `src/infrastructure/db/drizzle-email-log.js`:
```js
import { eq, desc, and, like, gte, lte, sql } from 'drizzle-orm'
import { emailLog } from './schema.js'

const DrizzleEmailLogRepository = (db) => {
  const create = async ({ toAddress, subject, template, status = 'queued', attempt = 1, maxRetries = 0, variables, fromEmail }) => {
    const rows = await db.insert(emailLog).values({ toAddress, subject, template, status, attempt, maxRetries, variables, fromEmail }).returning()
    return rows[0]
  }

  const updateStatus = async (id, status, error = null) => {
    const values = { status, error, updatedAt: new Date() }
    if (status === 'sent') values.sentAt = new Date()
    const rows = await db.update(emailLog).set(values).where(eq(emailLog.id, id)).returning()
    return rows[0]
  }

  const updateAttempt = async (id, attempt) => {
    const rows = await db
      .update(emailLog)
      .set({ attempt, status: 'queued', error: null, updatedAt: new Date() })
      .where(eq(emailLog.id, id))
      .returning()
    return rows[0]
  }

  const findById = async (id) => {
    const rows = await db.select().from(emailLog).where(eq(emailLog.id, id))
    return rows[0] || null
  }

  const findAll = async ({ page = 1, limit = 50, status, template, to, from, to_date } = {}) => {
    const conditions = []
    if (status) conditions.push(eq(emailLog.status, status))
    if (template) conditions.push(eq(emailLog.template, template))
    if (to) conditions.push(like(emailLog.toAddress, `%${to}%`))
    if (from) conditions.push(gte(emailLog.createdAt, new Date(from)))
    if (to_date) conditions.push(lte(emailLog.createdAt, new Date(to_date)))

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const offset = (page - 1) * limit

    const [data, countResult] = await Promise.all([
      db.select().from(emailLog).where(where).orderBy(desc(emailLog.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql`count(*)::int` }).from(emailLog).where(where),
    ])

    return { data, total: countResult[0]?.count || 0, page, limit }
  }

  return { create, updateStatus, updateAttempt, findById, findAll }
}

export { DrizzleEmailLogRepository }
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/db/drizzle-email-log.js
git commit -m "feat: extend email log repository with pagination and filtering"
```

---

## Task 13: Template Repository

**Files:**
- Create: `src/infrastructure/db/drizzle-template-repository.js`

**Note:** No dedicated unit tests — DB repositories require a real database. Validated through admin-routes integration tests (Task 15) and E2E test (Task 19).

- [ ] **Step 1: Implement repository**

Create `src/infrastructure/db/drizzle-template-repository.js`:
```js
import { eq } from 'drizzle-orm'
import { emailTemplates } from './schema.js'

const DrizzleTemplateRepository = (db) => {
  const findByName = async (name) => {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name))
    return rows[0] || null
  }

  const findById = async (id) => {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id))
    return rows[0] || null
  }

  const findAll = async () => {
    return db.select().from(emailTemplates).orderBy(emailTemplates.name)
  }

  const create = async ({ name, html, variables = [], maxRetries = 0 }) => {
    const rows = await db.insert(emailTemplates).values({ name, html, variables, maxRetries }).returning()
    return rows[0]
  }

  const update = async (id, data) => {
    const rows = await db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning()
    return rows[0] || null
  }

  const remove = async (id) => {
    const rows = await db.delete(emailTemplates).where(eq(emailTemplates.id, id)).returning()
    return rows[0] || null
  }

  return { findByName, findById, findAll, create, update, delete: remove }
}

export { DrizzleTemplateRepository }
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/db/drizzle-template-repository.js
git commit -m "feat: add Drizzle template repository"
```

---

## Task 14: Deep Health Checks

**Files:**
- Modify: `src/infrastructure/http/routes/health-routes.js`

- [ ] **Step 1: Rewrite health routes**

```js
import { sql } from 'drizzle-orm'

const startTime = Date.now()
const HEALTH_TIMEOUT = 3000

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

const healthRoutes = (app, { db, rabbitManager }) => {
  app.get('/health', async ({ set }) => {
    const checks = { database: 'ok', rabbitmq: 'ok' }

    if (db) {
      try {
        await withTimeout(db.execute(sql`SELECT 1`), HEALTH_TIMEOUT)
      } catch {
        checks.database = 'failing'
      }
    } else {
      checks.database = 'skipped'
    }

    if (rabbitManager) {
      checks.rabbitmq = rabbitManager.isConnected() ? 'ok' : 'failing'
    } else {
      checks.rabbitmq = 'skipped'
    }

    const critical = checks.database !== 'failing'
    const allHealthy = critical && checks.rabbitmq !== 'failing'
    if (!critical) set.status = 503

    return {
      status: allHealthy ? 'ok' : critical ? 'degraded' : 'unhealthy',
      service: 'email-service',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
    }
  })

  return app
}

export { healthRoutes }
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/http/routes/health-routes.js
git commit -m "feat: deep health checks for DB and RabbitMQ"
```

---

## Task 15: Admin API Routes (TDD)

**Files:**
- Create: `src/infrastructure/http/routes/admin-routes.js`
- Create: `test/infrastructure/http/admin-routes.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/infrastructure/http/admin-routes.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Elysia } from 'elysia'
import { adminRoutes } from '../../../src/infrastructure/http/routes/admin-routes.js'
import { TemplateService } from '../../../src/modules/templates/template-service.js'
import { FakeTemplateRepository } from '../../fakes/fake-template-repository.js'
import { FakeEmailLogRepository } from '../../fakes/fake-email-log-repository.js'

describe('Admin Routes', () => {
  let app, baseUrl

  beforeAll(async () => {
    const templateRepo = FakeTemplateRepository()
    const templateService = TemplateService({ templateRepository: templateRepo })
    const emailLogRepository = FakeEmailLogRepository()

    // Seed a log entry for testing
    await emailLogRepository.create({ toAddress: 'test@x.com', subject: 'Hi', template: 'otp', status: 'sent', attempt: 1, maxRetries: 0, variables: { code: '1' }, fromEmail: 'no@x.com' })

    const elysia = new Elysia()
    adminRoutes(elysia, { templateService, emailLogRepository, adminApiKey: 'test-key', log: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } })
    app = elysia.listen(0)
    baseUrl = `http://localhost:${app.server.port}`
  })

  afterAll(() => app.stop())

  const headers = { 'x-admin-key': 'test-key', 'content-type': 'application/json' }

  it('rejects requests without admin key', async () => {
    const res = await fetch(`${baseUrl}/admin/api/templates`)
    expect(res.status).toBe(401)
  })

  it('rejects requests with wrong admin key', async () => {
    const res = await fetch(`${baseUrl}/admin/api/templates`, { headers: { 'x-admin-key': 'wrong' } })
    expect(res.status).toBe(401)
  })

  it('creates and lists templates', async () => {
    const createRes = await fetch(`${baseUrl}/admin/api/templates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'test', html: '<p>{{msg}}</p>', variables: ['msg'], maxRetries: 1 }),
    })
    expect(createRes.status).toBe(200)
    const created = await createRes.json()
    expect(created.name).toBe('test')

    const listRes = await fetch(`${baseUrl}/admin/api/templates`, { headers })
    const list = await listRes.json()
    expect(list).toHaveLength(1)
  })

  it('gets template by id', async () => {
    const listRes = await fetch(`${baseUrl}/admin/api/templates`, { headers })
    const list = await listRes.json()
    const res = await fetch(`${baseUrl}/admin/api/templates/${list[0].id}`, { headers })
    expect(res.status).toBe(200)
    const t = await res.json()
    expect(t.name).toBe('test')
  })

  it('updates a template', async () => {
    const listRes = await fetch(`${baseUrl}/admin/api/templates`, { headers })
    const list = await listRes.json()
    const res = await fetch(`${baseUrl}/admin/api/templates/${list[0].id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ html: '<p>updated</p>' }),
    })
    expect(res.status).toBe(200)
    const t = await res.json()
    expect(t.html).toBe('<p>updated</p>')
  })

  it('deletes a template', async () => {
    const listRes = await fetch(`${baseUrl}/admin/api/templates`, { headers })
    const list = await listRes.json()
    const res = await fetch(`${baseUrl}/admin/api/templates/${list[0].id}`, { method: 'DELETE', headers })
    expect(res.status).toBe(200)
    const afterList = await fetch(`${baseUrl}/admin/api/templates`, { headers })
    expect((await afterList.json())).toHaveLength(0)
  })

  it('lists email logs', async () => {
    const res = await fetch(`${baseUrl}/admin/api/logs`, { headers })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('gets log by id', async () => {
    const listRes = await fetch(`${baseUrl}/admin/api/logs`, { headers })
    const body = await listRes.json()
    const res = await fetch(`${baseUrl}/admin/api/logs/${body.data[0].id}`, { headers })
    expect(res.status).toBe(200)
    const log = await res.json()
    expect(log.toAddress).toBe('test@x.com')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test test/infrastructure/http/admin-routes.test.js
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement admin routes**

Create `src/infrastructure/http/routes/admin-routes.js`:
```js
import { secureCompare } from '../../../shared/utils.js'

const adminRoutes = (app, { templateService, emailLogRepository, adminApiKey, log }) => {
  app.guard(
    {
      beforeHandle: ({ headers, set }) => {
        const key = headers['x-admin-key']
        if (!key || !secureCompare(key, adminApiKey)) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
      },
    },
    (app) => {
      // Templates CRUD
      app.get('/admin/api/templates', async () => {
        return templateService.getAll()
      })

      app.get('/admin/api/templates/:id', async ({ params, set }) => {
        const t = await templateService.getById(params.id)
        if (!t) {
          set.status = 404
          return { error: 'Not found' }
        }
        return t
      })

      app.post('/admin/api/templates', async ({ body }) => {
        return templateService.create(body)
      })

      app.put('/admin/api/templates/:id', async ({ params, body }) => {
        return templateService.update(params.id, body)
      })

      app.delete('/admin/api/templates/:id', async ({ params }) => {
        return templateService.delete(params.id)
      })

      // Email Logs
      app.get('/admin/api/logs', async ({ query }) => {
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

      app.get('/admin/api/logs/:id', async ({ params, set }) => {
        const log = await emailLogRepository.findById(params.id)
        if (!log) {
          set.status = 404
          return { error: 'Not found' }
        }
        return log
      })
    },
  )

  return app
}

export { adminRoutes }
```

- [ ] **Step 4: Run tests**

```bash
bun test test/infrastructure/http/admin-routes.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/http/routes/admin-routes.js test/infrastructure/http/admin-routes.test.js
git commit -m "feat: add admin API routes with auth guard"
```

---

## Task 16: Application Bootstrap Rewrite

**Files:**
- Modify: `src/index.js`
- Modify: `.env.example`

- [ ] **Step 1: Rewrite index.js**

Full rewrite of `src/index.js` with graceful shutdown, middleware stack, connection manager. Reference the spec Section 12 for the complete bootstrap sequence. Key changes:
- Import `drizzle` from `drizzle-orm/bun-sql` instead of `drizzle-orm/postgres-js`
- Remove `postgres` import, use `drizzle(config.database.url)` directly
- Add `RabbitMQConnectionManager` instead of raw `amqplib.connect`
- Add security headers, request ID, request logging, global error handler (Elysia middleware)
- Add graceful shutdown (SIGTERM/SIGINT)
- Register admin routes with dependencies
- Wire TemplateService with `DrizzleTemplateRepository`
- Wire EmailService with all deps
- Wire consumer through connection manager
- **Do NOT add admin HTML serving yet** — that is added in Task 18 Step 9

**Override support for testing:** The `createApp` function must support these overrides for test fakes:
```js
const createApp = async ({ overrides = {}, config: configOverride } = {}) => {
  // ...
  if (!overrides.emailProvider) {
    // Bootstrap real infrastructure (DB, RabbitMQ, Resend)
  } else {
    // Use overrides directly — skip real infra connections
    // Support: emailProvider, eventPublisher, emailLogRepository, templateRepository
  }
}
```

When overrides are provided, the container registers them directly instead of creating real implementations. This allows E2E tests to run without DB/RabbitMQ.

- [ ] **Step 2: Update .env.example**

Add `ADMIN_API_KEY=your-secret-admin-key` to `.env.example`.

- [ ] **Step 3: Remove `postgres` dependency**

```bash
bun remove postgres
```

- [ ] **Step 4: Run all tests**

```bash
bun test
```

Expected: All existing tests pass (unit tests don't depend on real infra).

- [ ] **Step 5: Commit**

```bash
git add src/index.js .env.example package.json bun.lock
git commit -m "feat: rewrite app bootstrap with graceful shutdown and middleware"
```

---

## Task 17: Dockerfile

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Update Dockerfile**

```dockerfile
FROM oven/bun:1 AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN useradd --no-create-home --shell /bin/sh appuser
USER appuser
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: production Dockerfile with healthcheck and non-root user"
```

---

## Task 18: Admin Panel UI

**Files:**
- Create: `src/admin/index.html`
- Create: `src/admin/app.tsx`
- Create: `src/admin/components/layout.tsx`
- Create: `src/admin/pages/templates.tsx`
- Create: `src/admin/pages/logs.tsx`
- Create: `src/admin/components/template-form.tsx`
- Create: `src/admin/components/template-list.tsx`
- Create: `src/admin/components/log-table.tsx`

This task creates the React admin panel served via Bun HTML imports. No unit tests — validated via E2E and manual testing.

- [ ] **Step 1: Install React dependencies**

```bash
bun add react react-dom
bun add -d @types/react @types/react-dom
```

- [ ] **Step 2: Create entry HTML**

Create `src/admin/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Service Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./app.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Create app shell with hash router**

Create `src/admin/app.tsx` with:
- API key login prompt (stores in sessionStorage)
- Hash-based routing (`#/templates`, `#/logs`)
- Layout wrapper
- API helper function that attaches `X-Admin-Key` header
- Reference spec Section 10 for details

- [ ] **Step 4: Create layout component**

Create `src/admin/components/layout.tsx`:
- Sidebar with nav links (Templates, Logs)
- Header with "Email Service Admin" title
- Main content area

- [ ] **Step 5: Create template list component**

Create `src/admin/components/template-list.tsx`:
- Table with columns: name, variables, max retries, updated at
- Edit and Delete action buttons
- Create button at top

- [ ] **Step 6: Create template form component**

Create `src/admin/components/template-form.tsx`:
- Fields: name, HTML (textarea), variables (comma-separated), max retries
- HTML preview pane
- Save/Cancel buttons

- [ ] **Step 7: Create templates page**

Create `src/admin/pages/templates.tsx`:
- Combines template-list and template-form
- Manages create/edit/delete state
- Fetches from `/admin/api/templates`

- [ ] **Step 8: Create log table component**

Create `src/admin/components/log-table.tsx`:
- Table with columns: to, subject, template, status (with color badges), attempt, created at
- Expandable rows showing error and variables
- Status badges: green=sent, red=failed, yellow=queued

- [ ] **Step 9: Create logs page**

Create `src/admin/pages/logs.tsx`:
- Uses log-table component
- Filter controls: status dropdown, template dropdown, date range, recipient search
- Pagination controls
- Fetches from `/admin/api/logs`

- [ ] **Step 10: Wire admin panel serving in index.js**

In `src/index.js`, add the admin HTML route:
```js
import adminHtml from './admin/index.html'

// After other routes:
app.get('/admin', () => new Response(adminHtml))
app.get('/admin/*', () => new Response(adminHtml))
```

- [ ] **Step 11: Commit**

```bash
git add src/admin/ package.json bun.lock src/index.js
git commit -m "feat: add React admin panel with template management and log viewer"
```

---

## Task 19: E2E Test

**Files:**
- Create: `test/e2e/email-flow.test.js`

- [ ] **Step 1: Write E2E test**

Create `test/e2e/email-flow.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createApp } from '../../src/index.js'
import { FakeTemplateRepository } from '../fakes/fake-template-repository.js'
import { FakeEmailLogRepository } from '../fakes/fake-email-log-repository.js'
import { FakeEventPublisher } from '../fakes/fake-event-publisher.js'
import { InMemoryEmailProvider } from '../fakes/in-memory-email-provider.js'

describe('Email Flow E2E', () => {
  let app, baseUrl, emailProvider, events, logRepo, templateRepo

  beforeAll(async () => {
    emailProvider = InMemoryEmailProvider()
    events = FakeEventPublisher()
    logRepo = FakeEmailLogRepository()
    templateRepo = FakeTemplateRepository()

    const result = await createApp({
      overrides: {
        emailProvider,
        eventPublisher: events,
        emailLogRepository: logRepo,
        templateRepository: templateRepo,
      },
      config: {
        database: { url: 'unused' },
        rabbitmq: { url: 'unused' },
        resend: { apiKey: 'unused' },
        fromEmail: 'noreply@test.com',
        adminApiKey: 'e2e-key',
        port: 0,
        logLevel: 'error',
      },
    })
    app = result.app
    baseUrl = `http://localhost:${result.port}`
  })

  afterAll(() => app?.stop())

  const adminHeaders = { 'x-admin-key': 'e2e-key', 'content-type': 'application/json' }

  it('creates template via admin API and verifies it exists', async () => {
    const res = await fetch(`${baseUrl}/admin/api/templates`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'e2e-test', html: '<p>Hello {{name}}</p>', variables: ['name'], maxRetries: 0 }),
    })
    expect(res.status).toBe(200)
    const t = await res.json()
    expect(t.name).toBe('e2e-test')
  })

  it('health check returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBeDefined()
    expect(body.service).toBe('email-service')
  })
})
```

- [ ] **Step 2: Run E2E test**

```bash
bun test test/e2e/email-flow.test.js
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/e2e/email-flow.test.js
git commit -m "test: add E2E flow test"
```

---

## Task 20: Cleanup

**Files:**
- Delete: `src/modules/sender/email-entity.js` (if not already deleted)
- Delete: `src/infrastructure/templates/file-template-store.js`
- Delete: `test/fakes/in-memory-template-store.js`
- Delete: `index.ts`
- Delete: `docker-compose.yml`

- [ ] **Step 1: Delete unused files**

```bash
rm -f src/modules/sender/email-entity.js
rm -f src/infrastructure/templates/file-template-store.js
rm -f test/fakes/in-memory-template-store.js
rm -f index.ts
rm -f docker-compose.yml
```

- [ ] **Step 2: Format entire codebase**

```bash
bun run format
```

- [ ] **Step 3: Run full quality check**

```bash
bun run check
```

Expected: All lint, format, and test checks pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: cleanup unused files, format codebase"
```

---

## Task 21: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Verify lint and format**

```bash
bun run check
```

Expected: Clean.

- [ ] **Step 3: Verify Docker build**

```bash
docker build -t email-service .
```

Expected: Build succeeds.

- [ ] **Step 4: Review all changes**

```bash
git log --oneline
```

Verify commit history is clean and logical.
