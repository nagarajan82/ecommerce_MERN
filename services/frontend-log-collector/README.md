# Frontend Log Collector Microservice

An independent, security-hardened Node.js microservice designed to collect frontend application logs from the micro-frontends and ingest them into Elastic Cloud (Elasticsearch).

---

## Features

- **Schema Validation**: Validates the standardized log schema from `src/lib/logger.js` (`id`, `timestamp`, `level`, `category`, `appName`, `environment`, `message`, `metadata`, `duplicateCount`).
- **Single & Batch Ingestion**: Supports single event objects or bounded arrays (up to 50 events per batch).
- **Defense-in-Depth Sanitization**: Automatically scrubs Bearer tokens, JWTs, credit cards, emails, passwords, cookies, and request/response bodies before ingestion.
- **Elastic Cloud Integration**: Uses the official `@elastic/elasticsearch` client to index logs into the configured Elasticsearch index.
- **Health Monitoring**: `GET /health` endpoint reporting service uptime and Elasticsearch connectivity without leaking sensitive configuration or credentials.
- **Security Controls**:
  - `helmet` security headers.
  - Strict CORS origin filtering (allowing only configured frontend origins).
  - Rate limiting (e.g., 100 requests per minute per IP).
  - Bounded JSON payload limits (100kb) to prevent DoS.
  - Console payload hygiene (never prints raw log payloads or authorization headers).

---

## Directory Structure

```text
services/frontend-log-collector/
├── .env.example              # Template configuration with placeholders
├── .gitignore                # Prevents local secrets & build artifacts from git
├── Dockerfile                # Container build definition
├── package.json              # Service dependencies & test scripts
├── README.md                 # Service documentation
├── src/
│   ├── app.js                # Express app setup, CORS, Helmet, body parser
│   ├── server.js             # Server listener & graceful shutdown handlers
│   ├── config/
│   │   └── env.js            # Environment variable parsing and defaults
│   ├── middleware/
│   │   ├── rateLimiter.js    # Rate limiting middleware
│   │   ├── sanitizer.js      # Server-side redaction and scrubbing
│   │   └── validator.js      # Schema and batch validation
│   ├── routes/
│   │   ├── health.js         # GET /health endpoint
│   │   └── logs.js           # POST /api/logs endpoint
│   └── services/
│       └── elasticClient.js  # Elasticsearch client connection & indexing
└── tests/
    ├── elasticClient.test.js # Unit tests for Elastic client wrapper
    ├── health.test.js        # Tests for health check endpoint
    ├── logs.test.js          # Integration tests for /api/logs endpoint
    ├── rateLimiter.test.js   # Rate limiter threshold tests
    ├── sanitizer.test.js     # Redaction pattern verification
    └── validator.test.js     # Schema and batch validation tests
```

---

## Environment Variables

Copy `.env.example` to `.env` in `services/frontend-log-collector/`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4006` | HTTP port for the collector microservice. |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`). |
| `FRONTEND_ORIGIN` | `http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004` | Comma-separated list of allowed CORS origins. |
| `ELASTICSEARCH_URL` | `""` | Elastic Cloud deployment endpoint URL (e.g., `https://<id>.es.<region>.<cloud>.elastic-cloud.com:9243`). |
| `ELASTIC_API_KEY` | `""` | Elastic API Key generated from Kibana or Elastic Cloud console. |
| `LOG_INDEX` | `frontend-logs` | Target index name in Elasticsearch. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limiting window in milliseconds (default: 1 minute). |
| `RATE_LIMIT_MAX` | `100` | Maximum allowed requests per IP per window. |
| `MAX_BATCH_SIZE` | `50` | Maximum number of log events allowed in a single batch request. |

> [!IMPORTANT]
> Use the standard Elasticsearch REST API endpoint (typically ending with `:9243` on Elastic Cloud), **not** the Elastic APM or OTLP endpoint.
> Never commit `.env` or hardcode credentials into Git.

---

## API Endpoints

### 1. Health Check
- **Route**: `GET /health`
- **Response**:
```json
{
  "status": "ok",
  "service": "frontend-log-collector",
  "uptime": 120,
  "timestamp": "2026-10-14T12:00:00.000Z",
  "elasticsearch": {
    "configured": true,
    "status": "connected"
  }
}
```

### 2. Ingest Logs
- **Route**: `POST /api/logs`
- **Headers**:
  - `Content-Type: application/json`
  - `Origin: http://localhost:3000` (must match an allowed frontend origin)
- **Single Event Body**:
```json
{
  "id": "c1f7b0a8-...",
  "timestamp": "2026-10-14T12:00:00.000Z",
  "level": "error",
  "category": "runtime_error",
  "appName": "frontend-shell",
  "environment": "development",
  "message": "Failed to load remote component",
  "metadata": {
    "component": "catalog-mfe",
    "statusCode": 500
  },
  "duplicateCount": 1
}
```
- **Batch Body**:
```json
[
  { "id": "...", "timestamp": "...", "level": "error", "appName": "auth-mfe", "message": "..." },
  { "id": "...", "timestamp": "...", "level": "warn", "appName": "catalog-mfe", "message": "..." }
]
```
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "ingested": 1
}
```

---

## Installation & Running

### Local Execution

1. Navigate to the service folder:
   ```bash
   cd services/frontend-log-collector
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the service:
   ```bash
   npm start
   ```

### Running Tests

Run the comprehensive unit and integration test suite:

```bash
cd services/frontend-log-collector
npm test
```

All external dependencies including Elasticsearch are completely mocked during automated testing. No network calls or Elastic credentials are required for tests.

---

## Docker Deployment

Build and run using Docker:

```bash
docker build -t frontend-log-collector -f services/frontend-log-collector/Dockerfile .
docker run -p 4006:4006 --env-file services/frontend-log-collector/.env frontend-log-collector
```

Or run via Docker Compose with the other services:
```bash
docker compose up -d frontend-log-collector
```
