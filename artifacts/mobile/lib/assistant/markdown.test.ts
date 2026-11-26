import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInlineMarkdown } from './markdown';

test('renders bold labels and headings without exposing Markdown delimiters', () => {
  assert.deepEqual(parseInlineMarkdown('**লেখা ও সম্পাদনা:** সাধারণ লেখা'), [
    { text: 'লেখা ও সম্পাদনা:', emphasis: 'bold' },
    { text: ' সাধারণ লেখা', emphasis: 'plain' },
  ]);
  assert.deepEqual(parseInlineMarkdown('**শিরোনাম**'), [
    { text: 'শিরোনাম', emphasis: 'bold' },
  ]);
});

test('supports italic and inline code while preserving surrounding text', () => {
  assert.deepEqual(parseInlineMarkdown('এটি *গুরুত্বপূর্ণ* এবং `const x = 1`'), [
    { text: 'এটি ', emphasis: 'plain' },
    { text: 'গুরুত্বপূর্ণ', emphasis: 'italic' },
    { text: ' এবং ', emphasis: 'plain' },
    { text: 'const x = 1', emphasis: 'code' },
  ]);
});

test('leaves unmatched Markdown markers untouched and preserves line breaks', () => {
  assert.deepEqual(parseInlineMarkdown('একটি **অসমাপ্ত লেখা\nপরের লাইন'), [
    { text: 'একটি **অসমাপ্ত লেখা\nপরের লাইন', emphasis: 'plain' },
  ]);
});
