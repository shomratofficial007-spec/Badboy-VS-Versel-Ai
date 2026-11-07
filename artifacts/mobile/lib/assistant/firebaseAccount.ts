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
const userMessagesRef = (uid: string) => collection(firestore, 'users', uid, 'chatMessages');

export async function loadCloudAssistantSnapshot(uid: string): Promise<CloudAssistantSnapshot | null> {
  const [stateSnapshot, memorySnapshot, messageSnapshot] = await Promise.all([
    getDoc(userStateRef(uid)),
    getDocs(userMemoriesRef(uid)),
    getDocs(userMessagesRef(uid)),
  ]);

  if (!stateSnapshot.exists() && memorySnapshot.empty && messageSnapshot.empty) return null;
  const state = stateSnapshot.exists() ? stateSnapshot.data() : {};
  const memories = memorySnapshot.docs.map((item) => item.data() as MemoryNote);
  const messages = messageSnapshot.docs
    .map((item) => item.data() as ChatMessage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-100);
  return {
    messages,
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
    settings: snapshot.settings,
    updatedAt: serverTimestamp(),
  });

  const [existingMemories, existingMessages] = await Promise.all([
    getDocs(userMemoriesRef(uid)),
    getDocs(userMessagesRef(uid)),
  ]);
  const memoryIds = new Set(snapshot.memories.map((item) => item.id));
  const messageList = snapshot.messages.slice(-100);
  const messageIds = new Set(messageList.map((item) => item.id));
  const operations = [
    ...snapshot.memories.map((item) => ({
      collection: userMemoriesRef(uid),
      type: 'set' as const,
      id: item.id,
      data: item,
    })),
    ...existingMemories.docs
      .filter((item) => !memoryIds.has(item.id))
      .map((item) => ({ collection: userMemoriesRef(uid), type: 'delete' as const, id: item.id })),
    ...messageList.map((item) => ({
      collection: userMessagesRef(uid),
      type: 'set' as const,
      id: item.id,
      data: item,
    })),
    ...existingMessages.docs
      .filter((item) => !messageIds.has(item.id))
      .map((item) => ({ collection: userMessagesRef(uid), type: 'delete' as const, id: item.id })),
  ];

  for (let offset = 0; offset < operations.length; offset += 450) {
    const batch = writeBatch(firestore);
    for (const operation of operations.slice(offset, offset + 450)) {
      const reference = doc(operation.collection, operation.id);
      if (operation.type === 'set') batch.set(reference, operation.data);
      else batch.delete(reference);
    }
    await batch.commit();
  }
}

export async function deleteCloudAssistantData(uid: string): Promise<void> {
  const [memories, messages, state] = await Promise.all([
    getDocs(userMemoriesRef(uid)),
    getDocs(userMessagesRef(uid)),
    getDoc(userStateRef(uid)),
  ]);
  const refs = [
    ...memories.docs.map((item) => item.ref),
    ...messages.docs.map((item) => item.ref),
    ...(state.exists() ? [userStateRef(uid)] : []),
  ];
  for (let offset = 0; offset < refs.length; offset += 450) {
    const batch = writeBatch(firestore);
    refs.slice(offset, offset + 450).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}
