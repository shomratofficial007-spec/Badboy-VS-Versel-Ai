// Voice helpers with dual support for Native Mobile (Android / iOS) via
// Expo Speech Recognition & Expo Speech, and Web Speech API fallback for browsers.
//
// Speech-to-text (dictation) streams audio to device / vendor speech recognition,
// so callers must gate it behind the user's voice-processing consent.
// Text-to-speech runs through native TTS engine on mobile or browser local voices on web.

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native');
    if (rn?.Platform?.OS) {
      return rn.Platform.OS;
    }
  } catch {
    // Pure web or Node test runner
  }
  if (typeof window !== 'undefined') return 'web';
  return 'node';
}

function getSpeechModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech');
  } catch {
    return null;
  }
}

function getSpeechRecognitionModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    return mod?.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

/** Common speech-recognition/TTS locales. Actual availability depends on Android's installed speech provider. */
export const VOICE_LANGUAGES = [
  { code: 'bn-BD', label: 'বাংলা (বাংলাদেশ)' },
  { code: 'bn-IN', label: 'বাংলা (ভারত)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-CA', label: 'English (Canada)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'es-MX', label: 'Español (México)' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'fr-CA', label: 'Français (Canada)' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ur-PK', label: 'اردو' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'zh-TW', label: '中文 (繁體)' },
  { code: 'yue-Hant-HK', label: '粵語' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'uk-UA', label: 'Українська' },
  { code: 'tr-TR', label: 'Türkçe' },
  { code: 'nl-NL', label: 'Nederlands' },
  { code: 'sv-SE', label: 'Svenska' },
  { code: 'no-NO', label: 'Norsk' },
  { code: 'da-DK', label: 'Dansk' },
  { code: 'fi-FI', label: 'Suomi' },
  { code: 'pl-PL', label: 'Polski' },
  { code: 'cs-CZ', label: 'Čeština' },
  { code: 'sk-SK', label: 'Slovenčina' },
  { code: 'hu-HU', label: 'Magyar' },
  { code: 'ro-RO', label: 'Română' },
  { code: 'bg-BG', label: 'Български' },
  { code: 'el-GR', label: 'Ελληνικά' },
  { code: 'he-IL', label: 'עברית' },
  { code: 'fa-IR', label: 'فارسی' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'ms-MY', label: 'Bahasa Melayu' },
  { code: 'th-TH', label: 'ไทย' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'fil-PH', label: 'Filipino' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
  { code: 'sw-KE', label: 'Kiswahili' },
  { code: 'af-ZA', label: 'Afrikaans' },
  { code: 'ca-ES', label: 'Català' },
  { code: 'eu-ES', label: 'Euskara' },
  { code: 'hr-HR', label: 'Hrvatski' },
  { code: 'sr-RS', label: 'Српски' },
  { code: 'sl-SI', label: 'Slovenščina' },
  { code: 'et-EE', label: 'Eesti' },
  { code: 'lv-LV', label: 'Latviešu' },
  { code: 'lt-LT', label: 'Lietuvių' },
  { code: 'is-IS', label: 'Íslenska' },
  { code: 'ga-IE', label: 'Gaeilge' },
] as const;

export function getVoiceLanguageLabel(code: string): string {
  return VOICE_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

export function getNextVoiceLanguage(code: string): string {
  const index = VOICE_LANGUAGES.findIndex((language) => language.code === code);
  return VOICE_LANGUAGES[(index + 1) % VOICE_LANGUAGES.length].code;
}

interface SpeechCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (errorType?: string) => void;
  onDone?: () => void;
  onWakeWordDetected?: () => void;
  lang?: string;
}

type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: unknown };
  length: number;
};

type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
};

function recognitionConstructor(): (new () => RecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const scoped = window as unknown as Record<string, unknown>;
  const ctor = scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition;
  return typeof ctor === 'function'
    ? (ctor as new () => RecognitionInstance)
    : null;
}

export function isDictationAvailable(): boolean {
  const os = getPlatformOS();
  const nativeModule = getSpeechRecognitionModule();
  if (os !== 'web' && os !== 'node') {
    return nativeModule?.isRecognitionAvailable?.() ?? false;
  }
  return (
    (nativeModule?.isRecognitionAvailable?.() ?? false) ||
    recognitionConstructor() !== null
  );
}

export function isReadAloudAvailable(): boolean {
  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node') {
    return typeof speechModule?.speak === 'function';
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return typeof window.speechSynthesis?.speak === 'function';
  }
  return false;
}

