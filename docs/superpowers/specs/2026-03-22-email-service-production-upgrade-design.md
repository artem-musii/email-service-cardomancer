# Email Service — Production Upgrade Design

**Date:** 2026-03-22
**Status:** Draft
**Approach:** Structured rewrite (Approach 3)

---

## 1. Overview

Rewrite the email-service from a basic event-driven email sender into a production-grade, multi-tenant email platform that any microservice can use. The service processes email requests via RabbitMQ, manages templates in a database with an admin panel, supports configurable retry policies, and follows the same production standards as the auth-service.

### Goals

- Generic email service usable by any microservice (not just auth)
- Database-backed templates with admin panel (CRUD + email log viewer)
- Configurable retry logic per template
- Subject passed by caller (not hardcoded)
- Interface designed to support attachments in the future (not implemented now)
- Full quality gates: ESLint, Prettier, Husky, CI/CD
- Rolling update support for Coolify: graceful shutdown, deep health checks
- Comprehensive test coverage

### Non-Goals

- File attachments (interface reserved, implementation deferred)
- Shared library extraction across services
- SMTP support (Resend API only)
- Multi-provider failover (single Resend provider)

---

## 2. Current State Analysis

### What Works

- Clean architecture with hexagonal pattern (modules/ + infrastructure/)
- DI container with override support for testing
- Test fakes for all infrastructure dependencies
- Structured JSON logging
- RabbitMQ consumer with manual ack/nack
- Resend provider with error handling

### What's Broken or Missing

| Issue | Impact | Fix |
|-------|--------|-----|
| No graceful shutdown | Requests dropped during Coolify rolling updates | Add SIGTERM/SIGINT handlers |
| No ESLint/Prettier/Husky | No quality gates, inconsistent formatting | Add toolchain matching auth-service |
| No CI/CD pipeline | No automated checks before deploy | Add GitHub Actions workflow |
| Shallow health check | Coolify can't detect DB/RabbitMQ failures | Deep checks with timeouts |
| No RabbitMQ reconnection | Service dies on transient RabbitMQ failures | Add connection manager with backoff |
| Hardcoded subjects | Can't send arbitrary emails | Subject passed in message |
| File-based templates | Adding templates requires redeploy | Database-backed templates |
| No message validation | Malformed RabbitMQ messages cause crashes | Validate before processing |
| No security headers | Missing basic HTTP security | Add standard headers |
| No global error handler | Unhandled errors leak stack traces | Add .onError() handler |
| No request logging | Can't trace admin panel requests | Add request logging middleware |
| No request ID correlation | Can't trace requests across logs | Add X-Request-ID |
| No non-root Docker user | Security risk in containers | Add appuser |
| No Docker healthcheck | Coolify can't monitor container health | Add HEALTHCHECK instruction |
| No retry logic | Failed emails are lost | Configurable retry with backoff |
| No admin panel | Templates managed via code only | Web UI for templates + logs |
| `email-entity.js` hardcodes subjects | Not extensible | Remove, subject comes from caller |
| Docker compose missing RabbitMQ | Can't run full stack locally | Add RabbitMQ service |
| Uses `postgres` package | Auth-service uses Bun.sql | Migrate to `drizzle-orm/bun-sql` |
| No `@types/amqplib` | Missing type hints | Add dev dependency |

---

## 3. Architecture

### Layer Structure

```
src/
├── index.js                              # Bootstrap, graceful shutdown, SIGTERM
├── config.js                             # Env validation
├── container.js                          # DI container (unchanged)
├── logger.js                             # Structured JSON logging (unchanged)
├── shared/
│   └── utils.js                          # maskEmail
├── modules/
│   ├── sender/
│   │   ├── email-service.js              # Core send logic + retry orchestration
│   │   └── retry-policy.js               # Retry delay calculation
│   └── templates/
│       └── template-service.js           # CRUD + rendering (DB-backed)
├── infrastructure/
│   ├── db/
│   │   ├── schema.js                     # email_log + email_templates tables
│   │   ├── drizzle-email-log.js          # Email log repository (extended)
│   │   ├── drizzle-template-repository.js # Template CRUD repository
│   │   └── migrations/
│   ├── rabbitmq/
│   │   ├── connection-manager.js         # Auto-reconnect with exponential backoff
│   │   ├── event-consumer.js             # Message validation + routing
│   │   └── event-publisher.js            # Adapted for connection manager
│   ├── resend/
│   │   └── resend-provider.js            # Unchanged
│   └── http/
│       ├── routes/
│       │   ├── health-routes.js          # Deep checks (DB + RabbitMQ)
│       │   └── admin-routes.js           # Template CRUD + email log API
│       └── middleware/                    # Auth guard inlined in admin-routes.js
├── admin/                                # React admin panel
│   ├── index.html                        # Entry HTML (Bun HTML imports)
│   ├── app.tsx                           # App shell, routing, layout
│   ├── pages/
│   │   ├── templates.tsx                 # Template list + editor
│   │   └── logs.tsx                      # Email log viewer with filters
│   └── components/
│       ├── template-form.tsx             # Create/edit template form
│       ├── template-list.tsx             # Template table
│       ├── log-table.tsx                 # Email log table
│       └── layout.tsx                    # Shell layout (sidebar, header)
templates/                                # Seed files (migrated to DB on first run)
├── otp-code.html
└── welcome.html
```

