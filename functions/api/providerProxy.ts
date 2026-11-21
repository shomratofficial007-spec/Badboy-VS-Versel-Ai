type ProviderId = "openai" | "openrouter" | "gemini" | "groq" | "together" | "cerebras" | "sambanova" | "mistral" | "cloudflare" | "cohere" | "nvidia" | "custom";
type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const PROVIDER_BASE_URLS: Record<Exclude<ProviderId, "custom">, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
  cerebras: "https://api.cerebras.ai/v1",
  sambanova: "https://api.sambanova.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  cloudflare: "",
  cohere: "https://api.cohere.com/compatibility/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Provider-Key",
  "Cache-Control": "no-store",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerIdFrom(value: unknown): ProviderId | null {
  return value === "openai" ||
    value === "openrouter" ||
    value === "gemini" ||
    value === "groq" ||
    value === "together" ||
    value === "cerebras" ||
    value === "sambanova" ||
    value === "mistral" ||
    value === "cloudflare" ||
    value === "cohere" ||
    value === "nvidia" ||
    value === "custom"
    ? value
    : null;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".") || host.includes(":") || host.startsWith("[")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return [
    "localhost",
    ".localhost",
    ".local",
    ".internal",
    ".test",
    ".invalid",
    ".example",
    ".onion",
  ].some((suffix) => host === suffix || host.endsWith(suffix));
}

function resolveProviderBaseUrl(providerId: ProviderId, value: unknown): string | null {
  const supplied = typeof value === "string" ? value.trim() : "";
  const raw = supplied || (providerId === "custom" ? "" : PROVIDER_BASE_URLS[providerId]);
  if (!raw || raw.length > 2048) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.port !== "" && parsed.port !== "443") ||
    isBlockedHostname(parsed.hostname)
  ) {
    return null;
  }

  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

function providerKeyFrom(request: Request): string | null {
  const key = request.headers.get("X-Provider-Key")?.trim() ?? "";
  if (!key || key.length > 4096 || /[\r\n]/.test(key)) return null;
  return key;
}

function buildUpstreamHeaders(providerId: ProviderId, apiKey: string, accept: string): Headers {
  const headers = new Headers({
    Authorization: "Bearer " + apiKey,
    Accept: accept,
  });
  if (providerId === "openrouter") {
    headers.set("HTTP-Referer", "https://badboy-vs-versel-ai.app");
    headers.set("X-Title", "Badboy AI");
  }
  return headers;
}

function validateMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;

  let totalCharacters = 0;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (item.role !== "system" && item.role !== "user" && item.role !== "assistant") return null;
    if (typeof item.content !== "string" || item.content.length > 12000) return null;
    totalCharacters += item.content.length;
    if (totalCharacters > 48000) return null;
    messages.push({ role: item.role, content: item.content });
  }
  return messages;
}

async function fetchUpstream(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: "manual" });
  } catch {
    throw new Error("PROVIDER_UNAVAILABLE");
  }
}

export async function handleProviderChatProxy(
  request: Request,
  payload: unknown,
): Promise<Response> {
  if (!isRecord(payload)) return jsonResponse(400, { code: "INVALID_PROVIDER_REQUEST", error: "Provider request body is invalid." });

  const providerId = providerIdFrom(payload.providerId);
  const apiKey = providerKeyFrom(request);
  const baseUrl = providerId ? resolveProviderBaseUrl(providerId, payload.baseUrl) : null;
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  const messages = validateMessages(payload.messages);

  if (!providerId || !apiKey || !baseUrl || !/^[\w./:-]{1,200}$/.test(model) || !messages) {
    return jsonResponse(400, {
      code: "INVALID_PROVIDER_REQUEST",
      error: "Provider ID, HTTPS base URL, API key, model or chat messages are invalid.",
    });
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(baseUrl + "/chat/completions", {
      method: "POST",
      headers: new Headers({
        ...Object.fromEntries(buildUpstreamHeaders(providerId, apiKey, "text/event-stream").entries()),
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 4096,
      }),
      signal: request.signal,
    });
  } catch {
    return jsonResponse(502, {
      code: "PROVIDER_UNAVAILABLE",
      error: "The selected AI provider could not be reached. Check the endpoint and try again.",
    });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    return jsonResponse(502, {
      code: "PROVIDER_REDIRECT_BLOCKED",
      error: "Provider redirects are blocked for credential safety. Use the final HTTPS API endpoint.",
    });
  }

  if (!upstream.ok) {
    const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : upstream.status;
    await upstream.body?.cancel();
    return jsonResponse(status, {
      code: "PROVIDER_REQUEST_FAILED",
      error: "Provider request failed (HTTP " + upstream.status + "). Check the API key, model and base URL.",
    });
  }

  const contentType = upstream.headers.get("Content-Type") ?? "";
  if (!upstream.body || !contentType.toLowerCase().includes("text/event-stream")) {
    await upstream.body?.cancel();
    return jsonResponse(502, {
      code: "PROVIDER_STREAM_UNAVAILABLE",
      error: "The selected provider did not return a compatible streaming response.",
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function handleProviderModelsProxy(
  request: Request,
  payload: unknown,
): Promise<Response> {
  if (!isRecord(payload)) return jsonResponse(400, { code: "INVALID_PROVIDER_REQUEST", error: "Provider request body is invalid." });

  const providerId = providerIdFrom(payload.providerId);
  const apiKey = providerKeyFrom(request);
  const baseUrl = providerId ? resolveProviderBaseUrl(providerId, payload.baseUrl) : null;
  if (!providerId || !apiKey || !baseUrl) {
    return jsonResponse(400, {
      code: "INVALID_PROVIDER_REQUEST",
      error: "Provider ID, HTTPS base URL or API key is invalid.",
    });
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(baseUrl + "/models", {
      method: "GET",
      headers: buildUpstreamHeaders(providerId, apiKey, "application/json"),
      signal: request.signal,
    });
  } catch {
    return jsonResponse(502, {
      code: "PROVIDER_UNAVAILABLE",
      error: "The selected AI provider could not be reached. Check the endpoint and try again.",
    });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    return jsonResponse(502, {
      code: "PROVIDER_REDIRECT_BLOCKED",
      error: "Provider redirects are blocked for credential safety. Use the final HTTPS API endpoint.",
    });
  }

  if (!upstream.ok) {
    const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : upstream.status;
    await upstream.body?.cancel();
    return jsonResponse(status, {
      code: "PROVIDER_REQUEST_FAILED",
      error: "Provider model list failed (HTTP " + upstream.status + "). Check the API key and base URL.",
    });
  }

  let result: unknown;
  try {
    result = await upstream.json();
  } catch {
    return jsonResponse(502, {
      code: "INVALID_PROVIDER_MODELS",
      error: "Provider returned an invalid model list.",
    });
  }

  if (!isRecord(result) || !Array.isArray(result.data)) {
    return jsonResponse(502, {
      code: "INVALID_PROVIDER_MODELS",
      error: "Provider did not return a compatible /models response.",
    });
  }

  const ids = [...new Set(
    result.data
      .filter(isRecord)
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && /^[\w./:-]{1,200}$/.test(id)),
  )].sort((a, b) => a.localeCompare(b)).slice(0, 500);

  return jsonResponse(200, { data: ids.map((id) => ({ id })) });
}
