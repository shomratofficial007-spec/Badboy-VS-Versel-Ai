/**
 * Single-owner bearer-key authentication for a personal Badboy deployment.
 *
 * The only trusted credential is BADBOY_OWNER_TOKEN from the Worker secret
 * store. Client-provided owner IDs, query parameters, and request bodies are
 * never used to establish identity.
 */
export interface PersonalAuthEnv {
  BADBOY_OWNER_TOKEN?: string;
}

export interface VerifiedPersonalOwner {
  /** Stable server-assigned owner key; never accepted from a client. */
  ownerId: "badboy-personal-owner-v1";
}

type AuthResult =
  | { identity: VerifiedPersonalOwner; response?: never }
  | { identity?: never; response: Response };

const OWNER_ID: VerifiedPersonalOwner["ownerId"] = "badboy-personal-owner-v1";
const MIN_TOKEN_LENGTH = 43;
const MAX_TOKEN_LENGTH = 128;

function jsonError(code: string, error: string, status: number): Response {
  return new Response(JSON.stringify({ code, error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isWellFormedToken(value: string): boolean {
  return value.length >= MIN_TOKEN_LENGTH &&
    value.length <= MAX_TOKEN_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

/** Compare fixed-length digests without an early exit on the first mismatch. */
async function tokensMatch(candidate: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [candidateDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(candidateDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function authenticatePersonalOwner(
  request: Request,
  env: PersonalAuthEnv,
): Promise<AuthResult> {
  const expected = env.BADBOY_OWNER_TOKEN;
  if (!expected || !isWellFormedToken(expected)) {
    return {
      response: jsonError(
        "PERSONAL_AUTH_NOT_CONFIGURED",
        "Personal authentication is not configured on this Worker.",
        503,
      ),
    };
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization);
  if (!match) {
    return {
      response: jsonError(
        "PERSONAL_AUTH_REQUIRED",
        "A valid personal access key is required.",
        401,
      ),
    };
  }

  try {
    if (!(await tokensMatch(match[1], expected))) {
      return {
        response: jsonError(
          "PERSONAL_AUTH_INVALID",
          "Personal access key is invalid.",
          401,
        ),
      };
    }
  } catch {
    return {
      response: jsonError(
        "PERSONAL_AUTH_UNAVAILABLE",
        "Personal authentication could not be completed.",
        503,
      ),
    };
  }

  return { identity: { ownerId: OWNER_ID } };
}
