# Deployment

## Production: Coolify

The email-service is deployed on [Coolify](https://coolify.io) using the **Dockerfile build pack** (not docker-compose). Each infrastructure dependency (Postgres, RabbitMQ) runs as a separate Coolify resource.

### Build Pack Configuration

Use **Dockerfile** as the build pack. Coolify builds the image from the project's `Dockerfile`, which includes:

- Multi-stage build: dependency installation is cached in a separate stage
- `curl` installed for the health check
- Non-root user (`appuser`) for security
- `HEALTHCHECK` directive for Coolify's rolling update detection
- `CMD` runs migrations then starts the server: `bun run db:migrate && bun run start`

### Infrastructure Resources

Deploy each as a separate Coolify resource (not bundled with the app):

**PostgreSQL:**
- Use Coolify's built-in Postgres resource
- Create a dedicated database named `email_db`
- Strategy: shared Postgres cluster, separate databases per service (`auth_db`, `email_db`, etc.)
- Set `DATABASE_URL` in the email-service environment variables

**RabbitMQ:**
- Deploy as a Docker container in Coolify (use `rabbitmq:3-management-alpine` image)
- Shared with auth-service (and other services that publish email commands)
- Set `RABBITMQ_URL` in the email-service environment variables

### Networking

- Use Coolify's **predefined network** for inter-service communication
- All resources on the same predefined network can reach each other by container name
- **Do NOT map host ports** for production services — let Traefik handle external routing
- **Do NOT set custom container names** — Coolify manages naming for rolling updates

### Rolling Updates

Coolify performs rolling updates when a new deployment is triggered:

1. Coolify builds a new container image
2. The new container starts and must pass the `HEALTHCHECK` before receiving traffic
3. The old container is stopped after the new one is healthy

The `HEALTHCHECK` in the Dockerfile probes `GET /health` every 10 seconds. The health endpoint checks both Postgres and RabbitMQ connectivity.

Database failure is critical (returns 503, blocks traffic). RabbitMQ failure is non-critical (returns 200 with degraded status) — the service can still serve the admin panel and health checks while RabbitMQ reconnects.

### Environment Variables

Configure these in Coolify's environment variable UI for the email-service resource:

```
DATABASE_URL=postgres://user:pass@postgres-resource:5432/email_db
RABBITMQ_URL=amqp://rabbitmq-resource:5672
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com
ADMIN_API_KEY=<generate-a-strong-random-string>
PORT=3002
LOG_LEVEL=info
CORS_ORIGIN=https://app.example.com
```

Replace hostnames with Coolify resource names on the predefined network.

---

## Database Strategy

### Shared Cluster, Separate Databases

All microservices connect to the same Postgres cluster but use separate databases:

```
Postgres Cluster
  ├── auth_db      (auth-service)
  ├── email_db     (email-service)
  └── ...
```

This reduces operational overhead (one cluster to monitor, backup, scale) while maintaining data isolation between services. Each service owns its database exclusively; cross-service data access happens through APIs or events, never direct database queries.

### Migrations

Migrations run automatically on startup (`bun run db:migrate` in the Dockerfile `CMD`). This means:

- Every deployment runs pending migrations before the server accepts traffic
- Migrations must be **backward-compatible**: the previous version of the service may still be running during a rolling update
- Never rename or drop columns in a single deployment. Use a multi-step process: add new column, deploy, migrate data, deploy with new column usage, then drop old column

Migration files are generated with `bun run db:generate` (Drizzle Kit) and stored in the `drizzle/` directory.

### Tables

**`email_log`** — Records every email send attempt:
- `id` (UUID, PK), `to_address`, `subject`, `template`, `status` (queued/sent/failed), `error`, `attempt`, `max_retries`, `variables` (JSONB), `from_email`, `sent_at`, `created_at`, `updated_at`
- Indexes on `(status, created_at)`, `template`, `to_address`

**`email_templates`** — Stores email templates:
- `id` (UUID, PK), `name` (unique), `subject`, `from_name`, `html`, `variables` (text[]), `max_retries`, `created_at`, `updated_at`

---

## Local Development

### Infrastructure

Start Postgres and RabbitMQ with Docker Compose:

```bash
docker compose up -d
```

Then:

```bash
cp .env.example .env    # first time only
bun run db:migrate      # first time or after schema changes
bun run dev             # starts with --watch
```

The dev server runs on port 3002 by default.

---

## Monitoring

### Health Check

`GET /health` returns 200 when Postgres is reachable, 503 otherwise. RabbitMQ failure degrades the status but does not trigger 503. The Dockerfile `HEALTHCHECK` polls this endpoint every 10 seconds.

### Structured Logging

All log output is structured JSON with fields: `time`, `level`, `service`, `msg`, and context-specific fields. Logs include:
- Request ID (`requestId`) for cross-service correlation
- Masked emails in all log entries (e.g., `use***@example.com`)
- No sensitive data logged (API keys, full email bodies)
- `/health` requests are excluded from access logs

### Events

Domain events published to RabbitMQ (`email.events` exchange) can be consumed for monitoring:
- `email.sent` — email delivered successfully
- `email.failed` — email failed permanently after all retries exhausted