### Data Flow

```
Caller Service                    Email Service
     │                                 │
     │  RabbitMQ: email.send           │
     │  {to, subject, template,        │
     │   variables, retryPolicy?}      │
     ├────────────────────────────────►│
     │                                 ├─► Validate message
     │                                 ├─► Load template from DB
     │                                 ├─► Render (replace {{vars}})
     │                                 ├─► Create email_log (queued)
     │                                 ├─► Send via Resend API
     │                                 │   ├─ Success → status=sent, publish email.sent
     │                                 │   └─ Failure → retry or status=failed, publish email.failed
     │                                 │
     │  RabbitMQ: email.sent/failed    │
     │◄────────────────────────────────┤
```

### Retry Flow

```
Message received (attempt from x-retry-count header, default 0 → attempt = count + 1)
    │
    ├─► Attempt send
    │   ├─ Success → ack, update log to sent, publish email.sent
    │   └─ Failure
    │       ├─ attempt <= maxRetries?
    │       │   ├─ Yes → ack original, publish NEW message to retry queue
    │       │   │        with expiration = baseDelay * 2^(attempt-1) (max 60s)
    │       │   │        and x-retry-count = attempt, x-email-log-id = logEntry.id
    │       │   └─ No  → ack, update log to failed, publish email.failed
```

Retry uses RabbitMQ's dead-letter exchange with per-message TTL. The consumer explicitly publishes a new message to the retry queue (with `expiration` property for the delay) and acks the original. The retry queue's dead-letter exchange points back to the main queue, creating a delayed retry loop without external schedulers.

---

## 4. Database Schema Changes

### New Table: `email_templates`

```sql
CREATE TABLE email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) UNIQUE NOT NULL,   -- slug identifier (e.g., "otp-code")
  html        TEXT NOT NULL,                   -- HTML body with {{variable}} placeholders
  variables   TEXT[] NOT NULL DEFAULT '{}',    -- expected variable names for validation
  max_retries INTEGER NOT NULL DEFAULT 0,      -- 0 = no retry
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Extended Table: `email_log`

```sql
-- Existing columns preserved, new columns added:
ALTER TABLE email_log ADD COLUMN subject     VARCHAR(500);
ALTER TABLE email_log ADD COLUMN attempt     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE email_log ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_log ADD COLUMN variables   JSONB;
ALTER TABLE email_log ADD COLUMN from_email  VARCHAR(255);
ALTER TABLE email_log ADD COLUMN updated_at  TIMESTAMP NOT NULL DEFAULT NOW();
```

### Drizzle Schema (full)

```js
// schema.js
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

---

## 5. RabbitMQ Message Contract

### Inbound: `email.send` (command)