/**
 * Check microphone permission state on Native Android/iOS or Browser Web.
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  const os = getPlatformOS();
  const nativeModule = getSpeechRecognitionModule();
  if (os !== 'web' && os !== 'node' && nativeModule) {
    try {
      const res = await nativeModule.getPermissionsAsync();
      if (res.status === 'granted') return 'granted';
      if (res.status === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined') return 'unsupported';
  if (navigator?.permissions?.query) {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch {
      // Fallback to prompt
    }
  }
  return 'prompt';
}

/** Detect "Oi" / "ওহে" / "Badboy" / "JARVIS" wake phrase in transcript string */
export function containsWakePhrase(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const patterns = [
    /(?:^|[^\p{L}\p{N}])oi(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])ওহে(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])badboy(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])ব্যাডবয়(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])jarvis(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])জারভিস(?:[^\p{L}\p{N}]|$)/iu,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

/** User-friendly localized Bangla error messages for voice recognition issues */
export function getVoiceErrorMessage(errorType?: string): string {
  switch (errorType) {
    case 'not-allowed':
    case 'permission-denied':
    case 'denied':
    case 'permission_denied':
      return 'মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজার বা ডিভাইসের Settings থেকে Microphone অনুমতি সক্রিয় করুন।';
    case 'no-speech':
    case 'no_match':
    case 'speech_timeout':
      return 'কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন।';
    case 'network':
    case 'network_failure':
    case 'server':
      return 'ভয়েস রিকগনিশন সার্ভারে সংযোগ হচ্ছে না। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।';
    case 'audio-capture':
    case 'audio_extra':
      return 'মাইক্রোফোন ডিভাইসটি পাওয়া যায়নি বা অন্য অ্যাপ ব্যবহার করছে।';
    case 'aborted':
      return 'ভয়েস গ্রহণ ব্যবহারকারী দ্বারা বন্ধ করা হয়েছে।';
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'এই ভাষায় Android-এর স্পিচ সার্ভিস সাড়া দেয়নি। Badboy-এর ভাষা বাটন থেকে অন্য ভাষা বেছে নিন; ফোনের Settings → Google → Voice বা Speech Services by Google-এ ভাষা ডাউনলোড/সক্রিয় করুন। সব ভাষা সব ফোনে উপলভ্য নয়।';
    case 'busy':
    case 'recognizer-busy':
      return 'ভয়েস সার্ভিস ব্যস্ত আছে। অন্য কোনো অ্যাপের মাইক্রোফোন ব্যবহার বন্ধ করে আবার চেষ্টা করুন।';
    case 'client':
    case 'unknown':
      return 'Android-এর Speech Recognition সার্ভিস চালু হতে পারেনি। Google app ও Speech Services by Google আপডেট করে ফোন পুনরায় চালু করুন।';
    case 'start_failed':
    case 'speech_error':
    case 'recognition-service-not-available':
    case 'service-not-available':
      return 'Android-এর Speech Recognition চালু হয়নি। Microphone অনুমতি দিন; Google app ও Speech Services by Google সক্রিয়/আপডেট করুন, ইন্টারনেট পরীক্ষা করে ফোন পুনরায় চালু করুন। তারপরও না হলে ফোনের Speech Recognition provider-এ সমস্যা থাকতে পারে।';
    case 'unsupported':
    case 'not_supported':
      return 'এই ডিভাইসে বা ব্রাউজারে ভয়েস রিকগনিশন সমর্থিত নয়। Google Speech Services বা উপযুক্ত সার্ভিস ইনস্টল আছে কিনা যাচাই করুন।';
    default:
      return 'ভয়েস ইনপুটে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।';
  }
}

/**
 * Note on Background Listening Limitations:
 * Web Speech API and Native Mobile Speech Recognition run while the application is active in the foreground.
 * Continuous background listening, lock-screen activation, or hardware wake-word triggering on mobile devices
 * requires a dedicated native Android/iOS background service / DSP chip hardware integration.
 * In this app, real-time "Oi" wake-word detection triggers dynamically during active foreground dictation sessions.
 */

