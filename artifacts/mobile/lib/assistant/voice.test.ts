import assert from 'node:assert';
import test from 'node:test';
import {
  containsWakePhrase,
  resolveRecognitionLocale,
  getVoiceErrorMessage,
  getNextVoiceLanguage,
  getVoiceLanguageLabel,
  VOICE_LANGUAGES,
  isDictationAvailable,
  isReadAloudAvailable,
} from './voice.ts';

test('recognition locale resolution handles exact, base, regional and incomplete provider locale lists', () => {
  assert.equal(resolveRecognitionLocale('bn-BD', ['bn-BD', 'en-US']), 'bn-BD');
  assert.equal(resolveRecognitionLocale('bn-BD', ['bn', 'en-US']), 'bn');
  assert.equal(resolveRecognitionLocale('bn-BD', ['bn-IN', 'en-US']), 'bn-IN');
  // Some Android providers return incomplete locale metadata. Try the language base
  // before reporting failure so the recognition service gets a chance to handle it.
  assert.equal(resolveRecognitionLocale('bn-BD', ['en-US', 'hi-IN']), 'bn');
  assert.equal(resolveRecognitionLocale('en-US', []), 'en-US');
});

test('wake phrases: English and Bangla aliases are recognized', () => {
  for (const phrase of [
    'Oi', 'oi please', 'ওহে', 'Badboy', 'ব্যাডবয়', 'JARVIS', 'জারভিস',
    'Oi Badboy, ki khobor?', 'ওহে ব্যাডবয়', 'Jarvis, status',
  ]) {
    assert.equal(containsWakePhrase(phrase), true, phrase);
  }
});

test('wake phrases match whole tokens, not substrings inside other words', () => {
  for (const phrase of [
    'boiling water', 'pointless', 'badboys', 'jarvison', 'hello world',
  ]) {
    assert.equal(containsWakePhrase(phrase), false, phrase);
  }
});

test('voice errors map permission, recognition, network and service failures to Bangla guidance', () => {
  const cases: Array<[string, RegExp]> = [
    ['denied', /অনুমতি পাওয়া যায়নি/],
    ['permission_denied', /অনুমতি পাওয়া যায়নি/],
    ['no-speech', /কথা শোনা যায়নি/],
    ['network', /ইন্টারনেট সংযোগ/],
    ['server', /ভয়েস রিকগনিশন সার্ভারে সংযোগ/],
    ['service-not-allowed', /অন্য ভাষা বেছে নিন/],
    ['language-not-supported', /অন্য ভাষা বেছে নিন/],
    ['busy', /Speech Recognition সার্ভিস ব্যস্ত|ভয়েস সার্ভিস ব্যস্ত/],
    ['client', /Speech Recognition সার্ভিস চালু হতে পারেনি/],
    ['audio-capture', /মাইক্রোফোন ডিভাইসটি পাওয়া যায়নি/],
    ['unsupported', /সমর্থিত নয়/],
    ['recognition-service-not-available', /Speech Services by Google/],
    ['start_failed', /Android-এর Speech Recognition চালু হয়নি/],
    ['unknown_error_code', /ভয়েস ইনপুটে সমস্যা হয়েছে/],
  ];
  for (const [error, expected] of cases) {
    assert.match(getVoiceErrorMessage(error), expected, error);
  }
});

test('availability checks return booleans without throwing in the test runtime', () => {
  assert.equal(typeof isDictationAvailable(), 'boolean');
  assert.equal(typeof isReadAloudAvailable(), 'boolean');
});

test('voice language catalogue includes Bengali and English plus international locales', () => {
  assert.ok(VOICE_LANGUAGES.length >= 50);
  assert.equal(VOICE_LANGUAGES[0].code, 'bn-BD');
  assert.ok(VOICE_LANGUAGES.some((language) => language.code === 'en-US'));
  assert.ok(VOICE_LANGUAGES.some((language) => language.code === 'hi-IN'));
  assert.equal(getVoiceLanguageLabel('bn-BD'), 'বাংলা (বাংলাদেশ)');
  assert.equal(getNextVoiceLanguage('bn-BD'), 'bn-IN');
  assert.equal(getNextVoiceLanguage('unknown-locale'), 'bn-BD');
});
