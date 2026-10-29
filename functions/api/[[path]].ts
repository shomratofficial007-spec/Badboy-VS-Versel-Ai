// Cloudflare Pages Function: /api/* routes backed by OpenRouter.
// Directs /api/assistant/chat requests to OpenRouter with streaming SSE.

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL_ID = "nvidia/nemotron-3.5-lightning:free";

interface Env {
  OPENROUTER_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
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

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawPathname = url.pathname.replace(/\/+$/, "");
  const pathname = rawPathname.startsWith("/api")
    ? rawPathname
    : `/api${rawPathname.startsWith("/") ? rawPathname : `/${rawPathname}`}`;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    if (pathname === "/api/healthz" || pathname === "/api/health") {
      const aiConfigured = Boolean(env.OPENROUTER_API_KEY?.trim());
      return jsonResponse(
        {
          status: aiConfigured ? "ok" : "degraded",
          aiConfigured,
          model: OPENROUTER_MODEL_ID,
        },
        aiConfigured ? 200 : 503,
      );
    }
    return jsonResponse({ error: "Endpoint not found." }, 404);
  }

  if (request.method === "POST" && pathname === "/api/assistant/voice") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return jsonResponse({
        code: "VOICE_API_NOT_CONFIGURED",
        error: "Online Bengali voice is not configured yet. Add OPENAI_API_KEY as a server-side secret.",
      }, 503);
    }

    let voiceBody: unknown;
    try {
      voiceBody = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid voice request body." }, 400);
    }
    const { audioBase64, mimeType = "audio/m4a", language = "bn" } = (voiceBody ?? {}) as {
      audioBase64?: unknown; mimeType?: unknown; language?: unknown;
    };
    if (typeof audioBase64 !== "string" || !audioBase64.length || audioBase64.length > 14_000_000 ||
        typeof mimeType !== "string" || !/^audio\/[a-z0-9.+-]+$/i.test(mimeType) ||
        typeof language !== "string" || !/^(bn|en)(-[A-Za-z]{2,8})?$/i.test(language)) {
      return jsonResponse({ error: "Invalid audio payload. Record a short voice message and try again." }, 400);
    }

    try {
      const bytes = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
      const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("wav") ? "wav" : mimeType.includes("mpeg") ? "mp3" : "m4a";
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mimeType }), `voice.${extension}`);
      form.append("model", "gpt-4o-mini-transcribe");
      form.append("language", language.toLowerCase().startsWith("bn") ? "bn" : "en");
      const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!upstream.ok) {
        console.error("[CF Voice] Transcription provider returned status", upstream.status);
        return jsonResponse({
          code: upstream.status === 429 ? "VOICE_RATE_LIMIT" : "VOICE_TRANSCRIPTION_FAILED",
          error: upstream.status === 429 ? "Voice service limit reached. Try again later." : "The online voice service could not transcribe this audio.",
        }, upstream.status === 429 ? 429 : 502);
      }
      const result = await upstream.json() as { text?: unknown };
      if (typeof result.text !== "string" || !result.text.trim()) {
        return jsonResponse({ code: "VOICE_NO_TRANSCRIPT", error: "কথা পরিষ্কার বোঝা যায়নি। আবার বলুন।" }, 422);
      }
      return jsonResponse({ text: result.text.trim(), language: language.toLowerCase().startsWith("bn") ? "bn" : "en" });
    } catch (error) {
      console.error("[CF Voice] Request failed:", error instanceof Error ? error.message : "unknown error");
      return jsonResponse({ code: "VOICE_TRANSCRIPTION_FAILED", error: "Voice service connection failed. Check internet and try again." }, 502);
    }
  }

  if (request.method !== "POST" || pathname !== "/api/assistant/chat") {
    return jsonResponse({ error: "Endpoint not found." }, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid assistant message body." }, 400);
  }

  const { message, personality = "", developerMode = false } = (body ?? {}) as {
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
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Badboy Voice Memory Assistant",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL_ID,
        max_tokens: 8192,
        messages: [
          {
            role: "system",
            content: systemInstruction(personality, developerMode),
          },
          { role: "user", content: message.trim() },
        ],
        stream: true,
      }),
    });
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
    console.error("[CF Function Error] OpenRouter rate limit (429) reached.");
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
