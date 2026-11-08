import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';

const OWNER_TOKEN_KEY = 'badboy-owner-token-v1';
const DEFAULT_NATIVE_API_DOMAIN = 'https://badboy-vs-versel-ai.shomratofficial007.workers.dev';

let activeToken: string | null = null;

function isWebPlatform(): boolean {
  return process.env.EXPO_OS === 'web';
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
    activeToken = await SecureStore.getItemAsync(OWNER_TOKEN_KEY);
    return activeToken;
  } catch {
    return null;
  }
}

export async function saveOwnerToken(token: string): Promise<void> {
  if (!isWebPlatform()) {
    await SecureStore.setItemAsync(OWNER_TOKEN_KEY, token);
  }
  activeToken = token;
}

export async function clearOwnerToken(): Promise<void> {
  activeToken = null;
  if (!isWebPlatform()) {
    await SecureStore.deleteItemAsync(OWNER_TOKEN_KEY);
  }
}

export async function verifyOwnerToken(token: string): Promise<void> {
  const response = await expoFetch(authApiUrl(), {
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

export async function restoreOwnerSession(): Promise<boolean> {
  // A token that was verified before and saved in SecureStore keeps the local
  // app available offline. Every server request still revalidates it, so a
  // revoked/rotated token cannot access private server data.
  return Boolean(await getOwnerToken());
}
