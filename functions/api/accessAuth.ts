/**
 * Cloudflare Access JWT verification for private Developer Agent APIs.
 *
 * This module deliberately does not trust Authorization, query, or body
 * identity values. Only the signed Cf-Access-Jwt-Assertion is accepted.
 */
export interface AccessAuthEnv {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ALLOWED_EMAILS?: string;
}

export interface VerifiedAccessIdentity {
  /** Stable identity key from the signed Access subject claim. */
  ownerId: string;
  email: string;
}

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  sub?: unknown;
  email?: unknown;
};

type AuthResult =
  | { identity: VerifiedAccessIdentity; response?: never }
  | { identity?: never; response: Response };

function jsonError(code: string, error: string, status: number): Response {
  return new Response(JSON.stringify({ code, error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment<T>(segment: string): T {
  const bytes = decodeBase64Url(segment);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
}

function resolveTeamDomain(value: string): { origin: string; issuer: string } | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) return null;
    return { origin: url.origin, issuer: `${url.origin}/` };
  } catch {
    return null;
  }
}

function audienceMatches(claim: unknown, expected: string): boolean {
  return typeof claim === "string"
    ? claim === expected
    : Array.isArray(claim) && claim.some((value) => value === expected);
}

export async function authenticateCloudflareAccess(
  request: Request,
  env: AccessAuthEnv,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthResult> {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  const allowlist = (env.CF_ACCESS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!teamDomain || !audience || allowlist.length === 0) {
    return {
      response: jsonError(
        "ACCESS_AUTH_NOT_CONFIGURED",
        "Cloudflare Access authentication is not configured.",
        503,
      ),
    };
  }

  const domain = resolveTeamDomain(teamDomain);
  if (!domain || audience.length > 512) {
    return {
      response: jsonError(
        "ACCESS_AUTH_MISCONFIGURED",
        "Cloudflare Access issuer configuration is invalid.",
        503,
      ),
    };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token || token.length > 16_384) {
    return {
      response: jsonError(
        "ACCESS_TOKEN_REQUIRED",
        "A valid Cloudflare Access identity token is required.",
        401,
      ),
    };
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    return {
      response: jsonError("ACCESS_TOKEN_INVALID", "Access token is invalid.", 401),
    };
  }

  try {
    const header = decodeJsonSegment<JwtHeader>(segments[0]);
    const claims = decodeJsonSegment<JwtClaims>(segments[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
      throw new Error("Unsupported JWT header.");
    }

    if (
      claims.iss !== domain.issuer ||
      !audienceMatches(claims.aud, audience) ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= nowSeconds ||
      (claims.nbf !== undefined &&
        (typeof claims.nbf !== "number" ||
          !Number.isFinite(claims.nbf) ||
          claims.nbf > nowSeconds)) ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim() ||
      claims.sub.length > 256 ||
      typeof claims.email !== "string" ||
      !claims.email.trim()
    ) {
      throw new Error("JWT claims validation failed.");
    }

    const jwksResponse = await fetch(
      `${domain.origin}/cdn-cgi/access/certs`,
      { headers: { Accept: "application/json" } },
    );
    if (!jwksResponse.ok) throw new Error("Could not retrieve Access signing keys.");
    const jwks = await jwksResponse.json() as {
      keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string; key_ops?: string[] }>;
    };
    const jwk = jwks.keys?.find((key) =>
      key.kid === header.kid &&
      key.kty === "RSA" &&
      (!key.alg || key.alg === "RS256") &&
      (!key.use || key.use === "sig") &&
      (!key.key_ops || key.key_ops.includes("verify"))
    );
    if (!jwk) throw new Error("Matching Access signing key not found.");

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(decodeBase64Url(segments[2]));
    const signedData = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
    const signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      signedData,
    );
    if (!signatureValid) throw new Error("JWT signature is invalid.");

    const email = claims.email.trim().toLowerCase();
    if (!allowlist.includes(email)) {
      return {
        response: jsonError(
          "ACCESS_IDENTITY_NOT_ALLOWED",
          "This Cloudflare Access identity is not authorized.",
          403,
        ),
      };
    }

    return {
      identity: {
        ownerId: claims.sub.trim(),
        email,
      },
    };
  } catch {
    // Never return token contents, signing keys, or provider details to clients.
    return {
      response: jsonError("ACCESS_TOKEN_INVALID", "Access token is invalid or expired.", 401),
    };
  }
}
