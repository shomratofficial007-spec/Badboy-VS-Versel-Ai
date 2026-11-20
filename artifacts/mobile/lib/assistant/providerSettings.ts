import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { apiUrl } from './ownerJsonRequest';
import { getOwnerToken } from './ownerAuth';
import {
  createProviderKeyStore,
  normalizeProviderBaseUrl,
  parseProviderModelIds,
} from './providerSettingsCore';

export { normalizeProviderBaseUrl } from './providerSettingsCore';

export type AIProviderId = 'server' | 'openai' | 'openrouter' | 'gemini' | 'groq' | 'together' | 'custom';
export interface AIProviderPreset { id: Exclude<AIProviderId, 'server'>; label: string; baseUrl: string; }
export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'custom', label: 'Custom / Proxy', baseUrl: '' },
];

const providerKeyStore = createProviderKeyStore(SecureStore);
export const saveProviderApiKey = (providerId: AIProviderId, apiKey: string) => providerKeyStore.save(providerId, apiKey);
export const getProviderApiKey = (providerId: AIProviderId) => providerKeyStore.get(providerId);
export const deleteProviderApiKey = (providerId: AIProviderId) => providerKeyStore.delete(providerId);

/**
 * Fetch the selected provider's model list through the authenticated Cloudflare Worker.
 * The API key stays in device SecureStore and is forwarded only for this request;
 * the Worker does not persist or log it.
 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
  providerId: Exclude<AIProviderId, 'server'>,
): Promise<string[]> {
  const normalizedBaseUrl = normalizeProviderBaseUrl(baseUrl);
  const cleanApiKey = apiKey.trim();
  if (!cleanApiKey) throw new Error('প্রথমে API Key সংরক্ষণ করুন।');

  const ownerToken = await getOwnerToken();
  if (!ownerToken) {
    throw new Error('Owner login is required. Enter your Badboy Owner Token to continue.');
  }

  const response = await expoFetch(apiUrl('/assistant/provider-models'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ownerToken,
      'X-Provider-Key': cleanApiKey,
    },
    body: JSON.stringify({ providerId, baseUrl: normalizedBaseUrl }),
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: unknown;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Provider model list failed (HTTP ' + response.status + ').');
  }
  return parseProviderModelIds(payload);
}
