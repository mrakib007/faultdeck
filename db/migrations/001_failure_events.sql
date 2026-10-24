CREATE TABLE IF NOT EXISTS failure_events (
    event_id uuid PRIMARY KEY,
    version integer NOT NULL CHECK (version = 1),
    job_id varchar(200) NOT NULL,
    attempt integer NOT NULL CHECK (attempt >= 1),
    service varchar(100) NOT NULL,
    queue varchar(200) NOT NULL,
    occurred_at timestamptz NOT NULL,
    error_category varchar(100) NOT NULL,
    error_message varchar(512) NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    stored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS failure_events_job_id_occurred_at_idx
    ON failure_events (job_id, occurred_at DESC);