```json
{
  "type": "email.send",
  "payload": {
    "to": "user@example.com",
    "subject": "Your verification code",
    "template": "otp-code",
    "variables": { "code": "123456" },
    "retryPolicy": {
      "maxRetries": 3,
      "baseDelayMs": 1000
    },
    "attachments": []
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `to` | Yes | Recipient email address |
| `subject` | Yes | Email subject line |
| `template` | Yes | Template name (slug) |
| `variables` | Yes | Key-value pairs for template rendering |
| `retryPolicy` | No | Override template's default retry. `null` = use template default |
| `attachments` | No | Reserved for future use. Ignored if present. |

### Outbound: `email.sent` / `email.failed` (events)

```json
{
  "id": "uuid",
  "type": "email.sent",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "payload": {
    "emailId": "uuid",
    "to": "user@example.com",
    "template": "otp-code"
  }
}
```

```json
{
  "id": "uuid",
  "type": "email.failed",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "payload": {
    "emailId": "uuid",
    "to": "user@example.com",
    "template": "otp-code",
    "error": "Resend API error: rate limited",
    "attempt": 3,
    "maxRetries": 3
  }
}
```

### Message Validation

The consumer validates every incoming message before processing:

```js
const validateEmailMessage = (event) => {
  if (!event?.payload) return { valid: false, error: 'missing payload' }
  const { to, subject, template, variables } = event.payload
  if (!to || typeof to !== 'string') return { valid: false, error: 'missing or invalid "to"' }
  if (!subject || typeof subject !== 'string') return { valid: false, error: 'missing or invalid "subject"' }
  if (!template || typeof template !== 'string') return { valid: false, error: 'missing or invalid "template"' }
  if (!variables || typeof variables !== 'object') return { valid: false, error: 'missing or invalid "variables"' }
  return { valid: true }
}
```

Invalid messages are acked (removed from queue) and logged as errors — they would fail on every retry.

---

## 6. RabbitMQ Retry Architecture

### Exchanges and Queues

```
email.commands (direct exchange)
  └─► email-service.email.send (main queue)
        dead-letter-exchange: email.retry
        dead-letter-routing-key: email.retry

email.retry (direct exchange)
  └─► email-service.email.retry (retry queue)
        dead-letter-exchange: email.commands
        dead-letter-routing-key: email.send
        (messages expire via per-message TTL → re-routed to main queue)

email.events (topic exchange)
  └─► email.sent / email.failed events
```

### How It Works

1. Message arrives in main queue, consumer processes it
2. Send attempt fails, `sendEmail` returns `{ retry: true, delayMs }`
3. Consumer reads `x-retry-count` header (default 0), increments it
4. If retries remain: consumer **acks** the original message, then **publishes a new message** to the retry exchange with:
   - `expiration` property set to the delay in ms (per-message TTL)
   - `x-retry-count` header set to the incremented attempt count
   - Original payload preserved
5. Message sits in retry queue until TTL expires
6. TTL expires → message dead-lettered back to main queue (via retry queue's dead-letter config)
7. Consumer picks it up again, reads the incremented `x-retry-count` from headers

**Why ack + republish instead of nack?** RabbitMQ does not allow setting per-message TTL or modifying headers during nack. To get exponential backoff (different delays per attempt), we must explicitly publish a new message with the `expiration` property set. The original message is acked to remove it from the queue.

**Idempotency note:** If the connection drops while processing a message (after sending but before acking), RabbitMQ will redeliver the message. This may cause a duplicate email send. This is acceptable for the current use case (a duplicate OTP or welcome email is harmless). If idempotency becomes critical in the future, add a deduplication check using the `email_log` table (check if a log entry with the same `correlationId` already has status=sent).

---

## 7. Connection Manager

Ported from auth-service's `RabbitMQConnectionManager` with additions for the consumer:

```js
const RabbitMQConnectionManager = ({ url, log }) => {
  // Same as auth-service:
  // - Auto-reconnect with exponential backoff (1s → 30s cap)
  // - Connection/channel error handlers
  // - Publisher reset on reconnect
  // - Graceful close

  // Addition for email-service:
  // - Consumer restart on reconnect
  const consumers = []
  const registerConsumer = (consumer) => consumers.push(consumer)
  // On reconnect: for (const consumer of consumers) await consumer.restart(channel)
}
```

Key behaviors:
- Initial connection failure is non-fatal (logs warning, retries in background)
- All publishers and consumers re-register when connection recovers
- `close()` sets `closed = true` to prevent reconnect attempts during shutdown

---

## 8. Template System

### Template Service (modules/templates/template-service.js)

```js
const TemplateService = ({ templateRepository }) => ({
  // CRUD
  create: async ({ name, html, variables, maxRetries }) => { ... },
  getByName: async (name) => { ... },
  getAll: async () => { ... },
  update: async (id, { name, html, variables, maxRetries }) => { ... },
  delete: async (id) => { ... },

  // Rendering
  render: async (name, variables) => {
    const template = await templateRepository.findByName(name)
    if (!template) throw new Error(`Template not found: ${name}`)
    let html = template.html
    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, value)
    }
    return { html, maxRetries: template.maxRetries }
  },
})
```

### Template Repository (infrastructure/db/drizzle-template-repository.js)

```js
const DrizzleTemplateRepository = (db) => ({
  findByName: (name) => ...,
  findById: (id) => ...,
  findAll: () => ...,
  create: ({ name, html, variables, maxRetries }) => ...,
  update: (id, data) => ...,
  delete: (id) => ...,
})
```

### Seed Migration

On first startup, seed the existing `otp-code` and `welcome` templates into the database. This is implemented as a **manually-written SQL migration file** placed in the migrations directory alongside Drizzle-generated migrations. Drizzle's `generate` command creates migrations from schema diffs only — it does not handle data seeding. The seed file is added after the schema migration that creates the `email_templates` table.

```sql
-- 0002_seed_templates.sql (manually created)
INSERT INTO email_templates (name, html, variables, max_retries)
VALUES
  ('otp-code', '<!DOCTYPE html>...full html...', ARRAY['code'], 0),
  ('welcome', '<!DOCTYPE html>...full html...', ARRAY['name', 'app'], 3)
