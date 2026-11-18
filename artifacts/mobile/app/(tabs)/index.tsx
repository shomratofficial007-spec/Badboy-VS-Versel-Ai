import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BadboyLogo } from '@/components/BadboyLogo';
import { ChatFooter, ChatHeader, ProviderModelStrip, QuickActionGrid, WelcomeBanner } from '@/components/ChatChrome';
import {
  cleanSongQuery,
  extractYouTubeIntent,
  getYouTubeUrls,
  isGeneralMusicRequest,
} from '@/lib/assistant/youtube';
import { useAssistant } from '@/context/AssistantContext';
import { useOwnerAuth } from '@/context/OwnerAuthContext';
import { isOwnerLoginRequiredError } from '@/lib/assistant/ownerAuth';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { searchAgentMemory, streamAgenticReply, streamReply, transcribeRecordedAudio } from '@/lib/assistant/api';
import { listDeveloperProjects } from '@/lib/assistant/developerData';
import {
  dictateOnce,
  getVoiceErrorMessage,
  getNextVoiceLanguage,
  getVoiceLanguageLabel,
  isDictationAvailable,
  speak,
  stopSpeaking,
  shouldStopVoiceRecordingForSilence,
  updateVoiceRecordingLifecycle,
  VOICE_SILENCE_THRESHOLD_DBFS,
} from '@/lib/assistant/voice';
import type { ChatMessage } from '@/lib/assistant/types';
import { useColors } from '@/hooks/useColors';
import { getOfflineWakeWordStatus, startOfflineWakeWord, stopOfflineWakeWord, subscribeToWakeWord, subscribeToWakeWordStatus } from '@/lib/assistant/wakeWord';
import { getActiveCustomSkillContext } from '@/lib/assistant/skillStorage';
import { loadEnabledPluginIds } from '@/lib/assistant/pluginStorage';
import { getDefaultModel, getProvider, type ModelChoice } from '@/lib/assistant/providerManager';

const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

type BrowserSpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};


