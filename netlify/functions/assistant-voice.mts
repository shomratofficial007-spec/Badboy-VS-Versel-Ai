// Netlify Function: authenticated voice endpoint placeholder.
// The selected text-only model does not provide server-side voice output.

import { authenticatePersonalOwner } from "../../functions/api/personalAuth.ts";

function readEnv(name: string): string {
  try {
    const viaNetlify = (globalThis as Record<string, any>)?.Netlify?.env?.get?.(name);
    if (typeof viaNetlify === "string" && viaNetlify.length > 0) return viaNetlify.trim();
  } catch {
    // Fall through to process.env.
  }
  const fallback = typeof process !== "undefined"
    ? (process as unknown as { env: Record<string, string | undefined> }).env[name]
    : undefined;
  return (fallback ?? "").trim();
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: CORS_HEADERS });
  }

  const auth = await authenticatePersonalOwner(req, {
    BADBOY_OWNER_TOKEN: readEnv("BADBOY_OWNER_TOKEN"),
  });
  if (!auth.ok) return auth.response;

  return Response.json(
    {
      code: "MODEL_AUDIO_UNSUPPORTED",
      error: "The selected free model accepts text input and returns text only. Voice input and spoken responses are unavailable on this endpoint.",
    },
    { status: 501, headers: CORS_HEADERS },
  );
}

export default handler;

export const config = {
  path: "/api/assistant/voice",
  method: "POST",
};
