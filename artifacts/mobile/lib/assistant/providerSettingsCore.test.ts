import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderBaseUrl, parseProviderModelIds } from './providerSettingsCore';

test('provider base URLs require HTTPS and strip trailing slashes', () => {
  assert.equal(normalizeProviderBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.throws(() => normalizeProviderBaseUrl('http://api.example.com/v1'), /HTTPS/);
  assert.throws(() => normalizeProviderBaseUrl('http://localhost:8787/v1'), /HTTPS/);
  assert.throws(() => normalizeProviderBaseUrl('https://localhost/v1'), /public HTTPS hostname/);
  assert.throws(() => normalizeProviderBaseUrl('https://127.0.0.1/v1'), /public HTTPS hostname/);
  assert.throws(() => normalizeProviderBaseUrl('https://user:pass@api.example.com/v1'), /username/);
});

test('provider model parser filters invalid IDs, removes duplicates and caps output', () => {
  const ids = parseProviderModelIds({
    data: [
      { id: 'gpt-4o-mini' },
      { id: 'gpt-4o-mini' },
      { id: 'gemini/2.5-flash' },
      { id: 'invalid model id' },
      { id: 42 },
      null,
    ],
  });
  assert.deepEqual(ids, ['gemini/2.5-flash', 'gpt-4o-mini']);
  assert.throws(() => parseProviderModelIds({ models: [] }), /OpenAI-compatible/);
});