function newMessage(role: ChatMessage['role'], content = ''): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(true);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [defaultModel, setDefaultModel] = useState<ModelChoice | null>(null);
  const [drawerModal, setDrawerModal] = useState<'search' | 'history' | 'options' | 'newChat' | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const { messages, setMessages, settings, updateSettings, setExpertReviewDraft } = useAssistant();
  const { signOut } = useOwnerAuth();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const [listening, setListening] = useState(false);
  const voiceMode = settings.autoSpeakReplies;
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [wakeDetected, setWakeDetected] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>(settings.voiceLanguage);
  const [error, setError] = useState<string | null>(null);
  const [awaitingSongName, setAwaitingSongName] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const stopDictationRef = useRef<(() => void) | null>(null);
  const audioRecorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const audioRecorderState = useAudioRecorderState(audioRecorder, 250);
  const audioRecordingStartedRef = useRef(false);
  const transcriptionInFlightRef = useRef(false);
  const speechDetectedRef = useRef(false);
  const lastVoiceActivityAtRef = useRef(0);
  const voiceSessionActiveRef = useRef(false);
  const wakeResumePromiseRef = useRef<Promise<void> | null>(null);
  const wakeWordAllowedRef = useRef(false);
  wakeWordAllowedRef.current = Platform.OS === 'android' && settings.voiceProcessingConsent && settings.wakeWordEnabled && settings.voiceInputEnabled;

  useEffect(() => { setSelectedLang(settings.voiceLanguage); }, [settings.voiceLanguage]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getDefaultModel()
      .then((model) => { if (active) setDefaultModel(model); })
      .catch(() => { if (active) setDefaultModel(null); });
    return () => { active = false; };
  }, []));
  useEffect(() => { setQuickActionsExpanded(messages.length === 0); }, [messages.length]);
  useEffect(() => {
    if (!settings.voiceOutputEnabled) {
      stopSpeaking();
      setSpeakingMessageId(null);
    }
  }, [settings.voiceOutputEnabled]);

  // Audio Visualizer Bar & Core Pulse Animations
  const barAnim1 = useRef(new Animated.Value(12)).current;
  const barAnim2 = useRef(new Animated.Value(24)).current;
  const barAnim3 = useRef(new Animated.Value(18)).current;
  const barAnim4 = useRef(new Animated.Value(30)).current;
  const corePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (listening || busy) {
      const visualizerLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(barAnim1, { toValue: 32, duration: 300, useNativeDriver: false }),
            Animated.timing(barAnim1, { toValue: 10, duration: 300, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(barAnim2, { toValue: 14, duration: 400, useNativeDriver: false }),
            Animated.timing(barAnim2, { toValue: 36, duration: 400, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(barAnim3, { toValue: 38, duration: 250, useNativeDriver: false }),
            Animated.timing(barAnim3, { toValue: 12, duration: 250, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(barAnim4, { toValue: 16, duration: 350, useNativeDriver: false }),
            Animated.timing(barAnim4, { toValue: 34, duration: 350, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(corePulse, { toValue: 1.25, duration: 600, useNativeDriver: true }),
            Animated.timing(corePulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
        ])
      );
      visualizerLoop.start();
      return () => visualizerLoop.stop();
    } else {
      barAnim1.setValue(10);
      barAnim2.setValue(16);
      barAnim3.setValue(12);
      barAnim4.setValue(14);
      corePulse.setValue(1);
    }
  }, [listening, busy, barAnim1, barAnim2, barAnim3, barAnim4, corePulse]);

  const speakVoiceReply = useCallback(async (text: string) => {
    if (!settings.voiceOutputEnabled || !voiceSessionActiveRef.current || !text.trim()) return;
    await new Promise<void>((resolve) => {
      const started = speak(text, selectedLang, {
        onDone: () => resolve(),
        onError: () => resolve(),
      }, settings.voiceIdentifier);
      if (!started) resolve();
    });
  }, [selectedLang, settings.voiceIdentifier, settings.voiceOutputEnabled]);

  const resumeWakeWord = useCallback(async () => {
    if (!voiceSessionActiveRef.current) return;
    // Recording completion and sendMessage can both request a resume. Share one
    // in-flight operation so they cannot race two native service starts.
    if (wakeResumePromiseRef.current) {
      await wakeResumePromiseRef.current;
      return;
    }

    const resumeTask = (async () => {
      if (!wakeWordAllowedRef.current) {
        voiceSessionActiveRef.current = false;
        return;
      }

      let lastError = 'Hey Badboy পুনরায় চালু করা যায়নি।';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          let status = await startOfflineWakeWord();
          // Native start() initially reports "starting". Do not treat that as
          // success until AudioRecord/model initialization reports "listening".
          for (let check = 0; check < 24; check += 1) {
            if (!wakeWordAllowedRef.current) {
              await stopOfflineWakeWord().catch(() => undefined);
              voiceSessionActiveRef.current = false;
              return;
            }
            if (status.state === 'listening') {
              voiceSessionActiveRef.current = false;
              setWakeDetected(false);
              return;
            }
            if (status.state === 'error') {
              lastError = status.message ?? lastError;
              break;
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 150));
            status = await getOfflineWakeWordStatus();
          }
          if (status.state === 'error') lastError = status.message ?? lastError;
          else lastError = 'Android-এর Hey Badboy listener চালু হতে সময় নিচ্ছে।';
        } catch (cause) {
          lastError = cause instanceof Error ? cause.message : lastError;
        }

        if (!wakeWordAllowedRef.current) {
          await stopOfflineWakeWord().catch(() => undefined);
          voiceSessionActiveRef.current = false;
          return;
        }
        await stopOfflineWakeWord().catch(() => undefined);
        if (attempt < 2) await new Promise<void>((resolve) => setTimeout(resolve, 400));
      }

      voiceSessionActiveRef.current = false;
      setError(lastError);
    })();

    wakeResumePromiseRef.current = resumeTask;
    try {
      await resumeTask;
    } finally {
      if (wakeResumePromiseRef.current === resumeTask) wakeResumePromiseRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || busy) return;
    Keyboard.dismiss();
    setDraft('');
    setEmojiPickerOpen(false);
    setError(null);

    const userMessage = newMessage('user', text);
    let answer = newMessage('assistant');
    let working = [...messages, userMessage, answer];
    setMessages(working);
    setBusy(true);

    if (awaitingSongName) {
      setAwaitingSongName(false);
      const cleanTitle = cleanSongQuery(text);
      const { url, appUrl } = getYouTubeUrls(cleanTitle);
      answer = {
        ...answer,
        content: `"${cleanTitle}" গানটি ইউটিউবে প্লে করা হচ্ছে...`,
      };
      setMessages([...messages, userMessage, answer]);
      setBusy(false);
      if (voiceSessionActiveRef.current) {
        await speakVoiceReply(answer.content);
        await resumeWakeWord();
      }
      setTimeout(() => {
        void openYouTubeUrl(url, appUrl);
      }, 800);
      return;
    }

    if (isGeneralMusicRequest(text)) {
      setAwaitingSongName(true);
      answer = {
        ...answer,
        content: 'কোন গান শুনতে চাও?',
      };
      setMessages([...messages, userMessage, answer]);
      setBusy(false);
      if (voiceSessionActiveRef.current) await speakVoiceReply(answer.content);
      if (isDictationAvailable() && settings.voiceProcessingConsent) {
        setTimeout(() => {
          setListening(true);
          stopDictationRef.current = dictateOnce({
            lang: selectedLang,
            onTranscript: (songName) => {
              setDraft(songName.slice(0, 4000));
            },
            onError: (errType) => {
              setError(getVoiceErrorMessage(errType));
            },
            onDone: () => {
              setListening(false);
              stopDictationRef.current = null;
              if (voiceSessionActiveRef.current) void resumeWakeWord();
            },
          });
        }, 1200);
      } else {
        await resumeWakeWord();
      }
      return;
    }

    if (!settings.onlineAI) {
      working = working.filter((message) => message.id !== answer.id);
      setMessages(working);
      setError('অফলাইন মোড চালু আছে। বার্তা AI-তে পাঠানো হচ্ছে না।');
      setBusy(false);
      await resumeWakeWord();
      return;
    }

    try {
      // Pull only owner-scoped, non-sensitive project notes. Memory lookup is
      // best-effort: an unavailable D1/API must never prevent ordinary chat.
      let memoryContext = '';
      try {
        const projects = await listDeveloperProjects(20);
        const matches = await Promise.all(projects.slice(0, 10).map(async (project) => {
          try {
            const memories = await searchAgentMemory(project.project_id, text, 3);
            return memories.map((memory) => ({ project: project.name, ...memory }));
          } catch {
            return [];
          }
        }));
        memoryContext = matches.flat().slice(0, 8).map((memory) =>
          `[${memory.project} / ${memory.category}] ${memory.content.slice(0, 900)}`,
        ).join('\n').slice(0, 5000);
      } catch {
        // Keep the existing chat path available when project memory is offline.
      }
      let skillContext = '';
      try {
        skillContext = await getActiveCustomSkillContext() ?? '';
      } catch {
        // An unavailable local skill store must not block ordinary assistant chat.
      }
      let enabledPluginIds: Awaited<ReturnType<typeof loadEnabledPluginIds>> = [];
      try {
        enabledPluginIds = await loadEnabledPluginIds();
      } catch {
        // Corrupt or unavailable plugin settings fail closed: no integration tools are enabled.
      }
      await streamAgenticReply(
        text,
        settings,
        messages.slice(-8).map(({ role, content }) => ({ role, content })),
        (chunk) => {
        answer = { ...answer, content: answer.content + chunk };
        working = working.map((message) =>
          message.id === answer.id ? answer : message,
        );
        setMessages(working);
      },
      memoryContext,
      skillContext,
      enabledPluginIds,
      );
    } catch (cause) {
      working = working.filter((message) => message.id !== answer.id);
      setMessages(working);
      setError(
        cause instanceof Error
          ? cause.message
          : 'AI সংযোগে সমস্যা হয়েছে। কিছুক্ষণ পর চেষ্টা করুন।',
      );
    } finally {
      setBusy(false);
      if (voiceSessionActiveRef.current) {
        await speakVoiceReply(answer.content);
        await resumeWakeWord();
      } else if (voiceMode && settings.voiceOutputEnabled && answer.content.trim()) {
        await new Promise<void>((resolve) => {
          setSpeakingMessageId(answer.id);
          const started = speak(answer.content, selectedLang, {
            onDone: () => { setSpeakingMessageId(null); resolve(); },
            onError: () => {
              setSpeakingMessageId(null);
              setError('উত্তরটি শোনানো যায়নি। আবার চেষ্টা করুন।');
              resolve();
            },
          }, settings.voiceIdentifier);
          if (!started) { setSpeakingMessageId(null); resolve(); }
        });
      }
    }
  }, [awaitingSongName, busy, messages, resumeWakeWord, selectedLang, setError, setMessages, settings, speakVoiceReply, voiceMode]);

  const requestImprovement = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
    if (!lastUserMessage || !settings.onlineAI || !settings.autoImprove || improving) return;
    setImproving(true);
    setError(null);
    let suggestion = '';
    try {
      await streamReply(
        `Based only on this user's current message, suggest one concise optional change to my communication style. Return only the suggestion in Bangla. User message: ${lastUserMessage.content}`,
        settings,
        (chunk) => { suggestion += chunk; },
      );
      if (!suggestion.trim()) throw new Error('কোনো পরামর্শ পাওয়া যায়নি।');
      Alert.alert(
        'ব্যক্তিত্বের পরামর্শ',
        suggestion.trim(),
        [
          { text: 'এখন নয়', style: 'cancel' },
          {
            text: 'অনুমতি দিয়ে যোগ করুন',
            onPress: () => updateSettings({
              personality: `${settings.personality.trim()}\n${suggestion.trim()}`.trim(),
            }),
          },
        ],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'পরামর্শ পাওয়া যায়নি।');
    } finally {
      setImproving(false);
    }
  }, [improving, messages, settings, updateSettings]);

  const finishRecordedVoice = useCallback(async () => {
    if (!audioRecordingStartedRef.current || transcriptionInFlightRef.current) return;
    transcriptionInFlightRef.current = true;
    audioRecordingStartedRef.current = false;
    let recordingUri: string | null = null;

    try {
      if (audioRecorder.isRecording) await audioRecorder.stop();
      recordingUri = audioRecorder.uri;
      if (!recordingUri) throw new Error('অডিও রেকর্ডিং সম্পূর্ণ হয়নি। আবার চেষ্টা করুন।');

      const transcript = await transcribeRecordedAudio(recordingUri, selectedLang);
      if (!transcript.trim()) throw new Error('কোনো কথা শনাক্ত করা যায়নি। আবার চেষ্টা করুন।');
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      setListening(false);
      setDraft(transcript);
      if (settings.autoSubmitVoice) await sendMessage(transcript);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'ভয়েস সার্ভারে পাঠানো যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।',
      );
    } finally {
      if (recordingUri) {
        await FileSystem.deleteAsync(recordingUri, { idempotent: true }).catch(() => undefined);
      }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      setListening(false);
      transcriptionInFlightRef.current = false;
      // If recording/transcription failed before sendMessage owned the turn,
      // restore offline wake-word listening instead of leaving the assistant idle.
      await resumeWakeWord();
    }
  }, [audioRecorder, resumeWakeWord, selectedLang, sendMessage, settings.autoSubmitVoice]);

  useEffect(() => {
    if (!updateVoiceRecordingLifecycle(
      Platform.OS === 'web', audioRecordingStartedRef.current, transcriptionInFlightRef.current,
      audioRecorderState.isRecording, lastVoiceActivityAtRef, Date.now(), finishRecordedVoice,
    )) return;
    const meter = audioRecorderState.metering;
    if (typeof meter !== 'number' || !Number.isFinite(meter)) return;

    const now = Date.now();
    if (meter > VOICE_SILENCE_THRESHOLD_DBFS) {
      speechDetectedRef.current = true;
      lastVoiceActivityAtRef.current = now;
      return;
    }
    if (shouldStopVoiceRecordingForSilence(
      meter,
      speechDetectedRef.current,
      lastVoiceActivityAtRef.current,
      now,
    )) {
      void finishRecordedVoice();
    }
  }, [audioRecorderState.isRecording, audioRecorderState.metering, finishRecordedVoice]);

  useEffect(() => {
    return () => {
      if (!audioRecordingStartedRef.current) return;
      audioRecordingStartedRef.current = false;
        void audioRecorder
        .stop()
        .then(() => {
          const recordingUri = audioRecorder.uri;
          if (recordingUri) {
            return FileSystem.deleteAsync(recordingUri, { idempotent: true });
          }
          return undefined;
        })
        .catch(() => undefined);
    };
  }, [audioRecorder]);

  const toggleVoice = useCallback(async () => {
    if (!settings.voiceInputEnabled) {
      setError('Settings থেকে Voice Input চালু করুন।');
      return;
    }
    if (!settings.voiceProcessingConsent) {
      setError('ভয়েস ব্যবহারের জন্য Settings-এ Voice Consent সক্ষম করুন।');
      return;
    }

    if (listening) {
      if (Platform.OS !== 'web' && audioRecordingStartedRef.current) {
        try {
          await audioRecorder.stop();
          await finishRecordedVoice();
        } catch (cause) {
          audioRecordingStartedRef.current = false;
          setListening(false);
          await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
          setError(cause instanceof Error ? cause.message : 'অডিও রেকর্ডিং বন্ধ করা যায়নি।');
        }
      } else {
        stopDictationRef.current?.();
        stopDictationRef.current = null;
        setListening(false);
      }
      return;
    }

    if (Platform.OS !== 'web') {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setError(getVoiceErrorMessage('permission_denied'));
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await audioRecorder.prepareToRecordAsync();
        transcriptionInFlightRef.current = false;
            speechDetectedRef.current = false;
        lastVoiceActivityAtRef.current = 0;
        audioRecordingStartedRef.current = true;
        // Silence detection ends normal turns; 20 seconds remains a hard safety cap.
        audioRecorder.record({ forDuration: 20 });
        setError(null);
        setListening(true);
      } catch (cause) {
        audioRecordingStartedRef.current = false;
            setListening(false);
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        setError(
          cause instanceof Error
            ? cause.message
            : 'মাইক্রোফোন চালু করা যায়নি। অনুমতি ও ডিভাইস সেটিংস পরীক্ষা করুন।',
        );
        // Wake detection already handed off microphone ownership. If recorder
        // startup fails, restore wake listening unless the user has pressed Stop.
        if (voiceSessionActiveRef.current) await resumeWakeWord();
      }
      return;
    }

    if (!isDictationAvailable()) {
      setError('এই ডিভাইসে Speech Recognition সমর্থিত নয়।');
      return;
    }

    // Web Speech API asks for microphone access when recognition starts.
    setError(null);
    setListening(true);
    setWakeDetected(false);
    const base = draft;
    stopDictationRef.current = dictateOnce({
      lang: selectedLang,
      onTranscript: (text, isFinal) => {
        const combined = base ? `${base} ${text}`.trim() : text.trim();
        setDraft(combined.slice(0, 4000));
        if (isFinal && text.trim() && settings.autoSubmitVoice) {
          const finalText = text.trim().slice(0, 4000);
          setDraft(finalText);
          setTimeout(() => { void sendMessage(finalText); }, 0);
        }
      },
      onWakeWordDetected: () => setWakeDetected(true),
      onError: (errType) => setError(getVoiceErrorMessage(errType)),
      onDone: () => {
        setListening(false);
        stopDictationRef.current = null;
      },
    });
  }, [
    audioRecorder,
    draft,
    finishRecordedVoice,
    listening,
    selectedLang,
    sendMessage,
    settings.voiceProcessingConsent,
    settings.voiceInputEnabled,
    settings.autoSubmitVoice,
    resumeWakeWord,
  ]);

  // Android foreground microphone service is started only after voice consent and permission.
  const wakeHandoffRef = useRef(false);
  const toggleVoiceRef = useRef(toggleVoice);
  useEffect(() => { toggleVoiceRef.current = toggleVoice; }, [toggleVoice]);
  useEffect(() => {
    if (Platform.OS !== 'android' || !settings.voiceProcessingConsent || !settings.wakeWordEnabled || !settings.voiceInputEnabled) return;
    let active = true;
    wakeWordAllowedRef.current = true;
    const subscription = subscribeToWakeWord(() => {
      if (!active || wakeHandoffRef.current) return;
      wakeHandoffRef.current = true;
      voiceSessionActiveRef.current = true;
      setWakeDetected(true);
      void stopOfflineWakeWord().finally(() => {
        if (active) void toggleVoiceRef.current();
        setTimeout(() => { wakeHandoffRef.current = false; }, 1800);
      });
    });
    const statusSubscription = subscribeToWakeWordStatus((status) => {
      if (!active || !wakeWordAllowedRef.current) return;
      if (status.state === 'error') {
        setError(status.message ?? 'Hey Badboy-এর wake listener বন্ধ হয়ে গেছে।');
      }
    });
    void requestRecordingPermissionsAsync().then((permission) => {
      if (!active || !permission.granted) return;
      return startOfflineWakeWord().then((status) => {
        if (status.state === 'error') setError(status.message ?? 'Hey Badboy চালু করা যায়নি।');
      });
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Hey Badboy চালু করা যায়নি।');
    });
    return () => {
      active = false;
      wakeWordAllowedRef.current = false;
      subscription.remove();
      statusSubscription.remove();
      void stopOfflineWakeWord().catch(() => undefined);
    };
  }, [settings.voiceProcessingConsent, settings.wakeWordEnabled, settings.voiceInputEnabled]);

  const startNewChat = () => {
    setDrawerModal('newChat');
  };


  const shareConversation = async () => {
    if (!messages.length) {
      setError('শেয়ার করার মতো কোনো চ্যাট নেই।');
      return;
    }
    const transcript = messages.map((item) =>
      `${item.role === 'user' ? 'আপনি' : 'Badboy AI'}: ${item.content}`,
    ).join('\n\n');
    try {
      await Share.share({ message: transcript, title: 'Badboy AI চ্যাট' });
    } catch {
      setError('চ্যাট শেয়ার করা যায়নি।');
    }
  };

  const chooseAiStyle = () => {
    const styles = [
      { label: 'বন্ধুসুলভ', value: 'Warm, friendly, thoughtful, clear, practical. Always reply in Bangla (Bengali) unless the user asks otherwise.' },
      { label: 'পেশাদার', value: 'Professional, precise, respectful, structured, and practical. Always reply in Bangla (Bengali) unless the user asks otherwise.' },
      { label: 'মজার / Funny', value: 'Light-hearted, witty, playful but respectful. Use humor when appropriate, never at the user’s expense. Reply in Bangla (Bengali) unless asked otherwise.' },
      { label: 'Jarvis / Sci-fi', value: 'A polished futuristic personal assistant: calm, concise, proactive, technically clear, with a subtle sci-fi tone. Never pretend to have performed actions. Reply in Bangla (Bengali) unless asked otherwise.' },
      { label: 'শিক্ষক', value: 'Patient teacher: explain step by step in simple language, use examples, check assumptions, and avoid unnecessary jargon. Reply in Bangla (Bengali) unless asked otherwise.' },
      { label: 'সৃজনশীল লেখক', value: 'Creative writing partner skilled at fiction, sci-fi, stories, poetry, dialogue, scripts, and brainstorming. Match the requested genre and tone. Reply in Bangla (Bengali) unless asked otherwise.' },
      { label: 'সংক্ষিপ্ত উত্তর', value: 'Be concise and direct. Start with the answer, then only essential details. Reply in Bangla (Bengali) unless asked otherwise.' },
      { label: 'বিস্তারিত উত্তর', value: 'Give thorough, well-organized explanations with examples and practical steps. Avoid repeating yourself. Reply in Bangla (Bengali) unless asked otherwise.' },
    ];
    Alert.alert('AI ব্যক্তিত্ব ও উত্তর-স্টাইল', 'একটি স্টাইল বেছে নিন। এটি আপনার AI-এর নির্দেশনা বদলাবে।', [
      ...styles.map((item) => ({ text: item.label, onPress: () => updateSettings({ personality: item.value }) })),
      { text: 'বাতিল', style: 'cancel' },
    ]);
  };

  const showCreativeOptions = () => {
    const prompts = [
      { label: 'কল্পবিজ্ঞান গল্প', prompt: 'আমার জন্য একটি মৌলিক কল্পবিজ্ঞান গল্প লেখো। চরিত্র, জগৎ, দ্বন্দ্ব ও চমকপ্রদ সমাপ্তি তৈরি করো।' },
      { label: 'ছোট গল্প', prompt: 'একটি আকর্ষণীয় মৌলিক বাংলা ছোট গল্প লেখো, শক্তিশালী শুরু ও সুন্দর সমাপ্তিসহ।' },
      { label: 'কবিতা', prompt: 'আমার জন্য একটি মৌলিক বাংলা কবিতা লেখো; বিষয় ও আবেগ সুন্দরভাবে ফুটিয়ে তোলো।' },
      { label: 'ভিডিও স্ক্রিপ্ট', prompt: 'একটি আকর্ষণীয় বাংলা ভিডিও স্ক্রিপ্ট লেখো—হুক, মূল অংশ ও সমাপ্তিসহ।' },
      { label: 'আইডিয়া / Brainstorm', prompt: 'আমার বিষয়ের জন্য কয়েকটি নতুন, বাস্তবসম্মত ও সৃজনশীল আইডিয়া দাও এবং সেরা আইডিয়াটি কেন ভালো তা বলো।' },
    ];
    Alert.alert('সৃজনশীল লেখা', 'কোন ধরনের লেখা শুরু করবেন?', [
      ...prompts.map((item) => ({ text: item.label, onPress: () => setDraft(item.prompt) })),
      { text: 'বাতিল', style: 'cancel' },
    ]);
  };

  const showChatOptions = () => {
    setDrawerModal('options');
  };


  const regenerateAnswer = useCallback(async (message: ChatMessage) => {
    if (busy || !settings.onlineAI) {
      setError(!settings.onlineAI ? 'আবার উত্তর পেতে অনলাইন AI চালু করুন।' : 'আগের উত্তর শেষ হলে আবার চেষ্টা করুন।');
      return;
    }
    const index = messages.findIndex((item) => item.id === message.id);
    const previousUser = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user');
    if (!previousUser) {
      setError('এই উত্তরের আগের প্রশ্নটি পাওয়া যায়নি।');
      return;
    }
    const replacement = newMessage('assistant');
    let working = [...messages.slice(0, index), replacement];
    setMessages(working);
    setBusy(true);
    setError(null);
    try {
      await streamReply(previousUser.content, settings, (chunk) => {
        const updated = { ...replacement, content: replacement.content + chunk };
        working = working.map((item) => item.id === replacement.id ? updated : item);
        setMessages(working);
      });
    } catch (cause) {
      setMessages(messages);
      setError(cause instanceof Error ? cause.message : 'নতুন উত্তর পাওয়া যায়নি।');
    } finally {
      setBusy(false);
    }
  }, [busy, messages, setMessages, settings]);

  const playMessage = useCallback((message: ChatMessage) => {
    if (!settings.voiceOutputEnabled) return;
    if (speakingMessageId === message.id) {
      stopSpeaking();
      setSpeakingMessageId(null);
      return;
    }
    setError(null);
    setSpeakingMessageId(message.id);
    const started = speak(message.content, selectedLang, {
      onDone: () => setSpeakingMessageId(null),
      onError: () => {
        setSpeakingMessageId(null);
        setError('উত্তরটি শোনানো যায়নি। আবার চেষ্টা করুন।');
      },
    }, settings.voiceIdentifier);
    if (!started) setSpeakingMessageId(null);
  }, [selectedLang, setError, speakingMessageId, settings.voiceIdentifier, settings.voiceOutputEnabled]);

  const shareMessage = async (message: ChatMessage) => {
    try {
      await Share.share({ message: message.content, title: 'Badboy AI উত্তর' });
    } catch {
      setError('বার্তাটি শেয়ার করা যায়নি।');
    }
  };

  const clearChat = () => {
    Alert.alert(
      'চ্যাট ইতিহাস মুছবেন?',
      'সংরক্ষিত চ্যাট মুছে যাবে। এই কাজটি ফিরিয়ে আনা সম্ভব নয়।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'মুছে ফেলুন',
          style: 'destructive',
          onPress: () => setMessages([]),
        },
      ],
    );
  };

  const getStatusText = () => {
    if (listening) return wakeDetected ? 'Oi Badboy সনাক্ত হয়েছে!' : 'কথা বলুন…';
    if (busy) return 'Badboy ভাবছে…';
    if (!settings.onlineAI) return 'অফলাইন মোড';
    return 'Your Ultimate AI Assistant';
  };

  const getStatusColor = () => {
    if (listening) return '#C084FC';
    if (busy) return '#F59E0B';
    if (!settings.onlineAI) return '#F87171';
    return '#B7ADD0';
  };

  const openYouTubeUrl = async (webUrl: string, appUrl: string) => {
    try {
      const canApp = await Linking.canOpenURL(appUrl).catch(() => false);
      if (canApp) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      Linking.openURL(webUrl).catch(() => {
        setError('YouTube লিঙ্কটি খোলা যায়নি।');
      });
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const ytIntent = !isUser ? extractYouTubeIntent(item.content) : null;
    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return (
      <View style={[styles.messageRow, isUser && styles.userRow]}>
        {!isUser ? (
          <View style={styles.avatarWrap}>
            <View style={styles.messageAvatar}><BadboyLogo size={30} /></View>
            <View style={styles.avatarDot} />
          </View>
        ) : null}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text selectable style={styles.messageText}>
            {item.content || (busy && item.role === 'assistant' ? 'Badboy ভাবছে…' : '')}
          </Text>
          {ytIntent ? (
            <Pressable
              onPress={() => void openYouTubeUrl(ytIntent.url, ytIntent.appUrl)}
              style={({ pressed }) => [
                styles.ytButton,
                { backgroundColor: colors.destructive, opacity: pressed ? 0.8 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`YouTube-এ ${ytIntent.query} খুলুন`}
            >
              <Feather name="youtube" size={16} color="#ffffff" />
              <Text style={styles.ytButtonText}>YouTube-এ "{ytIntent.query}" প্লে করুন</Text>
            </Pressable>
          ) : null}
          {!isUser && item.content.trim() ? (
            <View style={styles.messageActions}>
              {settings.voiceOutputEnabled ? (
                <Pressable onPress={() => playMessage(item)} accessibilityRole="button" accessibilityLabel={speakingMessageId === item.id ? 'পড়া বন্ধ করুন' : 'উত্তর পড়ে শুনুন'} style={styles.messageAction}>
                  <Feather name={speakingMessageId === item.id ? 'volume-x' : 'volume-2'} size={13} color="#A39EB5" />
                  <Text style={styles.messageActionText}>{speakingMessageId === item.id ? 'বন্ধ' : 'শুনুন'}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => { void shareMessage(item); }} accessibilityRole="button" accessibilityLabel="উত্তর শেয়ার করুন" style={styles.messageAction}>
                <Feather name="share-2" size={13} color="#A39EB5" />
                <Text style={styles.messageActionText}>শেয়ার</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setExpertReviewDraft(item.content);
                  router.push('/(tabs)/settings' as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="Expert Review-এ পাঠান"
                style={styles.messageAction}
              >
                <Feather name="clipboard" size={13} color="#A39EB5" />
                <Text style={styles.messageActionText}>Expert Review</Text>
              </Pressable>
              <Pressable onPress={() => void regenerateAnswer(item)} disabled={busy} accessibilityRole="button" accessibilityLabel="উত্তর আবার তৈরি করুন" style={[styles.messageAction, { opacity: busy ? 0.5 : 1 }]}>
                <Feather name="refresh-cw" size={13} color="#A39EB5" />
                <Text style={styles.messageActionText}>আবার উত্তর</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaTime}>{time}</Text>
            {isUser ? (
              <View style={styles.checks}>
                <Feather name="check" size={12} color="#67E8F9" />
                <Feather name="check" size={12} color="#67E8F9" style={{ marginLeft: -7 }} />
              </View>
            ) : null}
          </View>
        </View>
        {isUser ? <View style={styles.userAvatar}><Feather name="user" size={22} color="#E9D5FF" /></View> : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
    >
      <LinearGradient colors={['#05030D', '#0B0618', '#14060F']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View pointerEvents="none" style={styles.glowPurple} />
      <View pointerEvents="none" style={styles.glowRed} />

      <ChatHeader
        topInset={insets.top}
        avatarScale={corePulse}
        online={settings.onlineAI}
        subtitle={getStatusText()}
        subtitleColor={getStatusColor()}
        quickActionsExpanded={quickActionsExpanded}
        onAvatar={() => setDrawerOpen(true)}
        onToggleQuick={() => setQuickActionsExpanded((value) => !value)}
        onOptions={showChatOptions}
      />

      <ProviderModelStrip
        providerName={defaultModel ? (getProvider(defaultModel.providerId)?.name || defaultModel.providerId) : 'Select provider'}
        modelName={defaultModel?.label || defaultModel?.modelId || 'Select model'}
        online={settings.onlineAI}
        onProvider={() => router.push('/(tabs)/providers' as never)}
        onModel={() => router.push('/(tabs)/models' as never)}
      />

      {drawerOpen ? (
        <View style={[styles.drawerScrim, { backgroundColor: 'rgba(0,0,0,0.58)' }]}>
          <Pressable style={styles.drawerOutside} onPress={() => setDrawerOpen(false)} accessibilityLabel="মেনু বন্ধ করুন" />
          <View style={[styles.drawerPanel, { backgroundColor: colors.card, borderRightColor: colors.border, paddingTop: Math.max(insets.top, 14) + 10, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.drawerBrand}>
              <BadboyLogo size={42} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.brandTitle, { color: colors.foreground }]}>Badboy AI</Text>
                <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>তোমার AI সহকারী</Text>
              </View>
              <Pressable onPress={() => setDrawerOpen(false)} style={styles.iconButton} accessibilityLabel="বন্ধ করুন"><Feather name="x" size={19} color={colors.foreground} /></Pressable>
            </View>
            <Pressable style={[styles.drawerPrimary, { backgroundColor: colors.primary }]} onPress={() => { setDrawerOpen(false); startNewChat(); }}>
              <Feather name="plus" size={18} color={colors.primaryForeground} /><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>নতুন চ্যাট</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); setChatSearch(''); setDrawerModal('search'); }}>
              <Feather name="search" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>চ্যাট খুঁজুন</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); setDrawerModal('history'); }}>
              <Feather name="clock" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>চ্যাট হিস্টোরি</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); setDrawerModal('options'); }}>
              <Feather name="bookmark" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>চ্যাট অপশন</Text>
            </Pressable>
            <View style={[styles.drawerDivider, { backgroundColor: colors.border }]} />
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); router.push('/(tabs)/settings' as never); }}>
              <Feather name="settings" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>সেটিংস</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); chooseAiStyle(); }}>
              <Feather name="sliders" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>AI ব্যক্তিত্ব</Text>
            </Pressable>
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); showCreativeOptions(); }}>
              <Feather name="edit-3" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>সৃজনশীল লেখা</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <View style={[styles.drawerDivider, { backgroundColor: colors.border }]} />
            <Pressable style={styles.drawerItem} onPress={() => { setDrawerOpen(false); Alert.alert('Badboy AI', 'ব্যক্তিগত AI সহকারী • Cloudflare'); }}>
              <Feather name="help-circle" size={18} color={colors.foreground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>সাহায্য ও অ্যাপের তথ্য</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal
        visible={drawerModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDrawerModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.chatModal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.brandTitle, { color: colors.foreground }]}>
                {drawerModal === 'search' ? 'চ্যাট খুঁজুন' : 'চ্যাট হিস্টোরি'}
              </Text>
              <Pressable onPress={() => setDrawerModal(null)} accessibilityRole="button" accessibilityLabel="বন্ধ করুন" style={styles.iconButton}>
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            {drawerModal === 'options' ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20, gap: 10 }}>
                {[
                  { label: `ভাষা: ${getVoiceLanguageLabel(selectedLang)} (বদলাতে চাপুন)`, action: () => setSelectedLang((prev) => getNextVoiceLanguage(prev)) },
                  { label: 'AI ব্যক্তিত্ব / উত্তর-স্টাইল', action: () => { setDrawerModal(null); chooseAiStyle(); } },
                  { label: 'গল্প, কবিতা, স্ক্রিপ্ট', action: () => { setDrawerModal(null); showCreativeOptions(); } },
                  { label: 'নতুন চ্যাট', action: () => setDrawerModal('newChat') },
                  { label: 'চ্যাট শেয়ার', action: () => { setDrawerModal(null); void shareConversation(); } },
                  { label: 'চ্যাট মুছুন', action: () => { setDrawerModal(null); clearChat(); } },
                ].map((option) => (
                  <Pressable key={option.label} accessibilityRole="button" onPress={option.action} style={[styles.drawerItem, { minHeight: 50, backgroundColor: colors.secondary }]}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : drawerModal === 'newChat' ? (
              <View style={{ paddingVertical: 18, gap: 16 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 22 }}>বর্তমান কথোপকথনটি বন্ধ করে নতুন চ্যাট শুরু করতে চাও?</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <Pressable accessibilityRole="button" onPress={() => setDrawerModal(null)} style={[styles.drawerItem, { paddingHorizontal: 16, backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground }}>বাতিল</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setMessages([]); setDraft(''); setError(null); setDrawerModal(null); }} style={[styles.drawerItem, { paddingHorizontal: 16, backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>নতুন চ্যাট শুরু</Text></Pressable>
                </View>
              </View>
            ) : null}
            {drawerModal === 'search' ? (
              <TextInput
                value={chatSearch}
                onChangeText={setChatSearch}
                placeholder="এই কথোপকথনে খুঁজুন..."
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                style={[styles.searchInput, { color: colors.foreground, borderColor: colors.border }]}
              />
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {messages
                .filter((item) => drawerModal !== 'search' || !chatSearch.trim() || item.content.toLocaleLowerCase().includes(chatSearch.trim().toLocaleLowerCase()))
                .slice()
                .reverse()
                .map((item) => (
                  <View key={item.id} style={[styles.historyItem, { borderBottomColor: colors.border }]}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>
                      {item.role === 'user' ? 'আপনি' : 'Badboy AI'}
                    </Text>
                    <Text selectable style={{ color: colors.foreground, fontSize: 14, lineHeight: 21 }}>
                      {item.content || 'বার্তা খালি'}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 5 }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))}
              {messages.filter((item) => drawerModal !== 'search' || !chatSearch.trim() || item.content.toLocaleLowerCase().includes(chatSearch.trim().toLocaleLowerCase())).length === 0 ? (
                <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 24 }}>
                  {drawerModal === 'search' ? 'কোনো মিল পাওয়া যায়নি।' : 'এখনো কোনো চ্যাট মেসেজ নেই।'}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {!messages.length ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.welcome} keyboardShouldPersistTaps="handled">
          <WelcomeBanner />
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          ListFooterComponent={
            <View>
              <WelcomeBanner />
              {settings.autoImprove && settings.onlineAI ? (
                <Pressable
                  onPress={requestImprovement}
                  disabled={improving || busy}
                  style={styles.improveButton}
                >
                  {improving ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="sliders" size={14} color={colors.primary} />}
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>শৈলী সংশোধন</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}

      {quickActionsExpanded ? <QuickActionGrid onPick={setDraft} /> : null}

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive }]}>
          <Feather name="alert-triangle" size={16} color={colors.destructiveForeground} />
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={{ color: colors.destructiveForeground, fontSize: 13, lineHeight: 18 }}>{error}</Text>
            {isOwnerLoginRequiredError(error) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void signOut().catch((cause) => {
                    setError(cause instanceof Error ? cause.message : 'Owner session reset করা যায়নি। আবার চেষ্টা করুন।');
                  });
                }}
                style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.destructiveForeground }}
              >
                <Text style={{ color: colors.destructive, fontWeight: '800', fontSize: 13 }}>Owner Login খুলুন</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <Modal visible={attachmentMenuOpen} transparent animationType="fade" onRequestClose={() => setAttachmentMenuOpen(false)}>
        <Pressable style={styles.attachmentBackdrop} onPress={() => setAttachmentMenuOpen(false)}>
          <View style={[styles.attachmentPanel,{backgroundColor:colors.card,borderColor:colors.border}]}>
            <Text style={{color:colors.foreground,fontWeight:'900',fontSize:15,marginBottom:8}}>Attach to message</Text>
            {[
              {label:'File',icon:'file',detail:'Documents and other files'},
              {label:'Photo',icon:'image',detail:'Choose a photo'},
              {label:'Video',icon:'video',detail:'Choose a video'},
            ].map((item) => (
              <Pressable key={item.label} onPress={() => { setAttachmentMenuOpen(false); Alert.alert(item.label, 'এই attachment picker ও chat upload workflow এখনো সংযুক্ত হয়নি। UI-তে অপশনটি রাখা হয়েছে; upload কাজ করবে বলে দাবি করছি না।'); }} style={[styles.attachmentOption,{borderColor:colors.border}]}>
                <View style={[styles.attachmentIcon,{backgroundColor:colors.secondary}]}><Feather name={item.icon as any} size={18} color={colors.primary}/></View>
                <View style={{flex:1}}><Text style={{color:colors.foreground,fontWeight:'800'}}>{item.label}</Text><Text style={{color:colors.mutedForeground,fontSize:11}}>{item.detail}</Text></View>
                <Feather name="chevron-right" size={17} color={colors.mutedForeground}/>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {emojiPickerOpen ? (
        <View style={styles.emojiTray}>
          {['😀', '😂', '🥰', '👍', '❤️', '🔥', '🙏', '🤔', '🎉', '🚀'].map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                setDraft((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${emoji}`.slice(0, 4000));
              }}
              accessibilityRole="button"
              accessibilityLabel={`ইমোজি ${emoji} যোগ করুন`}
              style={styles.emojiChip}
            >
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Composer Row */}
      <View style={styles.composer}>
        <Pressable onPress={() => setAttachmentMenuOpen(true)} accessibilityRole="button" accessibilityLabel="ফাইল, ছবি বা ভিডিও যোগ করুন" style={styles.sideButton}>
          <Feather name="paperclip" size={22} color="#C4B5FD" />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your message..."
            placeholderTextColor="#8E8A9C"
            multiline
            maxLength={4000}
            returnKeyType="default"
            style={styles.input}
            accessibilityLabel="আপনার প্রশ্ন"
          />
          <Pressable
            onPress={() => setEmojiPickerOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={emojiPickerOpen ? 'ইমোজি বন্ধ করুন' : 'ইমোজি যোগ করুন'}
            style={styles.emojiButton}
          >
            <Feather name="smile" size={22} color={emojiPickerOpen ? '#F0ABFC' : '#C4B5FD'} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => void toggleVoice()}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'ভয়েস গ্রহণ বন্ধ করুন' : 'ভয়েস অন করুন'}
          disabled={!settings.voiceInputEnabled || !settings.voiceProcessingConsent}
          style={[styles.roundButton, { backgroundColor: listening ? colors.primary : 'rgba(124,58,237,0.16)' }]}
        >
          {listening
            ? <ActivityIndicator size="small" color={colors.primaryForeground} />
            : <Feather name="mic" size={18} color="#E9D5FF" />}
        </Pressable>
        <Pressable
          onPress={() => {
            const enabled = !(settings.autoSpeakReplies && settings.autoSubmitVoice);
            if (enabled && (!settings.voiceInputEnabled || !settings.voiceProcessingConsent)) {
              setError('Auto Voice Conversation চালু করতে Settings থেকে Voice Input ও Voice Consent চালু করুন।');
              return;
            }
            updateSettings({ autoSpeakReplies: enabled, autoSubmitVoice: enabled });
          }}
          accessibilityRole="button"
          accessibilityLabel={settings.autoSpeakReplies && settings.autoSubmitVoice ? 'Auto Voice Conversation বন্ধ করুন' : 'Auto Voice Conversation চালু করুন'}
          style={[styles.roundButton, { backgroundColor: settings.autoSpeakReplies && settings.autoSubmitVoice ? colors.primary : 'rgba(124,58,237,0.16)' }]}
        >
          <Feather name="headphones" size={18} color={settings.autoSpeakReplies && settings.autoSubmitVoice ? colors.primaryForeground : '#E9D5FF'} />
        </Pressable>
        <Pressable
          onPress={() => void sendMessage(draft)}
          disabled={!draft.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="পাঠান"
          style={[styles.sendButton, { opacity: !draft.trim() || busy ? 0.45 : 1 }]}
        >
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="send" size={22} color="#FFFFFF" />}
        </Pressable>
      </View>
      <ChatFooter bottomInset={insets.bottom} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#05030D' },
  glowPurple: { position: 'absolute', top: 40, left: -110, width: 260, height: 260, borderRadius: 130, backgroundColor: '#6D00FF', opacity: 0.12 },
  glowRed: { position: 'absolute', top: 320, right: -130, width: 260, height: 260, borderRadius: 130, backgroundColor: '#FF123F', opacity: 0.09 },
  drawerScrim: { ...StyleSheet.absoluteFill, zIndex: 100, flexDirection: 'row' },
  drawerOutside: { flex: 1 },
  drawerPanel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '82%', maxWidth: 340, borderRightWidth: 1, paddingHorizontal: 16, zIndex: 101, elevation: 18 },
  drawerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 20 },
  drawerPrimary: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  drawerItem: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, borderRadius: 10 },
  drawerItemText: { flex: 1, fontSize: 14, fontWeight: '500' },
  drawerDivider: { height: 1, marginVertical: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  chatModal: { maxHeight: '82%', minHeight: '45%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 18, paddingTop: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  searchInput: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 },
  historyItem: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  brandTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 },
  brandSub: { fontSize: 11, marginTop: 2 },
  iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  welcome: { paddingTop: 6, paddingBottom: 12 },
  messageList: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 8 },
  userRow: { justifyContent: 'flex-end' },
  avatarWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  messageAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0B0716', borderWidth: 2, borderColor: '#A855F7' },
  avatarDot: { position: 'absolute', right: 0, bottom: 2, width: 11, height: 11, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#05030D' },
  userAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A1260', borderWidth: 2, borderColor: '#8B5CF6' },
  messageBubble: { maxWidth: '76%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  userBubble: { backgroundColor: 'rgba(109,40,217,0.55)', borderColor: '#8B5CF6', borderBottomRightRadius: 5, shadowColor: '#8B5CF6', shadowOpacity: 0.35, shadowRadius: 12, elevation: 3 },
  botBubble: { backgroundColor: 'rgba(10,8,24,0.92)', borderColor: 'rgba(168,85,247,0.55)', borderBottomLeftRadius: 5, shadowColor: '#C026D3', shadowOpacity: 0.25, shadowRadius: 12, elevation: 3 },
  messageText: { color: '#F5F0FF', fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  metaTime: { color: '#B7ADD0', fontSize: 11 },
  checks: { flexDirection: 'row', alignItems: 'center' },
  ytButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  ytButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  messageActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 7 },
  messageAction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  messageActionText: { color: '#A39EB5', fontSize: 11 },
  improveButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, marginTop: 4 },
  errorBox: { marginHorizontal: 12, marginBottom: 8, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  composer: { marginHorizontal: 12, marginBottom: 6, marginTop: 4, borderWidth: 1, borderColor: '#7C3AED', borderRadius: 18, minHeight: 60, paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 6, backgroundColor: 'rgba(12,8,28,0.92)', shadowColor: '#8A20FF', shadowOpacity: 0.3, shadowRadius: 16, elevation: 6 },
  sideButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, minHeight: 44, maxHeight: 120, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#B91C6B', borderRadius: 16, paddingLeft: 12, paddingRight: 4, backgroundColor: 'rgba(8,6,20,0.95)' },
  input: { flex: 1, minHeight: 40, maxHeight: 110, paddingVertical: 8, fontSize: 15, color: '#F5F0FF' },
  emojiButton: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 48, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6D28D9', borderWidth: 1, borderColor: '#A855F7' },
  emojiTray: { marginHorizontal: 12, marginBottom: 7, borderWidth: 1, borderColor: '#5B2DB0', borderRadius: 16, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, backgroundColor: 'rgba(12,8,28,0.95)' },
  emojiChip: { minWidth: 34, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(135,55,255,0.10)' },
  attachmentBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,0.55)',padding:12},
  attachmentPanel:{borderWidth:1,borderRadius:20,padding:14,paddingBottom:20,gap:8},
  attachmentOption:{minHeight:58,borderWidth:1,borderRadius:13,padding:9,flexDirection:'row',alignItems:'center',gap:10},
  attachmentIcon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},
  roundButton: { width: 38, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
