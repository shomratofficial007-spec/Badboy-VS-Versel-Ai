import { fetch as expoFetch } from 'expo/fetch';
import type { AssistantSettings } from '@/lib/assistant/types';
import { getTranscriptionLanguageCode } from './transcriptionLanguage';

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
    },
    body: JSON.stringify({
      message,
      personality: settings.personality,
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

export async function transcribeAudio(
  audioBase64: string,
  format: string,
  language: string,
): Promise<string> {
  const response = await expoFetch(apiUrl('/assistant/transcribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
