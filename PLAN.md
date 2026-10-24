# FaultDeck

**One-line pitch:** A self-hosted dashboard that helps engineers find, group, and investigate failed RabbitMQ jobs without digging through scattered worker logs.

## Problem and audience

When a background job fails, its error, retry history, and message context are often split between application logs and broker tooling. FaultDeck gives engineers a searchable view of failures and what happened across attempts. It does not replace RabbitMQ, own application queues, or promise to detect failures that applications never report.

The first release is an open-source, clone-and-run tool for local development and trusted internal environments, not a hosted SaaS. Validate the workflow by asking engineers who run background jobs what they actually need to see during a failure.

## First usable version

1. An example worker publishes structured failure events to a **dedicated monitoring exchange** when it catches a job error. Document the event format so other workers can opt in.
2. A Go collector consumes FaultDeck's monitoring queue, validates events, groups similar errors, and records failures and attempts in PostgreSQL. It acknowledges a message only after durable processing; duplicate events must not create duplicate attempts.
3. A React dashboard lists recent failures, counts and status by group, and shows a detail page with attempt timeline, error message, and safe message metadata. Search or filter by service, queue, error group, and time.
4. A Node.js API serves dashboard queries and health checks. A seeded failure scenario demonstrates retries, duplicates, and a worker restart without needing a real production application.
5. Docker Compose runs the UI, API, collector, PostgreSQL, RabbitMQ, and example producer. Document how to connect an existing application without consuming or changing its normal queues.

The core demo: run the stack, trigger a failing example job, see its attempts grouped in the dashboard, then restart the Go collector and show that no attempt is lost or double-counted.

## Technical direction

- **Frontend:** React 19, TypeScript, and Vite. React 19 is suitable for an interactive internal dashboard; server-side rendering is not required. Prioritize accessible tables, clear empty/error states, and a useful incident detail view over decorative charts.
- **Main backend:** Node.js, TypeScript, and Express for the read API, health endpoints, and demo integration. Keep the main application in TypeScript while learning Go.
- **Collector:** A small Go process owns consuming monitoring events, validation, grouping, idempotent persistence, and acknowledgements. Document the event schema and database write ownership between Go and Node.
- **Broker:** RabbitMQ with an opt-in monitoring exchange and a queue owned by FaultDeck. Never attach a consumer to an application's dead-letter queue by default. Use durable messages/queues and a bounded failure path for malformed events; avoid endless redelivery loops.
- **Storage:** PostgreSQL for failure groups, events, and attempt history. Use a stable event ID for deduplication and migrations for schema changes. Payloads and stack traces may contain secrets: store only configured, redacted fields, set retention limits, and avoid logging raw payloads.
- **Redis:** Not needed for version one. Add it only for a measured requirement, such as high-volume alert deduplication or live counters that PostgreSQL cannot reasonably handle.
- **Security/deployment:** Localhost-only defaults and sample credentials are for development, not production. A shared deployment needs authentication and access controls (or a documented trusted reverse proxy), TLS, secret management, and review of what failure data is stored. No replay controls in version one: replay can repeat external side effects.

## Integration contract

An application explicitly publishes a versioned JSON failure event with an event ID, service, queue, job ID, attempt number, timestamp, error category/message, and allowlisted metadata. A failure event describes what the application observed; RabbitMQ alone cannot reveal why arbitrary consumers failed. The Go collector validates the contract and commits to PostgreSQL before acknowledging delivery. If the database is unavailable, the broker can redeliver the event; the event ID keeps that retry from duplicating history.

## Build sequence

1. **Define the problem:** talk to engineers, choose the minimum fields needed to debug one failed job, and specify privacy/redaction rules.
2. **RabbitMQ vertical slice:** build an example producer, monitoring exchange/queue, versioned event contract, small Go consumer, PostgreSQL persistence, and a test covering redelivery.
3. **Dashboard:** add the Node read API and React 19 UI for failure lists, grouping, filters, and attempt details.
4. **Reliability and packaging:** test duplicate events, malformed events, database downtime, and collector restarts against real RabbitMQ/PostgreSQL; add Docker Compose, seed scenario, and setup docs.
5. **Later, only if useful:** add an opt-in Kafka adapter that translates application-emitted failure events into the same contract. Kafka consumer offsets and replay semantics differ from RabbitMQ; do not present them as interchangeable. Consider alerting or controlled replay only after the diagnostic workflow works.

## Suggested repository layout

```text
frontend/              React 19 dashboard
backend/               TypeScript API
services/collector/    Go RabbitMQ failure-event collector
examples/worker/       Example failing job and event publisher
db/migrations/         PostgreSQL schema
contracts/             Versioned event schema and examples
tests/integration/     Broker-to-collector-to-dashboard flow
compose.yaml           Local stack
README.md              Setup, integration, architecture, and limitations
```

## Success criterion

An engineer can clone the repo, start the stack, trigger a job failure, and understand the error and retry timeline in the dashboard. Duplicate delivery and collector restart do not corrupt the recorded history.
