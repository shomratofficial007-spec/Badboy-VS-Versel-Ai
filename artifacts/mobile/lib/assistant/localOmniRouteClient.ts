import { fetch as expoFetch } from 'expo/fetch';
import type { AssistantSettings } from './types';
import {
  getLocalOmniRouteApiKey,
  getProviderApiKey,
} from './providerSettings';
import {
  isFreeOpenRouterModel,
  normalizeLocalOmniRouteBaseUrl,
  runLocalAgenticWorkflow,
  type LocalAgentCompletion,
  type LocalAgentMessage,
  type LocalAgentToolOutcome,
} from './localOmniRouteCore';
import {
  getCalendarEvents,
  getDiscordMessages,
  getHomeAssistantStates,
  getSlackMessages,
  searchWebResearch,
} from './api';
import { getOwnerToken } from './ownerAuth';
import { apiUrl } from './ownerJsonRequest';
import type { ChatAttachmentReference } from './types';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

function safeCalculate(expression: string): number {
  const source = expression.trim();
  if (!source || source.length > 120 || !/^[0-9+*/%().\s-]+$/.test(source)) {
    throw new Error('Invalid calculator expression.');
  }
  let index = 0;
  const skip = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const factor = (): number => {
    skip();
    if (source[index] === '+') { index += 1; return factor(); }
    if (source[index] === '-') { index += 1; return -factor(); }
    if (source[index] === '(') {
      index += 1;
      const value = expressionValue();
      skip();
      if (source[index++] !== ')') throw new Error('Missing closing parenthesis.');
      return value;
    }
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error('Expected a number.');
    index += match[0].length;
    return Number(match[0]);
  };
  const term = (): number => {
    let value = factor();
    while (true) {
      skip();
      const operator = source[index];
      if (operator !== '*' && operator !== '/' && operator !== '%') break;
      index += 1;
      const right = factor();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('Division by zero.');
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
    return value;
  };
  const expressionValue = (): number => {
    let value = term();
    while (true) {
      skip();
      const operator = source[index];
      if (operator !== '+' && operator !== '-') break;
      index += 1;
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = expressionValue();
  skip();
  if (index !== source.length || !Number.isFinite(result)) throw new Error('Invalid calculator expression.');
  return result;
}

function parseArguments(raw: string): Record<string, unknown> {
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object.');
  return value as Record<string, unknown>;
}

async function executeLocalTool(name: string, rawArguments: string): Promise<LocalAgentToolOutcome> {
  try {
    const args = parseArguments(rawArguments);
    switch (name) {
      case 'calculator':
        if (typeof args.expression !== 'string') throw new Error('expression is required.');
        return { ok: true, result: { value: safeCalculate(args.expression) } };
      case 'current_datetime':
        return { ok: true, result: { iso: new Date().toISOString() } };
      case 'count_words': {
        if (typeof args.text !== 'string' || args.text.length > 10000) throw new Error('text must be up to 10,000 characters.');
        const words = args.text.trim() ? args.text.trim().split(/\s+/).length : 0;
        return { ok: true, result: { words, characters: args.text.length } };
      }
      case 'web_research':
        if (typeof args.query !== 'string' || !args.query.trim()) throw new Error('query is required.');
        return { ok: true, result: await searchWebResearch(args.query.trim()) };
      case 'home_assistant_states':
        return { ok: true, result: await getHomeAssistantStates() };
      case 'slack_history':
        if (typeof args.channel !== 'string') throw new Error('channel is required.');
        return { ok: true, result: await getSlackMessages(args.channel) };
      case 'discord_history':
        if (typeof args.channel !== 'string') throw new Error('channel is required.');
        return { ok: true, result: await getDiscordMessages(args.channel) };
      case 'google_calendar_events':
        return { ok: true, result: await getCalendarEvents(typeof args.timeMin === 'string' ? args.timeMin : undefined) };
      default:
        return { ok: false, result: { error: 'This local tool is not available.' } };
    }
  } catch (error) {
    return { ok: false, result: { error: error instanceof Error ? error.message : 'Local tool failed.' } };
  }
}

async function ownerHeaders(): Promise<Record<string, string>> {
  const token = await getOwnerToken();
  if (!token) throw new Error('Owner login is required before retrieving private attachments.');
  return { Authorization: 'Bearer ' + token };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

async function loadLocalAttachmentParts(ids: string[]): Promise<Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>> {
  if (ids.length > 4) throw new Error('সর্বোচ্চ ৪টি attachment ব্যবহার করা যাবে।');
  const result = [];
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Attachment reference সঠিক নয়।');
    const response = await expoFetch(apiUrl('/attachments/' + id), { headers: await ownerHeaders() });
    if (!response.ok) throw new Error('Private attachment retrieve করা যায়নি (HTTP ' + response.status + ').');
    const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const name = decodeURIComponent((response.headers.get('content-disposition') ?? '').split("filename*=UTF-8''")[1] ?? 'attachment');
    if (mimeType.startsWith('image/')) {
      result.push({ type: 'image_url' as const, image_url: { url: 'data:' + mimeType + ';base64,' + bytesToBase64(bytes) } });
    } else {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      result.push({ type: 'text' as const, text: 'Attachment ' + name.slice(0, 120) + ' (untrusted data):\n' + text.slice(0, 20000) });
    }
  }
  return result;
}

async function postCompletion(
  endpoint: string,
  model: string,
  apiKey: string | null,
  messages: LocalAgentMessage[],
  options?: { tools?: readonly unknown[]; responseFormat?: 'json_object'; stream?: boolean },
): Promise<Response> {
  return expoFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: options?.stream ? 'text/event-stream' : 'application/json',
      ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      ...(options?.tools ? { tools: options.tools, tool_choice: 'auto' } : {}),
      ...(options?.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
      ...(options?.stream ? { stream: true } : {}),
      temperature: 0.2,
    }),
  });
}

