import assert from 'node:assert/strict';
import test from 'node:test';
import { getTranscriptionLanguageCode } from './transcriptionLanguage.ts';

test('transcription language uses the selected locale base language', () => {
  assert.equal(getTranscriptionLanguageCode('bn-BD'), 'bn');
  assert.equal(getTranscriptionLanguageCode('bn-IN'), 'bn');
  assert.equal(getTranscriptionLanguageCode('en-US'), 'en');
  assert.equal(getTranscriptionLanguageCode('hi-IN'), 'hi');
  assert.equal(getTranscriptionLanguageCode('ur_PK'), 'ur');
  assert.equal(getTranscriptionLanguageCode('fr-FR'), 'fr');
});

test('transcription language trims and normalizes case', () => {
  assert.equal(getTranscriptionLanguageCode('  BN-bd '), 'bn');
  assert.equal(getTranscriptionLanguageCode(' EN '), 'en');
});

test('invalid or unsupported locale strings safely fall back to English', () => {
  assert.equal(getTranscriptionLanguageCode(''), 'en');
  assert.equal(getTranscriptionLanguageCode('unknown-locale'), 'en');
  assert.equal(getTranscriptionLanguageCode('123-US'), 'en');
});
