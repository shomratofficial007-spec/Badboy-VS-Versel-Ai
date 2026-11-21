import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import type { AssistantSettings } from '@/lib/assistant/types';
import { getTranscriptionLanguageCode } from './transcriptionLanguage';
import { getOwnerToken } from './ownerAuth';
import { AI_PROVIDER_PRESETS, getProviderApiKey, normalizeProviderBaseUrl } from './providerSettings';

// This repository deploys its own Worker; do not send native APK traffic to the
// unrelated legacy Voice-Memory-Assistant Worker.
import { apiUrl } from "./ownerJsonRequest";
import { DEFAULT_AGENT_PLUGIN_IDS, type AgentPluginId } from "./pluginCatalog";
async function ownerAuthorizationHeader(): Promise<string> {
  const token = await getOwnerToken();
  if (!token) {
    throw new Error('Owner login is required. Enter your Badboy Owner Token to continue.');
  }
  return `Bearer ${token}`;
}

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

async function streamSseResponse(
  response: Response,
  onChunk: (chunk: string) => void,
) {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(
      body.error ??
        'The assistant could not reply right now (HTTP ' + response.status + ').',
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('The assistant response stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let emittedContent = false;
  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') {
      complete = true;
      return;
    }
    const event = JSON.parse(payload) as { content?: string; error?: string };
    if (event.error) throw new Error(event.error);
    if (event.content) { emittedContent = true; onChunk(event.content); }
  };

  try {
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
        if (complete) break;
      }
    }
    buffer += decoder.decode();
    if (!complete && buffer.trim()) {
      for (const line of buffer.split('\n')) {
        processLine(line);
        if (complete) break;
      }
    }
    if (!complete) throw new Error('The assistant stream ended before its completion marker.');
    if (!emittedContent) throw new Error('The assistant returned an empty response.');
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

async function streamOpenAICompatibleResponse(response: Response, onChunk: (chunk: string) => void): Promise<void> {
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error('নির্বাচিত AI Provider request গ্রহণ করেনি (HTTP ' + response.status + ')। API Key, Model ও Base URL যাচাই করুন।');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI Provider response stream পাওয়া যায়নি।');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = false;
  let emittedContent = false;
  const emitLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') {
      complete = true;
      return;
    }
    let event: { error?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      throw new Error('AI Provider returned malformed stream data.');
    }
    if (event.error) throw new Error('AI Provider stream error.');
    const content = event.choices?.[0]?.delta?.content;
    if (typeof content === 'string' && content) { emittedContent = true; onChunk(content); }
  };

  try {
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        emitLine(line);
        if (complete) break;
      }
    }
    buffer += decoder.decode();
    if (!complete && buffer.trim()) {
      for (const line of buffer.split('\n')) {
        emitLine(line.trim());
        if (complete) break;
      }
    }
    if (!complete) throw new Error('AI Provider stream ended before its completion marker.');
    if (!emittedContent) throw new Error('AI Provider returned an empty response.');
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
async function streamConfiguredProviderReply(message: string, settings: AssistantSettings, onChunk: (chunk: string) => void, history: ChatHistoryItem[] = [], memoryContext = '', skillContext = ''): Promise<void> {
  // All provider traffic is proxied by the authenticated Cloudflare Worker.
  // The provider key is sent only to the Worker, which forwards it without storing it.
  const providerId = settings.aiProvider;
  if (providerId === 'server') throw new Error('External Provider selection is required for this request.');
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === providerId);
  const baseUrl = normalizeProviderBaseUrl(settings.aiBaseUrl || preset?.baseUrl || '');
  const model = settings.aiModel.trim();
  if (!model) throw new Error('Settings থেকে একটি Model নির্বাচন করুন।');
  const messages = [
    { role: 'system', content: settings.personality + '\n\nLanguage preference: ' + settings.voiceLanguage + (settings.developerMode ? '\nDeveloper mode is enabled. Preserve existing behavior and explain code changes clearly.' : '') + (memoryContext ? '\n\nRelevant project memory:\n' + memoryContext.slice(0, 5000) : '') + (skillContext ? '\n\nLocal skill guidance:\n' + skillContext.slice(0, 4000) : '') },
    ...history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 3000) })),
    { role: 'user', content: message.trim() },
  ];
  const attempt = async (id: Exclude<typeof providerId, 'server'>, endpoint: string, selectedModel: string, onText: (chunk: string) => void) => {
    const apiKey = await getProviderApiKey(id);
    if (!apiKey) throw new Error('Provider ' + id + ' এর API Key Secure Storage-এ নেই।');
    const response = await expoFetch(apiUrl('/assistant/provider-chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: await ownerAuthorizationHeader(),
        'X-Provider-Key': apiKey,
      },
      body: JSON.stringify({
        providerId: id,
        baseUrl: endpoint,
        model: selectedModel,
        messages,
      }),
    });
    await streamOpenAICompatibleResponse(response, onText);
  };
  let primaryEmitted = false;
  try {
    await attempt(providerId, baseUrl, model, (chunk) => { primaryEmitted = true; onChunk(chunk); });
  } catch (primaryError) {
    const fallbackId = settings.aiFallbackProvider ?? 'none';
    const fallbackModel = settings.aiFallbackModel?.trim() ?? '';
    const fallbackPreset = AI_PROVIDER_PRESETS.find((item) => item.id === fallbackId);
    // Retry only if the primary failed before producing any text; never splice two model answers.
    if (primaryEmitted || fallbackId === 'none' || fallbackId === providerId || !fallbackPreset || !fallbackModel) throw primaryError;
    await attempt(fallbackId, normalizeProviderBaseUrl(fallbackPreset.baseUrl), fallbackModel, onChunk);
  }
}
export async function streamReply(
  message: string,
  settings: AssistantSettings,
  onChunk: (chunk: string) => void,
) {
  if (settings.aiProvider && settings.aiProvider !== 'server') {
    await streamConfiguredProviderReply(message, settings, onChunk);
    return;
  }
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
  await streamSseResponse(response, onChunk);
}

