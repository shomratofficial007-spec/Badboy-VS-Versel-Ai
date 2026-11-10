import assert from 'node:assert';
import test from 'node:test';
import {
  containsWakePhrase,
  getVoiceErrorMessage,
  getNextVoiceLanguage,
  getVoiceLanguageLabel,
  VOICE_LANGUAGES,
  isDictationAvailable,
  isReadAloudAvailable,
  getSpeechPlaybackTimeoutMs,
  dictateOnce,
  checkMicrophonePermission,
  getAvailableSpeechVoices,
  shouldStopVoiceRecordingForSilence,
  shouldFinalizeStoppedVoiceRecording,
  updateVoiceRecordingLifecycle,
  VOICE_SILENCE_DURATION_MS,
} from './voice.ts';

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
    ['network', /Error code: network/],
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

test('speech playback watchdog scales with reply length and stays bounded', () => {
  assert.equal(getSpeechPlaybackTimeoutMs(0), 45_000);
  assert.equal(getSpeechPlaybackTimeoutMs(100), 45_000);
  assert.equal(getSpeechPlaybackTimeoutMs(1_000), 100_000);
  assert.equal(getSpeechPlaybackTimeoutMs(4_000), 240_000);
  assert.equal(getSpeechPlaybackTimeoutMs(Number.NaN), 45_000);
});


test('voice recording auto-stop requires speech followed by sustained silence', () => {
  const lastSpeechAt = 10000;
  assert.equal(shouldStopVoiceRecordingForSilence(-60, false, lastSpeechAt, 20000), false);
  assert.equal(shouldStopVoiceRecordingForSilence(-30, true, lastSpeechAt, 20000), false);
  assert.equal(shouldStopVoiceRecordingForSilence(-60, true, lastSpeechAt, lastSpeechAt + VOICE_SILENCE_DURATION_MS - 1), false);
  assert.equal(shouldStopVoiceRecordingForSilence(-60, true, lastSpeechAt, lastSpeechAt + VOICE_SILENCE_DURATION_MS), true);
  assert.equal(shouldStopVoiceRecordingForSilence(undefined, true, lastSpeechAt, 20000), false);
});

test('voice recording finalizes only after an active recorder stops at its hard duration limit', () => {
  assert.equal(shouldFinalizeStoppedVoiceRecording(false, false, false, 100), false);
  assert.equal(shouldFinalizeStoppedVoiceRecording(true, true, false, 100), false);
  assert.equal(shouldFinalizeStoppedVoiceRecording(true, false, true, 100), false);
  assert.equal(shouldFinalizeStoppedVoiceRecording(true, false, false, 0), false);
  assert.equal(shouldFinalizeStoppedVoiceRecording(true, false, false, 100), true);
});

test('voice recorder lifecycle finalizes once after an observed recording stops', () => {
  const activity = { current: 0 };
  let finalized = 0;
  assert.equal(updateVoiceRecordingLifecycle(false, true, false, false, activity, 100, () => finalized++), false);
  assert.equal(finalized, 0);
  assert.equal(updateVoiceRecordingLifecycle(false, true, false, true, activity, 200, () => finalized++), true);
  assert.equal(activity.current, 200);
  assert.equal(updateVoiceRecordingLifecycle(false, true, false, false, activity, 300, () => finalized++), false);
  assert.equal(activity.current, 200);
  assert.equal(finalized, 1);
});

test('voice recorder lifecycle ignores web, idle, and in-flight states', () => {
  const activity = { current: 0 };
  let finalized = 0;
  assert.equal(updateVoiceRecordingLifecycle(true, true, false, false, activity, 100, () => finalized++), false);
  assert.equal(updateVoiceRecordingLifecycle(false, false, false, true, activity, 100, () => finalized++), false);
  assert.equal(updateVoiceRecordingLifecycle(false, true, true, false, activity, 100, () => finalized++), false);
  assert.equal(finalized, 0);
});

test('dictation reports unsupported when no browser recognizer or native provider is available', () => {
  const originalWindow = globalThis.window;
  Reflect.deleteProperty(globalThis, 'window');
  const errors: string[] = [];
  let done = 0;
  try {
    const cancel = dictateOnce({
      onTranscript: () => assert.fail('unsupported dictation must not emit a transcript'),
      onError: (error) => errors.push(error ?? ''),
      onDone: () => { done += 1; },
    });
    assert.deepEqual(errors, ['unsupported']);
    assert.equal(done, 1);
    cancel();
    assert.equal(done, 1, 'completion callback is emitted exactly once');
  } finally {
    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: originalWindow });
    }
  }
});

