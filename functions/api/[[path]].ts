import { createUpstreamAbortSignal } from "./upstreamAbort.ts";
import { handleProviderChatProxy, handleProviderModelsProxy } from "./providerProxy.ts";
import { buildDeveloperAnalysisMessages, resolveDeveloperAnalysisEngine, validateDeveloperAnalysisPayload } from "./developerAgent.ts";
import { authenticatePersonalOwner } from "./personalAuth.ts";
import { handleDeveloperDataRequest } from "./developerData.ts";
import { createAgentStorage, type D1Database } from "./agentStorage.ts";
import { fetchGeminiChat, getGeminiModel } from "./geminiProvider.ts";
import { handleAgenticAssistantRequest } from "./agenticAssistant.ts";
import { handleAgentMemorySearchRequest } from "./agentMemory.ts";
import { handleIntegrationRequest, type IntegrationEnv } from "./integrationHub.ts";
import { handleAttachmentRequest } from "./attachments.ts";
// Cloudflare Worker API: Native Developer Agent controls optional AI provider adapters.
// Ordinary /api/assistant/chat remains on its existing OpenRouter route.

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const OPENROUTER_MODEL_ID = "openrouter/free";
const OPENROUTER_FREE_FALLBACKS = [
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3.5-lightning:free",
  "thinkingmachines/inkling:free",
  "recursive/flint-v1.0:free",
] as const;
const RETRYABLE_UPSTREAM_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

interface Env {
  OPENROUTER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  BADBOY_OWNER_TOKEN?: string;
  AGENT_DB?: D1Database;
  TAVILY_API_KEY?: string;
  HOME_ASSISTANT_URL?: string;
  HOME_ASSISTANT_TOKEN?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_ALLOWED_CHANNEL_IDS?: string;
  DISCORD_BOT_TOKEN?: string;
  GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
}

const API_SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-transform",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Provider-Key",
  ...API_SECURITY_HEADERS,
};

function withApiSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Removes trailing slashes without a backtracking regex (SonarCloud S5852).
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === "/") end--;
  return value.slice(0, end);
}

function logModelDiagnostic(event: string, model: string, statusCode?: number) {
  // Never log prompts, user content, provider bodies, or credentials.
  console.info(JSON.stringify({
    component: "badboy-cloudflare-model-routing",
    event,
    model,
    ...(statusCode !== undefined ? { statusCode } : {}),
  }));
}

async function fetchChatWithFreeFallbacks(
  apiKey: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal?: AbortSignal,
): Promise<{ response: Response; model: string }> {
  const models = [OPENROUTER_MODEL_ID, ...OPENROUTER_FREE_FALLBACKS];
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    logModelDiagnostic("attempt", model);
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Badboy AI",
        },
        signal,
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages,
          stream: true,
        }),
      });

      if (response.ok && response.body) {
        logModelDiagnostic("selected", model, response.status);
        return { response, model };
      }

      logModelDiagnostic("unavailable", model, response.status);
      if (!RETRYABLE_UPSTREAM_STATUSES.has(response.status) || index === models.length - 1) {
        return { response, model };
      }
      // Retry only before returning any stream data to the client.
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      logModelDiagnostic("network_error", model);
      if (index === models.length - 1) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All free models are unavailable.");
}


type ChatProvider = "openrouter" | "gemini" | "groq";

function getGroqModel(configuredModel?: string): string {
  const candidate = configuredModel?.trim() || "openai/gpt-oss-20b";
  return /^[a-zA-Z0-9._/-]{1,120}$/.test(candidate)
    ? candidate
    : "openai/gpt-oss-20b";
}

function shouldFallbackProvider(status: number): boolean {
  return RETRYABLE_UPSTREAM_STATUSES.has(status) || status === 401 || status === 403;
}

async function fetchGroqChat(
  apiKey: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  model: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      max_completion_tokens: 8192,
      messages,
      stream: true,
    }),
  });
}

/**
 * Route ordinary chat across independent providers. OpenRouter's model-level
 * fallbacks run first; Gemini and Groq are separate provider-level fallbacks.
 * A provider is switched only before any response bytes reach the client.
 */
