# Architecture

## Layered Design

The email-service follows a three-layer architecture with strict dependency direction: HTTP routes depend on domain services, which depend on infrastructure adapters. Infrastructure never imports from domain.

```
HTTP Routes (infrastructure/http/routes/)
    |
    v
Domain Services (modules/)
    |
    v
Infrastructure Adapters (infrastructure/db/, infrastructure/rabbitmq/, infrastructure/resend/)
```

### Layer Responsibilities

**HTTP Routes** — Parse requests, validate input, apply rate limits, authenticate admin requests, call domain services, format responses. No business logic lives here.

**Domain Services** — Implement business rules: email sending orchestration, template rendering with variable substitution, retry decisions. Services receive their dependencies via constructor injection.

**Infrastructure Adapters** — Concrete implementations for external systems: Drizzle/Postgres for persistence, RabbitMQ for message consumption and event publishing, Resend for email delivery.

## Dependency Injection

The service uses a manual DI container (`src/container.js`) with no framework. The container supports `register(name, factory)` and `resolve(name)` with lazy singleton semantics.

For testing, the `createApp()` function accepts an `overrides` object. When `overrides.emailProvider` is present, the app runs in test mode: no real infrastructure is initialized, and in-memory fakes replace database repositories and the email provider.

## Module Responsibilities

### sender/ — Email Sending

- **email-service.js** — Orchestrates the full send flow: renders the template, creates a log entry, calls the email provider, handles success/failure, publishes events, and decides whether to retry. Resolves subject and fromName from template defaults with per-message overrides.
- **retry-policy.js** — Exponential backoff: `baseDelayMs * 2^(attempt-1)`, capped at 60 seconds. `shouldRetry` returns true if `maxRetries > 0` and `attempt <= maxRetries`.

### templates/ — Template Management

- **template-service.js** — CRUD operations delegated to the repository. The `render()` method looks up a template by name, then replaces all `{{variable}}` placeholders in both HTML and subject with HTML-escaped values.

### shared/ — Utilities

- **utils.js** — `maskEmail` (for logging), `secureCompare` (timing-safe via HMAC), `secureCompareAny` (check against multiple keys), `parseBasicAuth` (extract password from Basic auth header).
- **rate-limiter.js** — In-memory fixed window rate limiter with periodic cleanup. Used for admin API rate limiting.

## Infrastructure Adapters

### PostgreSQL (Drizzle ORM)

- **schema.js** — Defines `email_log` and `email_templates` tables. Email logs track every send attempt with status, error, attempt count, and variables. Templates store HTML, subject, fromName, variables list, and maxRetries.
- **drizzle-email-log.js** — Email log repository: create entries, update status/attempt, query with filters (status, template, recipient, date range) and pagination.
- **drizzle-template-repository.js** — Template repository: CRUD operations with lookup by name or ID.

### RabbitMQ

Three exchanges and two queues:

| Exchange | Type | Purpose |
|----------|------|---------|
| `email.commands` | direct | Incoming email send commands (consumed) |
| `email.retry` | direct | Dead letter exchange for retry scheduling |
| `email.events` | topic | Outgoing events: `email.sent`, `email.failed` |

| Queue | Exchange | Routing Key | Purpose |
|-------|----------|-------------|---------|
| `email-service.email.send` | `email.commands` | `email.send` | Main processing queue |
| `email-service.email.retry` | `email.retry` | `email.retry` | Delayed retry queue (messages expire back to main queue via DLX) |

The **connection manager** handles connection lifecycle with automatic reconnection (exponential backoff: 1s, 2s, 4s... max 30s). On reconnect, publishers have their `ready` flag reset (triggering exchange re-assertion) and consumers are restarted.

**Retry mechanism:** When a send fails and the retry policy allows another attempt, the message is published to the retry exchange with an `expiration` header (the calculated delay). When the message expires in the retry queue, RabbitMQ's dead letter exchange routes it back to the main queue with incremented retry headers.

### Resend

- **resend-provider.js** — Thin wrapper around the Resend SDK. Calls `resend.emails.send()` and normalizes the response to `{ success, error? }`.

## Data Flow Diagrams

### Email Send (via RabbitMQ)