/** Owner-authenticated agentic chat with bounded context, safe tools and an optional multi-agent workflow. */
export async function streamAgenticReply(
  message: string,
  settings: AssistantSettings,
  history: ChatHistoryItem[],
  onChunk: (chunk: string) => void,
  memoryContext = '',
  skillContext = '',
  enabledPluginIds: AgentPluginId[] = DEFAULT_AGENT_PLUGIN_IDS,
) {
  const selectedProvider = settings.aiProvider && settings.aiProvider !== 'server' ? settings.aiProvider : null;
  const selectedPreset = selectedProvider ? AI_PROVIDER_PRESETS.find((item) => item.id === selectedProvider) : undefined;
  const selectedBaseUrl = selectedProvider ? normalizeProviderBaseUrl(settings.aiBaseUrl || selectedPreset?.baseUrl || '') : '';
  const selectedModel = (settings.aiModel ?? '').trim();
  const selectedApiKey = selectedProvider ? await getProviderApiKey(selectedProvider) : null;
  if (selectedProvider && (!selectedModel || !selectedBaseUrl || !selectedApiKey)) {
    throw new Error(!selectedModel ? 'Settings থেকে একটি Model নির্বাচন করুন।' : !selectedApiKey ? 'নির্বাচিত Provider-এর API Key Secure Storage-এ নেই।' : 'Provider Base URL সঠিক নয়।');
  }
  const safeMemoryContext = memoryContext.trim().slice(0, 5000);
  const safeSkillContext = skillContext.trim().slice(0, 4000);
  const sendAgenticRequest = async (
    providerId: typeof selectedProvider,
    baseUrl: string,
    model: string,
    apiKey: string | null,
    onText: (chunk: string) => void,
  ) => {
    const response = await expoFetch(apiUrl('/assistant/agent'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: await ownerAuthorizationHeader(),
        ...(apiKey ? { 'X-Provider-Key': apiKey } : {}),
      },
      body: JSON.stringify({
        message,
        ...(providerId ? { provider: { providerId, baseUrl, model } } : {}),
        personality: `${settings.personality}\n\nLanguage preference: ${settings.voiceLanguage}.`,
        memoryContext: safeMemoryContext,
        skillContext: safeSkillContext,
        developerMode: settings.developerMode,
        mode: 'multi',
        enabledPlugins: enabledPluginIds,
        history: history.slice(-8).map(({ role, content }) => ({
          role,
          content: content.slice(0, 3000),
        })),
      }),
    });
    await streamSseResponse(response, onText);
  };

  let primaryEmitted = false;
  try {
    await sendAgenticRequest(selectedProvider, selectedBaseUrl, selectedModel, selectedApiKey, (chunk) => {
      primaryEmitted = true;
      onChunk(chunk);
    });
  } catch (primaryError) {
    const fallbackId = settings.aiFallbackProvider ?? 'none';
    const fallbackModel = settings.aiFallbackModel?.trim() ?? '';
    const fallbackPreset = AI_PROVIDER_PRESETS.find((item) => item.id === fallbackId);
    // Retry only before any final answer text is emitted; never splice two model answers.
    if (!selectedProvider || primaryEmitted || fallbackId === 'none' || fallbackId === selectedProvider || !fallbackPreset || !fallbackModel) {
      throw primaryError;
    }
    const fallbackKey = await getProviderApiKey(fallbackId);
    if (!fallbackKey) throw primaryError;
    const fallbackBaseUrl = normalizeProviderBaseUrl(fallbackPreset.baseUrl);
    await sendAgenticRequest(fallbackId, fallbackBaseUrl, fallbackModel, fallbackKey, onChunk);
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
  engine: string,
  onChunk: (chunk: string) => void,
): Promise<{ taskId: string; engine: string }> {
  const response = await expoFetch(apiUrl('/api/developer/analyze'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: await ownerAuthorizationHeader(),
    },
    body: JSON.stringify({ prompt, projectContext, requestedEngine: engine }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Developer Agent request failed (HTTP ' + response.status + ').');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Developer Agent response stream is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  let taskId = '';
  let actualEngine = engine;
  let complete = false;
  let emittedContent = false;
  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') {
      complete = true;
      return;
    }
    const event = JSON.parse(payload) as { taskId?: string; engine?: string; content?: string; error?: string };
    if (event.error) throw new Error(event.error);
    if (event.taskId) taskId = event.taskId;
    if (event.engine) actualEngine = event.engine;
    if (event.content) { emittedContent = true; onChunk(event.content); }
  };

  try {
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
        if (complete) break;
      }
    }
    buffer += decoder.decode();
    if (!complete && buffer.trim()) {
      for (const line of buffer.split('\n')) {
        processLine(line);
        if (complete) break;
      }
    }
    if (!complete) throw new Error('Developer Agent stream ended before its completion marker.');
    if (!emittedContent) throw new Error('Developer Agent returned an empty response.');
    return { taskId, engine: actualEngine };
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

