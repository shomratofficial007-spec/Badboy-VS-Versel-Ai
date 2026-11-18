import * as SecureStore from 'expo-secure-store';

export type AIProviderId = 'server' | 'openai' | 'openrouter' | 'gemini' | 'groq' | 'together' | 'custom';

export interface AIProviderPreset {
  id: Exclude<AIProviderId, 'server'>;
  label: string;
  baseUrl: string;
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'custom', label: 'Custom / Proxy', baseUrl: '' },
];

const API_KEY_PREFIX = 'badboy-ai-provider-key-v1:';

export function normalizeProviderBaseUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Provider API Base URL দিন।');
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('সঠিক absolute HTTPS URL দিন।');
  }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(localHost && parsed.protocol === 'http:')) {
    throw new Error('নিরাপত্তার জন্য HTTPS endpoint ব্যবহার করুন।');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Base URL-এ username, password, query বা fragment রাখা যাবে না।');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function storageKey(providerId: AIProviderId): string {
  return `${API_KEY_PREFIX}${providerId}`;
}

export async function saveProviderApiKey(providerId: AIProviderId, apiKey: string): Promise<void> {
  const clean = apiKey.trim();
  if (!clean) throw new Error('API Key ফাঁকা রাখা যাবে না।');
  if (clean.length > 4096 || /[\r\n]/.test(clean)) throw new Error('API Key-এর ফরম্যাট সঠিক নয়।');
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('এই ডিভাইসে Secure Storage পাওয়া যাচ্ছে না; API Key সংরক্ষণ করা হয়নি।');
  }
  await SecureStore.setItemAsync(storageKey(providerId), clean);
}

export async function getProviderApiKey(providerId: AIProviderId): Promise<string | null> {
  if (!(await SecureStore.isAvailableAsync())) return null;
  return SecureStore.getItemAsync(storageKey(providerId));
}

export async function deleteProviderApiKey(providerId: AIProviderId): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('এই ডিভাইসে Secure Storage পাওয়া যাচ্ছে না।');
  }
  await SecureStore.deleteItemAsync(storageKey(providerId));
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = normalizeProviderBaseUrl(baseUrl);
  if (!apiKey.trim()) throw new Error('প্রথমে API Key সংরক্ষণ করুন।');
  const response = await fetch(`${base}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Model list পাওয়া যায়নি (HTTP ${response.status})। Base URL ও API Key যাচাই করুন।`);
  }
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(payload.data)) throw new Error('Provider OpenAI-compatible /models response দেয়নি।');
  return [...new Set(payload.data
    .map((item) => item?.id)
    .filter((id): id is string => typeof id === 'string' && /^[\w./:-]{1,200}$/.test(id)))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 500);
}
