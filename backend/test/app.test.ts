import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type FailureReader } from '../src/app.js';

const row = {
  event_id: '7b04e927-22b5-4a2b-b176-25244236ea5f',
  job_id: 'job-1',
  attempt: 1,
  service: 'mailer',
  queue: 'email.delivery',
  occurred_at: new Date('2026-10-24T12:00:00Z'),
  error_category: 'ConnectionError',
  error_message: 'SMTP unavailable',
  metadata: { provider: 'internal-smtp' },
  stored_at: new Date('2026-10-24T12:01:00Z'),
};

describe('read API', () => {
  it('keeps the health endpoint', async () => {
    const db: FailureReader = { query: vi.fn() };
    const response = await request(createApp(db)).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists recent failures with a bounded, parameterized limit', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const response = await request(createApp({ query })).get('/api/failures?limit=3');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ failures: [{
      event_id: row.event_id, job_id: row.job_id, attempt: 1, service: 'mailer',
      queue: 'email.delivery', occurred_at: '2026-10-24T12:00:00.000Z',
      error: { category: 'ConnectionError', message: 'SMTP unavailable' },
      metadata: { provider: 'internal-smtp' }, stored_at: '2026-10-24T12:01:00.000Z',
    }] });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY occurred_at DESC'), [3]);
  });

  it('defaults to 20, and returns an empty list without failures', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const response = await request(createApp({ query })).get('/api/failures');
    expect(response.body).toEqual({ failures: [] });
    expect(query).toHaveBeenCalledWith(expect.any(String), [20]);
  });

  it.each(['0', '-1', '101', '1.5', 'abc', '1&limit=2'])('rejects invalid limit %s', async (limit) => {
    const db: FailureReader = { query: vi.fn() };
    const response = await request(createApp(db)).get(`/api/failures?limit=${limit}`);
    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists the failed attempts for a job using a bound identifier', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const response = await request(createApp({ query })).get('/api/jobs/job-1/attempts');
    expect(response.status).toBe(200);
    expect(response.body.job_id).toBe('job-1');
    expect(response.body.attempts).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY attempt ASC'), ['job-1']);
  });

  it('returns 404 for a job with no failed attempts', async () => {
    const response = await request(createApp({ query: vi.fn().mockResolvedValue({ rows: [] }) }))
      .get('/api/jobs/missing/attempts');
    expect(response.status).toBe(404);
  });

  it('rejects excessively long job IDs without querying the database', async () => {
    const db: FailureReader = { query: vi.fn() };
    const response = await request(createApp(db)).get(`/api/jobs/${'x'.repeat(201)}/attempts`);
    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns a safe error when PostgreSQL is unavailable', async () => {
    const db: FailureReader = { query: vi.fn().mockRejectedValue(new Error('database credentials are secret')) };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const list = await request(createApp(db)).get('/api/failures');
      const attempts = await request(createApp(db)).get('/api/jobs/job-1/attempts');
      expect(list.status).toBe(503);
      expect(attempts.status).toBe(503);
      expect(JSON.stringify([list.body, attempts.body])).not.toContain('database credentials');
    } finally {
      log.mockRestore();
    }
  });
});
