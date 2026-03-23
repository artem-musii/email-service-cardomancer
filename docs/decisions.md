# Architectural Decision Records

## ADR-1: Resend as Email Provider

**Status:** Accepted

**Context:** The service needs a transactional email API. Options considered: AWS SES, SendGrid, Postmark, Resend. The service should not run its own SMTP server.

**Decision:** Use Resend as the email delivery provider, accessed via the `resend` npm package.

**Consequences:**
- Simple API with a thin SDK wrapper (`resend-provider.js` is ~20 lines).
- The email provider is injected as a dependency. Switching to another provider requires implementing a new adapter with the same `send({ to, subject, html, from }) -> { success, error? }` interface.
- Resend provides delivery analytics and bounce handling externally, reducing the scope of what the email-service needs to track.
- Cost is usage-based. At low volume, the free tier is sufficient.

---

## ADR-2: RabbitMQ-Driven Email Sending (No HTTP Send Endpoint)

**Status:** Accepted

**Context:** Other services (e.g., auth-service) need to trigger emails. Options: expose a direct HTTP endpoint, or consume commands from a message broker.

**Decision:** The email-service has no HTTP endpoint for sending emails. All email sending is triggered by consuming messages from the `email.commands` RabbitMQ exchange with routing key `email.send`.

**Consequences:**
- Decoupled: the auth-service publishes a message and moves on. It does not need to handle email delivery latency or failures.
- Built-in durability: if the email-service is down, messages queue in RabbitMQ and are processed when it comes back.
- Retry logic is handled within the email-service using RabbitMQ dead letter exchanges, not by the publishing service.
- Debugging is slightly harder: no synchronous HTTP response to check. The admin panel's log viewer compensates for this.
- Adding a new email trigger from another service requires no changes to the email-service — just publish the right message format.

---

## ADR-3: Dead Letter Exchange for Retry Scheduling

**Status:** Accepted

**Context:** When an email send fails (Resend API error, rate limit, etc.), the service needs to retry with exponential backoff. Options: in-process `setTimeout`, external scheduler, or RabbitMQ TTL with dead letter exchanges.

**Decision:** Use a two-queue pattern with dead letter exchanges:
1. Failed messages are published to `email.retry` exchange with a per-message `expiration` (the backoff delay).
2. The retry queue (`email-service.email.retry`) has `email.commands` / `email.send` as its dead letter exchange/routing key.
3. When the message TTL expires, RabbitMQ automatically routes it back to the main processing queue.

**Consequences:**
- No in-process timers: retries survive service restarts. If the service crashes, the message is still in RabbitMQ and will be redelivered.
- Exponential backoff: delays are `1s, 2s, 4s, 8s, ...` up to 60s max, calculated by `retry-policy.js`.
- Retry count and email log ID are carried in message headers (`x-retry-count`, `x-email-log-id`), allowing the service to continue updating the same log entry.
- Known limitation: RabbitMQ per-message TTL only applies when the message reaches the head of the queue. If a short-TTL message is behind a long-TTL message, it won't expire until the one ahead of it does. At current volume, the retry queue is nearly always empty so this is not a practical issue.

---

## ADR-4: Template-Based Email Rendering

**Status:** Accepted

**Context:** Emails need consistent formatting. Options: inline HTML in each publishing service, a shared template library, or server-side template storage and rendering.

**Decision:** Store email templates in PostgreSQL with `{{variable}}` placeholder syntax. The email-service renders templates by name, substituting variables with HTML-escaped values.

**Consequences:**
- Templates are managed centrally via the admin API, without redeploying the service.
- Publishing services only need to know the template name and variables, not the HTML structure.
- Variable values are HTML-escaped (`escapeHtml`) before substitution to prevent XSS in email bodies.
- Simple string replacement (`replaceAll`) — no template engine dependency. Sufficient for variable substitution but does not support conditionals, loops, or partials. This can be reconsidered if email complexity grows.
- Templates can define default `subject`, `fromName`, and `maxRetries`, which can be overridden per-message.

---

## ADR-5: In-Memory Rate Limiting for Admin API

**Status:** Accepted

**Context:** The admin API needs rate limiting to prevent abuse. The auth-service uses Redis-backed rate limiting, but the email-service does not use Redis.

**Decision:** Use an in-memory fixed window rate limiter for the admin API (60 requests per minute per IP).

**Consequences:**
- No Redis dependency. The email-service does not need Redis for any other purpose, so adding it solely for rate limiting would be over-engineering.
- Rate limits reset on service restart and are not shared across replicas. This is acceptable: the admin API is low-traffic and used by internal operators, not end users.
- A periodic cleanup interval removes expired buckets to prevent memory leaks.
- If the service scales to multiple replicas, this should be revisited (move to Redis or use a shared store).

---

## ADR-6: Admin API Key Authentication (Not Session-Based)

**Status:** Accepted

**Context:** The admin panel and API need authentication. Options: integrate with the auth-service (session tokens), standalone JWT, or API key.

**Decision:** Use a shared API key (`ADMIN_API_KEY`) for admin authentication. Supports multiple comma-separated keys for zero-downtime rotation. Accepted via `X-Admin-Key` header or Basic auth.

**Consequences:**
- Simple to implement and operate. No dependency on the auth-service for admin access.
- Supports key rotation: add the new key to the comma-separated list, deploy, update clients, remove the old key.
- Timing-safe comparison (HMAC-based `secureCompare`) prevents timing attacks.
- No per-user access control: anyone with the key has full admin access. Acceptable for a small team; revisit if fine-grained permissions are needed.
- Basic auth support allows using the admin panel from browsers (username is ignored, password is the API key).

---

## ADR-7: Shared Postgres Cluster, Separate Databases

**Status:** Accepted

**Context:** Same as auth-service ADR-4.

**Decision:** Run a single Postgres cluster with separate databases per service (`auth_db`, `email_db`, etc.).

**Consequences:**
- Reduced operational overhead: one Postgres instance to provision, monitor, back up, and scale.
- Data isolation maintained at the database level.
- Cross-service queries are impossible by design, enforcing service boundaries.
- Risk: a runaway query in one service's database can affect the shared cluster. Mitigation: connection limits and statement timeouts per database.

---

## ADR-8: Bun HTML Imports for Admin Panel

**Status:** Accepted

**Context:** The admin panel needs to be served by the email-service itself (no separate frontend deployment). Options: server-rendered HTML, separate Vite build, or Bun's HTML imports.

**Decision:** Use Bun's HTML imports to serve a React admin panel. The HTML file is imported directly in `Bun.serve({ routes })` and Bun handles bundling, transpilation, and HMR in development.

**Consequences:**
- Zero build configuration. No Vite, webpack, or separate build step.
- The admin panel is served at `/admin` alongside the API, simplifying deployment.
- HMR works in development with `--watch`.
- The admin panel is a simple SPA with React, not a full framework (no Next.js, Remix, etc.). Suitable for the limited scope (template CRUD + log viewing).
