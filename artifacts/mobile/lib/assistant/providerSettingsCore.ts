export function normalizeProviderBaseUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Provider API Base URL দিন।');
  let parsed: URL;
  try { parsed = new URL(input); } catch { throw new Error('সঠিক absolute HTTPS URL দিন।'); }
  if (parsed.protocol !== 'https:') throw new Error('নিরাপত্তার জন্য HTTPS endpoint ব্যবহার করুন।');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Base URL-এ username, password, query বা fragment রাখা যাবে না।');
  if (parsed.port) throw new Error('Cloudflare Worker provider endpoints must use HTTPS port 443.');
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const blockedHost = !hostname.includes('.') ||
    hostname.includes(':') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    ['localhost', '.localhost', '.local', '.internal', '.test', '.invalid', '.example', '.onion']
      .some((suffix) => hostname === suffix || hostname.endsWith(suffix));
  if (blockedHost) throw new Error('Cloudflare Worker থেকে public HTTPS hostname ব্যবহার করুন; localhost ও IP endpoint সমর্থিত নয়।');
  return parsed.toString().replace(/\/+$/, '');
}

export function parseProviderModelIds(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || !('data' in payload) || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error('Provider OpenAI-compatible /models response দেয়নি।');
  }
  const data = (payload as { data: Array<{ id?: unknown }> }).data;
  return [...new Set(data.map((item) => item?.id).filter((id): id is string => typeof id === 'string' && /^[\w./:-]{1,200}$/.test(id)))].sort((a, b) => a.localeCompare(b)).slice(0, 500);
}

export interface SecureKeyStorageAdapter {
  isAvailableAsync(): Promise<boolean>;
  setItemAsync(key: string, value: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  deleteItemAsync(key: string): Promise<void>;
}

export function createProviderKeyStore(adapter: SecureKeyStorageAdapter) {
  const keyFor = (providerId: string) => `badboy-ai-provider-key-v1-${providerId}`;
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
