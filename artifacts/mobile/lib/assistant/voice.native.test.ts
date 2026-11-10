import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const listeners = new Map<string, (event: any) => void>();
const calls: Array<{ name: string; value?: any }> = [];
let supportedLocales: string[] = ['en-US', 'bn'];
let permissionGranted = true;
let localeError: Error | null = null;
let permissionError: Error | null = null;
let voiceError: Error | null = null;
let nativeTtsOptions: any = null;
let nativeTtsText = '';
let nativeStopCount = 0;

const nativeModule = {
  isRecognitionAvailable: () => true,
  getPermissionsAsync: async () => {
    if (permissionError) throw permissionError;
    return { status: permissionGranted ? 'granted' : 'denied' };
  },
  getSupportedLocales: async () => {
    if (localeError) throw localeError;
    return { locales: supportedLocales };
  },
  requestPermissionsAsync: async () => ({ granted: permissionGranted }),
  addListener: (event: string, listener: (payload: any) => void) => {
    listeners.set(event, listener);
    calls.push({ name: 'addListener', value: event });
    return { remove: () => { calls.push({ name: 'removeListener', value: event }); listeners.delete(event); } };
  },
  start: (options: unknown) => { calls.push({ name: 'start', value: options }); },
  stop: () => { calls.push({ name: 'stop' }); },
  abort: () => { calls.push({ name: 'abort' }); },
  getAvailableVoicesAsync: async () => {
    if (voiceError) throw voiceError;
    return [
      { identifier: 'voice-b', name: 'Beta', language: 'bn-BD' },
      { identifier: 'voice-a', name: '', language: 'bn-IN' },
      { identifier: 'invalid', name: 'Invalid', language: 12 },
    ];
  },
};
mock.module('react-native', { namedExports: { Platform: { OS: 'android' } } });
mock.module('expo-speech-recognition', {
  namedExports: { ExpoSpeechRecognitionModule: nativeModule },
});
mock.module('expo-speech', {
  namedExports: {
    getAvailableVoicesAsync: nativeModule.getAvailableVoicesAsync,
    speak: (text: string, options: any) => { nativeTtsText = text; nativeTtsOptions = options; },
    stop: () => { nativeStopCount += 1; },
  },
});
mock.module('./api', {
  namedExports: {
    requestSpeech: async () => { throw new Error('No verified cloud TTS voice for this locale.'); },
  },
});
const voicePromise = import('./voice');

function reset() {
  listeners.clear();
  calls.length = 0;
  supportedLocales = ['en-US', 'bn'];
  permissionGranted = true;
  localeError = null;
  permissionError = null;
  voiceError = null;
  nativeTtsOptions = null;
  nativeTtsText = '';
  nativeStopCount = 0;
}
async function flush() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

test('native Android dictation selects a compatible locale, requests permission and streams results', async () => {
  reset();
  const voice = await voicePromise;
  assert.equal(voice.isDictationAvailable(), true);
  assert.equal(await voice.checkMicrophonePermission(), 'granted');
  const transcripts: Array<[string, boolean]> = [];
  const errors: string[] = [];
  let done = 0;
  const cancel = voice.dictateOnce({
    lang: 'bn-BD',
    onTranscript: (text, final) => transcripts.push([text, final]),
    onError: (error) => errors.push(error ?? ''),
    onDone: () => { done += 1; },
  });
  await flush();
  assert.deepEqual(calls.find((call) => call.name === 'start')?.value, {
    lang: 'bn',
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
  });
  listeners.get('result')?.({ results: [{ transcript: 'তুমি কেমন আছো?' }], isFinal: true });
  assert.deepEqual(transcripts, [['তুমি কেমন আছো?', true]]);
  assert.equal(done, 1);
  assert.deepEqual(errors, []);
  cancel();
  assert.ok(calls.some((call) => call.name === 'removeListener'));
});

