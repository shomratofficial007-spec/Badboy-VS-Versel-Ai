import { buildDeveloperAnalysisMessages, resolveDeveloperAnalysisEngine, validateDeveloperAnalysisPayload } from "./developerAgent.ts";
import { authenticatePersonalOwner } from "./personalAuth.ts";
import { handleDeveloperDataRequest } from "./developerData.ts";
import { createAgentStorage, type D1Database } from "./agentStorage.ts";
// Cloudflare Pages Function: /api/* routes backed by OpenRouter.
// Directs /api/assistant/chat requests to OpenRouter with streaming SSE.

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
  GROQ_API_KEY?: string;
  BADBOY_OWNER_TOKEN?: string;
  AGENT_DB?: D1Database;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

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
          "X-Title": "Badboy Voice Memory Assistant",
        },
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

const MAX_CHAT_REQUEST_BYTES = 64 * 1024;
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
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) texts.push(delta);
    } catch {
      // Ignore malformed chunks
    }
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

      const groqResponse = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: formData,
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
    } catch (groqErr) {
      console.warn("[CF Function Warn] Groq whisper transcription failed:", groqErr instanceof Error ? groqErr.message : String(groqErr));
    }
  }

  // 2. Fallback: OpenRouter transcription (openai/whisper-1)
  if (!openrouterApiKey) {
    return jsonResponse({
      code: "TRANSCRIPTION_UPSTREAM_FAILED",
      error: "Groq speech transcription failed and OpenRouter fallback is not configured.",
    }, 502);
  }

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

