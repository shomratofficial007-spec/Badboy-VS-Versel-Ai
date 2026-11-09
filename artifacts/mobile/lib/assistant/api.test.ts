import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let fetchHandler: (...args: any[]) => Promise<any> = async () => {
  throw new Error('Unexpected expoFetch call');
};
let fileContent = '';
const requestedFiles: string[] = [];

mock.module('expo/fetch', {
  namedExports: { fetch: (...args: any[]) => fetchHandler(...args) },
});
mock.module('expo-file-system/legacy', {
  namedExports: {
    EncodingType: { Base64: 'base64' },
    readAsStringAsync: async (uri: string, options: unknown) => {
      requestedFiles.push(uri);
      assert.deepEqual(options, { encoding: 'base64' });
      return fileContent;
    },
  },
});
mock.module('./ownerAuth.ts', {
  namedExports: { getOwnerToken: async () => 'owner-token-test' },
});
mock.module('./ownerJsonRequest.ts', {
  namedExports: { apiUrl: (path: string) => `https://worker.example${path}` },
});

const apiPromise = import('./api');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

function authFrom(init: any) {
  return new Headers(init?.headers).get('Authorization');
}

test('streamReply sends owner-authenticated request and parses split SSE frames', async () => {
  const { streamReply } = await apiPromise;
  let url = '';
  let sent: any;
  fetchHandler = async (input, init) => {
    url = String(input);
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return streamResponse([
      'data: {"content":"বাংলা ',
      'উত্তর"}\n\n',
      'data: {"content":"সম্পূর্ণ"}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const chunks: string[] = [];
  await streamReply('হ্যালো', {
    personality: 'বন্ধুসুলভ',
    voiceLanguage: 'bn-BD',
    developerMode: true,
  } as any, (chunk) => chunks.push(chunk));
  assert.equal(url, 'https://worker.example/assistant/chat');
  assert.equal(sent.message, 'হ্যালো');
  assert.equal(sent.developerMode, true);
  assert.match(sent.personality, /bn-BD/);
  assert.deepEqual(chunks, ['বাংলা উত্তর', 'সম্পূর্ণ']);
});

test('streamReply rejects HTTP errors and provider error events', async () => {
  const { streamReply } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'owner denied' }, 401);
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    /owner denied/,
  );
  fetchHandler = async () => streamResponse(['data: {"error":"upstream failed"}\n\n']);
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    /upstream failed/,
  );
});

test('streamReply rejects missing response streams and malformed SSE JSON', async () => {
  const { streamReply } = await apiPromise;
  fetchHandler = async () => new Response(null, { status: 200 });
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    /response stream is unavailable/,
  );
  fetchHandler = async () => streamResponse(['data: {broken json}\n\n']);
  await assert.rejects(
    streamReply('hello', { personality: '', voiceLanguage: 'en-US' } as any, () => {}),
    SyntaxError,
  );
});

test('streamDeveloperAnalysis returns task metadata and streams analysis chunks', async () => {
  const { streamDeveloperAnalysis } = await apiPromise;
  let sent: any;
  fetchHandler = async (_input, init) => {
    sent = JSON.parse(String(init.body));
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    return streamResponse([
      'data: {"taskId":"task-123","engine":"native"}\n\n',
      'data: {"content":"প্রথম অংশ"}\n\n',
      'data: {"content":"দ্বিতীয় অংশ"}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const chunks: string[] = [];
  const result = await streamDeveloperAnalysis(
    'Review this project', 'Project context', 'native', (chunk) => chunks.push(chunk),
  );
  assert.deepEqual(sent, {
    prompt: 'Review this project',
    projectContext: 'Project context',
    requestedEngine: 'native',
  });
  assert.deepEqual(result, { taskId: 'task-123', engine: 'native' });
  assert.deepEqual(chunks, ['প্রথম অংশ', 'দ্বিতীয় অংশ']);
});

test('streamDeveloperAnalysis handles HTTP, stream, and event errors', async () => {
  const { streamDeveloperAnalysis } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'not allowed' }, 403);
  await assert.rejects(
    streamDeveloperAnalysis('p', 'c', 'auto', () => {}),
    /not allowed/,
  );
  fetchHandler = async () => new Response(null, { status: 200 });
  await assert.rejects(
    streamDeveloperAnalysis('p', 'c', 'auto', () => {}),
    /response stream is unavailable/,
  );
  fetchHandler = async () => streamResponse(['data: {"error":"analysis failed"}\n\n']);
  await assert.rejects(
    streamDeveloperAnalysis('p', 'c', 'auto', () => {}),
    /analysis failed/,
  );
});

test('transcribeAudio maps language, sends audio and returns trimmed transcript', async () => {
  const { transcribeAudio } = await apiPromise;
  let sent: any;
  fetchHandler = async (url, init) => {
    assert.equal(String(url), 'https://worker.example/assistant/transcribe');
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    sent = JSON.parse(String(init.body));
    return jsonResponse({ text: '  তুমি কেমন আছো?  ' });
  };
  assert.equal(await transcribeAudio('YXVkaW8=', 'm4a', 'bn-BD'), 'তুমি কেমন আছো?');
  assert.deepEqual(sent, { audioBase64: 'YXVkaW8=', format: 'm4a', language: 'bn' });
});

test('transcribeAudio rejects HTTP failures and empty transcripts', async () => {
  const { transcribeAudio } = await apiPromise;
  fetchHandler = async () => jsonResponse({ error: 'transcription unavailable' }, 503);
  await assert.rejects(transcribeAudio('abc', 'wav', 'en-US'), /transcription unavailable/);
  fetchHandler = async () => jsonResponse({ text: '   ' });
  await assert.rejects(transcribeAudio('abc', 'wav', 'en-US'), /কোনো কথা শনাক্ত/);
});

test('transcribeRecordedAudio validates the recording and reads base64 audio', async () => {
  const { transcribeRecordedAudio } = await apiPromise;
  requestedFiles.length = 0;
  await assert.rejects(transcribeRecordedAudio('  ', 'bn-BD'), /রেকর্ডিং ফাইল/);
  fileContent = '';
  await assert.rejects(transcribeRecordedAudio('file:///recording.m4a', 'bn-BD'), /অডিও ফাঁকা/);
  fileContent = 'YXVkaW8=';
  fetchHandler = async () => jsonResponse({ text: 'hello from recording' });
  assert.equal(await transcribeRecordedAudio('file:///recording.m4a', 'en-US'), 'hello from recording');
  assert.deepEqual(requestedFiles, ['file:///recording.m4a', 'file:///recording.m4a']);
});

test('requestSpeech returns audio bytes and rejects HTTP or empty audio responses', async () => {
  const { requestSpeech } = await apiPromise;
  fetchHandler = async (url, init) => {
    assert.equal(String(url), 'https://worker.example/assistant/speech');
    assert.equal(authFrom(init), 'Bearer owner-token-test');
    assert.deepEqual(JSON.parse(String(init.body)), { text: 'হ্যালো', language: 'bn-BD' });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };
  assert.deepEqual([...await requestSpeech('হ্যালো', 'bn-BD')], [1, 2, 3]);
  fetchHandler = async () => jsonResponse({ error: 'speech unavailable' }, 502);
  await assert.rejects(requestSpeech('hello', 'en-US'), /speech unavailable/);
  fetchHandler = async () => new Response(new Uint8Array([]), { status: 200 });
  await assert.rejects(requestSpeech('hello', 'en-US'), /empty audio file/);
});
