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

/**
 * Streams model output through the Vercel AI SDK instead of maintaining a
 * project-specific OpenRouter SSE parser. The existing route contract remains
 * an AsyncIterable<string>, so clients do not need to change.
 */
export async function streamOpenRouterReply(
  messages: OpenRouterMessage[],
): Promise<AsyncIterable<string>> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new OpenRouterApiError(503);

  try {
    const openrouter = createOpenRouter({ apiKey });
    const result = streamText({
      model: openrouter(OPENROUTER_MODEL_ID),
      messages,
      maxOutputTokens: 8192,
    });

    return result.textStream;
  } catch {
    throw new OpenRouterApiError(502);
  }
}
