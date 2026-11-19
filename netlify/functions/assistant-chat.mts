// Netlify Function: owner-authenticated assistant chat backed by OpenRouter.
// The route mirrors the Cloudflare Worker contract and is intentionally
// protected by the same BADBOY_OWNER_TOKEN secret.

import { authenticatePersonalOwner } from "../../functions/api/personalAuth.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL_ID = "nvidia/nemotron-3.5-lightning:free";
const MAX_REQUEST_BYTES = 16 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

function readEnv(name: string): string {
  try {
    const viaNetlify = (globalThis as Record<string, any>)?.Netlify?.env?.get?.(name);
    if (typeof viaNetlify === "string" && viaNetlify.length > 0) return viaNetlify.trim();
  } catch {
    // Fall through to process.env for local Netlify development.
  }
  const fallback = typeof process !== "undefined"
    ? (process as unknown as { env: Record<string, string | undefined> }).env[name]
    : undefined;
  return (fallback ?? "").trim();
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function readJsonBody(request: Request): Promise<unknown | Response> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse({ code: "UNSUPPORTED_MEDIA_TYPE", error: "Content-Type must be application/json." }, 415);
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_REQUEST_BYTES) {
    return jsonResponse({ code: "REQUEST_BODY_TOO_LARGE", error: "Request body exceeds the allowed size." }, 413);
  }

  if (!request.body) {
    return jsonResponse({ code: "INVALID_JSON_BODY", error: "Request body must contain JSON." }, 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return jsonResponse({ code: "REQUEST_BODY_TOO_LARGE", error: "Request body exceeds the allowed size." }, 413);
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return jsonResponse({ code: "INVALID_JSON_BODY", error: "Request body contains invalid JSON." }, 400);
  }
}

function systemInstruction(personality: string, developerMode: boolean): string {
  const base =
    "You are Badboy AI, a highly intelligent, polite personal AI assistant. Always reply strictly in Bangla (Bengali) language by default. Never respond in Portuguese, Spanish, or any unintended language. If the user explicitly speaks or requests English, you may reply in English. Be clear, concise, practical, and polite. Never claim to have performed external physical or phone actions that are unsupported. Ask before sensitive data modifications or external actions.";
  const developer =
    "The user may ask for help developing Badboy AI. Understand instructions, propose a clear plan, write organized code when asked, preserve working behavior, explain normal bugs/fixes, and ask approval before risky changes, permissions, authentication, API keys, account connections, data deletion, or external actions.";
  const custom = personality.trim().slice(0, 1000);
  return [base, developerMode ? developer : "", custom].filter(Boolean).join("\n\n");
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
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) texts.push(delta);
    } catch {
      // Ignore malformed provider events and continue the stream.
    }
  }
  return { texts, done };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  // Authenticate before reading or allocating the request body.
  const auth = await authenticatePersonalOwner(req, {
    BADBOY_OWNER_TOKEN: readEnv("BADBOY_OWNER_TOKEN"),
  });
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;

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
    return jsonResponse({ error: "Invalid assistant message." }, 400);
  }

  const apiKey = readEnv("OPENROUTER_API_KEY");
  if (!apiKey) {
    return jsonResponse({
      code: "AI_NOT_CONFIGURED",
      error: "Add OPENROUTER_API_KEY to environment variables to connect to OpenRouter.",
    }, 503);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Badboy AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL_ID,
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemInstruction(personality, developerMode) },
          { role: "user", content: message.trim() },
        ],
        stream: true,
      }),
      signal: req.signal,
    });
  } catch {
    return jsonResponse({
      code: "OPENROUTER_REQUEST_FAILED",
      error: "OpenRouter could not complete the reply. Please check your network connection.",
    }, 502);
  }

  if (upstream.status === 429) {
    return jsonResponse({
      code: "OPENROUTER_RATE_LIMIT",
      error: "The free-model request limit has been reached. Please try again in a few moments.",
    }, 429);
  }
  if (!upstream.ok || !upstream.body) {
    return jsonResponse({
      code: "OPENROUTER_REQUEST_FAILED",
      error: "OpenRouter could not complete the reply. Please try again.",
    }, 502);
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pending = "";
      const send = (payload: string) => controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      const cancelUpstream = () => { void reader.cancel().catch(() => undefined); };
      req.signal.addEventListener("abort", cancelUpstream, { once: true });
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
            const parsed = extractDeltas(event);
            for (const text of parsed.texts) send(JSON.stringify({ content: text }));
            if (parsed.done) {
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
          for (const text of parsed.texts) send(JSON.stringify({ content: text }));
        }
        send("[DONE]");
        controller.close();
      } catch {
        try {
          send(JSON.stringify({ error: "OpenRouter response stream was interrupted. Please try again." }));
          controller.close();
        } catch {
          // The client may already have cancelled the stream.
        }
      } finally {
        req.signal.removeEventListener("abort", cancelUpstream);
        try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export default handler;

export const config = {
  path: "/api/assistant/chat",
  method: "POST",
};
