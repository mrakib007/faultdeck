# faultdeck

A self-hosted failure dashboard for RabbitMQ jobs. The React dashboard still uses demo data and the TypeScript API only serves `/health`; a Go collector now records example failure events from RabbitMQ in PostgreSQL.

The wire format is described in the [versioned failure-event contract](contracts/README.md).

## Local development

### All services with Docker

Requires Docker with Compose. From the repository root:

```sh
docker compose up --build
```

Open http://localhost:5173 for the frontend, http://localhost:3001/health for the API, and http://localhost:15672 for RabbitMQ management (`faultdeck` / `faultdeck_dev`). PostgreSQL and RabbitMQ use persistent named volumes. Stop the stack with `docker compose down` (without `-v` to keep the data).

PostgreSQL is available from the host on port `15432` (the backend connects internally on port `5432`).

These are development-only credentials. A one-shot migration creates `failure_events` on startup, including for existing PostgreSQL volumes. The collector owns writes; the API does not yet read PostgreSQL. Images copy source at build time, so rebuild after editing code (`docker compose up --build`).

### Trigger and inspect one failed job

With the stack running, in another terminal:

```sh
docker compose --profile demo run --build --rm worker
docker compose exec postgres psql -U faultdeck -d faultdeck -c 'SELECT event_id, job_id, attempt, service, queue, error_category, error_message, occurred_at FROM failure_events ORDER BY stored_at DESC LIMIT 5;'
```

The worker simulates one failed email job, publishes a sanitized v1 event to the dedicated durable `faultdeck.failures` exchange/queue, waits for RabbitMQ's publish confirmation, and exits. Each run uses a fresh event ID; the collector inserts the row before acknowledging it. No application queues are consumed. The dashboard still shows demo data until the API and UI batches.

### Verify delivery reliability (local development only)

With `docker compose up --build -d` already running:

```sh
go test ./...
FAULTDECK_INTEGRATION=1 go test ./tests/integration -count=1 -v
```

The opt-in integration test publishes a duplicate event, blocks a database insert to check the message stays unacknowledged, restarts the collector, quarantines an invalid event, and **temporarily stops and restarts the Compose PostgreSQL container** to check redelivery. Do not run it while other work depends on that local database. It restores PostgreSQL and the collector afterward; it does not remove persistent volumes or existing failure rows.

The collector accepts only v1 events matching the contract's fields and bounds. Invalid messages go to the durable `faultdeck.invalid` queue, with a reason header, after RabbitMQ confirms the quarantine copy; they are then acknowledged in the main queue. Quarantined bodies may contain sensitive data, so restrict RabbitMQ management access. They expire after seven days. A PostgreSQL write failure leaves the original message unacknowledged; the collector exits and Compose restarts it until the database is available. The event ID prevents a redelivery from creating another row. This is at-least-once handling, not a guarantee that publishers will never lose an event before RabbitMQ confirms it.

### Run the apps outside Docker

Requires Node.js and npm. You can run the frontend and API without the infrastructure for now. The dashboard currently uses explicitly labeled demo data.

```sh
npm install
npm run dev
```

The frontend runs at http://localhost:5173 and the API health endpoint is at http://localhost:3001/health. Run `npm run build` to build both workspaces.
