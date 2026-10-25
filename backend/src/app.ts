import express from 'express';

type FailureRow = {
  event_id: string;
  job_id: string;
  attempt: number;
  service: string;
  queue: string;
  occurred_at: Date;
  error_category: string;
  error_message: string;
  metadata: Record<string, string | number | boolean>;
  stored_at: Date;
};

// A read-only query interface keeps the API independent of the collector's writes.
export type FailureReader = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: FailureRow[] }>;
};

function formatFailure(row: FailureRow) {
  return {
    event_id: row.event_id,
    job_id: row.job_id,
    attempt: row.attempt,
    service: row.service,
    queue: row.queue,
    occurred_at: row.occurred_at.toISOString(),
    error: { category: row.error_category, message: row.error_message },
    metadata: row.metadata,
    stored_at: row.stored_at.toISOString(),
  };
}

const failureColumns = `event_id, job_id, attempt, service, queue, occurred_at,
  error_category, error_message, metadata, stored_at`;

export function createApp(db: FailureReader) {
  const app = express();

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/failures', async (request, response) => {
    const rawLimit = request.query.limit;
    if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^[1-9]\d*$/.test(rawLimit) ||
      Number(rawLimit) > 100)) {
      response.status(400).json({ error: 'limit must be an integer from 1 to 100' });
      return;
    }
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    try {
      const result = await db.query(
        `SELECT ${failureColumns} FROM failure_events
         ORDER BY occurred_at DESC, event_id DESC LIMIT $1`, [limit],
      );
      response.json({ failures: result.rows.map(formatFailure) });
    } catch (error) {
      console.error('Could not list failures:', error);
      response.status(503).json({ error: 'Failure records are temporarily unavailable' });
    }
  });

  app.get('/api/jobs/:jobId/attempts', async (request, response) => {
    const { jobId } = request.params;
    if (!jobId || [...jobId].length > 200) {
      response.status(400).json({ error: 'jobId must be 1 to 200 characters' });
      return;
    }
    try {
      const result = await db.query(
        `SELECT ${failureColumns} FROM failure_events WHERE job_id = $1
         ORDER BY attempt ASC, occurred_at ASC, event_id ASC`, [jobId],
      );
      if (result.rows.length === 0) {
        response.status(404).json({ error: 'No failed attempts found for this job' });
        return;
      }
      response.json({ job_id: jobId, attempts: result.rows.map(formatFailure) });
    } catch (error) {
      console.error('Could not load job attempts:', error);
      response.status(503).json({ error: 'Failure records are temporarily unavailable' });
    }
  });

  return app;
}
