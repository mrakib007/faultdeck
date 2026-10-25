export type Failure = {
  event_id: string;
  job_id: string;
  attempt: number;
  service: string;
  queue: string;
  occurred_at: string;
  error: { category: string; message: string };
  metadata: Record<string, string | number | boolean>;
  stored_at: string;
};

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(response.status === 503
      ? 'The failure database is temporarily unavailable.'
      : `The API returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export async function listFailures(signal?: AbortSignal): Promise<Failure[]> {
  const result = await getJson<{ failures: Failure[] }>('/api/failures?limit=100', signal);
  if (!Array.isArray(result.failures)) throw new Error('Unexpected failure list from the API.');
  return result.failures;
}

export async function jobAttempts(jobId: string, signal?: AbortSignal): Promise<Failure[]> {
  const result = await getJson<{ attempts: Failure[] }>(
    `/api/jobs/${encodeURIComponent(jobId)}/attempts`, signal,
  );
  if (!Array.isArray(result.attempts)) throw new Error('Unexpected attempt history from the API.');
  return result.attempts;
}
