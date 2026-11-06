import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeveloperEngine } from './developerEngine';

test('Native engine is available without Copilot', () => {
  const result = resolveDeveloperEngine('native', false);
  assert.equal(result.status, 'ready');
  assert.equal(result.activeEngine, 'native');
});

test('Copilot engine reports unavailable until runtime is validated', () => {
  const result = resolveDeveloperEngine('copilot', false);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.activeEngine, null);
  assert.match(result.reason ?? '', /CLI runtime/);
});

test('Auto mode transparently falls back to Native and retains task context', () => {
  const result = resolveDeveloperEngine('auto', false);
  assert.equal(result.status, 'fallback');
  assert.equal(result.activeEngine, 'native');
  assert.match(result.reason ?? '', /Task prompt ও context অক্ষত/);
});

test('Auto mode selects Copilot only after runtime is available', () => {
  const result = resolveDeveloperEngine('auto', true);
  assert.equal(result.status, 'ready');
  assert.equal(result.activeEngine, 'copilot');
});