test('native dictation reports unsupported locale and denied permission safely', async () => {
  reset();
  const voice = await voicePromise;
  supportedLocales = ['fr-FR'];
  const localeErrors: string[] = [];
  let localeDone = 0;
  voice.dictateOnce({
    lang: 'bn-BD', onTranscript: () => {},
    onError: (error) => localeErrors.push(error ?? ''),
    onDone: () => { localeDone += 1; },
  });
  await flush();
  assert.deepEqual(localeErrors, ['language-not-supported']);
  assert.equal(localeDone, 1);
  assert.equal(calls.some((call) => call.name === 'start'), false);

  reset();
  permissionGranted = false;
  const permissionErrors: string[] = [];
  let permissionDone = 0;
  voice.dictateOnce({
    lang: 'bn-BD', onTranscript: () => {},
    onError: (error) => permissionErrors.push(error ?? ''),
    onDone: () => { permissionDone += 1; },
  });
  await flush();
  assert.deepEqual(permissionErrors, ['permission-denied']);
  assert.equal(permissionDone, 1);
  assert.equal(calls.some((call) => call.name === 'start'), false);
});

test('native locale and permission provider failures fall back or report unsupported status', async () => {
  reset();
  const voice = await voicePromise;
  localeError = new Error('locale API missing');
  const errors: string[] = [];
  const cancel = voice.dictateOnce({ lang: 'bn-BD', onTranscript: () => {}, onError: (error) => errors.push(error ?? '') });
  await flush();
  assert.ok(calls.some((call) => call.name === 'start'));
  assert.deepEqual(errors, []);
  cancel();

  permissionError = new Error('permission provider missing');
  assert.equal(await voice.checkMicrophonePermission(), 'unsupported');
});

test('native available voice catalogue filters invalid entries, fills names and sorts', async () => {
  reset();
  const voice = await voicePromise;
  assert.deepEqual(await voice.getAvailableSpeechVoices(), [
    { identifier: 'voice-b', name: 'Beta', language: 'bn-BD' },
    { identifier: 'voice-a', name: 'voice-a', language: 'bn-IN' },
  ]);
  voiceError = new Error('voice provider failed');
  assert.deepEqual(await voice.getAvailableSpeechVoices(), []);
});

test('native TTS honors the selected installed voice and reports playback lifecycle', async () => {
  reset();
  const voice = await voicePromise;
  const events: string[] = [];
  assert.equal(voice.speak('  হ্যালো Badboy  ', 'bn-BD', {
    onStart: () => events.push('start'),
    onDone: () => events.push('done'),
    onError: () => events.push('error'),
  }, 'bn-installed-voice'), true);
  assert.equal(nativeTtsText, 'হ্যালো Badboy');
  assert.equal(nativeTtsOptions.language, 'bn-BD');
  assert.equal(nativeTtsOptions.voice, 'bn-installed-voice');
  assert.equal(nativeTtsOptions.pitch, 1);
  assert.equal(nativeTtsOptions.rate, 1);
  nativeTtsOptions.onStart();
  nativeTtsOptions.onDone();
  assert.deepEqual(events, ['start', 'done']);
  assert.ok(nativeStopCount >= 1);
});

test('native TTS rejects blank text and stopSpeaking safely stops the provider', async () => {
  reset();
  const voice = await voicePromise;
  const errors: string[] = [];
  assert.equal(voice.speak('   ', 'bn-BD', {
    onError: (error) => errors.push(String(error)),
  }), false);
  assert.match(errors[0], /পড়ে শোনানোর মতো কোনো লেখা নেই/);
  voice.stopSpeaking();
  assert.ok(nativeStopCount >= 1);
});
test('cloud TTS failure falls back to the device voice using the selected locale', async () => {
  reset();
  const voice = await voicePromise;
  const events: string[] = [];
  assert.equal(voice.speak('Hello', 'zu-ZA', {
    onStart: () => events.push('start'),
    onDone: () => events.push('done'),
    onError: () => events.push('error'),
  }), true);
  await flush();
  assert.equal(nativeTtsText, 'Hello');
  assert.equal(nativeTtsOptions.language, 'zu-ZA');
  nativeTtsOptions.onStart();
  assert.deepEqual(events, ['start']);
});
