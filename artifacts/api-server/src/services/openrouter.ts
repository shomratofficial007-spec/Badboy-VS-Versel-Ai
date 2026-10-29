import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";

export const OPENROUTER_MODEL_ID = "nvidia/nemotron-3.5-lightning:free";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class OpenRouterApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super("OpenRouter request failed.");
    this.name = "OpenRouterApiError";
    this.statusCode = statusCode;
  }
}

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function statusFromError(error: unknown): number {
  if (!error || typeof error !== "object") return 502;
  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const candidate =
    value.statusCode ?? value.status ?? value.response?.status;
  return typeof candidate === "number" && candidate >= 400 && candidate <= 599
    ? candidate
    : 502;
}

/**
 * Uses the Vercel AI SDK to stream OpenRouter output while preserving the
 * existing AsyncIterable<string> route contract. Errors may occur while the
 * stream is consumed, so translate them inside the generator as well.
 */
export async function streamOpenRouterReply(
  messages: OpenRouterMessage[],
): Promise<AsyncIterable<string>> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new OpenRouterApiError(503);

  let textStream: AsyncIterable<string>;
  try {
    const openrouter = createOpenRouter({ apiKey });
    const result = streamText({
      model: openrouter(OPENROUTER_MODEL_ID),
      messages,
      maxOutputTokens: 8192,
    });
    textStream = result.textStream;
  } catch (error) {
    throw new OpenRouterApiError(statusFromError(error));
  }

  async function* translateStreamErrors(): AsyncGenerator<string> {
    try {
      for await (const chunk of textStream) yield chunk;
    } catch (error) {
      if (error instanceof OpenRouterApiError) throw error;
      throw new OpenRouterApiError(statusFromError(error));
    }
  }

  return translateStreamErrors();
}
