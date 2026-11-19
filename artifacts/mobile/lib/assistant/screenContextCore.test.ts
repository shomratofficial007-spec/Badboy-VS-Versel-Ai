import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVisibleScreenText } from './screenContextCore';

test('normalizes whitespace and removes repeated screen labels', () => {
  assert.equal(normalizeVisibleScreenText('  Home  \nHome\n  Settings   \n'), 'Home\nSettings');
});

test('removes control characters and bounds screen context', () => {
  const normalized = normalizeVisibleScreenText('A\u0000B\n' + 'x'.repeat(5_000));
  assert.ok(!normalized.includes('\u0000'));
  assert.ok(normalized.length <= 4_500);
  assert.ok(normalized.startsWith('AB'));
});

test('returns an empty string for empty screen content', () => {
  assert.equal(normalizeVisibleScreenText(' \n \t '), '');
});

test('rejects non-string values at the runtime boundary and removes DEL controls', () => {
  assert.equal(normalizeVisibleScreenText(42 as unknown as string), '');
  assert.equal(normalizeVisibleScreenText('Before\\u007fAfter'), 'BeforeAfter');
});