async function fetchChatWithProviderFallbacks(
  env: Env,
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal?: AbortSignal,
): Promise<{ response: Response; provider: ChatProvider; model: string }> {
  const openrouterApiKey = env.OPENROUTER_API_KEY?.trim() || "";
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || "";
  const groqApiKey = env.GROQ_API_KEY?.trim() || "";
  if (!openrouterApiKey && !geminiApiKey && !groqApiKey) {
    throw new Error("No chat AI provider is configured.");
  }

  let lastResponse: { response: Response; provider: ChatProvider; model: string } | undefined;
  let lastError: unknown;

  if (openrouterApiKey) {
    try {
      const routed = await fetchChatWithFreeFallbacks(openrouterApiKey, messages, signal);
      if (routed.response.ok && routed.response.body) {
        return { ...routed, provider: "openrouter" };
      }
      lastResponse = { ...routed, provider: "openrouter" };
      if (!shouldFallbackProvider(routed.response.status) && routed.response.status !== 200) {
        return lastResponse;
      }
      await routed.response.body?.cancel().catch(() => undefined);
      logModelDiagnostic("provider_fallback", "openrouter", routed.response.status);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      logModelDiagnostic("provider_network_error", "openrouter");
    }
  }

  if (geminiApiKey && !signal?.aborted) {
    const model = getGeminiModel(env.GEMINI_MODEL);
    try {
      const response = await fetchGeminiChat(geminiApiKey, messages, model, fetch, signal);
      if (response.ok && response.body) {
        logModelDiagnostic("selected", model, response.status);
        return { response, provider: "gemini", model };
      }
      lastResponse = { response, provider: "gemini", model };
      if (!shouldFallbackProvider(response.status) && response.status !== 200) {
        return lastResponse;
      }
      await response.body?.cancel().catch(() => undefined);
      logModelDiagnostic("provider_fallback", "gemini", response.status);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      logModelDiagnostic("provider_network_error", "gemini");
    }
  }

  if (groqApiKey && !signal?.aborted) {
    const model = getGroqModel(env.GROQ_MODEL);
    try {
      const response = await fetchGroqChat(groqApiKey, messages, model, signal);
      if (response.ok && response.body) {
        logModelDiagnostic("selected", model, response.status);
        return { response, provider: "groq", model };
      }
      lastResponse = { response, provider: "groq", model };
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      logModelDiagnostic("provider_network_error", "groq");
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("All configured chat AI providers are unavailable.");
}

type DeveloperProvider = "gemini" | "openrouter";

async function fetchDeveloperAnalysisWithProviders(
  env: Env,
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal?: AbortSignal,
): Promise<{ response: Response; provider: DeveloperProvider; model: string }> {
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || "";
  const openrouterApiKey = env.OPENROUTER_API_KEY?.trim() || "";

  // Native remains the controller. Gemini is the preferred optional adapter;
  // OpenRouter is used only when Gemini is unavailable/rate-limited and configured.
  if (geminiApiKey) {
    const model = getGeminiModel(env.GEMINI_MODEL);
    logModelDiagnostic("attempt", model);
    try {
      const response = await fetchGeminiChat(geminiApiKey, messages, model, fetch, signal);
      if (response.ok && response.body) {
        logModelDiagnostic("selected", model, response.status);
        return { response, provider: "gemini", model };
      }
      logModelDiagnostic("unavailable", model, response.status);
      if (!RETRYABLE_UPSTREAM_STATUSES.has(response.status) || !openrouterApiKey) {
        return { response, provider: "gemini", model };
      }
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      logModelDiagnostic("network_error", model);
      if (!openrouterApiKey) throw error;
    }
  }

  if (openrouterApiKey) {
    const routed = await fetchChatWithFreeFallbacks(openrouterApiKey, messages, signal);
    return { ...routed, provider: "openrouter" };
  }
  throw new Error("No Developer Agent AI provider is configured.");
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

const MAX_CHAT_REQUEST_BYTES = 64 * 1024;
const MAX_PROVIDER_REQUEST_BYTES = 160 * 1024;
const MAX_DEVELOPER_REQUEST_BYTES = 16 * 1024;
const MAX_SPEECH_REQUEST_BYTES = 64 * 1024;
// Base64 expands audio by roughly 4/3. Keep the existing 6 MB encoded-audio
// contract plus a small allowance for JSON metadata.
const MAX_TRANSCRIPTION_REQUEST_BYTES = 6_100_000;

type JsonBodyReadResult =
  | { body: unknown }
  | { response: Response };

/**
 * Parse JSON with an application-level byte ceiling.
 * Content-Length is only an early-rejection hint; the stream is always counted
 * so chunked requests cannot bypass the limit by omitting that header.
 */
async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyReadResult> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return {
      response: jsonResponse(
        { code: "UNSUPPORTED_MEDIA_TYPE", error: "Content-Type must be application/json." },
        415,
      ),
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      return {
        response: jsonResponse(
          { code: "INVALID_CONTENT_LENGTH", error: "Invalid Content-Length header." },
          400,
        ),
      };
    }
    if (declaredBytes > maxBytes) {
      return {
        response: jsonResponse(
          { code: "REQUEST_BODY_TOO_LARGE", error: "Request body exceeds the endpoint size limit." },
          413,
        ),
      };
    }
  }

  if (!request.body) {
    return {
      response: jsonResponse({ code: "INVALID_JSON_BODY", error: "Request body is required." }, 400),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          response: jsonResponse(
            { code: "REQUEST_BODY_TOO_LARGE", error: "Request body exceeds the endpoint size limit." },
            413,
          ),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      response: jsonResponse({ code: "INVALID_JSON_BODY", error: "Could not read request body." }, 400),
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already have been cancelled.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { body: JSON.parse(source) as unknown };
  } catch {
    return {
      response: jsonResponse({ code: "INVALID_JSON_BODY", error: "Request body must contain valid JSON." }, 400),
    };
  }
}

function systemInstruction(personality: string, developerMode: boolean) {
  const base =
    "You are Badboy, a highly intelligent, polite personal AI assistant with smart reasoning capabilities. Reply strictly in natural Bangla (Bengali) language by default. You also understand Banglish (Bengali written in English alphabet) and English. If the user explicitly speaks or requests English, reply in clear English. For complex questions or tasks, structure your response using these 5 points where appropriate: 1. Direct Answer, 2. Explanation, 3. Sources/Evidence, 4. Limitations, 5. Next Practical Step. When the user asks to play a song or open YouTube, confirm politely in Bangla and state that YouTube search results will open on their device. Never claim that music or video is playing inside the chat unless verified. Ask before sensitive data changes or external actions.";
  const developer =
    "Developer Mode Enabled: Assist the user in building, refining, and executing feature development for their Voice Memory Assistant. Parse feature requests across Web Development, Android App & APK Builder, Auto QA, Project Brain, and Self Development. Generate structured step-by-step development plans, detail file paths, write clean TS/TSX code, outline tests/typechecks, and guide GitHub branch & Pull Request workflows without claiming unverified PR creation or automatic production deployments.";
  const custom = personality.trim().slice(0, 1000);
  return [base, developerMode ? developer : "", custom]
    .filter(Boolean)
    .join("\n\n");
}

function extractDeltas(event: string): { texts: string[]; done: boolean } {
  const texts: string[] = [];
  let done = false;
  for (const line of event.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      continue;
    }
    if (!data) continue;
    let parsed: {
      error?: unknown;
      choices?: Array<{ delta?: { content?: unknown } }>;
    };
    try {
      parsed = JSON.parse(data) as typeof parsed;
    } catch {
      throw new Error("AI provider returned malformed stream data.");
    }
    if (parsed.error) throw new Error("AI provider returned an upstream stream error.");
    const delta = parsed.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) texts.push(delta);
  }
  return { texts, done };
}


function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}