ON CONFLICT (name) DO NOTHING;
```

The `templates/` directory with HTML files is kept for reference but no longer read at runtime.

---

## 9. Email Service (Core Logic)

### Updated Flow

```js
const EmailService = ({ emailProvider, eventPublisher, emailLogRepository, templateService, fromEmail, log }) => {
  const sendEmail = async ({ to, subject, template, variables, retryPolicy, attempt = 1, emailLogId = null }) => {
    log.info('sending email', { to: maskEmail(to), template, attempt })

    // 1. Render template + get default retry config
    const { html, maxRetries: templateMaxRetries } = await templateService.render(template, variables)

    // 2. Resolve retry policy (caller override > template default)
    const maxRetries = retryPolicy?.maxRetries ?? templateMaxRetries
    const baseDelayMs = retryPolicy?.baseDelayMs ?? 1000

    // 3. Create or update log entry
    //    First attempt creates a new row; retries update the existing row
    let logEntry
    if (emailLogId) {
      logEntry = await emailLogRepository.updateAttempt(emailLogId, attempt)
    } else {
      logEntry = await emailLogRepository.create({
        toAddress: to, subject, template, status: 'queued',
        attempt, maxRetries, variables, fromEmail,
      })
    }

    // 4. Send via provider
    const result = await emailProvider.send({ to, subject, html, from: fromEmail })

    // 5. Handle result
    if (result.success) {
      await emailLogRepository.updateStatus(logEntry.id, 'sent')
      await eventPublisher.publish({
        id: crypto.randomUUID(), type: 'email.sent',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, template },
      })
      return { success: true, retry: false }
    }

    // 6. Failed — decide retry
    //    attempt=1, maxRetries=3 → retries on attempts 1,2,3 → gives up on attempt 4
    const shouldRetry = attempt <= maxRetries
    await emailLogRepository.updateStatus(logEntry.id, shouldRetry ? 'queued' : 'failed', result.error)

    if (!shouldRetry) {
      await eventPublisher.publish({
        id: crypto.randomUUID(), type: 'email.failed',
        timestamp: new Date().toISOString(),
        payload: { emailId: logEntry.id, to, template, error: result.error, attempt, maxRetries },
      })
    }

    return {
      success: false,
      retry: shouldRetry,
      delayMs: Math.min(baseDelayMs * Math.pow(2, attempt - 1), 60000),
      attempt,
      emailLogId: logEntry.id,
    }
  }

  return { sendEmail }
}
```

**Key design decisions:**

- **Single log row per email:** First attempt creates the row. The `emailLogId` is passed through RabbitMQ message headers across retries so subsequent attempts update the same row (incrementing `attempt`, updating `error`).
- **Retry semantics:** `attempt` starts at 1. With `maxRetries=3`, the email is attempted on attempts 1, 2, 3 (retries) and gives up after attempt 3 fails with no more retries. Total attempts = `maxRetries + 1` (initial + retries), but attempt 1 failing with `shouldRetry = (1 <= 3)` triggers the first retry.
- **Return value:** The consumer uses the return value to decide: `retry=true` → publish to retry queue with delay + ack original. `retry=false` → just ack.
- **emailLogId in return:** Passed back so the consumer can include it in the retry message headers.

---

## 10. Admin Panel

### API Routes (admin-routes.js)

All admin routes are protected by `X-Admin-Key` header matching `ADMIN_API_KEY` env var.

**Templates:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/api/templates` | List all templates |
| `GET` | `/admin/api/templates/:id` | Get single template |
| `POST` | `/admin/api/templates` | Create template |
| `PUT` | `/admin/api/templates/:id` | Update template |
| `DELETE` | `/admin/api/templates/:id` | Delete template |

