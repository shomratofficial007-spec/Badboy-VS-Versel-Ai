import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AssistantSettings, ChatMessage, MemoryNote } from './types';

const CHAT_KEY = 'oi-assistant-chat-v1';
const SETTINGS_KEY = 'oi-assistant-settings-v1';
const MEMORY_INDEX_KEY = 'oi-assistant-memory-index-v1';
const MEMORY_PREFIX = 'oi-assistant-memory-';
const SECURE_STORAGE_ERROR =
  'Encrypted device storage is unavailable. Private memory was not read or saved; existing data has been left untouched.';

type MemoryIndexItem = {
  id: string;
  // Legacy metadata is read once and migrated into the secure note payload.
  title?: string;
  createdAt?: string;
};

type SecureStoreModule = typeof import('expo-secure-store');

async function getSecureStore(): Promise<SecureStoreModule> {
  try {
    const SecureStore = await import('expo-secure-store');
    if (await SecureStore.isAvailableAsync()) return SecureStore;
  } catch {
    // Native private memory must fail closed instead of falling back to plaintext.
  }
  throw new Error(SECURE_STORAGE_ERROR);
}

async function setSecureOrFallback(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Browser storage is local to this browser profile but is not encrypted by this app.
    await AsyncStorage.setItem(key, value);
    return;
  }
  const SecureStore = await getSecureStore();
  await SecureStore.setItemAsync(key, value);
}

async function getSecureOrFallback(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);

  const SecureStore = await getSecureStore();
  const secureValue = await SecureStore.getItemAsync(key);
  if (secureValue !== null) return secureValue;

  // Migrate notes previously written to AsyncStorage by older versions when
  // SecureStore was unavailable. Keep the old copy unless secure write succeeds.
  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue !== null) {
    await SecureStore.setItemAsync(key, legacyValue);
    await AsyncStorage.removeItem(key);
  }
  return legacyValue;
}

async function deleteSecureOrFallback(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  const SecureStore = await getSecureStore();
  await SecureStore.deleteItemAsync(key);
  // Remove any legacy plaintext copy after secure deletion succeeds.
  await AsyncStorage.removeItem(key);
}

function isStoredMemoryNote(value: unknown, expectedId: string): value is MemoryNote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const note = value as Record<string, unknown>;
  return note.id === expectedId &&
    typeof note.title === 'string' &&
    typeof note.content === 'string' &&
    typeof note.createdAt === 'string';
}

function parseMemoryIndex(value: string | null): MemoryIndexItem[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): MemoryIndexItem[] => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) return [];
    const legacy = item as Record<string, unknown>;
    return [{
      id: item.id,
      ...(typeof legacy.title === 'string' ? { title: legacy.title } : {}),
      ...(typeof legacy.createdAt === 'string' ? { createdAt: legacy.createdAt } : {}),
    }];
  });
}

async function persistMemoryIndex(memories: MemoryNote[]) {
  // Titles and timestamps can themselves be sensitive. Keep only opaque IDs in AsyncStorage.
  const index = memories.map(({ id }) => ({ id }));
  await AsyncStorage.setItem(MEMORY_INDEX_KEY, JSON.stringify(index));
}

export async function readLocalState() {
  const [messagesValue, settingsValue, indexValue] = await Promise.all([
    AsyncStorage.getItem(CHAT_KEY),
    AsyncStorage.getItem(SETTINGS_KEY),
    AsyncStorage.getItem(MEMORY_INDEX_KEY),
  ]);

  const messages = messagesValue
    ? (JSON.parse(messagesValue) as ChatMessage[])
    : [];
  const settings = settingsValue
    ? (JSON.parse(settingsValue) as Partial<AssistantSettings>)
    : {};
  const index = parseMemoryIndex(indexValue);

  const memoryResults = await Promise.allSettled(index.map(async (item): Promise<MemoryNote | null> => {
    const key = MEMORY_PREFIX + item.id;
    const stored = await getSecureOrFallback(key);
    if (stored === null) {
      if (item.title === undefined || item.createdAt === undefined) return null;
      return { id: item.id, title: item.title, createdAt: item.createdAt, content: '' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      parsed = null;
    }
    if (isStoredMemoryNote(parsed, item.id)) return parsed;

    // Older versions stored only note content in SecureStore and kept the
    // title/date in a plaintext index. Migrate the complete note into SecureStore.
    const migrated: MemoryNote = {
      id: item.id,
      title: item.title ?? 'Private note',
      createdAt: item.createdAt ?? new Date().toISOString(),
      content: stored,
    };
    await setSecureOrFallback(key, JSON.stringify(migrated));
    return migrated;
  }));

  const memories = memoryResults.flatMap((result) =>
    result.status === 'fulfilled' && result.value !== null ? [result.value] : [],
  );
  const failedMemoryRead = memoryResults.find((result) => result.status === 'rejected');
  const storageError = failedMemoryRead
    ? failedMemoryRead.reason instanceof Error
      ? failedMemoryRead.reason.message
      : SECURE_STORAGE_ERROR
    : null;

  // Do not rewrite the index when any secure read failed: that could orphan
  // notes that remain safely stored but could not be opened in this session.
  if (index.length > 0 && !storageError) await persistMemoryIndex(memories);

  return { messages, settings, memories, storageError };
}

export function persistMessages(messages: ChatMessage[]) {
  return AsyncStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

export function persistSettings(settings: AssistantSettings) {
  return AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function storeMemoryNote(note: MemoryNote, memories: MemoryNote[]) {
  await setSecureOrFallback(MEMORY_PREFIX + note.id, JSON.stringify(note));
  await persistMemoryIndex([...memories, note]);
}

export async function updateMemoryNote(updated: MemoryNote, memories: MemoryNote[]) {
  await setSecureOrFallback(MEMORY_PREFIX + updated.id, JSON.stringify(updated));
  const newMemories = memories.map((item) => (item.id === updated.id ? updated : item));
  await persistMemoryIndex(newMemories);
  return newMemories;
}

export async function removeMemoryNote(id: string, memories: MemoryNote[]) {
  await deleteSecureOrFallback(MEMORY_PREFIX + id);
  const newMemories = memories.filter((item) => item.id !== id);
  await persistMemoryIndex(newMemories);
  return newMemories;
}

export async function clearLocalAssistantData() {
  const indexValue = await AsyncStorage.getItem(MEMORY_INDEX_KEY);
  const index = parseMemoryIndex(indexValue);
  await Promise.all(index.map((item) => deleteSecureOrFallback(MEMORY_PREFIX + item.id)));
  await AsyncStorage.multiRemove([CHAT_KEY, SETTINGS_KEY, MEMORY_INDEX_KEY]);
}
