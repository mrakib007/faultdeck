# Failure event v1

The [JSON Schema](failure-event.v1.schema.json) defines the wire format; the [example](examples/failure-event.v1.json) is a single failed attempt. A worker publishes one event when it catches a job failure. Publishing is opt-in: FaultDeck does not consume application queues or infer failures from RabbitMQ.

| Field | Meaning |
| --- | --- |
| `version` | Contract version; currently `1`. Unknown versions must not be silently interpreted as v1. |
| `event_id` | UUID generated once for this failure event. Reuse it when retrying publication; a different failed attempt gets a new ID. |
| `job_id` | Stable application job identifier across attempts. |
| `attempt` | One-based attempt number for that job. |
| `service`, `queue` | Application service and original job queue, not the monitoring queue. |
| `occurred_at` | Time the failure occurred, as an RFC 3339 timestamp (publishers should use UTC). |
| `error.category` | Stable, low-cardinality error class/code for future grouping. |
| `error.message` | Short, *sanitized* diagnostic summary, not the raw exception or stack trace. |
| `metadata` | Optional, small map of explicitly allowlisted non-sensitive values selected by the application. |

Only the listed fields are permitted. Schema size limits are a guardrail, **not** redaction: publishers must remove tokens, personal information, URLs with query strings, raw job payloads, stack traces, and other secrets before publishing. Avoid including arbitrary exception messages. An application should define and review its own metadata allowlist; an empty or omitted `metadata` is fine.

This event means only that an attempt failed. It does **not** imply a retry was scheduled, a job is still open, or a later attempt succeeded. Success or lifecycle status will require a separate contract if needed. The collector will validate events before storage, treat `event_id` as the idempotency key, and acknowledge only after committing to PostgreSQL. Transport configuration and invalid-event handling belong to the next implementation batch.
