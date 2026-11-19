import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUpstreamAbortSignal } from './upstreamAbort.ts';

test('upstream timeout aborts the provider signal and records timeout cause', async () => {
  const request = new Request('https://example.test/api/assistant/chat');
  const upstream = createUpstreamAbortSignal(request, 5);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(upstream.signal.aborted, true);
  assert.equal(upstream.wasTimedOut(), true);
  upstream.cleanup();
});

test('client disconnect propagates to the upstream signal without marking a timeout', () => {
  const client = new AbortController();
  const request = new Request('https://example.test/api/assistant/chat', { signal: client.signal });
  const upstream = createUpstreamAbortSignal(request, 1000);
  client.abort(new Error('client disconnected'));
  assert.equal(upstream.signal.aborted, true);
  assert.equal(upstream.wasTimedOut(), false);
  upstream.cleanup();
});

test('explicit downstream cancellation aborts the upstream signal without marking a timeout', () => {
  const request = new Request('https://example.test/api/assistant/chat');
  const upstream = createUpstreamAbortSignal(request, 1000);
  upstream.abort(new Error('downstream cancelled'));
  assert.equal(upstream.signal.aborted, true);
  assert.equal(upstream.wasTimedOut(), false);
  upstream.cleanup();
});
