import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AssistantSettings, ChatMessage, MemoryNote } from './types';

const CHAT_KEY = 'oi-assistant-chat-v1';
const SETTINGS_KEY = 'oi-assistant-settings-v1';
const MEMORY_INDEX_KEY = 'oi-assistant-memory-index-v1';
const MEMORY_PREFIX = 'oi-assistant-memory-';
const FIREBASE_OWNER_KEY = 'badboy-firebase-local-owner-v1';

type MemoryIndexItem = Pick<MemoryNote, 'id' | 'title' | 'createdAt'>;

async function setSecureOrFallback(key: string, value: string): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore && (await SecureStore.isAvailableAsync().catch(() => false))) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
  } catch {
    // Fall back
  }
  await AsyncStorage.setItem(key, value);
}

async function getSecureOrFallback(key: string): Promise<string | null> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore && (await SecureStore.isAvailableAsync().catch(() => false))) {
      return await SecureStore.getItemAsync(key);
    }
  } catch {
    // Fall back
  }
  return await AsyncStorage.getItem(key);
}

async function deleteSecureOrFallback(key: string): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore && (await SecureStore.isAvailableAsync().catch(() => false))) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
  } catch {
    // Fall back
  }
  await AsyncStorage.removeItem(key);
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
  const index = indexValue ? (JSON.parse(indexValue) as MemoryIndexItem[]) : [];

  const memories = await Promise.all(
    index.map(async (item) => ({
      ...item,
      content: (await getSecureOrFallback(`${MEMORY_PREFIX}${item.id}`)) ?? '',
    })),
  );

  return { messages, settings, memories };
}

export function persistMessages(messages: ChatMessage[]) {
  return AsyncStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

export function persistSettings(settings: AssistantSettings) {
  return AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function persistMemoryIndex(memories: MemoryNote[]) {
  const index: MemoryIndexItem[] = memories.map(
    ({ id, title, createdAt }) => ({ id, title, createdAt }),
  );
  await AsyncStorage.setItem(MEMORY_INDEX_KEY, JSON.stringify(index));
}

export async function storeMemoryNote(note: MemoryNote, memories: MemoryNote[]) {
  await setSecureOrFallback(`${MEMORY_PREFIX}${note.id}`, note.content);
  await persistMemoryIndex([...memories, note]);
}

export async function updateMemoryNote(updated: MemoryNote, memories: MemoryNote[]) {
  await setSecureOrFallback(`${MEMORY_PREFIX}${updated.id}`, updated.content);
  const newMemories = memories.map((item) => (item.id === updated.id ? updated : item));
  await persistMemoryIndex(newMemories);
  return newMemories;
}

export async function removeMemoryNote(id: string, memories: MemoryNote[]) {
  await deleteSecureOrFallback(`${MEMORY_PREFIX}${id}`);
  const newMemories = memories.filter((item) => item.id !== id);
  await persistMemoryIndex(newMemories);
  return newMemories;
}

export async function clearLocalAssistantData() {
  const indexValue = await AsyncStorage.getItem(MEMORY_INDEX_KEY);
  const index = indexValue ? (JSON.parse(indexValue) as MemoryIndexItem[]) : [];
  await Promise.all(
    index.map((item) => deleteSecureOrFallback(`${MEMORY_PREFIX}${item.id}`)),
  );
  await AsyncStorage.multiRemove([CHAT_KEY, SETTINGS_KEY, MEMORY_INDEX_KEY]);
}

/** Keeps local app data from being uploaded to a different signed-in account. */
export function getLocalFirebaseOwner() {
  return AsyncStorage.getItem(FIREBASE_OWNER_KEY);
}

export function setLocalFirebaseOwner(uid: string) {
  return AsyncStorage.setItem(FIREBASE_OWNER_KEY, uid);
}
