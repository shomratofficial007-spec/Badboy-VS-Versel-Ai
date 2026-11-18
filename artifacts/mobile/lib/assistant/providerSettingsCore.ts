export function normalizeProviderBaseUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Provider API Base URL দিন।');
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new Error('সঠিক absolute HTTPS URL দিন।'); }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(localHost && parsed.protocol === 'http:')) throw new Error('নিরাপত্তার জন্য HTTPS endpoint ব্যবহার করুন।');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Base URL-এ username, password, query বা fragment রাখা যাবে না।');
  return parsed.toString().replace(/\/+$/, '');
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = normalizeProviderBaseUrl(baseUrl);
  if (!apiKey.trim()) throw new Error('প্রথমে API Key সংরক্ষণ করুন।');
  const response = await fetch(`${base}/models`, { method: 'GET', headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Model list পাওয়া যায়নি (HTTP ${response.status})। Base URL ও API Key যাচাই করুন।`);
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(payload.data)) throw new Error('Provider OpenAI-compatible /models response দেয়নি।');
  return [...new Set(payload.data.map((item) => item?.id).filter((id): id is string => typeof id === 'string' && /^[\w./:-]{1,200}$/.test(id)))].sort((a, b) => a.localeCompare(b)).slice(0, 500);
}

export interface SecureKeyStorageAdapter {
  isAvailableAsync(): Promise<boolean>;
  setItemAsync(key: string, value: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  deleteItemAsync(key: string): Promise<void>;
}

export function createProviderKeyStore(adapter: SecureKeyStorageAdapter) {
  const keyFor = (providerId: string) => `badboy-ai-provider-key-v1:${providerId}`;
  return {
    async save(providerId: string, apiKey: string): Promise<void> {
      const clean = apiKey.trim();
      if (!clean) throw new Error('API Key ফাঁকা রাখা যাবে না।');
      if (clean.length > 4096 || /[\r\n]/.test(clean)) throw new Error('API Key-এর ফরম্যাট সঠিক নয়।');
      if (!(await adapter.isAvailableAsync())) throw new Error('এই ডিভাইসে Secure Storage পাওয়া যাচ্ছে না; API Key সংরক্ষণ করা হয়নি।');
      await adapter.setItemAsync(keyFor(providerId), clean);
    },
    async get(providerId: string): Promise<string | null> {
      if (!(await adapter.isAvailableAsync())) return null;
      return adapter.getItemAsync(keyFor(providerId));
    },
    async delete(providerId: string): Promise<void> {
      if (!(await adapter.isAvailableAsync())) throw new Error('এই ডিভাইসে Secure Storage পাওয়া যাচ্ছে না।');
      await adapter.deleteItemAsync(keyFor(providerId));
    },
  };
}