async function handleTranscriptionRequest(request: Request, env: Env): Promise<Response> {
  const groqApiKey = env.GROQ_API_KEY?.trim() || "";
  const openrouterApiKey = env.OPENROUTER_API_KEY?.trim() || "";

  if (!groqApiKey && !openrouterApiKey) {
    return jsonResponse({
      code: "AI_NOT_CONFIGURED",
      error: "Speech transcription service is not configured on the server.",
    }, 503);
  }

  const parsedBody = await readJsonBody(request, MAX_TRANSCRIPTION_REQUEST_BYTES);
  if ("response" in parsedBody) return parsedBody.response;

  const payload = (parsedBody.body ?? {}) as {
    audioBase64?: unknown;
    format?: unknown;
    language?: unknown;
  };
  const allowedFormats = new Set(["wav", "mp3", "flac", "m4a", "ogg", "webm", "aac"]);
  if (
    typeof payload.audioBase64 !== "string" ||
    payload.audioBase64.length === 0 ||
    payload.audioBase64.length > 6_000_000 ||
    typeof payload.format !== "string" ||
    !allowedFormats.has(payload.format.toLowerCase()) ||
    (payload.language !== undefined && typeof payload.language !== "string")
  ) {
    return jsonResponse({
      error: "Invalid audio payload. Send audioBase64, a supported format, and optional language.",
    }, 400);
  }

  // Accept raw base64 only; data: URLs are deliberately rejected to avoid format ambiguity.
  const audioBase64 = payload.audioBase64.trim();
  if (audioBase64.startsWith("data:") || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) {
    return jsonResponse({ error: "Audio must be raw base64 data, without a data-URL prefix." }, 400);
  }

  const format = payload.format.toLowerCase();
  // Whisper accepts ISO-639-1 language codes, not locale tags such as en-US or bn-BD.
  const requestedLanguage = typeof payload.language === "string"
    ? payload.language.trim().toLowerCase().split(/[-_]/, 1)[0]
    : "";
  const lang = /^[a-z]{2}$/.test(requestedLanguage) ? requestedLanguage : undefined;
  const isBengali = lang?.toLowerCase().split(/[-_]/, 1)[0] === "bn";
  // Keep Bengali speech in Bengali script and preserve the speaker's actual words.
  // This is a transcription-style hint only; no chat history or generated answer is supplied.
  const transcriptionPrompt = isBengali
    ? "বাংলাদেশি বাংলা কথোপকথন হুবহু বাংলা লিপিতে লিখুন। কথার অর্থ বদলাবেন না, অনুবাদ বা সারাংশ করবেন না। স্পষ্টভাবে বলা ইংরেজি শব্দ ইংরেজিতেই রাখুন।"
    : undefined;

  // 1. Primary: Groq Cloud Whisper Large-V3 (ultra fast, free-tier supported)
  if (groqApiKey) {
    try {
      const mimeTypes: Record<string, string> = {
        wav: "audio/wav",
        mp3: "audio/mpeg",
        flac: "audio/flac",
        m4a: "audio/m4a",
        ogg: "audio/ogg",
        webm: "audio/webm",
        aac: "audio/aac",
      };
      const mimeType = mimeTypes[format] || "application/octet-stream";
      const audioBytes = base64ToUint8Array(audioBase64);
      const audioBlob = new Blob([audioBytes.buffer as ArrayBuffer], { type: mimeType });

      const formData = new FormData();
      formData.append("file", audioBlob, `audio.${format}`);
      formData.append("model", "whisper-large-v3");
      formData.append("response_format", "json");
      formData.append("temperature", "0");
      if (lang) {
        formData.append("language", lang);
      }
      if (transcriptionPrompt) {
        formData.append("prompt", transcriptionPrompt);
      }

      const upstreamAbort = createUpstreamAbortSignal(request);
      let groqResponse: Response;
      try {
        groqResponse = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: formData,
          signal: upstreamAbort.signal,
        });
        if (groqResponse.ok) {
          const result = (await groqResponse.json()) as { text?: unknown };
          if (typeof result.text === "string" && result.text.trim()) {
            return jsonResponse({
              text: result.text.trim(),
              provider: "groq",
              model: "whisper-large-v3",
            });
          }
        } else {
          console.warn(`[CF Function Warn] Groq whisper transcription returned HTTP ${groqResponse.status}. Attempting fallback.`);
        }
      } finally {
        upstreamAbort.cleanup();
      }

    } catch (groqErr) {
      console.warn("[CF Function Warn] Groq whisper transcription failed:", groqErr instanceof Error ? groqErr.message : String(groqErr));
    }
  }

  // Do not spend another provider request after the mobile client has cancelled.
  if (request.signal.aborted) {
    return jsonResponse({
      code: "TRANSCRIPTION_CANCELLED",
      error: "Speech transcription was cancelled by the client.",
    }, 499);
  }

  // 2. Fallback: OpenRouter transcription (openai/whisper-1)
  if (!openrouterApiKey) {
    return jsonResponse({
      code: "TRANSCRIPTION_UPSTREAM_FAILED",
      error: "Groq speech transcription failed and OpenRouter fallback is not configured.",
    }, 502);
  }

  try {
    const upstreamAbort = createUpstreamAbortSignal(request);
    try {
      const upstream = await fetch(`${OPENROUTER_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Badboy Voice Memory Assistant",
        },
        body: JSON.stringify({
          model: "openai/whisper-1",
          input_audio: {
            data: audioBase64,
            format,
          },
          ...(lang ? { language: lang } : {}),
        }),
        signal: upstreamAbort.signal,
      });

      if (upstream.status === 429) {
        return jsonResponse({
          code: "OPENROUTER_RATE_LIMIT",
          error: "Speech transcription rate limit reached. Please wait and try again.",
        }, 429);
      }

      if (!upstream.ok) {
        console.error(`[CF Function Error] OpenRouter transcription returned status ${upstream.status}.`);
        return jsonResponse({
          code: "TRANSCRIPTION_UPSTREAM_FAILED",
          error: `Speech transcription failed (HTTP ${upstream.status}). Try again later.`,
        }, 502);
      }

      const result = await upstream.json() as { text?: unknown; usage?: unknown };
      if (typeof result.text !== "string") {
        return jsonResponse({ code: "TRANSCRIPTION_EMPTY", error: "No transcript was returned." }, 502);
      }
      return jsonResponse({
        text: result.text,
        provider: "openrouter",
        model: "openai/whisper-1",
        ...(result.usage !== undefined ? { usage: result.usage } : {}),
      });
    } finally {
      upstreamAbort.cleanup();
    }
  } catch (err) {
    console.error("[CF Function Error] Transcription request failed:", err instanceof Error ? err.message : String(err));
    return jsonResponse({
      code: "TRANSCRIPTION_REQUEST_FAILED",
      error: "Could not reach the speech transcription service. Check the internet and try again.",
    }, 502);
  }
}

const EDGE_TTS_VOICE_MAP: Record<string, string> = {
  "bn-bd": "bn-BD-PradeepNeural",
  "bn-in": "bn-IN-BashkarNeural",
  "bn": "bn-BD-PradeepNeural",
  "en-us": "en-US-JennyNeural",
  "en-gb": "en-GB-SoniaNeural",
  "en-in": "en-IN-NeerjaNeural",
  "en": "en-US-JennyNeural",
  "hi-in": "hi-IN-SwaraNeural",
  "hi": "hi-IN-SwaraNeural",
  "ur-pk": "ur-PK-UzmaNeural",
  "ar-sa": "ar-SA-ZariyahNeural",
  "es-es": "es-ES-ElviraNeural",
  "fr-fr": "fr-FR-DeniseNeural",
  "de-de": "de-DE-KatjaNeural",
  "ja-jp": "ja-JP-NanamiNeural",
};

function resolveEdgeTtsVoice(language?: string): string | null {
  if (!language?.trim()) return "bn-BD-PradeepNeural";
  const normalized = language.trim().replace(/_/g, "-").toLowerCase();
  if (EDGE_TTS_VOICE_MAP[normalized]) return EDGE_TTS_VOICE_MAP[normalized];
  const langBase = normalized.split("-")[0];
  return EDGE_TTS_VOICE_MAP[langBase] ?? null;
}

/**
 * Microsoft Edge-TTS WebSocket synthesizer.
 * Connects to Microsoft Edge's ReadAloud service to stream natural neural speech.
 */
async function synthesizeEdgeTts(text: string, voice: string): Promise<Uint8Array | null> {
  const trustedToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedToken}`;

  return new Promise((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return resolve(null);
    }

    const audioChunks: Uint8Array[] = [];
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(null);
    }, 7000);

    ws.onopen = () => {
      const now = new Date().toISOString();
      const configMsg =
        `X-Timestamp:${now}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`;
      ws.send(configMsg);

      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      const reqId = "req-" + Date.now().toString(16);
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
        `<voice name="${voice}">${escaped}</voice>` +
        `</speak>`;
      const ssmlMsg =
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `Path:ssml\r\n\r\n` +
        `${ssml}`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event: MessageEvent) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          try {
            ws.close();
          } catch {
            // ignore
          }
          if (audioChunks.length === 0) return resolve(null);
          const totalLength = audioChunks.reduce((acc, c) => acc + c.length, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of audioChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(merged);
        }
      } else {
        try {
          const rawBuf = await (event.data as Blob).arrayBuffer();
          const view = new DataView(rawBuf);
          if (rawBuf.byteLength > 2) {
            const headerLen = view.getUint16(0);
            if (rawBuf.byteLength > 2 + headerLen) {
              const audioBytes = new Uint8Array(rawBuf.slice(2 + headerLen));
              audioChunks.push(audioBytes);
            }
          }
        } catch {
          // ignore
        }
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (audioChunks.length > 0) {
        const totalLength = audioChunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(merged);
      } else {
        resolve(null);
      }
    };
  });
}

