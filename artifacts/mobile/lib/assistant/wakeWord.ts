/**
 * Typed boundary for the optional Android-native offline Hey Badboy engine.
 * The native module owns microphone capture and must never upload audio.
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
type NativeWakeWordEventMap = {
  onWakeWordDetected(event: WakeWordEvent): void;
  onWakeWordStatus(status: WakeWordStatus): void;
};
type Subscription = { remove(): void };
type WakeWordBridgeDependencies = {
  platformOS: () => string;
  loadNativeModule: () => NativeWakeWordModule;
  createEmitter: (native: NativeWakeWordModule) => {
    addListener(event: 'onWakeWordDetected' | 'onWakeWordStatus', listener: (value: never) => void): Subscription;
  };
};

/**
 * Injectable bridge factory: production uses Expo's native module, while tests
 * exercise the exact platform/validation/event code with a deterministic fake.
 */
export function createWakeWordBridge(dependencies: WakeWordBridgeDependencies) {
  const nativeModule = (): NativeWakeWordModule | null => {
    try {
      return dependencies.platformOS() === 'android' ? dependencies.loadNativeModule() : null;
    } catch {
      return null;
    }
  };

  const unavailableStatus = (): WakeWordStatus => ({
    state: 'stopped',
    enabled: false,
    modelLoaded: false,
    message: 'Offline wake word is not installed in this app build.',
  });

  return {
    isOfflineWakeWordSupported(): boolean {
      return Boolean(nativeModule()?.isSupported?.());
    },

    async getOfflineWakeWordStatus(): Promise<WakeWordStatus> {
      const native = nativeModule();
      return native ? native.getStatus() : unavailableStatus();
    },

    async startOfflineWakeWord(threshold?: number): Promise<WakeWordStatus> {
      const native = nativeModule();
      if (!native) throw new Error('Offline Hey Badboy detection is unavailable in this app build.');
      if (threshold !== undefined && (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1)) {
        throw new RangeError('Wake-word threshold must be between 0 and 1.');
      }
      return native.start(threshold === undefined ? undefined : { threshold });
    },

    async stopOfflineWakeWord(): Promise<WakeWordStatus> {
      const native = nativeModule();
      return native ? native.stop() : unavailableStatus();
    },

    subscribeToWakeWordStatus(listener: (status: WakeWordStatus) => void): Subscription {
      const native = nativeModule();
      if (!native) return { remove() {} };
      return dependencies.createEmitter(native).addListener(
        'onWakeWordStatus',
        listener as (value: never) => void,
      );
    },

    subscribeToWakeWord(listener: (event: WakeWordEvent) => void): Subscription {
      const native = nativeModule();
      if (!native) return { remove() {} };
      return dependencies.createEmitter(native).addListener(
        'onWakeWordDetected',
        ((event: WakeWordEvent) => {
          if (event.phrase === 'hey-badboy') listener(event);
        }) as (value: never) => void,
      );
    },
  };
}

function getPlatformOS(): string {
  try {
    // Lazy loading keeps this typed boundary importable in the Node test runner.
    return require('react-native')?.Platform?.OS ?? 'node';
  } catch {
    return 'node';
  }
}

const bridge = createWakeWordBridge({
  platformOS: getPlatformOS,
  loadNativeModule: () => require('expo-modules-core').requireNativeModule('BadboyWakeWord') as NativeWakeWordModule,
  createEmitter: (native) => {
    const { EventEmitter } = require('expo-modules-core');
    return new EventEmitter(native as never);
  },
});

export const isOfflineWakeWordSupported = bridge.isOfflineWakeWordSupported;
export const getOfflineWakeWordStatus = bridge.getOfflineWakeWordStatus;
export const startOfflineWakeWord = bridge.startOfflineWakeWord;
export const stopOfflineWakeWord = bridge.stopOfflineWakeWord;
export const subscribeToWakeWordStatus = bridge.subscribeToWakeWordStatus;
export const subscribeToWakeWord = bridge.subscribeToWakeWord;