test('permission and installed-voice helpers return safe fallbacks in a headless runtime', async () => {
  assert.equal(await checkMicrophonePermission(), 'unsupported');
  assert.deepEqual(await getAvailableSpeechVoices(), []);
});

test('Web Speech API streams interim/final transcripts, detects Hey Badboy and finishes once', () => {
  const originalWindow = globalThis.window;
  let instance: any;
  class FakeRecognition {
    lang = '';
    interimResults = false;
    maxAlternatives = 0;
    onresult: any = null;
    onerror: any = null;
    onend: any = null;
    onstart: any = null;
    started = false;
    stopped = false;
    aborted = false;
    start() { this.started = true; }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
    constructor() { instance = this; }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true, writable: true,
    value: { SpeechRecognition: FakeRecognition, isSecureContext: true },
  });
  const transcripts: Array<[string, boolean]> = [];
  const errors: string[] = [];
  let wakeCount = 0;
  let doneCount = 0;
  try {
    const cancel = dictateOnce({
      lang: 'bn-BD',
      onTranscript: (text, final) => transcripts.push([text, final]),
      onWakeWordDetected: () => { wakeCount += 1; },
      onError: (error) => errors.push(error ?? ''),
      onDone: () => { doneCount += 1; },
    });
    assert.equal(instance.started, true);
    assert.equal(instance.lang, 'bn-BD');
    instance.onresult({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: 'Hey Badboy' } }],
    });
    instance.onresult({
      resultIndex: 0,
      results: [{ isFinal: true, length: 1, 0: { transcript: 'Hey Badboy, কেমন আছো?' } }],
    });
    assert.deepEqual(transcripts, [
      ['Hey Badboy', false],
      ['Hey Badboy, কেমন আছো?', true],
    ]);
    assert.equal(wakeCount, 2);
    assert.equal(instance.stopped, true);
    assert.equal(doneCount, 1);
    instance.onend();
    cancel();
    assert.equal(doneCount, 1);
    assert.equal(instance.aborted, true);
    assert.deepEqual(errors, []);
  } finally {
    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: originalWindow });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('Web Speech API suppresses benign post-transcript silence and reports real errors', () => {
  const originalWindow = globalThis.window;
  let instance: any;
  class FakeRecognition {
    lang = '';
    interimResults = false;
    maxAlternatives = 0;
    onresult: any = null;
    onerror: any = null;
    onend: any = null;
    start() {}
    stop() {}
    abort() {}
    constructor() { instance = this; }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true, writable: true,
    value: { SpeechRecognition: FakeRecognition, isSecureContext: false },
  });
  try {
    const errors: string[] = [];
    let done = 0;
    dictateOnce({
      onTranscript: () => {},
      onError: (error) => errors.push(error ?? ''),
      onDone: () => { done += 1; },
    });
    instance.onresult({
      resultIndex: 0,
      results: [{ isFinal: false, length: 1, 0: { transcript: 'hello' } }],
    });
    instance.onerror({ error: 'no-speech' });
    assert.deepEqual(errors, []);
    assert.equal(done, 1);

    let secondInstance: any;
    class ErrorRecognition extends FakeRecognition {
      constructor() { super(); secondInstance = this; }
    }
    (globalThis as any).window.SpeechRecognition = ErrorRecognition;
    const secondErrors: string[] = [];
    let secondDone = 0;
    dictateOnce({
      onTranscript: () => {},
      onError: (error) => secondErrors.push(error ?? ''),
      onDone: () => { secondDone += 1; },
    });
    secondInstance.onerror({ error: 'network' });
    assert.deepEqual(secondErrors, ['network']);
    assert.equal(secondDone, 1);
  } finally {
    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: originalWindow });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('Web Speech API startup exceptions are converted to start_failed and completion', () => {
  const originalWindow = globalThis.window;
  class BrokenRecognition {
    lang = '';
    interimResults = false;
    maxAlternatives = 0;
    onresult: any = null;
    onerror: any = null;
    onend: any = null;
    start() { throw new Error('recognizer startup failed'); }
    stop() {}
    abort() {}
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true, writable: true,
    value: { SpeechRecognition: BrokenRecognition, isSecureContext: true },
  });
  try {
    const errors: string[] = [];
    let done = 0;
    dictateOnce({
      onTranscript: () => {},
      onError: (error) => errors.push(error ?? ''),
      onDone: () => { done += 1; },
    });
    assert.deepEqual(errors, ['start_failed']);
    assert.equal(done, 1);
  } finally {
    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: originalWindow });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});
