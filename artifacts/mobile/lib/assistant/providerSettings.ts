import * as SecureStore from 'expo-secure-store';
import { createProviderKeyStore, fetchProviderModels, normalizeProviderBaseUrl } from './providerSettingsCore';
export { fetchProviderModels, normalizeProviderBaseUrl } from './providerSettingsCore';

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
