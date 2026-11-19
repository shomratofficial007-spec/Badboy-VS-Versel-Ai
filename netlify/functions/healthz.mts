// Public health check for Netlify deploy previews.
// Do not expose credentials; report whether the required AI key is configured.

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

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }
  const aiConfigured = Boolean(readEnv("OPENROUTER_API_KEY"));
  return Response.json({
    status: aiConfigured ? "ok" : "degraded",
    aiConfigured,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
};

export const config = {
  path: "/api/healthz",
  method: "GET",
};