function resolveEdgeTtsVoice(language?: string): string {
  if (!language) return "bn-BD-PradeepNeural";
  const normalized = language.trim().toLowerCase();
  if (EDGE_TTS_VOICE_MAP[normalized]) return EDGE_TTS_VOICE_MAP[normalized];
  const langBase = normalized.split("-")[0];
  return EDGE_TTS_VOICE_MAP[langBase] || "bn-BD-PradeepNeural";
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

  // 1. Primary: Microsoft Edge-TTS Natural Neural Voice
  try {
    const edgeAudio = await synthesizeEdgeTts(cleanText, selectedVoice);
    if (edgeAudio && edgeAudio.byteLength > 0) {
      return new Response(edgeAudio.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
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
      });

      if (upstream.ok) {
        const audioBytes = await upstream.arrayBuffer();
        if (audioBytes.byteLength > 0) {
          return new Response(audioBytes, {
            status: 200,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
              "Cache-Control": "no-store",
              "X-TTS-Voice": selectedVoice,
              "X-TTS-Engine": "openrouter-fish-audio",
              ...CORS_HEADERS,
            },
          });
        }
      }
    } catch (ttsErr) {
      console.warn("[CF Function Warn] Cloud speech upstream failed:", ttsErr instanceof Error ? ttsErr.message : String(ttsErr));
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

  const apiKey = env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) {
    return jsonResponse(
      {
        code: "AI_NOT_CONFIGURED",
        error: "Developer Agent Native engine requires OPENROUTER_API_KEY.",
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

  let upstream: Response;
  try {
    const routed = await fetchChatWithFreeFallbacks(
      apiKey,
      buildDeveloperAnalysisMessages(validation.value),
    );
    upstream = routed.response;
  } catch {
    await storage.updateTaskStatus({ taskId, ownerId, status: "failed" }).catch(() => false);
    await storage.appendTaskEvent({
      eventId: crypto.randomUUID(), taskId, ownerId,
      eventType: "task_failed", payload: { reason: "upstream_network_error" },
    }).catch(() => false);
    console.info(JSON.stringify({
      component: "badboy-developer-agent",
      event: "task_failed",
      taskId,
      engine,
      reason: "upstream_network_error",
    }));
    return jsonResponse(
      {
        code: "DEVELOPER_AGENT_UPSTREAM_FAILED",
        error: "Developer Agent could not reach an available AI provider.",
        taskId,
      },
      502,
    );
  }

  if (!upstream.ok || !upstream.body) {
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
      upstreamStatus: upstream.status,
    }));
    return jsonResponse(
      {
        code: upstream.status === 429 ? "OPENROUTER_RATE_LIMIT" : "DEVELOPER_AGENT_UPSTREAM_FAILED",
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
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: string) =>
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      send(JSON.stringify({ taskId, engine, status: "started" }));
      let accumulatedOutput = "";
      const completeTask = async () => {
        const updated = await storage.updateTaskStatus({
          taskId, ownerId, status: "completed", summary: accumulatedOutput.slice(0, 4000),
        });
        if (!updated) throw new Error("Task record could not be finalized.");
        await storage.appendTaskEvent({
          eventId: crypto.randomUUID(), taskId, ownerId,
          eventType: "task_completed", payload: { outputLength: accumulatedOutput.length },
        });
      };
      try {
        let pending = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          pending = pending.replace(/\r\n/g, "\n");
          let boundary = pending.indexOf("\n\n");
          while (boundary >= 0) {
            const event = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const parsed = extractDeltas(event);
            for (const content of parsed.texts) {
              accumulatedOutput = (accumulatedOutput + content).slice(0, 4000);
              send(JSON.stringify({ content, taskId, engine }));
            }
            if (parsed.done) {
              await completeTask();
              send(JSON.stringify({ taskId, engine, status: "completed" }));
              send("[DONE]");
              controller.close();
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
            send(JSON.stringify({ content, taskId, engine }));
          }
        }
        await completeTask();
        send(JSON.stringify({ taskId, engine, status: "completed" }));
        send("[DONE]");
        console.info(JSON.stringify({
          component: "badboy-developer-agent",
          event: "task_completed",
          taskId,
          engine,
        }));
        controller.close();
      } catch {
        await storage.updateTaskStatus({ taskId, ownerId, status: "failed" }).catch(() => false);
        await storage.appendTaskEvent({
          eventId: crypto.randomUUID(), taskId, ownerId,
          eventType: "task_failed", payload: { reason: "stream_interrupted" },
        }).catch(() => false);
        console.info(JSON.stringify({
          component: "badboy-developer-agent",
          event: "task_failed",
          taskId,
          engine,
          reason: "stream_interrupted",
        }));
        send(JSON.stringify({
          error: "Developer Agent stream was interrupted.",
          taskId,
          engine,
        }));
        controller.close();
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // The stream reader may already be released.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Badboy-Task-Id": taskId,
      "X-Badboy-Engine": engine,
      "X-Badboy-Task-Status": "running",
      ...CORS_HEADERS,
    },
  });
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawPathname = url.pathname.replace(/\/+$/, "");
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

  if (request.method === "GET") {
    if (pathname === "/api/developer/health") {
      const nativeAvailable = Boolean(env.OPENROUTER_API_KEY?.trim());
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
      const chatConfigured = Boolean(env.OPENROUTER_API_KEY?.trim());
      const transcriptionConfigured = Boolean(
        env.GROQ_API_KEY?.trim() || env.OPENROUTER_API_KEY?.trim(),
      );
      const anyCapabilityConfigured = chatConfigured || transcriptionConfigured;
      return jsonResponse(
        {
          status: chatConfigured ? "ok" : anyCapabilityConfigured ? "partial" : "degraded",
          // Keep the legacy field for existing clients; it describes chat only.
          aiConfigured: chatConfigured,
          capabilities: {
            chat: chatConfigured,
            transcription: transcriptionConfigured,
            serverSpeech: chatConfigured,
          },
          providers: {
            openrouter: chatConfigured,
            groqTranscription: Boolean(env.GROQ_API_KEY?.trim()),
          },
          model: OPENROUTER_MODEL_ID,
          fallbackCount: OPENROUTER_FREE_FALLBACKS.length,
        },
        anyCapabilityConfigured ? 200 : 503,
      );
    }
    return jsonResponse({ error: "Endpoint not found." }, 404);
  }

  if (request.method === "POST" && pathname === "/api/developer/analyze") {
    return handleDeveloperAnalysisRequest(request, env, verifiedOwnerId ?? "");
  }

  if (request.method === "POST" && pathname === "/api/assistant/transcribe") {
    return handleTranscriptionRequest(request, env);
  }

  if (request.method === "POST" && (pathname === "/api/assistant/speech" || pathname === "/api/assistant/speak")) {
    return handleSpeechRequest(request, env);
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

  const apiKey = env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) {
    console.error("[CF Function Error] OPENROUTER_API_KEY is missing from environment bindings.");
    return jsonResponse(
      {
        code: "AI_NOT_CONFIGURED",
        error:
          "Add OPENROUTER_API_KEY to your Cloudflare environment variables to activate AI chat.",
      },
      503
    );
  }

  let upstream: Response;
  try {
    const routed = await fetchChatWithFreeFallbacks(apiKey, [
      {
        role: "system",
        content: systemInstruction(personality, developerMode),
      },
      { role: "user", content: message.trim() },
    ]);
    upstream = routed.response;
  } catch (err) {
    console.error("[CF Function Error] OpenRouter fetch failed:", err instanceof Error ? err.message : String(err));
    return jsonResponse(
      {
        code: "OPENROUTER_REQUEST_FAILED",
        error: "OpenRouter service could not be reached. Check network connection.",
      },
      502
    );
  }

  if (upstream.status === 429) {
    console.error("[CF Function Error] All configured free models are rate limited or unavailable (429).");
    return jsonResponse(
      {
        code: "OPENROUTER_RATE_LIMIT",
        error: "OpenRouter model rate limit reached. Please wait a moment and try again.",
      },
      429
    );
  }

  if (!upstream.ok || !upstream.body) {
    // Avoid logging provider response bodies; keep diagnostics sanitized.
    console.error(`[CF Function Error] OpenRouter upstream returned status ${upstream.status}.`);
    return jsonResponse(
      {
        code: "OPENROUTER_REQUEST_FAILED",
        error: `OpenRouter error (${upstream.status}). Please try again later.`,
      },
      502
    );
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let pending = "";
      const send = (payload: string) =>
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      try {
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
            for (const content of texts) send(JSON.stringify({ content }));
            if (streamDone) {
              send("[DONE]");
              controller.close();
              reader.releaseLock();
              return;
            }
            boundary = pending.indexOf("\n\n");
          }
        }
        pending += decoder.decode();
        if (pending.trim()) {
          const { texts } = extractDeltas(pending);
          for (const content of texts) send(JSON.stringify({ content }));
        }
        send("[DONE]");
        controller.close();
      } catch (streamErr) {
        console.error("[CF Function Error] Stream reading interrupted:", streamErr instanceof Error ? streamErr.message : String(streamErr));
        try {
          send(
            JSON.stringify({
              error: "OpenRouter stream interrupted.",
            })
          );
          controller.close();
        } catch {
          // Closed
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Released
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      ...CORS_HEADERS,
    },
  });
}

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return handleApiRequest(context.request, context.env);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleApiRequest(context.request, context.env);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return handleApiRequest(context.request, context.env);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  return handleApiRequest(context.request, context.env);
};

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
      return handleApiRequest(request, env);
    }
    const assets = (env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
    if (assets) {
      return assets.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};
