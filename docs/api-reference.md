# API Reference

Base URL: `http://localhost:3002` (configurable via `PORT` env var).

All endpoints return JSON. Security headers are set on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`.

Maximum request body size: 64 KB.

---

## GET /health

Deep health check. Probes Postgres (`SELECT 1`) with a 3-second timeout and checks RabbitMQ connection status.

**Auth:** None

**Response (200 — healthy):**

```json
{
  "status": "ok",
  "service": "email-service",
  "uptime": 42,
  "checks": {
    "database": "ok",
    "rabbitmq": "ok"
  }
}
```

**Response (200 — degraded, non-critical component down):**

```json
{
  "status": "degraded",
  "service": "email-service",
  "uptime": 42,
  "checks": {
    "database": "ok",
    "rabbitmq": "failing"
  }
}
```

**Response (503 — unhealthy, database down):**

```json
{
  "status": "unhealthy",
  "service": "email-service",
  "uptime": 42,
  "checks": {
    "database": "failing",
    "rabbitmq": "ok"
  }
}
```

Check values: `"ok"`, `"failing"`, `"skipped"` (if adapter not initialized, e.g., in tests).

Database failure is critical (returns 503). RabbitMQ failure is non-critical (returns 200 with `"degraded"` status).

---

## GET /admin

Serves the React admin panel (Bun HTML import). No authentication required to load the page — API calls from the panel require an admin key.

---

## Admin API

All admin endpoints are prefixed with `/admin/api` and require authentication.

**Auth:** One of:
- `X-Admin-Key: <ADMIN_API_KEY>` header
- `Authorization: Basic <base64(any-user:ADMIN_API_KEY)>` header (password field is the admin key)

**Rate limit:** 60 requests per minute per IP (in-memory fixed window).

**Response (401 — unauthorized):**

```json
{ "error": "Unauthorized" }
```

**Response (429 — rate limited):**

```json
{ "error": "Too many requests", "retryAfter": 45 }
```

Headers: `Retry-After: <seconds>`

---

### GET /admin/api/templates

List all email templates, ordered by name.

**Response (200):**

```json
[
  {
    "id": "uuid",
    "name": "otp-verification",
    "subject": "Your verification code: {{code}}",
    "fromName": "MyApp",
    "html": "<h1>Your code is {{code}}</h1>",
    "variables": ["code"],
    "maxRetries": 3,
    "createdAt": "2026-03-23T12:00:00.000Z",
    "updatedAt": "2026-03-23T12:00:00.000Z"
  }
]
```

---

### GET /admin/api/templates/:id

Get a single template by ID.

**Response (200):** Single template object (same shape as above).

**Response (404):**

```json
{ "error": "Not found" }
```

---

### POST /admin/api/templates

Create a new email template.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique template name (used as lookup key) |
| `html` | string | Yes | HTML body with `{{variable}}` placeholders |
| `subject` | string | No | Email subject line (supports `{{variable}}` placeholders) |
| `fromName` | string | No | Sender display name |
| `variables` | string[] | No | List of expected variable names (documentation only) |
| `maxRetries` | number | No | Max retry attempts on send failure (default: 0) |

**Response (200):** Created template object.

**Response (400):**

```json
{ "error": "name and html are required strings" }
```

---

### PUT /admin/api/templates/:id

Update an existing template. Only provided fields are updated.

**Request body:** Same fields as POST (all optional).

**Response (200):** Updated template object.

---

### DELETE /admin/api/templates/:id

Delete a template.

**Response (200):** Deleted template object, or `null`.

---

### GET /admin/api/logs

Query email send logs with filtering and pagination.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Items per page (max 100) |
| `status` | string | — | Filter by status: `queued`, `sent`, `failed` |
| `template` | string | — | Filter by exact template name |
| `to` | string | — | Filter by recipient (substring match) |
| `from` | string | — | Filter by start date (ISO 8601) |
| `to_date` | string | — | Filter by end date (ISO 8601) |

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "toAddress": "user@example.com",
      "subject": "Your verification code: 123456",
      "template": "otp-verification",
      "status": "sent",
      "error": null,
      "attempt": 1,
      "maxRetries": 3,
      "variables": { "code": "123456" },
      "fromEmail": "MyApp <noreply@example.com>",
      "sentAt": "2026-03-23T12:00:00.000Z",
      "createdAt": "2026-03-23T12:00:00.000Z",
      "updatedAt": "2026-03-23T12:00:00.000Z"
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 50
}
```

---

### GET /admin/api/logs/:id

Get a single email log entry by ID.

**Response (200):** Single log object (same shape as in the `data` array above).

**Response (404):**

```json
{ "error": "Not found" }
```

---

## RabbitMQ Message Format

The email-service consumes messages from RabbitMQ rather than exposing a direct HTTP endpoint for sending emails. Other services (e.g., auth-service) publish to the `email.commands` exchange.

### Consuming: `email.commands` exchange (direct)

**Routing key:** `email.send`

**Message body:**

```json
{
  "id": "uuid",
  "type": "email.send",
  "timestamp": "2026-03-23T12:00:00.000Z",
  "payload": {
    "to": "user@example.com",
    "template": "otp-verification",
    "variables": { "code": "123456" },
    "subject": "Optional subject override",
    "fromName": "Optional sender name override"
  }
}
```

| Payload Field | Type | Required | Description |
|---------------|------|----------|-------------|
| `to` | string | Yes | Recipient email address |
| `template` | string | Yes | Template name (must exist in the database) |
| `variables` | object | Yes | Key-value pairs for template variable substitution |
| `subject` | string | No | Overrides the template's subject |
| `fromName` | string | No | Overrides the template's fromName |

### Publishing: `email.events` exchange (topic)

Events published after processing:

**`email.sent`** — email delivered successfully:

```json
{
  "id": "uuid",
  "type": "email.sent",
  "timestamp": "2026-03-23T12:00:00.000Z",
  "payload": {
    "emailId": "uuid",
    "to": "user@example.com",
    "template": "otp-verification"
  }
}
```

**`email.failed`** — email failed permanently (all retries exhausted):

```json
{
  "id": "uuid",
  "type": "email.failed",
  "timestamp": "2026-03-23T12:00:00.000Z",
  "payload": {
    "emailId": "uuid",
    "to": "user@example.com",
    "template": "otp-verification",
    "error": "Resend API error message",
    "attempt": 4,
    "maxRetries": 3
  }
}
```

---

## Common Error Responses

**500 — Internal Server Error** (unhandled exception):

```json
{ "error": "Internal server error" }
```

No stack traces or internal details are exposed to clients.
