export type Status = 'open' | 'retrying' | 'resolved';

export type Attempt = {
  number: number;
  time: string;
  result: string;
  detail: string;
  outcome: 'failed' | 'queued' | 'succeeded';
};

export type Incident = {
  id: string;
  title: string;
  service: string;
  queue: string;
  status: Status;
  count: number;
  lastSeen: string;
  firstSeen: string;
  jobId: string;
  error: string;
  metadata: Record<string, string | number>;
  attempts: Attempt[];
};

// Local, deterministic demo data. No broker or API connection is implied.
export const incidents: Incident[] = [
  {
    id: 'FD-1042', title: 'Connection refused to smtp.internal', service: 'mailer',
    queue: 'email.delivery', status: 'open', count: 18, lastSeen: '11:42:08',
    firstSeen: '10:14:32', jobId: 'job_8f2c91e4',
    error: 'dial tcp 10.0.2.18:587: connect: connection refused',
    metadata: { provider: 'internal-smtp', template: 'payment-receipt', region: 'eu-west-1' },
    attempts: [
      { number: 3, time: '11:42:08', result: 'Delivery failed', detail: 'Connection refused · 1.2s', outcome: 'failed' },
      { number: 2, time: '11:37:04', result: 'Delivery failed', detail: 'Connection refused · 1.1s', outcome: 'failed' },
      { number: 1, time: '11:32:01', result: 'Delivery failed', detail: 'Connection timed out · 30.0s', outcome: 'failed' },
    ],
  },
  {
    id: 'FD-1041', title: 'Webhook endpoint returned 503', service: 'webhooks',
    queue: 'webhook.dispatch', status: 'retrying', count: 12, lastSeen: '11:38:21',
    firstSeen: '09:52:10', jobId: 'job_6d09b73a',
    error: 'upstream responded with HTTP 503 Service Unavailable',
    metadata: { endpoint: 'https://example.test/hooks', event_type: 'order.created', timeout_ms: 5000 },
    attempts: [
      { number: 3, time: '11:38:21', result: 'Retry scheduled', detail: 'Next attempt pending', outcome: 'queued' },
      { number: 2, time: '11:33:21', result: 'Request failed', detail: 'HTTP 503 · 842ms', outcome: 'failed' },
      { number: 1, time: '11:28:18', result: 'Request failed', detail: 'HTTP 503 · 790ms', outcome: 'failed' },
    ],
  },
  {
    id: 'FD-1040', title: 'Invalid payload: missing account_id', service: 'billing',
    queue: 'invoice.generate', status: 'open', count: 7, lastSeen: '11:24:56',
    firstSeen: '08:21:02', jobId: 'job_0e47a1fd',
    error: 'ValidationError: required field "account_id" was not provided',
    metadata: { invoice_type: 'recurring', schema_version: 2 },
    attempts: [
      { number: 2, time: '11:24:56', result: 'Validation failed', detail: 'Missing required field', outcome: 'failed' },
      { number: 1, time: '11:19:54', result: 'Validation failed', detail: 'Missing required field', outcome: 'failed' },
    ],
  },
  {
    id: 'FD-1039', title: 'Database connection pool exhausted', service: 'billing',
    queue: 'payment.reconcile', status: 'resolved', count: 24, lastSeen: '10:58:13',
    firstSeen: '07:48:31', jobId: 'job_5b26d81c',
    error: 'timeout acquiring connection from pool after 10000ms',
    metadata: { pool_size: 20, operation: 'reconcile', region: 'us-east-1' },
    attempts: [
      { number: 3, time: '10:58:13', result: 'Completed', detail: 'Processed in 1.8s', outcome: 'succeeded' },
      { number: 2, time: '10:53:10', result: 'Pool timeout', detail: 'Waited 10.0s', outcome: 'failed' },
      { number: 1, time: '10:48:05', result: 'Pool timeout', detail: 'Waited 10.0s', outcome: 'failed' },
    ],
  },
  {
    id: 'FD-1038', title: 'Object storage upload timed out', service: 'media',
    queue: 'media.process', status: 'retrying', count: 5, lastSeen: '10:36:44',
    firstSeen: '10:05:17', jobId: 'job_91fa3c02',
    error: 'upload deadline exceeded after 30000ms',
    metadata: { bucket: 'uploads', file_type: 'image/png', size_bytes: 2048128 },
    attempts: [
      { number: 2, time: '10:36:44', result: 'Retry scheduled', detail: 'Next attempt pending', outcome: 'queued' },
      { number: 1, time: '10:31:41', result: 'Upload failed', detail: 'Deadline exceeded', outcome: 'failed' },
    ],
  },
  {
    id: 'FD-1037', title: 'Rate limit exceeded by upstream API', service: 'webhooks',
    queue: 'webhook.dispatch', status: 'resolved', count: 9, lastSeen: '09:12:07',
    firstSeen: '08:58:00', jobId: 'job_3c78e612',
    error: 'upstream responded with HTTP 429 Too Many Requests',
    metadata: { endpoint: 'https://example.test/hooks', event_type: 'user.updated' },
    attempts: [
      { number: 2, time: '09:12:07', result: 'Completed', detail: 'HTTP 200 · 322ms', outcome: 'succeeded' },
      { number: 1, time: '09:07:04', result: 'Rate limited', detail: 'HTTP 429 · 150ms', outcome: 'failed' },
    ],
  },
];
