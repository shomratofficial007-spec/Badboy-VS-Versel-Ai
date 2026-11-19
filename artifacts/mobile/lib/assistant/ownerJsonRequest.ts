import { getOwnerToken } from "./ownerAuth";

const DEFAULT_NATIVE_API_DOMAIN =
  "https://badboy-vs-versel-ai.shomratofficial007.workers.dev";

export function apiUrl(path: string): string {
  // An explicit API domain must win on web too. This lets Netlify (or another
  // static host) use the complete Cloudflare Worker API instead of falling
  // back to a partial host-local function set.
  const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (configuredDomain) {
    const baseUrl = configuredDomain.startsWith("http")
      ? configuredDomain
      : `https://${configuredDomain}`;
    return `${baseUrl.replace(/\/$/, "")}/api${path}`;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.location?.origin === "string" &&
    window.location.origin.startsWith("http")
  ) {
    return `${window.location.origin}/api${path}`;
  }

  return `${DEFAULT_NATIVE_API_DOMAIN}/api${path}`;
}

type OwnerJsonFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createOwnerJsonRequester(
  getToken: () => Promise<string | null>,
  fetcher: OwnerJsonFetch = globalThis.fetch as OwnerJsonFetch,
) {
  return async function requestOwnerJson<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = await getToken();
    if (!token) {
      throw new Error("Owner login is required. Enter your Badboy Owner Token to continue.");
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetcher(apiUrl(path), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Badboy API request failed (HTTP ${response.status}).`);
    }
    return payload;
  };
}

export const requestOwnerJson = createOwnerJsonRequester(getOwnerToken);
