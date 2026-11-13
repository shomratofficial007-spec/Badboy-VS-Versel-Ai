import { Platform } from 'react-native';

const SESSION_KEY = 'badboy-owner-session-v1';
const LEGACY_OWNER_TOKEN_KEY = 'badboy-owner-token-v1';
const DEFAULT_NATIVE_API_DOMAIN = 'https://badboy-vs-versel-ai.shomratofficial007.workers.dev';
let activeSession: string | null = null;
const sessionExpiryListeners = new Set<() => void>();

export function subscribeToOwnerSessionExpiry(listener: () => void): () => void {
  sessionExpiryListeners.add(listener);
  return () => sessionExpiryListeners.delete(listener);
}

export async function expireOwnerSession(): Promise<void> {
  activeSession = null;
  if (!isWebPlatform()) {
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await SecureStore.deleteItemAsync(LEGACY_OWNER_TOKEN_KEY);
    } catch { /* The in-memory credential is still cleared. */ }
  }
  for (const listener of sessionExpiryListeners) listener();
}

function isWebPlatform(): boolean {
  // Bracket access keeps Expo's EXPO_OS value runtime-readable in tests and
  // custom builds instead of allowing a build-time transform to freeze it.
  const expoOs = process.env['EXPO_OS'];
  if (expoOs === 'web') return true;
  if (expoOs === 'android' || expoOs === 'ios') return false;
  return Platform.OS === 'web';
}
function sessionApiUrl() {
  if (isWebPlatform() && typeof window !== 'undefined' && typeof window.location?.origin === 'string' && window.location.origin.startsWith('http')) {
    return `${window.location.origin}/api/auth/session`;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim() || DEFAULT_NATIVE_API_DOMAIN;
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  return `${baseUrl.replace(/\/$/, '')}/api/auth/session`;
}
export async function getOwnerToken(): Promise<string | null> {
  if (activeSession) return activeSession;
  if (isWebPlatform()) return null;
  try {
    const SecureStore = await import('expo-secure-store');
    activeSession = await SecureStore.getItemAsync(SESSION_KEY);
    return activeSession;
  } catch { return null; }
}
export async function saveOwnerToken(sessionToken: string): Promise<void> {
  if (!isWebPlatform()) {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(SESSION_KEY, sessionToken);
    await SecureStore.deleteItemAsync(LEGACY_OWNER_TOKEN_KEY);
  }
  activeSession = sessionToken;
}
/** Exchange the Owner Token for a server-generated session. The Owner Token is never persisted. */
export async function verifyOwnerToken(ownerToken: string): Promise<string> {
  const response = await fetch(sessionApiUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}`, Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as {
    authenticated?: boolean; sessionToken?: string; error?: string;
  };
  if (!response.ok || payload.authenticated !== true || typeof payload.sessionToken !== 'string') {
    const error = new Error(payload.error ?? `Owner authentication failed (HTTP ${response.status}).`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload.sessionToken;
}
export async function clearOwnerToken(): Promise<void> {
  const session = await getOwnerToken();
  activeSession = null;
  if (session) {
    try {
      await fetch(sessionApiUrl(), { method: 'DELETE', headers: { Authorization: `Bearer ${session}`, Accept: 'application/json' } });
    } catch { /* Local logout must still clear credentials when offline. */ }
  }
  if (!isWebPlatform()) {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(LEGACY_OWNER_TOKEN_KEY);
  }
}
export async function restoreOwnerSession(): Promise<boolean> {
  const session = isWebPlatform() ? activeSession : (activeSession = null, await getOwnerToken());
  if (!session) return false;
  try {
    const response = await fetch(sessionApiUrl(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${session}`, Accept: 'application/json' },
    });
    if (response.ok) return true;
    if (response.status === 401) await expireOwnerSession();
  } catch { /* Treat network failure as unavailable, not as an invalid session. */ }
  return false;
}
