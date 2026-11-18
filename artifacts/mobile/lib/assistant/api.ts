import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import type { AssistantSettings } from '@/lib/assistant/types';
import { getTranscriptionLanguageCode } from './transcriptionLanguage';
import { getOwnerToken } from './ownerAuth';
import { streamProviderReply } from './providerChat';
import { getCloudflareAccountId, getDefaultModel, getProvider, getProviderBaseUrl, getProviderKey } from './providerManager';

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

export async function streamReply(
  message: string,
  settings: AssistantSettings,
  onChunk: (chunk: string) => void,
) {
  // A locally selected provider/model takes precedence for ordinary chat.
  // Agentic chat and developer workflows keep their existing owner-authenticated orchestration path.
  const providerHandled = await streamProviderReply(
    `${settings.personality}\n\nLanguage preference: ${settings.voiceLanguage}.\n\n${message}`,
    onChunk,
  );
  if (providerHandled) return;
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

type AgenticProviderRequest = {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
};

async function getAgenticProviderRequest(): Promise<AgenticProviderRequest | undefined> {
  const selected = await getDefaultModel();
  if (!selected) return undefined;
  const provider = getProvider(selected.providerId);
  if (!provider) throw new Error('Selected AI provider is not supported.');
  if (selected.providerId === 'omniroute') {
    throw new Error('OmniRoute is running on this phone (127.0.0.1); cloud Agentic Chat cannot reach a phone-local endpoint. Use a public HTTPS provider for Agentic Chat.');
  }
  const apiKey = await getProviderKey(selected.providerId);
  if (!apiKey) throw new Error(`${provider.name} API Key is missing. Reconnect this provider in Settings.`);
  let baseUrl = (await getProviderBaseUrl(selected.providerId)).replace(/\/+$/, '');
  if (provider.compatible === 'gemini') baseUrl += '/openai';
  if (provider.compatible === 'cohere') baseUrl += '/compatibility/v1';
  if (provider.compatible === 'cloudflare') {
    const accountId = await getCloudflareAccountId();
    if (!accountId) throw new Error('Cloudflare Account ID is required for Agentic Chat.');
    baseUrl += `/accounts/${accountId}/ai/v1`;
  }
  return { providerId: selected.providerId, baseUrl, apiKey, modelId: selected.modelId };
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
  const safeMemoryContext = memoryContext.trim().slice(0, 5000);
  const safeSkillContext = skillContext.trim().slice(0, 4000);
  const provider = await getAgenticProviderRequest();
  const response = await expoFetch(apiUrl('/assistant/agent'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: await ownerAuthorizationHeader(),
    },
    body: JSON.stringify({
      message,
      ...(provider ? { provider } : {}),
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
  await streamSseResponse(response, onChunk);
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
