import { fetch as expoFetch } from 'expo/fetch';
import type { AssistantSettings } from '@/lib/assistant/types';

const DEFAULT_NATIVE_API_DOMAIN =
  'https://voice-memory-assistant-net.shomratofficial007.workers.dev';

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
  // otherwise use the confirmed Cloudflare Worker production URL.
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


/**
 * Send a user-consented, short audio recording to the server-side transcription
 * endpoint. The provider API key is never shipped in the mobile app.
 */
export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType = 'audio/m4a',
  language = 'bn',
): Promise<string> {
  const response = await expoFetch(apiUrl('/assistant/voice'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ audioBase64, mimeType, language }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };
  if (!response.ok || !body.text) {
    throw new Error(body.error ?? `Voice transcription failed (HTTP ${response.status}).`);
  }
  return body.text.trim();
}
