import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';

it.skipIf(process.env.FAULTDECK_API_INTEGRATION !== '1')(
  'reads real PostgreSQL failure records in event and attempt order', async () => {
    const db = new pg.Pool({
      connectionString: 'postgres://faultdeck:faultdeck_dev@127.0.0.1:15432/faultdeck',
    });
    const jobId = `api-test-${randomUUID()}`;
    const eventIds = [randomUUID(), randomUUID()];
    try {
      for (const [index, eventId] of eventIds.entries()) {
        await db.query(`INSERT INTO failure_events
          (event_id, version, job_id, attempt, service, queue, occurred_at, error_category, error_message, metadata)
          VALUES ($1, 1, $2, $3, 'api-test', 'test.jobs', $4, 'TestError', 'test failure', '{}'::jsonb)`,
          [eventId, jobId, index + 1, new Date(Date.now() + (2 - index) * 60_000)]);
      }
      const app = createApp(db);
      const recent = await request(app).get('/api/failures?limit=100');
      expect(recent.status).toBe(200);
      expect(recent.body.failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ event_id: eventIds[0], job_id: jobId }),
        expect.objectContaining({ event_id: eventIds[1], job_id: jobId }),
      ]));
      const attempts = await request(app).get(`/api/jobs/${jobId}/attempts`);
      expect(attempts.status).toBe(200);
      expect(attempts.body.attempts.map((event: { event_id: string }) => event.event_id))
        .toEqual(eventIds);
      expect(attempts.body.attempts[0].error).toEqual({
        category: 'TestError', message: 'test failure',
      });
    } finally {
      await db.query('DELETE FROM failure_events WHERE event_id = ANY($1::uuid[])', [eventIds]);
      await db.end();
    }
  },
);