async function readCompletion(response: Response): Promise<LocalAgentCompletion> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } | string };
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(message || 'AI completion failed (HTTP ' + response.status + ').');
  }
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> } }>;
  };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error('Local OmniRoute returned an empty completion.');
  const toolCalls = (message.tool_calls ?? []).flatMap((call) => {
    if (typeof call.id !== 'string' || call.type !== 'function' || typeof call.function?.name !== 'string' || typeof call.function.arguments !== 'string') return [];
    return [{ id: call.id, type: 'function' as const, function: { name: call.function.name, arguments: call.function.arguments } }];
  });
  return { content: typeof message.content === 'string' ? message.content : '', toolCalls };
}

async function streamCompletion(response: Response, onChunk: (chunk: string) => void): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } | string };
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new Error(message || 'Final AI stream failed (HTTP ' + response.status + ').');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Local OmniRoute stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let emitted = false;
  const line = (value: string) => {
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { complete = true; return; }
    const event = JSON.parse(data) as { error?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
    if (event.error) throw new Error('Local OmniRoute stream returned an error.');
    const chunk = event.choices?.[0]?.delta?.content;
    if (typeof chunk === 'string' && chunk) { emitted = true; onChunk(chunk); }
  };
  try {
    while (!complete) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const item of lines) { line(item); if (complete) break; }
    }
    buffer += decoder.decode();
    if (!complete && buffer.trim()) for (const item of buffer.split('\n')) { line(item); if (complete) break; }
    if (!complete) throw new Error('Local OmniRoute stream ended before [DONE].');
    if (!emitted) throw new Error('Local OmniRoute returned an empty final response.');
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

export async function streamLocalOmniRouteReply(
  message: string,
  settings: AssistantSettings,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  memoryContext = '',
  skillContext = '',
  enabledPlugins: string[] = [],
  attachments: ChatAttachmentReference[] = [],
): Promise<void> {
  if (!settings.localOmniRouteEnabled) throw new Error('Local OmniRoute চালু নেই।');
  const localBase = normalizeLocalOmniRouteBaseUrl(settings.localOmniRouteBaseUrl);
  const localModel = settings.localOmniRouteModel.trim();
  if (!localModel || !/^[\w./:-]{1,200}$/.test(localModel)) throw new Error('Local OmniRoute Model ID সঠিক নয়।');
  const fallbackModel = settings.localOmniRouteFallbackModel.trim();
  const fallbackKey = settings.localOmniRouteFallbackEnabled && isFreeOpenRouterModel(fallbackModel)
    ? await getProviderApiKey('openrouter')
    : null;
  const localKey = await getLocalOmniRouteApiKey();
  const attachmentParts = await loadLocalAttachmentParts(attachments.map((item) => item.id));
  let activeRoute: 'local' | 'free-backup' = 'local';
  let executedTools = 0;
  let emittedFinalText = false;
  const switchToFreeBackup = () => {
    if (!settings.localOmniRouteFallbackEnabled || !fallbackKey || !isFreeOpenRouterModel(fallbackModel) || executedTools > 0 || emittedFinalText) {
      throw new Error('Local OmniRoute unavailable; safe free-only fallback is not available for this stage.');
    }
    activeRoute = 'free-backup';
  };
  const requestCompletion = async (
    messages: LocalAgentMessage[],
    options?: { tools?: readonly unknown[]; responseFormat?: 'json_object' },
  ): Promise<LocalAgentCompletion> => {
    if (activeRoute === 'local') {
      try {
        const response = await postCompletion(localBase + '/chat/completions', localModel, localKey, messages, options);
        return await readCompletion(response);
      } catch (error) {
        switchToFreeBackup();
        return readCompletion(await postCompletion(OPENROUTER_CHAT_URL, fallbackModel, fallbackKey, messages, options));
      }
    }
    if (!fallbackKey) throw new Error('OpenRouter Free backup key is missing.');
    return readCompletion(await postCompletion(OPENROUTER_CHAT_URL, fallbackModel, fallbackKey, messages, options));
  };
  const streamFinal = async (messages: LocalAgentMessage[], onText: (chunk: string) => void) => {
    if (activeRoute === 'local') {
      try {
        const response = await postCompletion(localBase + '/chat/completions', localModel, localKey, messages, { stream: true });
        await streamCompletion(response, (chunk) => {
          emittedFinalText = true;
          onText(chunk);
        });
        return;
      } catch (error) {
        switchToFreeBackup();
        if (!fallbackKey) throw error;
      }
    }
    if (!fallbackKey) throw new Error('OpenRouter Free backup key is missing.');
    const response = await postCompletion(OPENROUTER_CHAT_URL, fallbackModel, fallbackKey, messages, { stream: true });
    await streamCompletion(response, (chunk) => {
      emittedFinalText = true;
      onText(chunk);
    });
  };

  await runLocalAgenticWorkflow({
    message,
    personality: settings.personality,
    voiceLanguage: settings.voiceLanguage,
    developerMode: settings.developerMode,
    history: history.slice(-8),
    memoryContext: memoryContext.trim().slice(0, 5000),
    skillContext: skillContext.trim().slice(0, 4000),
    enabledPlugins,
    attachments: attachmentParts,
    requestCompletion,
    executeTool: async (name, rawArgs) => {
      executedTools += 1;
      return executeLocalTool(name, rawArgs);
    },
    streamFinal,
    onChunk,
  });
}