export interface AgentMemorySearchResult {
  id: string;
  projectId: string;
  category: string;
  content: string;
  source: string;
  privacyLevel: string;
  updatedAt: string;
}

/** Search owner-scoped project memory; the server always excludes sensitive entries. */
export async function searchAgentMemory(
  projectId: string,
  query: string,
  limit = 5,
): Promise<AgentMemorySearchResult[]> {
  const cleanProjectId = projectId.trim();
  const cleanQuery = query.trim().slice(0, 1000);
  if (!cleanProjectId || !cleanQuery) return [];
  const response = await expoFetch(apiUrl('/agent/memory/search'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: await ownerAuthorizationHeader(),
    },
    body: JSON.stringify({
      projectId: cleanProjectId,
      query: cleanQuery,
      limit: Math.max(1, Math.min(10, Math.floor(limit))),
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Project memory search failed (HTTP ${response.status}).`);
  }
  const body = (await response.json()) as { memories?: unknown };
  if (!Array.isArray(body.memories)) return [];

  // Defense in depth: the Worker excludes sensitive rows, but never trust a
  // provider/cache/proxy response to preserve that invariant for the Agent.
  return body.memories.flatMap((value): AgentMemorySearchResult[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const memory = value as Record<string, unknown>;
    if (
      typeof memory.id !== 'string' ||
      typeof memory.projectId !== 'string' || memory.projectId !== cleanProjectId ||
      typeof memory.category !== 'string' ||
      typeof memory.content !== 'string' ||
      typeof memory.source !== 'string' ||
      typeof memory.privacyLevel !== 'string' || memory.privacyLevel.trim().toLowerCase() === 'sensitive' ||
      typeof memory.updatedAt !== 'string'
    ) return [];
    return [{
      id: memory.id.slice(0, 160),
      projectId: memory.projectId,
      category: memory.category.slice(0, 80),
      content: memory.content.slice(0, 2000),
      source: memory.source.slice(0, 80),
      privacyLevel: memory.privacyLevel.slice(0, 40),
      updatedAt: memory.updatedAt.slice(0, 40),
    }];
  }).slice(0, 10);
}

export async function transcribeAudio(
  audioBase64: string,
  format: string,
  language: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await expoFetch(apiUrl('/assistant/transcribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: await ownerAuthorizationHeader() },
      body: JSON.stringify({
        audioBase64,
        format,
        // OpenRouter expects ISO-639-1 language codes when provided.
        language: getTranscriptionLanguageCode(language),
      }),
      signal: controller.signal,
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
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('ভয়েস ট্রান্সক্রিপশন নির্ধারিত সময়ের মধ্যে শেষ হয়নি। আবার চেষ্টা করুন।');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await expoFetch(apiUrl('/assistant/speech'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', Authorization: await ownerAuthorizationHeader() },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Speech generation failed (HTTP ${response.status}).`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error('Speech service returned an empty audio file.');
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Speech generation timed out. Use the device speech engine and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface WebResearchSource {
  title: string;
  url: string;
  content: string;
  score: number | null;
}
export interface WebResearchResult {
  query: string;
  answer: string | null;
  results: WebResearchSource[];
  sourceCount: number;
  retrievedAt: string;
}

/** Search public web sources through the owner-authenticated server adapter. */
export async function searchWebResearch(query: string): Promise<WebResearchResult> {
  const cleanQuery = query.trim().slice(0, 500);
  if (!cleanQuery) throw new Error("Research query is required.");
  const response = await expoFetch(apiUrl('/research/search'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: await ownerAuthorizationHeader(),
    },
    body: JSON.stringify({ query: cleanQuery, maxResults: 5 }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Web research failed (HTTP ${response.status}).`);
  }
  const result = await response.json() as WebResearchResult;
  if (!Array.isArray(result.results)) throw new Error("Web research returned an invalid result.");
  return {
    query: cleanQuery,
    answer: typeof result.answer === 'string' ? result.answer.slice(0, 4000) : null,
    results: result.results.filter((item) => typeof item?.url === 'string' && item.url.startsWith('https://')).slice(0, 5),
    sourceCount: Math.min(5, result.results.length),
    retrievedAt: typeof result.retrievedAt === 'string' ? result.retrievedAt : new Date().toISOString(),
  };
}

export interface IntegrationProviderStatus {
  configured: boolean;
  mode: string;
}
export interface AssistantIntegrationStatus {
  research: IntegrationProviderStatus;
  homeAssistant: IntegrationProviderStatus;
  slack: IntegrationProviderStatus;
  discord: IntegrationProviderStatus;
  googleCalendar: IntegrationProviderStatus;
  telegram: IntegrationProviderStatus;
  writesRequireOwnerApproval: boolean;
  providerSecretsStayServerSide: boolean;
}

/** Read only provider readiness flags; never returns tokens or credential metadata. */
export async function getIntegrationStatus(): Promise<AssistantIntegrationStatus> {
  const response = await expoFetch(apiUrl('/integrations/status'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: await ownerAuthorizationHeader(),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Integration status failed (HTTP ${response.status}).`);
  }
  const body = await response.json() as { integrations?: AssistantIntegrationStatus };
  if (!body.integrations || typeof body.integrations !== 'object') {
    throw new Error('Integration status response is invalid.');
  }
  return body.integrations;
}


export interface DiscordMessage {
  id: string;
  timestamp: string;
  author: string;
  content: string;
}

/** Read a bounded Discord channel history through the server-side bot adapter. */
export async function getDiscordMessages(channelId: string): Promise<DiscordMessage[]> {
  const cleanChannelId = channelId.trim();
  if (!/^\d{17,20}$/.test(cleanChannelId)) throw new Error("A valid Discord channel ID is required.");
  const response = await expoFetch(
    apiUrl(`/integrations/discord/messages?channel=${encodeURIComponent(cleanChannelId)}`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: await ownerAuthorizationHeader(),
      },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Discord history failed (HTTP ${response.status}).`);
  }
  const body = await response.json() as { messages?: DiscordMessage[] };
  if (!Array.isArray(body.messages)) throw new Error("Discord returned an invalid message list.");
  return body.messages.slice(0, 20).filter((item) =>
    typeof item?.id === "string" && typeof item.timestamp === "string"
    && typeof item.author === "string" && typeof item.content === "string"
  );
}


export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string | null;
  htmlLink: string | null;
}

/** Read a bounded list of upcoming primary-calendar events via the authenticated Worker. */
export async function getCalendarEvents(timeMin = new Date().toISOString()): Promise<CalendarEvent[]> {
  const parsed = Date.parse(timeMin);
  if (!Number.isFinite(parsed) || !timeMin.endsWith("Z")) throw new Error("Calendar time must be a UTC ISO-8601 timestamp.");
  const response = await expoFetch(
    apiUrl(`/integrations/google-calendar/events?timeMin=${encodeURIComponent(timeMin)}`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: await ownerAuthorizationHeader(),
      },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Calendar request failed (HTTP ${response.status}).`);
  }
  const body = await response.json() as { events?: CalendarEvent[] };
  if (!Array.isArray(body.events)) throw new Error("Google Calendar returned an invalid event list.");
  return body.events.slice(0, 20).filter((item) =>
    typeof item?.id === "string" && typeof item.summary === "string"
    && typeof item.start === "string" && typeof item.end === "string"
    && (item.location === null || typeof item.location === "string")
    && (item.htmlLink === null || (typeof item.htmlLink === "string" && item.htmlLink.startsWith("https://calendar.google.com/")))
  );
}


export interface SlackMessage {
  timestamp: string;
  user: string;
  text: string;
}

/** Read a bounded Slack channel history through the owner-authenticated Worker. */
export async function getSlackMessages(channelId: string): Promise<SlackMessage[]> {
  const cleanChannelId = channelId.trim();
  if (!/^[A-Z0-9]{6,32}$/.test(cleanChannelId)) throw new Error("A valid Slack channel ID is required.");
  const response = await expoFetch(
    apiUrl(`/integrations/slack/history?channel=${encodeURIComponent(cleanChannelId)}`),
    {
      method: "GET",
      headers: { Accept: "application/json", Authorization: await ownerAuthorizationHeader() },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Slack history failed (HTTP ${response.status}).`);
  }
  const body = await response.json() as { messages?: SlackMessage[] };
  if (!Array.isArray(body.messages)) throw new Error("Slack returned an invalid message list.");
  return body.messages.slice(0, 20).filter((item) =>
    typeof item?.timestamp === "string" && typeof item.user === "string" && typeof item.text === "string"
  );
}

export interface HomeAssistantState {
  entityId: string;
  state: string;
  friendlyName: string | null;
}

/** Read a bounded Home Assistant entity-state list through the authenticated Worker. */
export async function getHomeAssistantStates(): Promise<HomeAssistantState[]> {
  const response = await expoFetch(apiUrl("/integrations/home-assistant/states"), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: await ownerAuthorizationHeader() },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Home Assistant request failed (HTTP ${response.status}).`);
  }
  const body = await response.json() as { states?: HomeAssistantState[] };
  if (!Array.isArray(body.states)) throw new Error("Home Assistant returned an invalid state list.");
  return body.states.slice(0, 100).filter((item) =>
    typeof item?.entityId === "string" && typeof item.state === "string"
    && (item.friendlyName === null || typeof item.friendlyName === "string")
  );
}
