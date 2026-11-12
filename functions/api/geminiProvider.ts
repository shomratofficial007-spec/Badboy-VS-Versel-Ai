export type GeminiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

interface GeminiStreamPart {
  text?: unknown;
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: GeminiStreamPart[];
    };
  }>;
}

function toGeminiContents(messages: GeminiChatMessage[]) {
  const contents = messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const systemInstruction = messages
    .filter((message) => message.role === "system" && message.content.trim())
    .map((message) => message.content.trim())
    .join("\n\n");

  return {
    contents,
    ...(systemInstruction
      ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
      : {}),
  };
}

/**
 * Convert Google's SSE candidates into the OpenAI-compatible delta shape
 * consumed by the existing Developer Agent stream parser.
 */
export function adaptGeminiStreamToOpenAI(response: Response): Response {
  if (!response.body) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pending = "";

      const emitEvent = (event: string) => {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data || data === "[DONE]") return;

        let parsed: GeminiStreamChunk;
        try {
          parsed = JSON.parse(data) as GeminiStreamChunk;
        } catch {
          return;
        }

        const textParts = (parsed.candidates ?? [])
          .flatMap((candidate) => candidate.content?.parts ?? [])
          .map((part) => part.text)
          .filter((part): part is string => typeof part === "string" && part.length > 0);

        for (const content of textParts) {
          const chunk = {
            choices: [{ index: 0, delta: { content }, finish_reason: null }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = pending.indexOf("\n\n");
          while (boundary >= 0) {
            emitEvent(pending.slice(0, boundary));
            pending = pending.slice(boundary + 2);
            boundary = pending.indexOf("\n\n");
          }
        }

        pending += decoder.decode();
        if (pending.trim()) emitEvent(pending);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // The source may already have released its reader.
        }
      }
    },
  });

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Call the official Gemini API with a server-only API key. The key is sent in
 * a header, never in a URL, response, diagnostic, or client bundle.
 */
export async function fetchGeminiChat(
  apiKey: string,
  messages: GeminiChatMessage[],
  model = DEFAULT_GEMINI_MODEL,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const selectedModel = model.trim() || DEFAULT_GEMINI_MODEL;
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(selectedModel)) {
    throw new Error("Invalid Gemini model identifier.");
  }

  const payload = toGeminiContents(messages);
  if (payload.contents.length === 0) {
    throw new Error("Gemini request requires at least one user or assistant message.");
  }

  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        ...payload,
        generationConfig: { maxOutputTokens: 8192 },
      }),
    },
  );

  return response.ok ? adaptGeminiStreamToOpenAI(response) : response;
}

export function getGeminiModel(configuredModel?: string): string {
  const candidate = configuredModel?.trim() || DEFAULT_GEMINI_MODEL;
  return /^[a-zA-Z0-9._-]{1,100}$/.test(candidate)
    ? candidate
    : DEFAULT_GEMINI_MODEL;
}
