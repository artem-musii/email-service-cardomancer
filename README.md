# email-service

Transactional email microservice. Consumes email commands from RabbitMQ, renders templates with variable substitution, sends via Resend, and logs every attempt with automatic retries. Includes a React admin panel for template management and log viewing.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | [Bun](https://bun.sh) v1+ |
| HTTP framework | [Elysia](https://elysiajs.com) |
| Database | PostgreSQL 16 via [Drizzle ORM](https://orm.drizzle.team) |
| Message broker | RabbitMQ 3 |
| Email provider | [Resend](https://resend.com) |
| Admin panel | React (Bun HTML imports) |

## Prerequisites

- **Bun** v1.0 or later
- **Docker** and Docker Compose (for local Postgres and RabbitMQ)
- **Resend** API key (get one at [resend.com](https://resend.com))

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd email-service
bun install

# 2. Start infrastructure (Postgres, RabbitMQ)
docker compose up -d

# 3. Copy and configure environment variables
cp .env.example .env
# Edit .env with your values (RESEND_API_KEY, ADMIN_API_KEY, etc.)

# 4. Run database migrations
bun run db:migrate

# 5. Start the development server
bun run dev
```

The dev server starts with `--watch` for live reload on port 3002 (configurable via `PORT`).

For production: `bun run start` runs the server directly.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (e.g., `postgres://user:pass@host:5434/email_db`) |
| `RABBITMQ_URL` | Yes | — | RabbitMQ connection string (e.g., `amqp://host:5672`) |
| `RESEND_API_KEY` | Yes | — | API key from Resend |
| `FROM_EMAIL` | Yes | — | Default sender address (e.g., `noreply@example.com`) |
| `ADMIN_API_KEY` | Yes | — | Comma-separated admin API keys for the admin panel and API; supports multiple keys for zero-downtime rotation |
| `PORT` | No | `3002` | HTTP listen port |
| `LOG_LEVEL` | No | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `CORS_ORIGIN` | No | `""` | Allowed CORS origin (single origin string) |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with watch mode |
| `bun run start` | Start production server |
| `bun test` | Run test suite |
| `bun run test:integration` | Run integration tests only |
| `bun run lint` | Run ESLint |
| `bun run lint:fix` | Run ESLint with auto-fix |
| `bun run format` | Format code with Prettier |
| `bun run format:check` | Check formatting without writing |
| `bun run check` | Run lint + format check + tests |
| `bun run db:generate` | Generate Drizzle migration files |
| `bun run db:migrate` | Run pending database migrations |

## Project Structure

```
src/
  index.js                              # Application entry point, Elysia setup, graceful shutdown
  config.js                             # Environment variable loading and validation
  container.js                          # Manual DI container (register/resolve)
  logger.js                             # Structured JSON logger

  shared/
    utils.js                            # maskEmail, secureCompare, parseBasicAuth
    rate-limiter.js                     # In-memory fixed window rate limiter

  modules/
    sender/
      email-service.js                  # Email sending orchestration with retry logic
      retry-policy.js                   # Exponential backoff with max delay
    templates/
      template-service.js              # Template CRUD and variable rendering

  infrastructure/
    db/
      schema.js                         # Drizzle schema (email_log, email_templates tables)
      drizzle-email-log.js              # Email log repository (create, update, query)
      drizzle-template-repository.js    # Template repository (CRUD)
    rabbitmq/
      connection-manager.js             # Connection lifecycle, auto-reconnect
      event-consumer.js                 # Consume email.send commands, manage retries via DLX
      event-publisher.js                # Publish email.sent and email.failed events
    resend/
      resend-provider.js                # Resend API wrapper
    http/routes/
      health-routes.js                  # GET /health (deep check: Postgres + RabbitMQ)
      admin-routes.js                   # Admin API: template CRUD, email log queries

  admin/
    index.html                          # Admin panel entry point (Bun HTML import)
    app.tsx                             # React app root
    layout.tsx                          # Admin panel layout
    components/
      template-form.tsx                 # Template editor form
      template-list.tsx                 # Template list view
      log-table.tsx                     # Email log table
    pages/
      templates.tsx                     # Template management page
      logs.tsx                          # Log viewer page

templates/                              # (if present) Static email template files
```

## Documentation

- [Architecture](docs/architecture.md) — layered design, DI, module responsibilities, data flow diagrams
- [API Reference](docs/api-reference.md) — all endpoints with request/response schemas
- [Deployment](docs/deployment.md) — Coolify, Docker, migrations, environment management
- [Decision Records](docs/decisions.md) — architectural decisions and rationale
