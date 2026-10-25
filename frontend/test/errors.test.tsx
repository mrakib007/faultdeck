// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows an actionable error instead of sample failures when the API is down', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  expect(screen.getByText('Loading failures…')).toBeTruthy();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    expect.stringContaining('temporarily unavailable'));
  expect(screen.getByText('Try again')).toBeTruthy();
  expect(screen.queryByText('No failures reported yet')).toBeNull();
  client.clear();
});
