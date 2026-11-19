import { Platform } from 'react-native';
import { normalizeVisibleScreenText } from './screenContextCore';

type NativeJarvisModule = {
  canDrawOverlays(): boolean;
  openOverlayPermissionSettings(): Promise<boolean>;
  startFloatingAssistant(): Promise<boolean>;
  stopFloatingAssistant(): Promise<boolean>;
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): Promise<boolean>;
  readVisibleScreenText(): Promise<string>;
};

function nativeModule(): NativeJarvisModule {
  if (Platform.OS !== 'android') throw new Error('Jarvis native controls are available on Android only.');
  // Lazy load keeps web builds and Node unit tests independent of Expo native runtime.
  return require('expo-modules-core').requireNativeModule('BadboyJarvis') as NativeJarvisModule;
}

export function canDrawFloatingAssistant(): boolean {
  try {
    return Platform.OS === 'android' && nativeModule().canDrawOverlays();
  } catch {
    return false;
  }
}

export async function openFloatingAssistantPermissionSettings(): Promise<void> {
  const opened = await nativeModule().openOverlayPermissionSettings();
  if (!opened) throw new Error('Android overlay permission settings could not be opened.');
}

export async function startFloatingAssistant(): Promise<void> {
  if (!canDrawFloatingAssistant()) {
    throw new Error('প্রথমে Android Settings থেকে Display over other apps permission দিন।');
  }
  const started = await nativeModule().startFloatingAssistant();
  if (!started) throw new Error('Android could not start the Jarvis floating assistant service.');
}

export async function stopFloatingAssistant(): Promise<void> {
  if (Platform.OS === 'android') await nativeModule().stopFloatingAssistant();
}

export function isScreenAwarenessEnabled(): boolean {
  try {
    return Platform.OS === 'android' && nativeModule().isAccessibilityEnabled();
  } catch {
    return false;
  }
}

export async function openScreenAwarenessSettings(): Promise<void> {
  const opened = await nativeModule().openAccessibilitySettings();
  if (!opened) throw new Error('Android Accessibility settings could not be opened.');
}

export async function readVisibleScreenText(): Promise<string> {
  const raw = await nativeModule().readVisibleScreenText();
  const normalized = normalizeVisibleScreenText(raw);
  if (!normalized) throw new Error('এই স্ক্রিনে পড়ার মতো কোনো লেখা পাওয়া যায়নি।');
  return normalized;
}
