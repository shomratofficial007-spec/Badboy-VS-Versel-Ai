import { EventEmitter, requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * Typed boundary for the optional Android-native offline Hey Badboy engine.
 * The native module must own microphone capture and must never upload audio.
 */
export type WakeWordState = 'stopped' | 'starting' | 'listening' | 'triggered' | 'error';
export interface WakeWordStatus {
  state: WakeWordState;
  enabled: boolean;
  modelLoaded: boolean;
  message?: string;
}
export interface WakeWordEvent {
  phrase: 'hey-badboy';
  confidence: number;
  timestamp: number;
}
type NativeWakeWordModule = {
  isSupported(): boolean;
  getStatus(): Promise<WakeWordStatus>;
  start(options?: { threshold?: number }): Promise<WakeWordStatus>;
  stop(): Promise<WakeWordStatus>;
};
function nativeModule(): NativeWakeWordModule | null {
  try {
    return Platform.OS === 'android' ? requireNativeModule<NativeWakeWordModule>('BadboyWakeWord') : null;
  } catch { return null; }
}
export function isOfflineWakeWordSupported(): boolean {
  return Boolean(nativeModule()?.isSupported?.());
}
export async function getOfflineWakeWordStatus(): Promise<WakeWordStatus> {
  const native = nativeModule();
  return native ? native.getStatus() : {
    state: 'stopped', enabled: false, modelLoaded: false,
    message: 'Offline wake word is not installed in this app build.',
  };
}
export async function startOfflineWakeWord(threshold?: number): Promise<WakeWordStatus> {
  const native = nativeModule();
  if (!native) throw new Error('Offline Hey Badboy detection is unavailable in this app build.');
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1)) {
    throw new RangeError('Wake-word threshold must be between 0 and 1.');
  }
  return native.start(threshold === undefined ? undefined : { threshold });
}
export async function stopOfflineWakeWord(): Promise<WakeWordStatus> {
  const native = nativeModule();
  return native ? native.stop() : {
    state: 'stopped', enabled: false, modelLoaded: false,
    message: 'Offline wake word is not installed in this app build.',
  };
}
export function subscribeToWakeWord(listener: (event: WakeWordEvent) => void): { remove(): void } {
  const native = nativeModule();
  if (!native) return { remove() {} };
  type WakeWordEventMap = {
    onWakeWordDetected(event: WakeWordEvent): void;
  };
  const emitter = new EventEmitter<WakeWordEventMap>(native as never);
  return emitter.addListener('onWakeWordDetected', (event) => {
    if (event.phrase === 'hey-badboy') listener(event);
  });
}
