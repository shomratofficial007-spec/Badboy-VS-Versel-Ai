const OWNER_TOKEN_KEY = 'badboy-owner-token-v1';
const DEFAULT_NATIVE_API_DOMAIN = 'https://badboy-vs-versel-ai.shomratofficial007.workers.dev';

let activeToken: string | null = null;

function isWebPlatform(): boolean {
  const expoOs = process.env.EXPO_OS;
  if (expoOs) return expoOs === 'web';

  // EXPO_OS is normally inlined by Expo. Some custom/native builds omit it;
  // React Native has a window object but no browser location.origin.
  // Node-based tests have no window and should use the in-memory web path.
  return !(
    typeof window !== 'undefined' &&
    (typeof window.location === 'undefined' ||
      typeof window.location.origin !== 'string' ||
      !window.location.origin.startsWith('http'))
  );
}

function authApiUrl() {
  if (
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    window.location.origin.startsWith('http')
  ) {
    return `${window.location.origin}/api/auth/verify`;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim() || DEFAULT_NATIVE_API_DOMAIN;
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  return `${baseUrl.replace(/\/$/, '')}/api/auth/verify`;
}

export async function getOwnerToken(): Promise<string | null> {
  if (activeToken) return activeToken;
  if (isWebPlatform()) return null;
  try {
    const SecureStore = await import('expo-secure-store');
    activeToken = await SecureStore.getItemAsync(OWNER_TOKEN_KEY);
    return activeToken;
  } catch {
    return null;
  }
}

export async function saveOwnerToken(token: string): Promise<void> {
  if (!isWebPlatform()) {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(OWNER_TOKEN_KEY, token);
  }
  activeToken = token;
}

export async function clearOwnerToken(): Promise<void> {
  activeToken = null;
  if (!isWebPlatform()) {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(OWNER_TOKEN_KEY);
  }
}

export async function verifyOwnerToken(token: string): Promise<void> {
  const response = await fetch(authApiUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as {
    authenticated?: boolean;
    error?: string;
  };
  if (!response.ok || payload.authenticated !== true) {
    const error = new Error(
      payload.error ?? `Owner authentication failed (HTTP ${response.status}).`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
}

/** Identify Worker responses that require the owner to authenticate again. */
export function isOwnerLoginRequiredError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string' ? error : '';
  return /owner login is required|owner (?:token|authentication).*?(?:invalid|expired|required|401)|(?:401|403).*?(?:owner|auth)/i.test(message);
}

export function getOwnerRouteRedirect(
  authenticated: boolean,
  segments: readonly string[],
): '/owner-login' | '/(tabs)' | null {
  const isOwnerLoginRoute = segments[0] === 'owner-login';
  if (!authenticated && !isOwnerLoginRoute) return '/owner-login';
  if (authenticated && isOwnerLoginRoute) return '/(tabs)';
  return null;
}

export async function restoreOwnerSession(): Promise<boolean> {
  // Always re-read native persistence; a cached token is not proof of a valid
  // owner session. The Worker remains the authority for authentication.
  if (!isWebPlatform()) activeToken = null;
  const token = await getOwnerToken();
  if (!token) return false;

  try {
    await verifyOwnerToken(token);
    return true;
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? (error as { status?: number }).status
      : undefined;
    // Revoke credentials that the Worker explicitly rejects. Preserve them on
    // network errors so a temporary outage does not destroy the owner's token.
    if (status === 401 || status === 403) {
      await clearOwnerToken();
    }
    return false;
  }
}