```
auth-service               RabbitMQ                  event-consumer         email-service        Resend       Postgres
  |                           |                           |                      |                  |            |
  |-- publish email.send ---->|                           |                      |                  |            |
  |                           |-- deliver to queue ------>|                      |                  |            |
  |                           |                           |-- parse & validate   |                  |            |
  |                           |                           |-- onEmailSend ------>|                  |            |
  |                           |                           |                      |-- render template |            |
  |                           |                           |                      |-- create log ---->|----------->|
  |                           |                           |                      |-- send() -------->|            |
  |                           |                           |                      |<-- { success } ---|            |
  |                           |                           |                      |-- update log ---->|----------->|
  |                           |                           |                      |-- publish email.sent --------->|
  |                           |                           |<-- { success } ------|                  |            |
  |                           |<-- ack -------------------|                      |                  |            |
```

### Email Retry (on failure)

```
event-consumer          email-service        Resend       Postgres       RabbitMQ (retry)     RabbitMQ (main)
  |                          |                  |            |                |                     |
  |-- onEmailSend ---------> |                  |            |                |                     |
  |                          |-- send() ------->|            |                |                     |
  |                          |<-- { error } ----|            |                |                     |
  |                          |-- shouldRetry?   |            |                |                     |
  |                          |-- update log --->|----------->|                |                     |
  |<-- { retry: true } ------|                  |            |                |                     |
  |-- publish to retry exchange with expiration ------------>|                |                     |
  |-- ack original message   |                  |            |                |                     |
  |                          |                  |            |  (after delay) |                     |
  |                          |                  |            |                |-- DLX to main ----->|
  |                          |                  |            |                |                     |-- redeliver
```

### Admin Template Management

```
Admin Panel              admin-routes         templateService       Postgres
  |                          |                      |                  |
  |-- GET /admin/api/templates -->|                 |                  |
  |                          |-- authenticate key   |                  |
  |                          |-- rate limit check   |                  |
  |                          |-- getAll() --------->|                  |
  |                          |                      |-- SELECT * ----->|
  |                          |                      |<-- rows ---------|
  |<-- [ templates ] --------|                      |                  |
  |                          |                      |                  |
  |-- POST /admin/api/templates -->|                |                  |
  |                          |-- authenticate key   |                  |
  |                          |-- create() --------->|                  |
  |                          |                      |-- INSERT ------->|
  |                          |                      |<-- row ----------|
  |<-- { template } ---------|                      |                  |
```

### Admin Log Viewing

```
Admin Panel              admin-routes         emailLogRepository     Postgres
  |                          |                      |                  |
  |-- GET /admin/api/logs?status=failed -->|        |                  |
  |                          |-- authenticate key   |                  |
  |                          |-- rate limit check   |                  |
  |                          |-- findAll(filters) ->|                  |
  |                          |                      |-- SELECT + COUNT>|
  |                          |                      |<-- rows, total --|
  |<-- { data, total, page } |                      |                  |
```

## Security

Applied globally via Elysia lifecycle hooks in `src/index.js`:

1. **CORS** (`onBeforeHandle`) — Checks request `Origin` against `CORS_ORIGIN` config. Only the exact configured origin is allowed. Preflight `OPTIONS` requests return 204.
2. **Security headers** (`onBeforeHandle`) — Sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`, `Referrer-Policy` on every response.
3. **Request ID** (`derive`) — Generates `crypto.randomUUID()` per request, or reuses incoming `X-Request-ID` header for cross-service correlation.
4. **Access logging** (`onAfterHandle`) — Logs method, path, status, and request ID for every request except `/health`.
5. **Global error handler** (`onError`) — Catches unhandled errors, logs full stack trace, returns generic 500 to client. Validation errors are passed through to Elysia's default handler.
6. **Body size limit** — `maxRequestBodySize: 65536` (64 KB) set on the Bun HTTP server.
7. **Admin auth** — Admin routes require either `X-Admin-Key` header or Basic auth, compared with timing-safe HMAC comparison. Supports multiple keys for zero-downtime key rotation.
8. **Template rendering** — All variable values are HTML-escaped before substitution to prevent XSS in email bodies.
