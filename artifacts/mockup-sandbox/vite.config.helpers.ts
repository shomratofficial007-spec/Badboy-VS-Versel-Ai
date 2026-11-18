const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1"] as const;

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port value: "${value}". Expected an integer from 1 to 65535.`);
  }
  return port;
}

export function parseAllowedHosts(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") {
    return [...DEFAULT_ALLOWED_HOSTS];
  }

  const hosts = value.split(",").map((host) => host.trim().toLowerCase());
  if (hosts.some((host) => !host || host === "*" || host === "true")) {
    throw new Error(
      "VITE_ALLOWED_HOSTS must be a comma-separated list of explicit hostnames; wildcard and true are not allowed.",
    );
  }

  const hostnamePattern = /^\.?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
  for (const host of hosts) {
    if (!hostnamePattern.test(host) || host.includes("..")) {
      throw new Error(`Invalid allowed host: "${host}". Use a hostname or a dot-prefixed domain suffix.`);
    }
  }

  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...hosts])];
}

export function resolveApiProxyTarget(
  target: string | undefined,
  apiPort: string | undefined,
): string {
  const resolvedTarget =
    target?.trim() || `http://127.0.0.1:${parsePort(apiPort, 3000)}`;

  let parsed: URL;
  try {
    parsed = new URL(resolvedTarget);
  } catch {
    throw new Error("API_PROXY_TARGET must be an absolute http:// or https:// URL.");
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("API_PROXY_TARGET must use http:// or https:// and must not contain credentials.");
  }

  return parsed.toString().replace(/\/$/, "");
}