**Email Logs:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/api/logs` | List logs (paginated, filterable) |
| `GET` | `/admin/api/logs/:id` | Get single log entry |

**Log Query Parameters:**

- `page` (default: 1)
- `limit` (default: 50, max: 100)
- `status` (filter: queued, sent, failed)
- `template` (filter by template name)
- `to` (search by recipient, partial match)
- `from` (date, ISO string)
- `to_date` (date, ISO string)

**Admin UI:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin` | Serve admin panel SPA |
| `GET` | `/admin/*` | Serve admin panel (client-side routing) |

### Admin Auth Middleware

Uses Elysia's `guard()` to scope authentication to all `/admin/api/*` routes. The API key comparison uses timing-safe comparison to prevent timing attacks.

```js
// In admin-routes.js
import { timingSafeEqual } from 'crypto'

const secureCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

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
      // All /admin/api/* routes registered inside this guard
      app.get('/admin/api/templates', async () => { ... })
      // ...
    },
  )
}
```

### Admin UI (React + Tailwind)

**Pages:**

1. **Templates Page** (`/admin/templates`)
   - Table listing all templates (name, variable count, max retries, updated at)
   - Create button → opens form
   - Edit button → opens form pre-filled
   - Delete button → confirmation dialog
   - Template form: name, HTML editor (textarea), variables (comma-separated input), max retries (number input)
   - Preview pane: renders HTML with sample variables

2. **Logs Page** (`/admin/logs`)
   - Table listing email logs (to, subject, template, status, attempt, created at)
   - Filters: status dropdown, template dropdown, date range, search by recipient
   - Pagination controls
   - Click row → expand to show error details, variables, full log entry
   - Status badges: green (sent), red (failed), yellow (queued)

**Layout:**
- Sidebar with navigation (Templates, Logs)
- Header with service name
- Clean, minimal design using Tailwind
- API key stored in browser sessionStorage (entered once via a simple login prompt)

**Tech:**
- React 19 with Bun HTML imports (no Vite, no build step)
- Tailwind CSS via CDN or Bun CSS bundling
- Client-side routing via simple hash router (no react-router dependency)
- Fetch API for all backend calls with `X-Admin-Key` header

---

## 11. Configuration

### Environment Variables

```env
# Required
DATABASE_URL=postgres://postgres:postgres@localhost:5434/email_db
RABBITMQ_URL=amqp://localhost:5672
RESEND_API_KEY=re_xxxx
FROM_EMAIL=noreply@example.com
ADMIN_API_KEY=your-secret-admin-key

# Optional
PORT=3002
LOG_LEVEL=info
```

