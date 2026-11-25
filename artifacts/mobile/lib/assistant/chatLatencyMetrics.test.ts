import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatLatencyTracker } from './chatLatencyMetrics';

test('chat latency tracker records first UI update once and total duration', () => {
  let now = 1_000;
  const metrics: Array<Record<string, unknown>> = [];
  const tracker = createChatLatencyTracker(900, (metric) => metrics.push(metric), () => now);

  now = 1_250;
  assert.equal(tracker.markFirstUiUpdate(), 350);
  now = 1_400;
  assert.equal(tracker.markFirstUiUpdate(), 350);
  tracker.markComplete();

  assert.deepEqual(metrics, [
    { event: 'first_ui_update', firstUiUpdateMs: 350 },
    { event: 'response_complete', totalResponseMs: 500, firstUiUpdateMs: 350 },
  ]);
});

test('chat latency tracker reports a response that completes without visible text', () => {
  let now = 2_000;
  const metrics: Array<Record<string, unknown>> = [];
  const tracker = createChatLatencyTracker(1_800, (metric) => metrics.push(metric), () => now);
  now = 2_600;
  tracker.markComplete();

  assert.deepEqual(metrics, [
    { event: 'response_complete', totalResponseMs: 800, firstUiUpdateMs: null },
  ]);
});
