import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { readLocalState, persistMessages, persistSettings, removeMemoryNote, storeMemoryNote, updateMemoryNote, clearLocalAssistantData, getLocalFirebaseOwner, setLocalFirebaseOwner } from '@/lib/assistant/storage';
import { DEFAULT_SETTINGS, type AssistantSettings, type ChatMessage, type MemoryNote } from '@/lib/assistant/types';
import { subscribeToFirebaseAccount, loadCloudAssistantSnapshot, syncCloudAssistantSnapshot, type FirebaseAccount } from '@/lib/assistant/firebaseAccount';

interface AssistantContextValue {
  ready: boolean;
  accountUser: FirebaseAccount | null;
  authReady: boolean;
  cloudSyncing: boolean;
  cloudSyncError: string | null;
  messages: ChatMessage[];
  memories: MemoryNote[];
  settings: AssistantSettings;
  storageError: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  updateSettings: (update: Partial<AssistantSettings>) => void;
  saveMemory: (title: string, content: string) => Promise<void>;
  updateMemory: (id: string, title: string, content: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  clearChat: () => Promise<void>;
  expertReviewDraft: string;
  setExpertReviewDraft: (value: string) => void;
  clearExpertReviewDraft: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);
let idCounter = 0;

function createId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useAssistant must be used inside AssistantProvider.');
  return value;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accountUser, setAccountUser] = useState<FirebaseAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudSyncReadyUid, setCloudSyncReadyUid] = useState<string | null>(null);
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<MemoryNote[]>([]);
  const [settings, setSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [expertReviewDraft, setExpertReviewDraftState] = useState('');

  useEffect(() => {
    return subscribeToFirebaseAccount(
      (user) => {
        setAccountUser(user);
        setAuthReady(true);
        setCloudSyncReadyUid(null);
        setCloudSyncError(null);
      },
      () => {
        setAuthReady(true);
        setCloudSyncError('Firebase Account অবস্থা যাচাই করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।');
      },
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    readLocalState()
      .then((state) => {
        if (!mounted) return;
        setMessagesState(state.messages);
        setMemories(state.memories);
        setSettings({ ...DEFAULT_SETTINGS, ...state.settings, roadmap: { ...DEFAULT_SETTINGS.roadmap, ...state.settings.roadmap } });
        setReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setStorageError('Local storage could not be opened. Your data was not sent anywhere.');
        setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (ready) {
      persistMessages(messages).catch(() =>
        setStorageError('Chat history could not be saved on this device.'),
      );
    }
  }, [messages, ready]);

  useEffect(() => {
    if (ready) {
      persistSettings(settings).catch(() =>
        setStorageError('Assistant settings could not be saved on this device.'),
      );
    }
  }, [settings, ready]);

  // On sign-in, restore this account's cloud snapshot. Never merge another account's
  // device data into the newly signed-in account.
  useEffect(() => {
    if (!ready || !authReady || !accountUser) return;
    let active = true;
    const uid = accountUser.uid;
    setCloudSyncReadyUid(null);
    (async () => {
      const localOwner = await getLocalFirebaseOwner();
      const canMergeLocal = !localOwner || localOwner === uid;
      try {
        const remote = await loadCloudAssistantSnapshot(uid);
        if (!active) return;

        if (remote) {
          const localMessages = canMergeLocal ? messages : [];
          const localMemories = canMergeLocal ? memories : [];
          const localSettings = canMergeLocal ? settings : DEFAULT_SETTINGS;
          const mergedMessages = new Map<string, ChatMessage>();
          [...remote.messages, ...localMessages].forEach((item) => mergedMessages.set(item.id, item));
          const nextMessages = [...mergedMessages.values()]
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .slice(-100);
          const mergedMemories = new Map<string, MemoryNote>();
          [...remote.memories, ...localMemories].forEach((item) => mergedMemories.set(item.id, item));
          const nextMemories = [...mergedMemories.values()];
          const nextSettings = {
            ...DEFAULT_SETTINGS,
            ...localSettings,
            ...remote.settings,
            roadmap: {
              ...DEFAULT_SETTINGS.roadmap,
              ...localSettings.roadmap,
              ...(remote.settings.roadmap ?? {}),
            },
          };
          setMessagesState(nextMessages);
          setMemories(nextMemories);
          setSettings(nextSettings);
          await Promise.all([
            persistMessages(nextMessages),
            persistSettings(nextSettings),
          ]);
        } else if (!canMergeLocal) {
          // A different account has no backup yet: clear the previous account's local data.
          await clearLocalAssistantData();
          setMessagesState([]);
          setMemories([]);
          setSettings(DEFAULT_SETTINGS);
          await Promise.all([persistMessages([]), persistSettings(DEFAULT_SETTINGS)]);
        }

        if (!active) return;
        await setLocalFirebaseOwner(uid);
        if (active) setCloudSyncReadyUid(uid);
      } catch (error) {
        if (!active) return;
        setCloudSyncError(
          error instanceof Error
            ? `Cloud Data পড়া যায়নি: ${error.message}`
            : 'Cloud Data পড়া যায়নি। Firestore Rules পরীক্ষা করুন।',
        );
        // Do not upload local data to a different account if its cloud snapshot
        // could not be read. The user can retry after Firestore access is fixed.
        if (canMergeLocal) setCloudSyncReadyUid(uid);
      }
    })();
    return () => { active = false; };
  }, [ready, authReady, accountUser?.uid]);

  // Keep the signed-in user's backup up to date without routing app/AI requests through Firebase.
  useEffect(() => {
    if (!ready || !accountUser || cloudSyncReadyUid !== accountUser.uid) return;
    const uid = accountUser.uid;
    const timer = setTimeout(() => {
      setCloudSyncing(true);
      syncCloudAssistantSnapshot(uid, { messages, memories, settings })
        .then(() => setCloudSyncError(null))
        .catch((error) => {
          setCloudSyncError(
            error instanceof Error
              ? `Cloud Sync ব্যর্থ: ${error.message}`
              : 'Cloud Sync ব্যর্থ। Firestore Rules/Connection পরীক্ষা করুন।',
          );
        })
        .finally(() => setCloudSyncing(false));
    }, 900);
    return () => clearTimeout(timer);
  }, [ready, accountUser?.uid, cloudSyncReadyUid, messages, memories, settings]);

  const setMessages = useCallback((next: ChatMessage[]) => {
    setMessagesState(next);
  }, []);

  const updateSettings = useCallback((update: Partial<AssistantSettings>) => {
    setSettings((current) => ({ ...current, ...update }));
  }, []);

  const saveMemory = useCallback(
    async (title: string, content: string) => {
      const note: MemoryNote = {
        id: createId('memory'),
        title: title.trim(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      const next = [note, ...memories];
      await storeMemoryNote(note, next);
      setMemories(next);
    },
    [memories],
  );

  const updateMemory = useCallback(
    async (id: string, title: string, content: string) => {
      const existing = memories.find((note) => note.id === id);
      if (!existing) throw new Error('Memory note not found.');
      const updated: MemoryNote = {
        ...existing,
        title: title.trim(),
        content: content.trim(),
      };
      const next = await updateMemoryNote(updated, memories);
      setMemories(next);
    },
    [memories],
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      const next = memories.filter((note) => note.id !== id);
      await removeMemoryNote(id, next);
      setMemories(next);
    },
    [memories],
  );

  const clearChat = useCallback(async () => {
    setMessagesState([]);
    await persistMessages([]);
  }, []);

  const setExpertReviewDraft = useCallback((value: string) => {
    setExpertReviewDraftState(value);
  }, []);

  const clearExpertReviewDraft = useCallback(() => {
    setExpertReviewDraftState('');
  }, []);

  const value = useMemo(
    () => ({
      ready,
      accountUser,
      authReady,
      cloudSyncing,
      cloudSyncError,
      messages,
      memories,
      settings,
      storageError,
      setMessages,
      updateSettings,
      saveMemory,
      updateMemory,
      deleteMemory,
      clearChat,
      expertReviewDraft,
      setExpertReviewDraft,
      clearExpertReviewDraft,
    }),
    [ready, accountUser, authReady, cloudSyncing, cloudSyncError, messages, memories, settings, storageError, setMessages, updateSettings, saveMemory, updateMemory, deleteMemory, clearChat, expertReviewDraft, setExpertReviewDraft, clearExpertReviewDraft],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
