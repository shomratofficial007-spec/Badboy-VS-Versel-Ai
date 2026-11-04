import { NativeModules, Platform } from 'react-native';
import { EventEmitter } from 'expo-modules-core';
const native = Platform.OS === 'android' ? NativeModules.BadboyWakeWord : null;
const emitter = native ? new EventEmitter(native) : null;
export function isWakeWordSupported(): boolean { return Boolean(native?.isSupported?.()); }
export function getWakeWordStatus(): Promise<any> { return native?.getStatus?.() ?? Promise.resolve({ state:'stopped', enabled:false, modelLoaded:false }); }
export function startWakeWord(options?: { threshold?: number }): Promise<any> { if (!native) return Promise.reject(new Error('Wake word unavailable')); return native.start(options ?? {}); }
export function stopWakeWord(): Promise<any> { return native?.stop?.() ?? Promise.resolve({ state:'stopped', enabled:false, modelLoaded:false }); }
export function onWakeWordDetected(listener: (event: { phrase:string; confidence:number; timestamp:number }) => void) { return emitter?.addListener('onWakeWordDetected', listener) ?? { remove() {} }; }