### Config Loading

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
```

---

## 12. Application Bootstrap (index.js)

### Startup Sequence

1. Load and validate config
2. Create logger
3. Connect to PostgreSQL via `drizzle-orm/bun-sql`
4. Create RabbitMQ connection manager, connect (non-fatal if fails)
5. Register all dependencies in container
6. Create services (TemplateService, EmailService)
7. Start RabbitMQ consumer
8. Create Elysia app with middleware
9. Register routes (health, admin)
10. Serve admin panel static files
11. Listen on port
12. Register SIGTERM/SIGINT handlers

### Graceful Shutdown

```js
const shutdown = async () => {
  log.info('shutting down gracefully...')
  server.stop()
  if (rabbitManager) await rabbitManager.close()
  if (db) await db.$client.close()
  log.info('shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

### Elysia Middleware Stack

```js
const app = new Elysia()
  // Security headers
  .onBeforeHandle(({ set }) => {
    set.headers['X-Content-Type-Options'] = 'nosniff'
    set.headers['X-Frame-Options'] = 'DENY'
    set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    set.headers['X-XSS-Protection'] = '0'
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
  })
  // Request ID
  .derive(({ headers }) => ({
    requestId: headers['x-request-id'] || crypto.randomUUID(),
  }))
  // Request logging (skip /health)
  .onAfterHandle(({ request, set, requestId }) => {
    const url = new URL(request.url)
    if (url.pathname === '/health') return
    log.info('request', {
      method: request.method,
      path: url.pathname,
      status: set.status || 200,
      requestId,
    })
    set.headers['X-Request-ID'] = requestId
  })
  // Global error handler
  .onError(({ code, error, set, requestId }) => {
    if (code === 'VALIDATION') return
    log.error('unhandled error', {
      error: error.message,
      stack: error.stack,
      requestId: requestId || 'unknown',
    })
    set.status = 500
    return { error: 'Internal server error' }
  })
```

---

## 13. Health Checks

Deep health checks matching auth-service pattern:

```js
const healthRoutes = (app, { db, rabbitManager }) => {
  app.get('/health', async ({ set }) => {
    const checks = { database: 'ok', rabbitmq: 'ok' }

    if (db) {
      try {
        await withTimeout(db.execute(sql`SELECT 1`), 3000)
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
}
```

Database is critical (503 if down). RabbitMQ is non-critical (degraded if down — emails queue up).

---

## 14. Docker & Deployment

### Dockerfile

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

Changes from current:
- Install `curl` for healthcheck
- Create non-root `appuser`
- Add `HEALTHCHECK` instruction for Coolify
- `start-period=15s` gives time for migrations + startup

### docker-compose.yml

Removed. Infrastructure (PostgreSQL, RabbitMQ) is managed by Coolify, not local compose. The existing `docker-compose.yml` file will be deleted.

---

## 15. Quality Gates

### ESLint (eslint.config.js)

Identical to auth-service:

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
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-console': 'off',
    },
  },
  { ignores: ['node_modules/', 'drizzle/'] },
]
```

### Prettier (.prettierrc)

Identical to auth-service:

```json
{
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

### Lint-Staged (.lintstagedrc)

```json
{
  "*.js": ["prettier --write", "eslint --fix"],
  "*.{tsx,ts}": ["prettier --write"]
}
```

### Husky (.husky/pre-commit)

```bash
bunx lint-staged
```

### Package.json Scripts

```json
{
  "dev": "bun run --watch src/index.js",
  "start": "bun run src/index.js",
  "test": "bun test",
  "lint": "eslint src/ test/ --ignore-pattern '*.tsx'",
  "lint:fix": "eslint src/ test/ --fix --ignore-pattern '*.tsx'",
  "format": "prettier --write \"src/**/*.{js,tsx}\" \"test/**/*.js\"",
  "format:check": "prettier --check \"src/**/*.{js,tsx}\" \"test/**/*.js\"",
  "check": "bun run lint && bun run format:check && bun run test",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "prepare": "husky"
}
```

**Note:** ESLint is configured for plain JS only (no TSX parser). The `.tsx` admin panel files are formatted by Prettier but not linted by ESLint. This avoids adding a TSX ESLint parser dependency for a small admin panel. If the admin panel grows, add `@typescript-eslint/parser` later.
```

### Dependencies

**Added production deps:**
- `@elysiajs/cors` (if admin panel needs CORS)

**Added dev deps:**
- `@eslint/js`
- `@types/amqplib`
- `eslint`
- `globals`
- `husky`
- `lint-staged`
- `prettier`
- `react`, `react-dom`, `@types/react`, `@types/react-dom` (admin panel)

**Removed production deps:**
- `postgres` (replaced by `drizzle-orm/bun-sql` which uses Bun.sql built-in)

---

## 16. CI/CD Pipeline

### GitHub Actions (.github/workflows/ci.yml)

Identical structure to auth-service:

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

---

## 17. Test Strategy

### Test Structure

```
test/
├── fakes/
│   ├── fake-email-log-repository.js      # Extended with new fields
│   ├── fake-event-publisher.js           # Unchanged
│   ├── fake-template-repository.js       # NEW: in-memory template CRUD
│   ├── in-memory-email-provider.js       # Unchanged
│   └── in-memory-template-store.js       # REMOVED (replaced by fake-template-repository)
├── modules/
│   ├── config.test.js                    # Extended: ADMIN_API_KEY required
│   ├── container.test.js                 # Unchanged
│   ├── sender/
│   │   ├── email-service.test.js         # Extended: retry logic, subject, new fields
│   │   └── retry-policy.test.js          # NEW: delay calculation tests
│   └── templates/
│       └── template-service.test.js      # Rewritten: CRUD + render from DB
├── infrastructure/
│   ├── rabbitmq/
│   │   └── event-consumer.test.js        # NEW: message validation tests
│   └── http/
│       └── admin-routes.test.js          # NEW: API endpoint tests
└── e2e/
    └── email-flow.test.js                # NEW: full send flow with fakes
```

### What Gets Tested

**Unit Tests:**

| Module | Tests |
|--------|-------|
| `config` | Loads valid config, throws on missing `ADMIN_API_KEY`, defaults for optional vars |
| `container` | Registration, resolution, caching, overrides (existing, unchanged) |
| `email-service` | Send success → log + event, send failure → log + event, retry decision (attempt <= maxRetries → retry=true), retry updates existing log row via emailLogId, caller retry override vs template default |
| `retry-policy` | Exponential backoff: 1s, 2s, 4s, 8s..., cap at 60s, attempt=0 edge case |
| `template-service` | Create template, get by name, get all, update, delete, render with variables, render throws on missing template, render with empty variables |
| `event-consumer` | Valid message → calls handler, invalid message (missing to) → ack + log error, invalid JSON → ack + log error, handler exception → nack with requeue |
| `admin-routes` | CRUD operations via HTTP, auth rejection (missing/wrong key), pagination, filtering |

**E2E Test:**

Full flow using `createApp({ overrides })`:
1. Seed template via admin API
2. Simulate RabbitMQ message (call emailService.sendEmail directly)
3. Verify email log created with correct status
4. Verify event published

### Test Fakes Updates

**FakeEmailLogRepository** — add new fields + methods:
```js
const create = async ({ toAddress, subject, template, status, attempt, maxRetries, variables, fromEmail }) => {
  const log = { id: crypto.randomUUID(), toAddress, subject, template, status, attempt, maxRetries, variables, fromEmail, createdAt: new Date() }
  logs.push(log)
  return log
}
const updateAttempt = async (id, attempt) => {
  const log = logs.find((l) => l.id === id)
  if (log) { log.attempt = attempt; log.status = 'queued'; log.error = null }
  return log
}
// Also add: findAll (with pagination/filtering), findById for admin route tests
```

**FakeTemplateRepository** (new):
```js
const FakeTemplateRepository = (initial = {}) => {
  const templates = new Map()
  // Pre-populate from initial
  return {
    findByName: (name) => templates.get(name) || null,
    findById: (id) => [...templates.values()].find(t => t.id === id) || null,
    findAll: () => [...templates.values()],
    create: ({ name, html, variables, maxRetries }) => { ... },
    update: (id, data) => { ... },
    delete: (id) => { ... },
    templates, // exposed for assertions
  }
}
```

---

## 18. Files to Create/Modify/Delete

### Create (new files)

| File | Purpose |
|------|---------|
| `src/shared/utils.js` | `maskEmail()` (extracted from email-service) |
| `src/modules/sender/retry-policy.js` | Retry delay calculation |
| `src/infrastructure/db/drizzle-template-repository.js` | Template CRUD |
| `src/infrastructure/rabbitmq/connection-manager.js` | Auto-reconnect (from auth-service) |
| `src/infrastructure/http/middleware/admin-auth.js` | API key guard |
| `src/infrastructure/http/routes/admin-routes.js` | Template + log API |
| `src/admin/index.html` | Admin panel entry |
| `src/admin/app.tsx` | React app shell |
| `src/admin/pages/templates.tsx` | Template management page |
| `src/admin/pages/logs.tsx` | Email log viewer page |
| `src/admin/components/template-form.tsx` | Template create/edit form |
| `src/admin/components/template-list.tsx` | Template table |
| `src/admin/components/log-table.tsx` | Log table |
| `src/admin/components/layout.tsx` | App layout |
| `eslint.config.js` | ESLint configuration |
| `.prettierrc` | Prettier configuration |
| `.lintstagedrc` | Lint-staged configuration |
| `.husky/pre-commit` | Git hook |
| `.github/workflows/ci.yml` | CI/CD pipeline |
| `test/fakes/fake-template-repository.js` | Template test fake |
| `test/modules/sender/retry-policy.test.js` | Retry logic tests |
| `test/infrastructure/rabbitmq/event-consumer.test.js` | Consumer validation tests |
| `test/infrastructure/http/admin-routes.test.js` | Admin API tests |
| `test/e2e/email-flow.test.js` | E2E flow test |

### Modify (existing files)

| File | Changes |
|------|---------|
| `src/index.js` | Full rewrite: graceful shutdown, middleware, connection manager, admin panel serving |
| `src/config.js` | Add `ADMIN_API_KEY` to required vars |
| `src/infrastructure/db/schema.js` | Add `emailTemplates` table, extend `emailLog` columns |
| `src/infrastructure/db/drizzle-email-log.js` | Extended: new columns, findAll with pagination/filtering, findById |
| `src/infrastructure/rabbitmq/event-consumer.js` | Add message validation, retry header handling |
| `src/infrastructure/rabbitmq/event-publisher.js` | Adapt for connection manager (get channel dynamically) |
| `src/modules/sender/email-service.js` | Retry logic, subject from caller, new log fields |
| `src/modules/templates/template-service.js` | Rewrite: DB-backed CRUD + render |
| `src/infrastructure/http/routes/health-routes.js` | Deep checks (DB + RabbitMQ) |
| `package.json` | New deps, new scripts, prepare hook |
| `Dockerfile` | curl, appuser, HEALTHCHECK |
| `.env.example` | Add ADMIN_API_KEY |
| `test/fakes/fake-email-log-repository.js` | New fields, findAll/findById |
| `test/modules/config.test.js` | Test ADMIN_API_KEY |
| `test/modules/sender/email-service.test.js` | Retry tests, new fields |
| `test/modules/templates/template-service.test.js` | Rewrite for DB-backed service |

### Delete

| File | Reason |
|------|--------|
| `src/modules/sender/email-entity.js` | Subjects no longer hardcoded |
| `src/infrastructure/templates/file-template-store.js` | Templates now in DB |
| `test/fakes/in-memory-template-store.js` | Replaced by fake-template-repository |
| `index.ts` | Unused placeholder file |
| `docker-compose.yml` | Infrastructure managed by Coolify, not local compose |

### Keep (unchanged)

| File | Reason |
|------|--------|
| `src/container.js` | Already good |
| `src/logger.js` | Already good |
| `src/infrastructure/resend/resend-provider.js` | Already good |
| `test/fakes/in-memory-email-provider.js` | Already good |
| `test/fakes/fake-event-publisher.js` | Already good |
| `test/modules/container.test.js` | Already good |
| `templates/otp-code.html` | Kept as reference, content seeded to DB via migration |
| `templates/welcome.html` | Kept as reference, content seeded to DB via migration |
| `drizzle.config.js` | Already good |
| `tsconfig.json` | Already good |

---

## 19. Migration Path

### Breaking Changes for Callers

The auth-service (and any other caller) must update its RabbitMQ message format:

**Before:**
```json
{ "type": "email.send", "payload": { "to": "...", "template": "otp-code", "variables": { "code": "123456" } } }
```

**After:**
```json
{ "type": "email.send", "payload": { "to": "...", "subject": "Your verification code", "template": "otp-code", "variables": { "code": "123456" } } }
```

The only addition is the required `subject` field. The auth-service's OTP service already knows the subject — it just needs to include it in the message.

### Database Migration

A single Drizzle migration will:
1. Add new columns to `email_log`
2. Create `email_templates` table
3. Seed initial templates from HTML files

### Deployment Order

1. Deploy updated email-service (it validates `subject` but the consumer won't crash on old messages — they'll be logged as validation errors and acked)
2. Deploy updated auth-service with `subject` in messages
3. Any old messages without `subject` in the queue will be discarded with an error log

---

## 20. Implementation Order (TDD)

All implementation follows test-driven development: write the test first, watch it fail, then implement until it passes.

1. **Quality gates** — ESLint, Prettier, Husky, lint-staged, CI/CD (no tests needed — tooling config)
2. **Infrastructure foundations** — Connection manager (test → impl), graceful shutdown (test → impl), deep health checks (test → impl), security headers, Dockerfile improvements
3. **Database** — Schema changes (templates table, extended log), migration, seed
4. **Core logic** — For each module: write tests first, then implement
   - Template service: CRUD tests → CRUD impl, render tests → render impl
   - Retry policy: delay calculation tests → impl
   - Email service: send/retry/log tests → impl
   - Message validation: validation tests → consumer impl
5. **Admin API** — Auth middleware tests → impl, template CRUD endpoint tests → impl, log endpoint tests → impl
6. **Admin UI** — React app, template management, log viewer (frontend, no unit tests — validated via E2E)
7. **E2E tests** — Full send flow, admin flow
8. **Cleanup** — Delete removed files, update .env.example, format all code
