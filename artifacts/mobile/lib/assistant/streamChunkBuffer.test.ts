import assert from 'node:assert/strict';
import test from 'node:test';
import { createStreamChunkBuffer } from './streamChunkBuffer';

test('stream chunks are coalesced into one update per animation frame', () => {
  const callbacks = new Map<number, () => void>();
  const flushed: string[] = [];
  const cancelled: number[] = [];
  let nextFrame = 0;
  const buffer = createStreamChunkBuffer(
    (chunk) => flushed.push(chunk),
    (callback) => {
      const id = ++nextFrame;
      callbacks.set(id, callback);
      return id;
    },
    (id) => {
      cancelled.push(id);
      callbacks.delete(id);
    },
  );

  buffer.push('first ');
  buffer.push('second ');
  buffer.push('third');
  assert.deepEqual(flushed, []);
  assert.equal(callbacks.size, 1);

  const [frameId, callback] = [...callbacks.entries()][0];
  callbacks.delete(frameId);
  callback();
  assert.deepEqual(flushed, ['first second third']);

  buffer.push('final chunk');
  buffer.flush();
  assert.deepEqual(flushed, ['first second third', 'final chunk']);
  assert.deepEqual(cancelled, [2]);
});

test('cancel discards pending chunks without flushing stale content', () => {
  const callbacks = new Map<number, () => void>();
  const flushed: string[] = [];
  const buffer = createStreamChunkBuffer(
    (chunk) => flushed.push(chunk),
    (callback) => {
      callbacks.set(1, callback);
      return 1;
    },
    (id) => callbacks.delete(id),
  );

  buffer.push('discard me');
  buffer.cancel();
  assert.deepEqual(flushed, []);
  assert.equal(callbacks.size, 0);
});
