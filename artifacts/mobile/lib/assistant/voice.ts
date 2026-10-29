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
  { code: 'bn', label: 'বাংলা (সাধারণ)' },
  { code: 'en', label: 'English (general)' },
  { code: 'es-AR', label: 'Español (Argentina)' },
  { code: 'es-CO', label: 'Español (Colombia)' },
  { code: 'es-US', label: 'Español (Estados Unidos)' },
  { code: 'fr-BE', label: 'Français (Belgique)' },
  { code: 'fr-CH', label: 'Français (Suisse)' },
  { code: 'de-AT', label: 'Deutsch (Österreich)' },
  { code: 'de-CH', label: 'Deutsch (Schweiz)' },
  { code: 'it-CH', label: 'Italiano (Svizzera)' },
  { code: 'pt-AO', label: 'Português (Angola)' },
  { code: 'pt-MZ', label: 'Português (Moçambique)' },
  { code: 'hi', label: 'हिन्दी (सामान्य)' },
  { code: 'ur-IN', label: 'اردو (بھارت)' },
  { code: 'ar-EG', label: 'العربية (مصر)' },
  { code: 'ar-AE', label: 'العربية (الإمارات)' },
  { code: 'ar-MA', label: 'العربية (المغرب)' },
  { code: 'zh-HK', label: '中文 (香港)' },
  { code: 'zh-SG', label: '中文 (新加坡)' },
  { code: 'ja', label: '日本語 (一般)' },
  { code: 'ko', label: '한국어 (일반)' },
  { code: 'ru', label: 'Русский (общий)' },
  { code: 'tr', label: 'Türkçe (genel)' },
  { code: 'id', label: 'Bahasa Indonesia (umum)' },
  { code: 'ms', label: 'Bahasa Melayu (umum)' },
  { code: 'ta', label: 'தமிழ் (பொது)' },
  { code: 'te', label: 'తెలుగు (సాధారణ)' },
  { code: 'mr', label: 'मराठी (सामान्य)' },
  { code: 'gu', label: 'ગુજરાતી (સામાન્ય)' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (ਆਮ)' },
  { code: 'ne-NP', label: 'नेपाली' },
  { code: 'si-LK', label: 'සිංහල' },
  { code: 'km-KH', label: 'ភាសាខ្មែរ' },
  { code: 'lo-LA', label: 'ລາວ' },
  { code: 'my-MM', label: 'မြန်မာ' },
  { code: 'am-ET', label: 'አማርኛ' },
  { code: 'ha-NG', label: 'Hausa' },
  { code: 'yo-NG', label: 'Yorùbá' },
  { code: 'ig-NG', label: 'Igbo' },
  { code: 'zu-ZA', label: 'isiZulu' },
  { code: 'xh-ZA', label: 'isiXhosa' },
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
  // Web builds must use the browser's Web Speech API. An Expo native module
  // may be bundled in the web app but cannot provide a working browser recognizer.
  if (os === 'web') return recognitionConstructor() !== null;
  return (nativeModule?.isRecognitionAvailable?.() ?? false) || recognitionConstructor() !== null;
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
  // Watchdog for speech providers that never emit `end`, which otherwise leaves
  // the microphone spinner active indefinitely. Reset while transcript activity arrives.
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  };
  const resetWatchdog = (stop: () => void, cleanup?: () => void, finish?: () => void) => {
    clearWatchdog();
    watchdog = setTimeout(() => {
      try { stop(); } catch { /* recognizer may already be stopped */ }
      cleanup?.();
      callbacks.onError?.('no-speech');
      finish?.();
    }, 15000);
  };
  const nativeModule = getSpeechRecognitionModule();
  // Never route browser sessions through the Expo native module, even if it
  // reports availability in a web bundle. Chrome must use Web Speech API.
  const useNative = os !== 'web' && os !== 'node' && Boolean(nativeModule);

  if (useNative && nativeModule) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearWatchdog();
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
        // Ask Android's active speech provider which locales it actually supports.
        // On Android 12 and older this API may be unavailable; in that case keep
        // the selected locale and let the provider return its normal result/error.
        let recognitionLanguage = callbacks.lang ?? 'bn-BD';
        try {
          if (typeof nativeModule.getSupportedLocales === 'function') {
            const support = await nativeModule.getSupportedLocales({});
            const locales: string[] = Array.isArray(support?.locales) ? support.locales : [];
            if (locales.length > 0 && !locales.includes(recognitionLanguage)) {
              const languageBase = recognitionLanguage.split('-')[0].toLowerCase();
              const compatibleLocale =
                locales.find((locale) => locale.toLowerCase() === languageBase) ??
                locales.find((locale) => locale.split('-')[0].toLowerCase() === languageBase);
              if (compatibleLocale) {
                console.warn('[BadboyVoice] Selected locale unavailable; using supported variant', {
                  requested: recognitionLanguage,
                  selected: compatibleLocale,
                });
                recognitionLanguage = compatibleLocale;
              } else {
                console.error('[BadboyVoice] Selected language is not supported by the active provider', {
                  requested: recognitionLanguage,
                  supportedLocaleCount: locales.length,
                });
                callbacks.onError?.('language-not-supported');
                finish();
                return;
              }
            }
          }
        } catch (localeError) {
          // Locale discovery is not available on every Android version/provider.
          console.warn('[BadboyVoice] Could not query supported locales; trying selected locale', {
            error: localeError instanceof Error ? localeError.message : String(localeError),
          });
        }

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
            if (transcript) resetWatchdog(() => nativeModule.abort(), cleanup, finish);

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

        resetWatchdog(() => nativeModule.abort(), cleanup, finish);
        nativeModule.start({
          lang: recognitionLanguage,
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
    clearWatchdog();
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
    if (combined) resetWatchdog(() => recognition.abort(), undefined, finish);

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
    const errorType = evt?.error ?? 'speech_error';
    // Chrome may emit "aborted" when recognition is stopped as part of normal
    // cleanup/watchdog handling. Do not report that as a user-cancelled action.
    if (finished) return;
    finish();
    if (errorType === 'aborted') return;
    callbacks.onError?.(errorType);
  };

  recognition.onend = () => finish();

  try {
    resetWatchdog(() => recognition.abort(), undefined, finish);
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

export interface SpeechLifecycleCallbacks {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

/** Speak text through the device's native TTS engine or browser local voices. */
export function speak(
  text: string,
  lang = 'bn-BD',
  callbacks: SpeechLifecycleCallbacks = {},
): boolean {
  const clean = text.trim().slice(0, 4000);
  if (!clean) {
    callbacks.onError?.(new Error('পড়ে শোনানোর মতো কোনো লেখা নেই।'));
    return false;
  }

  stopSpeaking();

  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node' && speechModule) {
    try {
      speechModule.speak(clean, {
        language: lang,
        pitch: 1.0,
        rate: 1.0,
        onStart: () => callbacks.onStart?.(),
        onDone: () => callbacks.onDone?.(),
        onStopped: () => callbacks.onDone?.(),
        onError: (error: unknown) => callbacks.onError?.(error),
      });
      return true;
    } catch (error) {
      // If native TTS cannot start, try the browser fallback only when available.
      if (!(typeof window !== 'undefined' && 'speechSynthesis' in window)) {
        callbacks.onError?.(error);
        return false;
      }
    }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang;
      utterance.onstart = () => callbacks.onStart?.();
      utterance.onend = () => callbacks.onDone?.();
      utterance.onerror = (event) => callbacks.onError?.(
        new Error(`ব্রাউজারের TTS ব্যর্থ হয়েছে: ${event.error || 'unknown error'}`),
      );
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      callbacks.onError?.(error);
      return false;
    }
  }

  callbacks.onError?.(new Error('এই ডিভাইসে TTS ইঞ্জিন উপলব্ধ নেই।'));
  return false;
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
