import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { jobAttempts, listFailures, type Failure } from '../src/api';

const failure: Failure = {
  event_id: '7b04e927-22b5-4a2b-b176-25244236ea5f', job_id: 'job-1',
  attempt: 1, service: 'mailer', queue: 'email.delivery',
  occurred_at: '2026-10-24T12:00:00.000Z', stored_at: '2026-10-24T12:01:00.000Z',
  error: { category: 'ConnectionError', message: 'SMTP unavailable' },
  metadata: { provider: 'internal-smtp' },
};

afterEach(() => vi.unstubAllGlobals());

function render(failures?: Failure[]) {
  const client = new QueryClient();
  if (failures) client.setQueryData(['failures'], failures);
  return renderToString(<QueryClientProvider client={client}><App /></QueryClientProvider>);
}

it('shows loading before the first API response', () => {
  expect(render()).toContain('Loading failures');
});

it('shows an honest empty state without a sample event', () => {
  const html = render([]);
  expect(html).toContain('No failures reported yet');
  expect(html).not.toContain('SMTP unavailable');
});

it('renders only records supplied by the API', () => {
  const html = render([failure]);
  expect(html).toContain('SMTP unavailable');
  expect(html).toContain('mailer');
  expect(html.replace(/<!--.*?-->/g, '')).toContain('Attempt 1 failed');
});

it('requests the real list and URL-encodes job identifiers', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ failures: [failure] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ attempts: [failure] }) });
  vi.stubGlobal('fetch', fetchMock);
  expect(await listFailures()).toEqual([failure]);
  expect(await jobAttempts('job/1')).toEqual([failure]);
  expect(fetchMock.mock.calls[0][0]).toBe('/api/failures?limit=100');
  expect(fetchMock.mock.calls[1][0]).toBe('/api/jobs/job%2F1/attempts');
});

it('reports API errors instead of substituting dummy data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(listFailures()).rejects.toThrow('temporarily unavailable');
});
