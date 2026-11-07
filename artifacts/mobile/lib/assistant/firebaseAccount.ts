import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { firebaseAuth, firestore } from './firebaseClient';
import type { AssistantSettings, ChatMessage, MemoryNote } from '@/lib/assistant/types';

export type FirebaseAccount = User;

export function subscribeToFirebaseAccount(
  listener: (user: FirebaseAccount | null) => void,
  onError?: (error: Error) => void,
) {
  return onAuthStateChanged(
    firebaseAuth,
    listener,
    (error) => onError?.(error),
  );
}

export function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
}

export function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
}

export function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(firebaseAuth, email.trim());
}

export function logoutFirebaseAccount() {
  return signOut(firebaseAuth);
}

export interface CloudAssistantSnapshot {
  messages: ChatMessage[];
  settings: Partial<AssistantSettings>;
  memories: MemoryNote[];
}

const userStateRef = (uid: string) => doc(firestore, 'users', uid, 'assistantData', 'state');
const userMemoriesRef = (uid: string) => collection(firestore, 'users', uid, 'memories');

export async function loadCloudAssistantSnapshot(uid: string): Promise<CloudAssistantSnapshot | null> {
  const [stateSnapshot, memorySnapshot] = await Promise.all([
    getDoc(userStateRef(uid)),
    getDocs(userMemoriesRef(uid)),
  ]);

  if (!stateSnapshot.exists() && memorySnapshot.empty) return null;
  const state = stateSnapshot.exists() ? stateSnapshot.data() : {};
  const memories = memorySnapshot.docs.map((item) => item.data() as MemoryNote);
  return {
    messages: Array.isArray(state.messages) ? state.messages as ChatMessage[] : [],
    settings: (state.settings ?? {}) as Partial<AssistantSettings>,
    memories,
  };
}

/** Upload only the signed-in user's app data. No AI prompts or engine traffic use Firebase. */
export async function syncCloudAssistantSnapshot(
  uid: string,
  snapshot: CloudAssistantSnapshot,
): Promise<void> {
  if (snapshot.memories.length > 400) {
    throw new Error('৪০০টির বেশি মেমোরি থাকায় Cloud Sync সীমিত হয়েছে।');
  }

  await setDoc(userStateRef(uid), {
    messages: snapshot.messages.slice(-100),
    settings: snapshot.settings,
    updatedAt: serverTimestamp(),
  });

  const existing = await getDocs(userMemoriesRef(uid));
  const localIds = new Set(snapshot.memories.map((item) => item.id));
  const operations = [
    ...snapshot.memories.map((item) => ({
      type: 'set' as const,
      id: item.id,
      data: item,
    })),
    ...existing.docs
      .filter((item) => !localIds.has(item.id))
      .map((item) => ({ type: 'delete' as const, id: item.id })),
  ];

  for (let offset = 0; offset < operations.length; offset += 450) {
    const batch = writeBatch(firestore);
    for (const operation of operations.slice(offset, offset + 450)) {
      const reference = doc(userMemoriesRef(uid), operation.id);
      if (operation.type === 'set') batch.set(reference, operation.data);
      else batch.delete(reference);
    }
    await batch.commit();
  }
}

export async function deleteCloudAssistantData(uid: string): Promise<void> {
  const [memories, state] = await Promise.all([
    getDocs(userMemoriesRef(uid)),
    getDoc(userStateRef(uid)),
  ]);
  const refs = [
    ...memories.docs.map((item) => item.ref),
    ...(state.exists() ? [userStateRef(uid)] : []),
  ];
  for (let offset = 0; offset < refs.length; offset += 450) {
    const batch = writeBatch(firestore);
    refs.slice(offset, offset + 450).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}
