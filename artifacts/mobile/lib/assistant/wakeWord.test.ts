import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createWakeWordBridge,
  type WakeWordEvent,
  type WakeWordStatus,
} from './wakeWord';

const stopped: WakeWordStatus = { state: 'stopped', enabled: false, modelLoaded: false };
const listening: WakeWordStatus = { state: 'listening', enabled: true, modelLoaded: true };
const detected: WakeWordEvent = { phrase: 'hey-badboy', confidence: 0.94, timestamp: 1234 };

function harness(platformOS = 'android', available = true) {
  const calls: Array<{ method: string; value?: unknown }> = [];
  const listeners = new Map<string, (value: never) => void>();
  let removed = false;
  const native = {
    isSupported: () => { calls.push({ method: 'isSupported' }); return true; },
    getStatus: async () => { calls.push({ method: 'getStatus' }); return listening; },
    start: async (options?: { threshold?: number }) => { calls.push({ method: 'start', value: options }); return listening; },
    stop: async () => { calls.push({ method: 'stop' }); return stopped; },
  };
  const bridge = createWakeWordBridge({
    platformOS: () => platformOS,
    loadNativeModule: () => {
      calls.push({ method: 'loadNativeModule' });
      if (!available) throw new Error('native module missing');
      return native;
    },
    createEmitter: () => ({
      addListener: (event, listener) => {
        listeners.set(event, listener);
        calls.push({ method: 'addListener', value: event });
        return { remove: () => { removed = true; } };
      },
    }),
  });
  return { bridge, calls, listeners, wasRemoved: () => removed };
}

test('unsupported platform returns safe status and no-op subscription', async () => {
  const { bridge } = harness('ios');
  assert.equal(bridge.isOfflineWakeWordSupported(), false);
  assert.deepEqual(await bridge.getOfflineWakeWordStatus(), {
    ...stopped,
    message: 'Offline wake word is not installed in this app build.',
  });
  assert.deepEqual(await bridge.stopOfflineWakeWord(), {
    ...stopped,
    message: 'Offline wake word is not installed in this app build.',
  });
  let called = false;
  const subscription = bridge.subscribeToWakeWordStatus(() => { called = true; });
  subscription.remove();
  assert.equal(called, false);
  await assert.rejects(bridge.startOfflineWakeWord(), /unavailable in this app build/);
});

test('missing native module fails closed without throwing from support/status/stop checks', async () => {
  const { bridge } = harness('android', false);
  assert.equal(bridge.isOfflineWakeWordSupported(), false);
  assert.equal((await bridge.getOfflineWakeWordStatus()).enabled, false);
  assert.equal((await bridge.stopOfflineWakeWord()).state, 'stopped');
  await assert.rejects(bridge.startOfflineWakeWord(), /unavailable in this app build/);
});

test('native support, status, start defaults and explicit threshold are forwarded', async () => {
  const { bridge, calls } = harness();
  assert.equal(bridge.isOfflineWakeWordSupported(), true);
  assert.deepEqual(await bridge.getOfflineWakeWordStatus(), listening);
  assert.deepEqual(await bridge.startOfflineWakeWord(), listening);
  assert.deepEqual(await bridge.startOfflineWakeWord(0.72), listening);
  assert.deepEqual(calls.filter((call) => call.method === 'start').map((call) => call.value), [undefined, { threshold: 0.72 }]);
  assert.deepEqual(await bridge.stopOfflineWakeWord(), stopped);
});

test('threshold rejects zero, one, out-of-range and non-finite values before native start', async () => {
  const { bridge, calls } = harness();
  for (const threshold of [0, 1, -0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(bridge.startOfflineWakeWord(threshold), RangeError);
  }
  assert.equal(calls.some((call) => call.method === 'start'), false);
});

test('native status subscription forwards events and exposes cleanup', () => {
  const { bridge, listeners, wasRemoved } = harness();
  let received: WakeWordStatus | undefined;
  const subscription = bridge.subscribeToWakeWordStatus((status) => { received = status; });
  listeners.get('onWakeWordStatus')?.(listening as never);
  assert.deepEqual(received, listening);
  subscription.remove();
  assert.equal(wasRemoved(), true);
});

test('wake event subscription accepts only the exact Hey Badboy phrase', () => {
  const { bridge, listeners } = harness();
  const received: WakeWordEvent[] = [];
  bridge.subscribeToWakeWord((event) => received.push(event));
  const listener = listeners.get('onWakeWordDetected');
  listener?.({ ...detected, phrase: 'other' } as never);
  listener?.(detected as never);
  assert.deepEqual(received, [detected]);
});
