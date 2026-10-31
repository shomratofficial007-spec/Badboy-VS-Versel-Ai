import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";

/**
 * Start with OpenRouter's dynamic free router. It chooses an available free
 * model that supports the request's required capabilities.
 */
export const OPENROUTER_MODEL_ID = "openrouter/free";

/**
 * Emergency text-chat fallbacks. Keep this list strictly to :free variants;
 * never add a paid model here. The dynamic router remains the primary path
 * and automatically tracks the changing OpenRouter free-model pool.
 */
export const OPENROUTER_FREE_FALLBACK_MODEL_IDS = [
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3.5-lightning:free",
  "thinkingmachines/inkling:free",
  "recursive/flint-v1.0:free",
] as const;

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
    cause?: { statusCode?: unknown; status?: unknown };
  };
  const candidate =
    value.statusCode ??
    value.status ??
    value.response?.status ??
    value.cause?.statusCode ??
    value.cause?.status;
  return typeof candidate === "number" && candidate >= 400 && candidate <= 599
    ? candidate
    : 502;
}

function shouldTryNextFreeModel(statusCode: number) {
  return [404, 408, 429, 500, 502, 503, 504].includes(statusCode);
}

/**
 * Emit safe model-routing diagnostics to the server runtime logs.
 * Never log prompts, user content, API keys, or provider response bodies.
 */
function logModelDiagnostic(
  event: "attempt" | "success" | "failure",
  modelId: string,
  statusCode?: number,
) {
  console.info(
    JSON.stringify({
      component: "badboy-ai-model-routing",
      event,
      model: modelId,
      ...(statusCode === undefined ? {} : { statusCode }),
    }),
  );
}

/**
 * Reasoning is opt-in because not every free model supports it. The same
 * setting is passed to the selected model; unsupported options are omitted
 * by default.
 */
function getReasoningProviderOptions() {
  const effort = process.env.OPENROUTER_REASONING_EFFORT?.trim().toLowerCase();
  if (effort !== "low" && effort !== "medium" && effort !== "high") {
    return undefined;
  }

  return {
    openrouter: {
      reasoning: { effort },
    },
  };
}

/**
 * Uses the Vercel AI SDK and preserves the existing AsyncIterable<string>
 * route contract. Fallback is attempted only before the first text chunk:
 * restarting after partial output would duplicate or corrupt the answer.
 *
 * Diagnostics record each attempted model, its failure status (if any), and
 * the model that completed the response. Only model IDs and HTTP status codes
 * are logged; user content and secrets are never included.
 */
export async function streamOpenRouterReply(
  messages: OpenRouterMessage[],
): Promise<AsyncIterable<string>> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new OpenRouterApiError(503);

  const openrouter = createOpenRouter({ apiKey });
  const modelIds = [
    OPENROUTER_MODEL_ID,
    ...OPENROUTER_FREE_FALLBACK_MODEL_IDS,
  ];

  async function* streamWithFreeFallbacks(): AsyncGenerator<string> {
    let lastError: OpenRouterApiError | undefined;

    for (const modelId of modelIds) {
      // Defensive guard: the dynamic router or a :free variant is the only
      // permitted model target. This prevents accidental paid-model routing.
      if (modelId !== "openrouter/free" && !modelId.endsWith(":free")) {
        continue;
      }

      let emittedText = false;
      logModelDiagnostic("attempt", modelId);
      try {
        const result = streamText({
          model: openrouter(modelId),
          messages,
          maxOutputTokens: 8192,
          providerOptions: getReasoningProviderOptions(),
        });

        for await (const chunk of result.textStream) {
          if (chunk.length > 0) emittedText = true;
          yield chunk;
        }
        logModelDiagnostic("success", modelId);
        return;
      } catch (error) {
        const failure =
          error instanceof OpenRouterApiError
            ? error
            : new OpenRouterApiError(statusFromError(error));
        lastError = failure;
        logModelDiagnostic("failure", modelId, failure.statusCode);

        // Once any content is sent, do not restart another model and risk
        // returning a mixed or duplicated answer to the client.
        if (emittedText || !shouldTryNextFreeModel(failure.statusCode)) {
          throw failure;
        }
      }
    }

    throw lastError ?? new OpenRouterApiError(503);
  }

  return streamWithFreeFallbacks();
}