async function handleSpeechRequest(request: Request, env: Env): Promise<Response> {
  const parsedBody = await readJsonBody(request, MAX_SPEECH_REQUEST_BYTES);
  if ("response" in parsedBody) return parsedBody.response;

  const { text, language = "bn-BD" } = (parsedBody.body ?? {}) as {
    text?: unknown;
    language?: unknown;
  };

  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 4000 ||
    typeof language !== "string" ||
    language.length > 30
  ) {
    return jsonResponse({
      code: "INVALID_SPEECH_REQUEST",
      error: "Invalid speech text or language parameter.",
    }, 400);
  }

  const cleanText = text.trim();
  const selectedVoice = resolveEdgeTtsVoice(language);

  // Languages without a verified Edge neural voice must use the device's
  // locale-aware TTS engine. Never silently speak them with a Bengali voice.
  if (!selectedVoice) {
    return jsonResponse({
      code: "FALLBACK_TO_CLIENT_TTS",
      error: `No verified cloud TTS voice is configured for ${language}. Use the device's local speech engine.`,
      language,
    }, 503);
  }

  // 1. Primary: Microsoft Edge-TTS Natural Neural Voice
  try {
    const edgeAudio = await synthesizeEdgeTts(cleanText, selectedVoice);
    if (edgeAudio && edgeAudio.byteLength > 0) {
      return new Response(edgeAudio.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "X-TTS-Voice": selectedVoice,
          "X-TTS-Engine": "microsoft-edge",
          ...CORS_HEADERS,
        },
      });
    }
  } catch (edgeErr) {
    console.warn("[CF Function Warn] Edge-TTS synthesis failed:", edgeErr instanceof Error ? edgeErr.message : String(edgeErr));
  }

  // 2. Secondary fallback: OpenRouter audio/speech (if configured)
  const openrouterApiKey = env.OPENROUTER_API_KEY?.trim();
  if (openrouterApiKey) {
    const upstreamAbort = createUpstreamAbortSignal(request, 30_000);
    try {
      const upstream = await fetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          model: "fish-audio/s2.1-pro-free:free",
          input: cleanText,
          response_format: "mp3",
          voice: selectedVoice,
        }),
        signal: upstreamAbort.signal,
      });

      if (upstream.ok) {
        const audioBytes = await upstream.arrayBuffer();
        if (audioBytes.byteLength > 0) {
          return new Response(audioBytes, {
            status: 200,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
              "X-TTS-Voice": selectedVoice,
              "X-TTS-Engine": "openrouter-fish-audio",
              ...CORS_HEADERS,
            },
          });
        }
      }
    } catch (ttsErr) {
      console.warn("[CF Function Warn] Cloud speech upstream failed:", ttsErr instanceof Error ? ttsErr.message : String(ttsErr));
    } finally {
      upstreamAbort.cleanup();
    }

  }

  // The mobile client treats every 2xx response as audio bytes. Use a non-2xx
  // status so requestSpeech parses this JSON error and voice.ts activates local TTS.
  return jsonResponse({
    code: "FALLBACK_TO_CLIENT_TTS",
    error: "Cloud speech is unavailable. Use the device's local speech engine.",
    voice: selectedVoice,
    language,
  }, 503);
}

