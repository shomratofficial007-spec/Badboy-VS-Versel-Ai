import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVisibleScreenText, redactSensitiveScreenText } from './screenContextCore';

test('normalizes whitespace and removes repeated screen labels', () => {
  assert.equal(normalizeVisibleScreenText('  Home  \nHome\n  Settings   \n'), 'Home\nSettings');
});

test('redacts emails, phone/account numbers, card numbers and contextual OTP codes', () => {
  const result = normalizeVisibleScreenText([
    'Email: person@example.com',
    'Phone: +1 (415) 555-2671',
    'Card: 4111 1111 1111 1111',
    'OTP: 123456',
  ].join('\n'));
  assert.equal(result, [
    'Email: [email]',
    'Phone: [phone/account number]',
    'Card: [card number]',
    'OTP: [code]',
  ].join('\n'));
});

test('redacts credentials, authorization headers, cookies, JWTs and URL secrets', () => {
  const result = redactSensitiveScreenText([
    'Password: hunter2',
    'API Key: abcdef123456',
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
    'Cookie: session=private-value',
    'https://example.test/?access_token=private-token',
    'sk-123456789012345678901234',
    'github_pat_123456789012345678901234567890',
    '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi12345',
  ].join('\n'));
  assert.match(result, /Password: \[redacted\]/);
  assert.match(result, /API Key: \[redacted\]/);
  assert.match(result, /Authorization: Bearer \[redacted\]/);
  assert.match(result, /Cookie: \[redacted\]/);
  assert.match(result, /access_token=\[redacted\]/);
  assert.equal((result.match(/\[secret token\]/g) ?? []).length, 3);
  assert.doesNotMatch(result, /private-value|private-token|hunter2|123456789012345678901234|github_pat_123456789012345678901234567890|ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi12345/);
});

test('preserves dates and ordinary text while redacting long numeric identifiers', () => {
  const result = normalizeVisibleScreenText('Meeting: 2026-11-20 04:30\nReference: 123456789012');
  assert.match(result, /Meeting: 2026-11-20 04:30/);
  assert.match(result, /Reference: \[phone\/account number\]/);
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
  assert.equal(normalizeVisibleScreenText('Before\u007fAfter'), 'BeforeAfter');
});
