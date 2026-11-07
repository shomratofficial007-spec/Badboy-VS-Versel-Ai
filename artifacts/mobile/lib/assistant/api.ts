import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import type { AssistantSettings } from '@/lib/assistant/types';
import { getTranscriptionLanguageCode } from './transcriptionLanguage';
import { getOwnerToken } from './ownerAuth';

// This repository deploys its own Worker; do not send native APK traffic to the
// unrelated legacy Voice-Memory-Assistant Worker.
const DEFAULT_NATIVE_API_DOMAIN =
  'https://badboy-vs-versel-ai.shomratofficial007.workers.dev';

function apiUrl(path: string) {
  // Web deployments use their own same-origin API routes.
  if (
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    window.location.origin.startsWith('http')
  ) {
    return `${window.location.origin}/api${path}`;
  }

  // Native APKs have no window origin. Prefer an explicitly configured domain,
  // otherwise use this repository's Worker (wrangler.json name: badboy-vs-versel-ai).
  const domain =
    process.env.EXPO_PUBLIC_DOMAIN?.trim() || DEFAULT_NATIVE_API_DOMAIN;
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  return `${baseUrl.replace(/\/$/, '')}/api${path}`;
}

async function ownerAuthorizationHeader(): Promise<string> {
  const token = await getOwnerToken();
  if (!token) {
    throw new Error('Owner login is required. Enter your Badboy Owner Token to continue.');
  }
  return `Bearer ${token}`;
}

export async function streamReply(
  message: string,
  settings: AssistantSettings,
  onChunk: (chunk: string) => void,
) {
  const response = await expoFetch(apiUrl('/assistant/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: await ownerAuthorizationHeader(),
    },
    body: JSON.stringify({
      message,
      personality: `${settings.personality}\n\nLanguage preference: Reply in the language selected for voice input/output (locale: ${settings.voiceLanguage}). Keep the response in that language unless the user explicitly asks for another language.`,
      developerMode: settings.developerMode,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(
      body.error ??
        `The assistant could not reply right now (HTTP ${response.status}).`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('The assistant response stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;

  while (!complete) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') {
        complete = true;
        break;
      }
      const event = JSON.parse(payload) as { content?: string; error?: string };
      if (event.error) throw new Error(event.error);
      if (event.content) onChunk(event.content);
    }
  }
}


export type DeveloperEngineRequest = 'native' | 'copilot' | 'auto';

export interface DeveloperAnalysisStreamResult {
  taskId?: string;
  engine?: string;
}

/** Stream a read-only Developer Agent analysis through the Cloudflare orchestration API. */
export async function streamDeveloperAnalysis(
  prompt: string,
  projectContext: string,
  requestedEngine: DeveloperEngineRequest,
  onChunk: (chunk: string) => void,
): Promise<DeveloperAnalysisStreamResult> {
  const response = await expoFetch(apiUrl('/developer/analyze'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: await ownerAuthorizationHeader(),
    },
    body: JSON.stringify({ prompt, projectContext, requestedEngine }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(
      body.error ?? `Developer Agent request failed (HTTP ${response.status}).`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Developer Agent response stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let taskId: string | undefined;
  let engine: string | undefined;

  while (!complete) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') {
        complete = true;
        break;
      }
      const event = JSON.parse(payload) as {
        content?: string;
        error?: string;
        taskId?: string;
        engine?: string;
      };
      if (event.taskId) taskId = event.taskId;
      if (event.engine) engine = event.engine;
      if (event.error) throw new Error(event.error);
      if (event.content) onChunk(event.content);
    }
  }

  return { taskId, engine };
}

export async function transcribeAudio(
  audioBase64: string,
  format: string,
  language: string,
): Promise<string> {
  const response = await expoFetch(apiUrl('/assistant/transcribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: await ownerAuthorizationHeader() },
    body: JSON.stringify({
      audioBase64,
      format,
      // OpenRouter expects ISO-639-1 language codes when provided.
      language: getTranscriptionLanguageCode(language),
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error ?? `Speech transcription failed (HTTP ${response.status}).`);
  }
  if (!result.text?.trim()) throw new Error('কোনো কথা শনাক্ত করা যায়নি। আবার চেষ্টা করুন।');
  return result.text.trim();
}

/** Read a completed Expo audio recording and send it to the server-side Whisper endpoint. */
export async function transcribeRecordedAudio(
  recordingUri: string,
  language: string,
): Promise<string> {
  if (!recordingUri.trim()) throw new Error('অডিও রেকর্ডিং ফাইল পাওয়া যায়নি।');
  const audioBase64 = await FileSystem.readAsStringAsync(recordingUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!audioBase64.trim()) throw new Error('রেকর্ড করা অডিও ফাঁকা। আবার চেষ্টা করুন।');
  return transcribeAudio(audioBase64, 'm4a', language);
}


/** Request free Fish Audio speech from the server; the API key stays server-side. */
export async function requestSpeech(text: string, language: string): Promise<Uint8Array> {
  const response = await expoFetch(apiUrl('/assistant/speech'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', Authorization: await ownerAuthorizationHeader() },
    body: JSON.stringify({ text, language }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Speech generation failed (HTTP ${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Speech service returned an empty audio file.');
  return bytes;
}