/** Start one dictation turn with wake-phrase detection and error handling. Returns a cancel function. */
export function dictateOnce(callbacks: SpeechCallbacks): () => void {
  const os = getPlatformOS();
  const nativeModule = getSpeechRecognitionModule();
  const useNative = (os !== 'web' && os !== 'node' && nativeModule) || Boolean(nativeModule?.isRecognitionAvailable?.());

  if (useNative && nativeModule) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      callbacks.onDone?.();
    };

    const subscriptions: Array<{ remove: () => void }> = [];
    const cleanup = () => {
      subscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch {
          // Ignore removal errors
        }
      });
      subscriptions.length = 0;
    };

    const startNative = async () => {
      try {
        const perm = await nativeModule.requestPermissionsAsync();
        if (!perm.granted) {
          callbacks.onError?.('permission-denied');
          finish();
          return;
        }

        const resSub = nativeModule.addListener(
          'result',
          (event: { results?: Array<{ transcript?: string }>; isFinal?: boolean }) => {
            const results = event.results ?? [];
            if (!results.length) return;
            const transcript = results[0]?.transcript ?? '';
            const isFinal = event.isFinal ?? false;

            if (transcript) {
              if (containsWakePhrase(transcript)) {
                callbacks.onWakeWordDetected?.();
              }
              callbacks.onTranscript(transcript, isFinal);
            }

            if (isFinal) {
              try {
                nativeModule.stop();
              } catch {
                // Ignore
              }
              cleanup();
              finish();
            }
          },
        );
        subscriptions.push(resSub);

        const errSub = nativeModule.addListener('error', (event: { error?: string; message?: string }) => {
          // Keep diagnostic details in Android logs without logging recognized speech.
          console.error('[BadboyVoice] Native speech-recognition error', {
            error: event?.error ?? 'unknown',
            message: event?.message ?? null,
            platform: os,
            language: callbacks.lang ?? 'bn-BD',
          });
          cleanup();
          finish();
          callbacks.onError?.(event?.error ?? 'speech_error');
        });
        subscriptions.push(errSub);

        const endSub = nativeModule.addListener('end', () => {
          cleanup();
          finish();
        });
        subscriptions.push(endSub);

        nativeModule.start({
          lang: callbacks.lang ?? 'bn-BD',
          interimResults: true,
          continuous: false,
          maxAlternatives: 1,
        });
      } catch (cause) {
        console.error('[BadboyVoice] Failed to initialize native speech recognition', {
          error: cause instanceof Error ? cause.message : String(cause),
          platform: os,
          language: callbacks.lang ?? 'bn-BD',
        });
        cleanup();
        finish();
        callbacks.onError?.('start_failed');
      }
    };

    void startNative();

    return () => {
      try {
        nativeModule.abort();
      } catch {
        // Ignore abort error
      }
      cleanup();
      finish();
    };
  }

  // Web Speech API fallback for web browsers
  const Ctor = recognitionConstructor();
  if (!Ctor) {
    callbacks.onError?.('unsupported');
    callbacks.onDone?.();
    return () => undefined;
  }

  const recognition = new Ctor();
  recognition.lang = callbacks.lang ?? 'bn-BD';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    callbacks.onDone?.();
  };

  recognition.onresult = (event: RecognitionEventLike) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript =
        typeof result[0]?.transcript === 'string' ? (result[0].transcript as string) : '';
      if (result.isFinal) finalText += transcript;
      else interimText += transcript;
    }
    const combined = `${finalText}${interimText}`.trim();

    if (combined) {
      if (containsWakePhrase(combined)) {
        callbacks.onWakeWordDetected?.();
      }
      callbacks.onTranscript(combined, finalText.length > 0 && !interimText);
    }

    if (finalText && !interimText) {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      finish();
    }
  };

  recognition.onerror = (evt) => {
    finish();
    callbacks.onError?.(evt?.error ?? 'speech_error');
  };

  recognition.onend = () => finish();

  try {
    recognition.start();
  } catch (cause) {
    console.error('[BadboyVoice] Web speech-recognition start failed', {
      error: cause instanceof Error ? cause.message : String(cause),
      language: callbacks.lang ?? 'bn-BD',
    });
    finish();
    callbacks.onError?.('start_failed');
  }

  return () => {
    try {
      recognition.abort();
    } catch {
      // Already ended.
    }
    finish();
  };
}

/** Speak text through the device's native TTS engine or browser local voices. */
export function speak(text: string, lang = 'bn-BD'): void {
  const clean = text.trim().slice(0, 4000);
  if (!clean) return;

  stopSpeaking();

  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node' && speechModule) {
    try {
      speechModule.speak(clean, {
        language: lang,
        pitch: 1.0,
        rate: 1.0,
      });
      return;
    } catch {
      // Fallback
    }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore
    }
  }
}

export function stopSpeaking(): void {
  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node' && speechModule) {
    try {
      speechModule.stop();
    } catch {
      // Ignore
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}