async function handleDeveloperAnalysisRequest(request: Request, env: Env, ownerId: string): Promise<Response> {
  const parsedBody = await readJsonBody(request, MAX_DEVELOPER_REQUEST_BYTES);
  if ("response" in parsedBody) return parsedBody.response;

  const validation = validateDeveloperAnalysisPayload(parsedBody.body);
  if (!validation.ok) {
    return jsonResponse(
      { code: validation.code, error: validation.error },
      400,
    );
  }

  const resolution = resolveDeveloperAnalysisEngine(validation.value.requestedEngine);
  if (resolution.status === "unavailable") {
    return jsonResponse(
      {
        code: "COPILOT_RUNTIME_UNAVAILABLE",
        error: resolution.reason,
        requestedEngine: validation.value.requestedEngine,
      },
      409,
    );
  }

  const hasGeminiProvider = Boolean(env.GEMINI_API_KEY?.trim());
  const hasOpenRouterProvider = Boolean(env.OPENROUTER_API_KEY?.trim());
  if (!hasGeminiProvider && !hasOpenRouterProvider) {
    return jsonResponse(
      {
        code: "AI_NOT_CONFIGURED",
        error: "Configure GEMINI_API_KEY or OPENROUTER_API_KEY in the server environment.",
      },
      503,
    );
  }

  if (!env.AGENT_DB) {
    return jsonResponse({
      code: "AGENT_STORAGE_NOT_CONFIGURED",
      error: "Developer Agent task persistence is not configured.",
    }, 503);
  }

  const storage = createAgentStorage(env.AGENT_DB);
  const taskId = crypto.randomUUID();
  const engine = resolution.activeEngine ?? "native";
  try {
    await storage.createTask({
      taskId,
      ownerId,
      status: "running",
      engine,
      title: validation.value.prompt.slice(0, 200),
      summary: validation.value.projectContext.slice(0, 4000),
    });
    await storage.appendTaskEvent({
      eventId: crypto.randomUUID(),
      taskId,
      ownerId,
      eventType: "task_started",
      payload: { engine, requestedEngine: validation.value.requestedEngine },
    });
  } catch {
    return jsonResponse({
      code: "DEVELOPER_TASK_PERSISTENCE_FAILED",
      error: "Developer Agent could not create its private task record.",
    }, 503);
  }

  console.info(JSON.stringify({
    component: "badboy-developer-agent",
    event: "task_started",
    taskId,
    engine,
    requestedEngine: validation.value.requestedEngine,
  }));

  const upstreamAbort = createUpstreamAbortSignal(request, 90_000);
  let upstream: Response;
  let selectedProvider: DeveloperProvider = "openrouter";
  let selectedModel = OPENROUTER_MODEL_ID;
  try {
    const routed = await fetchDeveloperAnalysisWithProviders(
      env,
      buildDeveloperAnalysisMessages(validation.value),
      upstreamAbort.signal,
    );
    upstream = routed.response;
    selectedProvider = routed.provider;
    selectedModel = routed.model;
  } catch {
    const wasCancelled = request.signal.aborted;
    upstreamAbort.cleanup();
    await storage.updateTaskStatus({
      taskId, ownerId, status: wasCancelled ? "cancelled" : "failed",
    }).catch(() => false);
    await storage.appendTaskEvent({
      eventId: crypto.randomUUID(), taskId, ownerId,
      eventType: wasCancelled ? "task_cancelled" : "task_failed",
      payload: { reason: wasCancelled ? "client_disconnected" : upstreamAbort.wasTimedOut() ? "upstream_timeout" : "upstream_network_error" },
    }).catch(() => false);
    if (wasCancelled) return new Response(null, { status: 499, headers: CORS_HEADERS });
    return jsonResponse(
      {
        code: upstreamAbort.wasTimedOut() ? "DEVELOPER_AGENT_UPSTREAM_TIMEOUT" : "DEVELOPER_AGENT_UPSTREAM_FAILED",
        error: upstreamAbort.wasTimedOut()
          ? "Developer Agent provider timed out. Please retry."
          : "Developer Agent could not reach an available AI provider.",
        taskId,
      },
      upstreamAbort.wasTimedOut() ? 504 : 502,
    );
  }

  if (!upstream.ok || !upstream.body) {
    upstreamAbort.cleanup();
    const status = upstream.status === 429 ? 429 : 502;
    await storage.updateTaskStatus({ taskId, ownerId, status: "failed" }).catch(() => false);
    await storage.appendTaskEvent({
      eventId: crypto.randomUUID(), taskId, ownerId,
      eventType: "task_failed", payload: { upstreamStatus: upstream.status },
    }).catch(() => false);
    console.info(JSON.stringify({
      component: "badboy-developer-agent",
      event: "task_failed",
      taskId,
      engine,
      provider: selectedProvider,
      model: selectedModel,
      upstreamStatus: upstream.status,
    }));
    return jsonResponse(
      {
        code: upstream.status === 429
          ? (selectedProvider === "gemini" ? "GEMINI_RATE_LIMIT" : "OPENROUTER_RATE_LIMIT")
          : "DEVELOPER_AGENT_UPSTREAM_FAILED",
        error: upstream.status === 429
          ? "AI provider rate limit reached. Please try again shortly."
          : `Developer Agent provider returned HTTP ${upstream.status}.`,
        taskId,
      },
      status,
    );
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let taskFinalized = false;
  let finalizationPromise: Promise<void> | null = null;
  let downstreamCancelled = false;
  let accumulatedOutput = "";

  const finalizeTask = async (status: "completed" | "failed" | "cancelled", reason?: string) => {
    if (taskFinalized) return;
    if (finalizationPromise) return finalizationPromise;
    finalizationPromise = (async () => {
      const updated = await storage.updateTaskStatus({
        taskId,
        ownerId,
        status,
        ...(status === "completed" ? { summary: accumulatedOutput.slice(0, 4000) } : {}),
      });
      if (!updated) throw new Error("Task record could not be finalized.");
      await storage.appendTaskEvent({
        eventId: crypto.randomUUID(),
        taskId,
        ownerId,
        eventType: status === "completed" ? "task_completed" : status === "cancelled" ? "task_cancelled" : "task_failed",
        payload: status === "completed"
          ? { outputLength: accumulatedOutput.length }
          : { reason: reason ?? status },
      });
      taskFinalized = true;
    })();
    try {
      await finalizationPromise;
    } finally {
      finalizationPromise = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      const send = (payload: string) => {
        if (downstreamCancelled || streamClosed) return;
        try {
          controller.enqueue(encoder.encode("data: " + payload + "\n\n"));
        } catch {
          streamClosed = true;
        }
      };
      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        try { controller.close(); } catch { /* downstream may already be closed */ }
      };

      send(JSON.stringify({ taskId, engine, provider: selectedProvider, model: selectedModel, status: "started" }));
      const completeTask = async () => {
        if (!accumulatedOutput.trim()) {
          await finalizeTask("failed", "empty_output");
          send(JSON.stringify({ error: "Developer Agent returned an empty response.", taskId, engine }));
          close();
          return;
        }
        await finalizeTask("completed");
        send(JSON.stringify({ taskId, engine, status: "completed" }));
        send("[DONE]");
        console.info(JSON.stringify({
          component: "badboy-developer-agent",
          event: "task_completed",
          taskId,
          engine,
        }));
        close();
      };

      try {
        let pending = "";
        let receivedDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (downstreamCancelled || (upstreamAbort.signal.aborted && !upstreamAbort.wasTimedOut())) {
              await finalizeTask("cancelled", "client_disconnected");
              close();
              return;
            }
            if (upstreamAbort.wasTimedOut()) {
              await finalizeTask("failed", "upstream_timeout");
              send(JSON.stringify({ error: "Developer Agent provider timed out.", taskId, engine }));
              close();
              return;
            }
            break;
          }
          pending += decoder.decode(value, { stream: true });
          pending = pending.replace(/\r\n/g, "\n");
          let boundary = pending.indexOf("\n\n");
          while (boundary >= 0) {
            const event = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const parsed = extractDeltas(event);
            for (const content of parsed.texts) {
              accumulatedOutput = (accumulatedOutput + content).slice(0, 4000);
              send(JSON.stringify({ content, taskId, engine, provider: selectedProvider }));
            }
            if (parsed.done) {
              receivedDone = true;
              if (downstreamCancelled || (upstreamAbort.signal.aborted && !upstreamAbort.wasTimedOut())) {
                await finalizeTask("cancelled", "client_disconnected");
                close();
                return;
              }
              if (upstreamAbort.wasTimedOut()) {
                await finalizeTask("failed", "upstream_timeout");
                send(JSON.stringify({ error: "Developer Agent provider timed out.", taskId, engine }));
                close();
                return;
              }
              await completeTask();
              return;
            }
            boundary = pending.indexOf("\n\n");
          }
        }

        pending += decoder.decode();
        if (pending.trim()) {
          const parsed = extractDeltas(pending);
          for (const content of parsed.texts) {
            accumulatedOutput = (accumulatedOutput + content).slice(0, 4000);
            send(JSON.stringify({ content, taskId, engine, provider: selectedProvider }));
          }
          receivedDone = parsed.done;
        }
        if (downstreamCancelled || (upstreamAbort.signal.aborted && !upstreamAbort.wasTimedOut())) {
          await finalizeTask("cancelled", "client_disconnected");
          close();
          return;
        }
        if (upstreamAbort.wasTimedOut()) {
          await finalizeTask("failed", "upstream_timeout");
          send(JSON.stringify({ error: "Developer Agent provider timed out.", taskId, engine }));
          close();
          return;
        }
        if (!receivedDone) throw new Error("Developer Agent stream ended before the completion marker.");
        await completeTask();
      } catch {
        const wasCancelled = downstreamCancelled || request.signal.aborted;
        const timedOut = upstreamAbort.wasTimedOut();
        await finalizeTask(wasCancelled ? "cancelled" : "failed", wasCancelled ? "client_disconnected" : timedOut ? "upstream_timeout" : "stream_interrupted").catch(() => undefined);
        if (!wasCancelled) {
          send(JSON.stringify({
            error: timedOut ? "Developer Agent provider timed out." : "Developer Agent stream was interrupted.",
            taskId,
            engine,
          }));
        }
        console.info(JSON.stringify({
          component: "badboy-developer-agent",
          event: wasCancelled ? "task_cancelled" : "task_failed",
          taskId,
          engine,
          reason: wasCancelled ? "client_disconnected" : timedOut ? "upstream_timeout" : "stream_interrupted",
        }));
        close();
      } finally {
        upstreamAbort.cleanup();
        try { reader.releaseLock(); } catch { /* reader may already be released */ }
      }
    },
    async cancel(reason) {
      downstreamCancelled = true;
      upstreamAbort.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
      await finalizeTask("cancelled", "downstream_cancelled").catch(() => undefined);
      upstreamAbort.cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "X-Badboy-Task-Id": taskId,
      "X-Badboy-Engine": engine,
      "X-Badboy-Provider": selectedProvider,
      "X-Badboy-Task-Status": "running",
      ...CORS_HEADERS,
    },
  });
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawPathname = trimTrailingSlashes(url.pathname);
  const pathname = rawPathname.startsWith("/api")
    ? rawPathname
    : `/api${rawPathname.startsWith("/") ? rawPathname : `/${rawPathname}`}`;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Keep only service health and the credential verifier public. Every other
  // Security invariant: verify the personal owner token before any API or private D1/Developer Agent data access.
  if (request.method === "POST" && pathname === "/api/auth/verify") {
    const auth = await authenticatePersonalOwner(request, env);
    if (!auth.ok) return auth.response;
    return jsonResponse({ authenticated: true }, 200);
  }

  const isPublicHealthCheck = request.method === "GET" &&
    (pathname === "/api/healthz" || pathname === "/api/health");
  let verifiedOwnerId: string | null = null;
  if (!isPublicHealthCheck) {
    const auth = await authenticatePersonalOwner(request, env);
    if (!auth.ok) return auth.response;
    verifiedOwnerId = auth.identity.ownerId;
  }

  if (verifiedOwnerId) {
    const dataResponse = await handleDeveloperDataRequest(request, env, verifiedOwnerId);
    if (dataResponse) return dataResponse;
  }

  if (pathname === "/api/attachments" || pathname.startsWith("/api/attachments/")) {
    return handleAttachmentRequest(request, pathname, env.AGENT_DB, verifiedOwnerId ?? "");
  }

  if (request.method === "GET") {
    if (pathname === "/api/developer/health") {
      const geminiAvailable = Boolean(env.GEMINI_API_KEY?.trim());
      const openrouterAvailable = Boolean(env.OPENROUTER_API_KEY?.trim());
      const nativeAvailable = geminiAvailable || openrouterAvailable;
      let taskPersistenceAvailable = false;
      if (env.AGENT_DB) {
        try {
          const table = await env.AGENT_DB.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_tasks' LIMIT 1",
          ).first<{ name: string }>();
          taskPersistenceAvailable = Boolean(table?.name);
        } catch {
          taskPersistenceAvailable = false;
        }
      }
      const analysisAvailable = nativeAvailable && taskPersistenceAvailable;
      return jsonResponse({
        status: analysisAvailable ? "ready" : "degraded",
        engines: {
          native: { available: nativeAvailable },
          providers: {
            gemini: { available: geminiAvailable, model: getGeminiModel(env.GEMINI_MODEL) },
            openrouter: { available: openrouterAvailable },
          },
          copilot: {
            available: false,
            reason: "Isolated Copilot CLI runtime and authentication are not yet validated.",
          },
          auto: { available: analysisAvailable, selectedEngine: analysisAvailable ? "native" : null },
        },
        capabilities: {
          analysis: analysisAvailable,
          taskPersistence: taskPersistenceAvailable,
          repositoryRead: false,
          repositoryWrite: false,
          workflowDispatch: false,
        },
      }, analysisAvailable ? 200 : 503);
    }
    if (pathname === "/api/healthz" || pathname === "/api/health") {
      const openrouterConfigured = Boolean(env.OPENROUTER_API_KEY?.trim());
      const geminiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
      const groqConfigured = Boolean(env.GROQ_API_KEY?.trim());
      const chatConfigured = openrouterConfigured || geminiConfigured || groqConfigured;
      const transcriptionConfigured = Boolean(groqConfigured || openrouterConfigured);
      const anyCapabilityConfigured = chatConfigured || transcriptionConfigured;
      return jsonResponse(
        {
          status: chatConfigured ? "ok" : anyCapabilityConfigured ? "partial" : "degraded",
          // Keep the legacy field for existing clients; it describes chat capability.
          aiConfigured: chatConfigured,
          capabilities: {
            chat: chatConfigured,
            transcription: transcriptionConfigured,
            // The existing cloud speech endpoint still depends on OpenRouter.
            serverSpeech: openrouterConfigured,
          },
          providers: {
            openrouter: openrouterConfigured,
            geminiChat: geminiConfigured,
            groqChat: groqConfigured,
            groqTranscription: groqConfigured,
          },
          model: openrouterConfigured
            ? OPENROUTER_MODEL_ID
            : geminiConfigured
              ? getGeminiModel(env.GEMINI_MODEL)
              : groqConfigured
                ? getGroqModel(env.GROQ_MODEL)
                : OPENROUTER_MODEL_ID,
          fallbackCount: OPENROUTER_FREE_FALLBACKS.length,
        },
        anyCapabilityConfigured ? 200 : 503,
      );
    }
    return jsonResponse({ error: "Endpoint not found." }, 404);
  }

  if (pathname.startsWith("/api/integrations/") || pathname === "/api/research/search") {
    // Pass only the identity established by authenticatePersonalOwner and the
    // server-side D1 binding; request payloads never choose an approval owner.
    return handleIntegrationRequest(
      request,
      pathname,
      env as IntegrationEnv,
      fetch,
      verifiedOwnerId ?? "",
      env.AGENT_DB,
    );
  }

  if (request.method === "POST" && pathname === "/api/developer/analyze") {
    return handleDeveloperAnalysisRequest(request, env, verifiedOwnerId ?? "");
  }

  if (pathname === "/api/agent/memory/search") {
    return handleAgentMemorySearchRequest(request, verifiedOwnerId ?? "", env.AGENT_DB);
  }

  if (request.method === "POST" && pathname === "/api/assistant/agent") {
    return handleAgenticAssistantRequest(request, env, verifiedOwnerId ?? "");
  }

  if (request.method === "POST" && pathname === "/api/assistant/transcribe") {
    return handleTranscriptionRequest(request, env);
  }

  if (request.method === "POST" && (pathname === "/api/assistant/speech" || pathname === "/api/assistant/speak")) {
    return handleSpeechRequest(request, env);
  }

  if (request.method === "POST" && (
    pathname === "/api/assistant/provider-chat" ||
    pathname === "/api/assistant/provider-models"
  )) {
    const parsedBody = await readJsonBody(request, MAX_PROVIDER_REQUEST_BYTES);
    if ("response" in parsedBody) return parsedBody.response;
    return pathname === "/api/assistant/provider-chat"
      ? handleProviderChatProxy(request, parsedBody.body)
      : handleProviderModelsProxy(request, parsedBody.body);
  }

  // Preserve the legacy Netlify/Express voice route while keeping the
  // current text-only model capability contract explicit on the Worker.
  if (request.method === "POST" && pathname === "/api/assistant/voice") {
    return jsonResponse({
      code: "MODEL_AUDIO_UNSUPPORTED",
      error: "The selected free chat model accepts text input and returns text only. Voice synthesis is handled by the supported /api/assistant/speech route or client-side TTS.",
    }, 501);
  }

  if (request.method !== "POST" || pathname !== "/api/assistant/chat") {
    return jsonResponse({ error: "Endpoint not found." }, 404);
  }

  const parsedBody = await readJsonBody(request, MAX_CHAT_REQUEST_BYTES);
  if ("response" in parsedBody) return parsedBody.response;

  const { message, personality = "", developerMode = false } = (parsedBody.body ?? {}) as {
    message?: unknown;
    personality?: unknown;
    developerMode?: unknown;
  };

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > 4000 ||
    typeof personality !== "string" ||
    typeof developerMode !== "boolean"
  ) {
    return jsonResponse({ error: "Invalid assistant message payload." }, 400);
  }

  const hasChatProvider = Boolean(
    env.OPENROUTER_API_KEY?.trim() || env.GEMINI_API_KEY?.trim() || env.GROQ_API_KEY?.trim(),
  );
  if (!hasChatProvider) {
    console.error("[CF Function Error] No chat AI provider is configured.");
    return jsonResponse(
      {
        code: "AI_NOT_CONFIGURED",
        error: "Configure at least one server-side AI provider (OpenRouter, Gemini, or Groq) to activate AI chat.",
      },
      503
    );
  }

  const upstreamAbort = createUpstreamAbortSignal(request, 90_000);
  let upstream: Response;
  let selectedProvider: ChatProvider = "openrouter";
  let selectedModel = OPENROUTER_MODEL_ID;
  try {
    const routed = await fetchChatWithProviderFallbacks(env, [
      {
        role: "system",
        content: systemInstruction(personality, developerMode),
      },
      { role: "user", content: message.trim() },
    ], upstreamAbort.signal);
    upstream = routed.response;
    selectedProvider = routed.provider;
    selectedModel = routed.model;
  } catch (err) {
    const wasCancelled = request.signal.aborted;
    const timedOut = upstreamAbort.wasTimedOut();
    upstreamAbort.cleanup();
    if (wasCancelled) return new Response(null, { status: 499, headers: CORS_HEADERS });
    console.error("[CF Function Error] AI provider routing failed:", err instanceof Error ? err.message : String(err));
    return jsonResponse(
      {
        code: timedOut ? "AI_PROVIDER_REQUEST_TIMEOUT" : "AI_PROVIDER_REQUEST_FAILED",
        error: timedOut
          ? "AI provider request timed out. Please try again."
          : "All configured AI providers could not be reached. Check provider status and try again.",
      },
      timedOut ? 504 : 502
    );
  }

  if (upstream.status === 429) {
    upstreamAbort.cleanup();
    console.error("[CF Function Error] All configured AI providers are rate limited (429).");
    return jsonResponse(
      {
        code: "AI_PROVIDER_RATE_LIMIT",
        error: "All configured AI providers are currently rate limited. Please try again shortly.",
      },
      429
    );
  }

  if (!upstream.ok || !upstream.body) {
    upstreamAbort.cleanup();
    // Avoid logging provider response bodies; keep diagnostics sanitized.
    console.error("[CF Function Error] " + selectedProvider + " provider returned status " + upstream.status + " for model " + selectedModel + ".");
    return jsonResponse(
      {
        code: "AI_PROVIDER_REQUEST_FAILED",
        error: "AI provider error (" + upstream.status + "). Please try again later.",
      },
      502
    );
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let downstreamCancelled = false;
  let emittedContent = false;
  const stream = new ReadableStream({
    async start(controller) {
      let pending = "";
      let streamClosed = false;
      const send = (payload: string) => {
        if (downstreamCancelled || streamClosed) return;
        try {
          controller.enqueue(encoder.encode("data: " + payload + "\n\n"));
        } catch {
          streamClosed = true;
        }
      };
      const close = () => {
        if (streamClosed) return;
        streamClosed = true;
        try { controller.close(); } catch { /* downstream may already be closed */ }
      };

      try {
        let receivedDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          pending = pending.replace(/\r\n/g, "\n");
          let boundary = pending.indexOf("\n\n");
          while (boundary >= 0) {
            const event = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const { texts, done: streamDone } = extractDeltas(event);
            for (const content of texts) {
              emittedContent = true;
              send(JSON.stringify({ content }));
            }
            if (streamDone) {
              receivedDone = true;
              if (downstreamCancelled || request.signal.aborted) {
                close();
                return;
              }
              if (!emittedContent) {
                send(JSON.stringify({ error: "OpenRouter returned an empty response." }));
                close();
                return;
              }
              send("[DONE]");
              close();
              return;
            }
            boundary = pending.indexOf("\n\n");
          }
        }
        pending += decoder.decode();
        if (pending.trim()) {
          const parsed = extractDeltas(pending);
          for (const content of parsed.texts) send(JSON.stringify({ content }));
          receivedDone = parsed.done;
        }
        if (downstreamCancelled || request.signal.aborted) {
          close();
          return;
        }
        if (upstreamAbort.wasTimedOut()) {
          send(JSON.stringify({ error: "OpenRouter request timed out." }));
        } else if (!receivedDone) {
          send(JSON.stringify({ error: "OpenRouter stream ended before the completion marker." }));
        } else if (!emittedContent) {
          send(JSON.stringify({ error: "OpenRouter returned an empty response." }));
        } else {
          send("[DONE]");
        }
        close();
      } catch (streamErr) {
        const wasCancelled = downstreamCancelled || request.signal.aborted;
        const timedOut = upstreamAbort.wasTimedOut();
        console.error("[CF Function Error] Stream reading interrupted:", streamErr instanceof Error ? streamErr.message : String(streamErr));
        if (!wasCancelled) {
          send(JSON.stringify({
            error: timedOut ? "OpenRouter request timed out." : "OpenRouter stream interrupted.",
          }));
        }
        close();
      } finally {
        upstreamAbort.cleanup();
        try { reader.releaseLock(); } catch { /* reader may already be released */ }
      }
    },
    async cancel(reason) {
      downstreamCancelled = true;
      upstreamAbort.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
      upstreamAbort.cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (promise: Promise<unknown>) => void }): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname === "/api" ||
      url.pathname.startsWith("/assistant/") ||
      url.pathname === "/healthz" ||
      url.pathname === "/health"
    ) {
      return withApiSecurityHeaders(await handleApiRequest(request, env));
    }
    const assets = (env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
    if (assets) {
      return assets.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};
