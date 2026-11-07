import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAssistant } from '@/context/AssistantContext';
import { useOwnerAuth } from '@/context/OwnerAuthContext';
import { VOICE_LANGUAGES, getAvailableSpeechVoices, speak, stopSpeaking, type AvailableSpeechVoice } from '@/lib/assistant/voice';
import { streamDeveloperAnalysis, streamReply } from '@/lib/assistant/api';
import { buildExpertReviewPrompt, inspectBadboyRepository, type RepositoryEvidence } from '@/lib/assistant/expertReview';
import { useColors } from '@/hooks/useColors';
import {
  checkTelegramMessages,
  connectTelegramBot,
  disconnectTelegramBot,
  hasTelegramBot,
  sendTelegramMessage,
} from '@/lib/assistant/telegram';
import {
  AgentExecutionResult,
  DevPlan,
  ModuleCategory,
  PRResult,
  PluginItem,
  ProjectBrain,
  QAResult,
  createGitHubPullRequest,
  executeAgentTask,
  generateDevelopmentPlan,
  getGitHubToken,
  getPluginRegistryStatus,
  getProjectBrainSummary,
  removeGitHubToken,
  runAutoQASuite,
  saveGitHubToken,
} from '@/lib/assistant/developer';
import { resolveDeveloperEngine } from '@/lib/assistant/developerEngine';
import type { DeveloperEngineMode } from '@/lib/assistant/types';

interface LocalTelegramMessage {
  id: number;
  chatId: number;
  sender: string;
  text: string;
  date: number;
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, clearChat, expertReviewDraft, clearExpertReviewDraft } = useAssistant();
  const { signOut } = useOwnerAuth();
  const [personalityDraft, setPersonalityDraft] = useState(settings.personality);
  const [botTokenDraft, setBotTokenDraft] = useState('');
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramItems, setTelegramItems] = useState<LocalTelegramMessage[]>([]);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [languageSearch, setLanguageSearch] = useState('');
  const [availableVoices, setAvailableVoices] = useState<AvailableSpeechVoice[]>([]);
  const [voiceListLoading, setVoiceListLoading] = useState(false);

  // Agent Execution System States
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentResult, setAgentResult] = useState<AgentExecutionResult | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);

  // Developer Control Center States
  const [activeDevTab, setActiveDevTab] = useState<ModuleCategory>('self');
  const [githubToken, setGithubToken] = useState('');
  const [githubTokenDraft, setGithubTokenDraft] = useState('');
  const [featureRequestInput, setFeatureRequestInput] = useState('');
  const [currentPlan, setCurrentPlan] = useState<DevPlan | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [devStatusLog, setDevStatusLog] = useState<string[]>([]);
  const [prResult, setPrResult] = useState<PRResult | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const [devHistory, setDevHistory] = useState<Array<{ plan: DevPlan; prUrl?: string; date: string }>>([]);

  // Brain & QA Inspection
  const [projectBrain, setProjectBrain] = useState<ProjectBrain | null>(null);
  const [qaResult, setQaResult] = useState<QAResult | null>(null);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [expertReviewInput, setExpertReviewInput] = useState('');
  const [expertReviewReport, setExpertReviewReport] = useState('');
  const [expertReviewEvidence, setExpertReviewEvidence] = useState<RepositoryEvidence | null>(null);
  const [expertReviewBusy, setExpertReviewBusy] = useState(false);
  const [expertReviewError, setExpertReviewError] = useState<string | null>(null);
  const [developerAnalysisPrompt, setDeveloperAnalysisPrompt] = useState('');
  const [developerAnalysisReport, setDeveloperAnalysisReport] = useState('');
  const [developerAnalysisError, setDeveloperAnalysisError] = useState<string | null>(null);
  const [developerAnalysisBusy, setDeveloperAnalysisBusy] = useState(false);
  const [developerAnalysisEngine, setDeveloperAnalysisEngine] = useState('');
  const [developerAnalysisFallback, setDeveloperAnalysisFallback] = useState('');
  const [developerAnalysisTaskId, setDeveloperAnalysisTaskId] = useState('');

  useEffect(() => {
    let active = true;
    setVoiceListLoading(true);
    getAvailableSpeechVoices().then((voices) => { if (active) setAvailableVoices(voices); }).finally(() => { if (active) setVoiceListLoading(false); });
    hasTelegramBot().then((connected) => {
      if (active) setTelegramConnected(connected);
    }).catch(() => {
      if (active) setTelegramError('ফোনের নিরাপদ স্টোরেজ পরীক্ষা করা যায়নি।');
    });

    getGitHubToken().then((token) => {
      if (active && token) {
        setGithubToken(token);
      }
    }).catch(() => {
      // Ignore fallback
    });

    setProjectBrain(getProjectBrainSummary());
    setQaResult(runAutoQASuite());
    setPlugins(getPluginRegistryStatus());

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (expertReviewDraft.trim()) {
      setExpertReviewInput(expertReviewDraft);
      setExpertReviewReport('');
      clearExpertReviewDraft();
    }
  }, [expertReviewDraft, clearExpertReviewDraft]);

  const handleExpertReview = async () => {
    const pasted = expertReviewInput.trim();
    if (!pasted || expertReviewBusy || !settings.onlineAI) return;
    setExpertReviewBusy(true);
    setExpertReviewError(null);
    setExpertReviewReport('');
    try {
      const evidence = await inspectBadboyRepository();
      setExpertReviewEvidence(evidence);
      const summary = JSON.stringify(getProjectBrainSummary(), null, 2);
      const prompt = buildExpertReviewPrompt(pasted, evidence, summary);
      let report = '';
      await streamReply(prompt, settings, (chunk) => {
        report += chunk;
        setExpertReviewReport(report);
      });
      if (!report.trim()) throw new Error('বিশ্লেষণ থেকে কোনো রিপোর্ট পাওয়া যায়নি।');
    } catch (cause) {
      setExpertReviewError(cause instanceof Error ? cause.message : 'Expert Review সম্পন্ন করা যায়নি।');
    } finally {
      setExpertReviewBusy(false);
    }
  };

  const handleDeveloperAnalysis = async (engineOverride?: DeveloperEngineMode) => {
    const prompt = developerAnalysisPrompt.trim();
    if (!prompt || developerAnalysisBusy || !settings.onlineAI) return;

    const requestedEngine = engineOverride ?? settings.developerEngine;
    // Copilot SDK is intentionally unavailable until its isolated runtime and
    // authentication are proven. Auto mode transparently uses Native for now.
    const resolution = resolveDeveloperEngine(requestedEngine, false);
    setDeveloperAnalysisError(null);
    setDeveloperAnalysisReport('');
    setDeveloperAnalysisTaskId('');
    setDeveloperAnalysisFallback(resolution.reason ?? '');
    setDeveloperAnalysisEngine(
      resolution.status === 'unavailable'
        ? 'GitHub Copilot SDK · not configured'
        : resolution.activeEngine === 'native'
          ? 'Badboy Native'
          : 'GitHub Copilot SDK',
    );

    if (resolution.status === 'unavailable') {
      setDeveloperAnalysisError(resolution.reason ?? 'Copilot SDK runtime এখনো প্রস্তুত নয়।');
      return;
    }

    setDeveloperAnalysisBusy(true);
    try {
      const brain = getProjectBrainSummary();
      let report = '';
      const result = await streamDeveloperAnalysis(
        prompt,
        JSON.stringify(brain, null, 2),
        requestedEngine,
        (chunk) => {
          report += chunk;
          setDeveloperAnalysisReport(report);
        },
      );
      setDeveloperAnalysisTaskId(result.taskId ?? '');
      if (!report.trim()) throw new Error('বিশ্লেষণ থেকে কোনো রিপোর্ট পাওয়া যায়নি।');
    } catch (cause) {
      setDeveloperAnalysisError(
        cause instanceof Error ? cause.message : 'Developer Agent analysis সম্পন্ন করা যায়নি।',
      );
    } finally {
      setDeveloperAnalysisBusy(false);
    }
  };

  const handleShareExpertReport = async () => {
    if (!expertReviewReport.trim()) return;
    try {
      await Share.share({ title: 'Badboy Expert Review', message: expertReviewReport });
    } catch {
      setExpertReviewError('রিপোর্ট শেয়ার করা যায়নি।');
    }
  };

  const handleRunAgentTask = async (overridePrompt?: string, userConfirmed: boolean = false) => {
    const prompt = (overridePrompt || agentPrompt).trim();
    if (!prompt || agentBusy) return;
    setAgentBusy(true);
    try {
      const res = await executeAgentTask(prompt, settings.onlineAI, userConfirmed);
      setAgentResult(res);
      if (res.state === 'completed' && (res.outputData?.action === 'open_youtube_search' || res.outputData?.action === 'open_youtube')) {
        const query = encodeURIComponent(String(res.outputData.query || prompt));
        Linking.openURL(`https://www.youtube.com/results?search_query=${query}`).catch(() => {});
      }
    } catch {
      // Ignore err
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSaveGithubToken = async () => {
    const val = githubTokenDraft.trim();
    if (!val) return;
    await saveGitHubToken(val);
    setGithubToken(val);
    setGithubTokenDraft('');
    Alert.alert('সংরক্ষিত', 'GitHub Personal Access Token সফলভাবে সংরক্ষণ করা হয়েছে।');
  };

  const handleRemoveGithubToken = async () => {
    await removeGitHubToken();
    setGithubToken('');
    Alert.alert('মুছে ফেলা হয়েছে', 'GitHub টোকেন সরিয়ে ফেলা হয়েছে।');
  };

  const handleCreatePlan = () => {
    const prompt = featureRequestInput.trim();
    if (!prompt) return;
    setDevError(null);
    setPrResult(null);
    const plan = generateDevelopmentPlan(prompt);
    setCurrentPlan(plan);
    setActiveDevTab(plan.category);
    setDevStatusLog([`[${new Date().toISOString().slice(11, 19)}] পরিকল্পনা প্রস্তুত (${plan.category.toUpperCase()}): "${plan.title}"`]);
  };

  const handleExecutePlanAndPR = async () => {
    if (!currentPlan) return;
    if (!githubToken) {
      setDevError('GitHub Personal Access Token প্রয়োজন। নিচে আপনার PAT সেভ করুন।');
      return;
    }

    Alert.alert(
      'স্বয়ংক্রিয় ডেভেলপমেন্ট ওয়ার্কফ্লো শুরু করবেন?',
      `ব্রাঞ্চ: ${currentPlan.branchName}\nলক্ষ্য: GitHub-এ Pull Request তৈরি করা।\n\nআপনি কি নিশ্চিত?`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'হ্যাঁ, শুরু করুন',
          onPress: async () => {
            setDevBusy(true);
            setDevError(null);
            setDevStatusLog((prev) => [...prev, `[${new Date().toISOString().slice(11, 19)}] সোর্স কোড ও ব্রাঞ্চ যাচাই চলছে...`]);

            try {
              const res = await createGitHubPullRequest({
                githubToken,
                plan: currentPlan,
              });

              setPrResult(res);
              if (res.logs && res.logs.length) {
                setDevStatusLog((prev) => [...prev, ...res.logs]);
              }
              if (res.success) {
                setDevHistory((prev) => [{ plan: currentPlan, prUrl: res.prUrl, date: new Date().toLocaleTimeString() }, ...prev]);
              } else {
                setDevError(res.error || 'Pull Request তৈরি করা ব্যর্থ হয়েছে।');
              }
            } catch (err) {
              setDevError(err instanceof Error ? err.message : 'অপ্রত্যাশিত ত্রুটি ঘটেছে।');
            } finally {
              setDevBusy(false);
            }
          },
        },
      ],
    );
  };

  const connectBot = () => {
    const token = botTokenDraft.trim();
    if (!token || telegramBusy) return;
    Alert.alert(
      'Telegram bot সংযোগ করবেন?',
      'Bot token ফোনের Secure Storage-এ থাকবে এবং সংযোগ যাচাই করতে সরাসরি Telegram-এ পাঠানো হবে। আপনার চ্যাট বার্তা এই অ্যাপের সার্ভারে যাবে না।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'সংযোগ করুন',
          onPress: () => {
            setTelegramBusy(true);
            setTelegramError(null);
            void connectTelegramBot(token)
              .then((bot) => {
                setTelegramConnected(true);
                setBotUsername(bot.username);
                setBotTokenDraft('');
              })
              .catch((cause) => setTelegramError(cause instanceof Error ? cause.message : 'Bot সংযোগ করা যায়নি।'))
              .finally(() => setTelegramBusy(false));
          },
        },
      ],
    );
  };

  const disconnectBot = () => {
    Alert.alert(
      'Telegram সংযোগ বিচ্ছিন্ন করবেন?',
      'এই ফোনে রাখা bot token মুছে যাবে।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'বিচ্ছিন্ন করুন',
          style: 'destructive',
          onPress: () => {
            void disconnectTelegramBot().then(() => {
              setTelegramConnected(false);
              setBotUsername('');
              setTelegramItems([]);
            }).catch(() => setTelegramError('Bot token মুছতে সমস্যা হয়েছে।'));
          },
        },
      ],
    );
  };

  const refreshTelegram = async () => {
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const messages = await checkTelegramMessages();
      if (messages.length) setTelegramItems((previous) => [...messages, ...previous].slice(0, 12));
      else setTelegramError('নতুন বার্তা নেই। Bot-এ /start পাঠিয়ে আবার দেখুন।');
    } catch (cause) {
      setTelegramError(cause instanceof Error ? cause.message : 'Telegram inbox খোলা যায়নি।');
    } finally {
      setTelegramBusy(false);
    }
  };

  const sendTelegram = () => {
    const text = telegramMessage.trim();
    if (!text || telegramBusy) return;
    Alert.alert(
      'Telegram-এ পাঠাবেন?',
      'এই বার্তাটি আপনার সংযুক্ত bot-এর সর্বশেষ chat-এ পাঠানো হবে।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'পাঠান',
          onPress: () => {
            setTelegramBusy(true);
            setTelegramError(null);
            void sendTelegramMessage(text)
              .then(() => setTelegramMessage(''))
              .catch((cause) => setTelegramError(cause instanceof Error ? cause.message : 'বার্তা পাঠানো যায়নি।'))
              .finally(() => setTelegramBusy(false));
          },
        },
      ],
    );
  };

  const sectionCard = { backgroundColor: colors.card, borderColor: colors.border };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 12) + 14, paddingBottom: Math.max(insets.bottom, 20) + 90 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.brandHeader, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Feather name="zap" size={19} color={colors.primaryForeground} />
        </View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, { color: colors.foreground }]}>Badboy AI</Text>
          <Text style={[styles.brandCaption, { color: colors.mutedForeground }]}>তোমার AI সহকারী · Settings</Text>
        </View>
        <View style={[styles.settingsPill, { borderColor: colors.border }]}>
          <Feather name="sliders" size={14} color={colors.primary} />
        </View>
      </View>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>PERSONAL CONTROL CENTER</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>সেটিংস</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        তোমার অভিজ্ঞতা, ভয়েস, গোপনীয়তা ও ডেভেলপার টুল—সব এক জায়গায়।
      </Text>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}><Feather name="droplet" size={17} color={colors.primary} /><Text style={[styles.sectionTitle,{color:colors.foreground}]}>অ্যাপ থিম</Text></View>
        <Text style={[styles.body,{color:colors.mutedForeground,marginBottom:10}]}>পছন্দের রং বেছে নাও। পরিবর্তন সঙ্গে সঙ্গে পুরো অ্যাপে দেখা যাবে এবং এই ফোনেই সংরক্ষিত থাকবে।</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
          {([
            {id:'badboy',label:'Badboy Neon Blue',color:'#00d9ff'}, {id:'neon',label:'Badboy Violet',color:'#9b8cff'}, {id:'ocean',label:'Ocean Blue',color:'#38bdf8'}, {id:'purple',label:'Purple',color:'#c084fc'}, {id:'emerald',label:'Emerald',color:'#34d399'}, {id:'sunset',label:'Sunset',color:'#fb923c'}, {id:'light',label:'Light',color:'#2563eb'},
          ] as const).map(theme => { const selected=settings.theme===theme.id; return <Pressable key={theme.id} onPress={()=>updateSettings({theme:theme.id})} accessibilityRole="button" accessibilityState={{selected}} style={{width:'31%',minHeight:66,borderWidth:selected?2:1,borderColor:selected?colors.primary:colors.border,borderRadius:13,padding:9,alignItems:'center',justifyContent:'center',gap:6,backgroundColor:colors.background}}><View style={{width:22,height:22,borderRadius:11,backgroundColor:theme.color}}/><Text style={{fontSize:11,fontWeight:selected?'800':'600',color:colors.foreground}}>{theme.label}</Text>{selected?<Feather name="check-circle" size={13} color={colors.primary}/>:null}</Pressable>; })}
        </View>
      </View>

      {/* Central Agent Task Execution Engine */}
      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="cpu" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>BADBOY Smart Agent Task Engine</Text>
        </View>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          ভয়েস বা টেক্সট কম্যান্ড দিলে এজেন্ট নিজে উপযুক্ত টুল ও স্মার্ট রিজনিং সিলেক্ট করে লাইভ ওয়েব তথ্যসহ টাস্ক সম্পাদন করে।
        </Text>
        <TextInput
          value={agentPrompt}
          onChangeText={setAgentPrompt}
          placeholder="যেমন: Search Cloudflare Pages docs / Play a song on YouTube"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input, marginTop: 8 }]}
        />
        <Pressable
          onPress={() => void handleRunAgentTask()}
          disabled={!agentPrompt.trim() || agentBusy}
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !agentPrompt.trim() || agentBusy ? 0.5 : 1 }]}
        >
          {agentBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="play-circle" size={15} color={colors.primaryForeground} />}
          <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>টাস্ক রান করুন</Text>
        </Pressable>

        {agentResult ? (
          <View style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>
                টাস্ক স্ট্যাটাস: {agentResult.state.toUpperCase()} {agentResult.latencyMs ? `(${agentResult.latencyMs}ms)` : ''}
              </Text>
              <View style={[styles.categoryPill, { backgroundColor: agentResult.state === 'completed' ? colors.primary : colors.secondary }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primaryForeground }}>
                  {agentResult.detectedLanguage.toUpperCase()} · {agentResult.requiresInternet ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>
            <Text style={[styles.body, { color: colors.foreground, marginTop: 6 }]}>{agentResult.summary}</Text>

            {agentResult.state === 'permission_pending' && agentResult.confirmationMessage ? (
              <View style={{ marginTop: 8, gap: 6 }}>
                <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: '600' }}>{agentResult.confirmationMessage}</Text>
                <Pressable
                  onPress={() => void handleRunAgentTask(agentResult.prompt, true)}
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>অনুমতি দিন ও সম্পাদন করুন</Text>
                </Pressable>
              </View>
            ) : null}

            {agentResult.logs.length > 0 ? (
              <View style={[styles.logBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
                {agentResult.logs.map((l, i) => (
                  <Text key={i} style={[styles.logText, { color: colors.mutedForeground }]}>{l}</Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="wifi" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>AI ও গোপনীয়তা</Text>
        </View>
        <SettingSwitch
          colors={colors}
          title="অনলাইন AI"
          subtitle={settings.onlineAI ? 'শুধু এই মুহূর্তের বার্তাটি AI-কে পাঠানো হয়।' : 'অফলাইনে chat ও মেমোরি এই ফোনেই থাকে; AI উত্তর বন্ধ।'}
          value={settings.onlineAI}
          onValueChange={(value) => updateSettings({ onlineAI: value })}
        />
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Assistant personality</Text>
        <TextInput
          value={personalityDraft}
          onChangeText={setPersonalityDraft}
          placeholder="কেমনভাবে উত্তর দেবে?"
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={1000}
          style={[styles.personalityInput, { color: colors.foreground, borderColor: colors.input }]}
          accessibilityLabel="Assistant-এর ব্যক্তিত্ব"
        />
        <Pressable
          onPress={() => {
            updateSettings({ personality: personalityDraft.trim() || 'Warm, clear, and practical.' });
            Alert.alert('সংরক্ষিত', 'আপনার assistant personality এই ফোনে সংরক্ষণ করা হয়েছে।');
          }}
          style={[styles.secondaryButton, { backgroundColor: colors.secondary }]}
        >
          <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>ব্যক্তিত্ব সংরক্ষণ</Text>
        </Pressable>
      </View>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="refresh-cw" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Auto-Improve</Text>
        </View>
        <SettingSwitch
          colors={colors}
          title="পরামর্শ দেখান"
          subtitle="শুধু বর্তমান বার্তার ভিত্তিতে পরামর্শ দেবে। আপনার অনুমতি ছাড়া personality বদলাবে না।"
          value={settings.autoImprove}
          onValueChange={(value) => updateSettings({ autoImprove: value })}
        />
      </View>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="clipboard" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Expert Review & Code Analysis</Text>
        </View>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Badboy-এর কোনো উত্তর, কোড, Error বা প্রস্তাব এখানে পাঠাও। বিশ্লেষণের জন্য লেখাটি তোমার নির্বাচিত AI service-এ পাঠানো হবে। GitHub PAT যুক্ত থাকলে Repository-এর live file inventory যাচাই করবে। এটি শুধু রিপোর্ট তৈরি করে—কোড, PR বা Deploy পরিবর্তন করে না।
        </Text>
        <TextInput
          value={expertReviewInput}
          onChangeText={setExpertReviewInput}
          placeholder="Badboy-এর উত্তর, কোড বা Error এখানে paste করো…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          textAlignVertical="top"
          style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input, minHeight: 120, marginTop: 8 }]}
        />
        <Pressable
          onPress={() => void handleExpertReview()}
          disabled={!expertReviewInput.trim() || expertReviewBusy || !settings.onlineAI}
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !expertReviewInput.trim() || expertReviewBusy || !settings.onlineAI ? 0.5 : 1 }]}
        >
          {expertReviewBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="search" size={15} color={colors.primaryForeground} />}
          <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Expert Review চালাও</Text>
        </Pressable>
        {!settings.onlineAI ? <Text style={[styles.smallNote, { color: colors.destructive }]}>অনলাইন AI বন্ধ আছে। Expert Review চালাতে Online AI চালু করো।</Text> : null}
        {expertReviewEvidence ? (
          <View style={[styles.wakeCard, { backgroundColor: colors.secondary }]}>
            <Feather name={expertReviewEvidence.status === 'verified' ? 'check-circle' : 'alert-circle'} size={15} color={colors.secondaryForeground} />
            <Text style={[styles.wakeText, { color: colors.secondaryForeground }]}>
              Repository: {expertReviewEvidence.status.toUpperCase()} · {expertReviewEvidence.filePaths.length} file path · {expertReviewEvidence.note}
            </Text>
          </View>
        ) : null}
        {expertReviewError ? <Text style={[styles.smallNote, { color: colors.destructive }]}>{expertReviewError}</Text> : null}
        {expertReviewReport ? (
          <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Text style={[styles.label, { color: colors.foreground }]}>বিশ্লেষণ রিপোর্ট</Text>
            <Text selectable style={[styles.body, { color: colors.foreground, lineHeight: 21 }]}>{expertReviewReport}</Text>
            <Pressable onPress={() => void handleShareExpertReport()} style={[styles.primaryButton, { backgroundColor: colors.secondary, marginTop: 8 }]}>
              <Feather name="share-2" size={15} color={colors.secondaryForeground} />
              <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>রিপোর্ট শেয়ার করুন</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Developer Control Center */}
      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="code" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>BADBOY Developer Platform</Text>
        </View>
        <SettingSwitch
          colors={colors}
          title="Develop mode"
          subtitle="ওয়েব ডেভেলপমেন্ট, অ্যান্ড্রয়েড এপিকে, অটো কিউএ এবং ব্যাডবয় সেলফ-ডেভেলপমেন্ট।"
          value={settings.developerMode}
          onValueChange={(value) => updateSettings({ developerMode: value })}
        />

        {settings.developerMode ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            {/* Multi-engine Developer Agent Analysis */}
            <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="cpu" size={16} color={colors.primary} />
                <Text style={[styles.label, { color: colors.foreground }]}>Developer Agent · Analysis Copilot</Text>
              </View>
              <Text style={[styles.smallNote, { color: colors.mutedForeground, marginTop: 4 }]}>
                কাজের নির্দেশনা দিলে Badboy পরিকল্পনা, ঝুঁকি, প্রয়োজনীয় ফাইল ও regression test বিশ্লেষণ করবে। এই ধাপে GitHub-এ কোনো ফাইল পড়া বা পরিবর্তন করা হবে না।
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                {([
                  { id: 'native', label: 'Badboy Native', icon: 'cpu' },
                  { id: 'copilot', label: 'Copilot SDK', icon: 'github' },
                  { id: 'auto', label: 'Auto / Hybrid', icon: 'shuffle' },
                ] as const).map((engine) => {
                  const selected = settings.developerEngine === engine.id;
                  return (
                    <Pressable
                      key={engine.id}
                      onPress={() => {
                        updateSettings({ developerEngine: engine.id });
                        setDeveloperAnalysisError(null);
                        setDeveloperAnalysisFallback('');
                        setDeveloperAnalysisEngine('');
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        flexGrow: 1,
                        minWidth: 105,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: selected ? colors.secondary : colors.card,
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Feather name={engine.icon as any} size={15} color={selected ? colors.primary : colors.mutedForeground} />
                      <Text style={{ color: selected ? colors.foreground : colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{engine.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={developerAnalysisPrompt}
                onChangeText={setDeveloperAnalysisPrompt}
                placeholder="যেমন: Developer Mode-এর পরবর্তী কাজগুলো বিশ্লেষণ করে নিরাপদ implementation plan তৈরি করো…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input, minHeight: 76, textAlignVertical: 'top', marginTop: 10 }]}
              />
              <Pressable
                onPress={() => void handleDeveloperAnalysis()}
                disabled={!developerAnalysisPrompt.trim() || developerAnalysisBusy || !settings.onlineAI}
                style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !developerAnalysisPrompt.trim() || developerAnalysisBusy || !settings.onlineAI ? 0.5 : 1 }]}
              >
                {developerAnalysisBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="search" size={15} color={colors.primaryForeground} />}
                <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Analyze with selected engine</Text>
              </Pressable>
              {!settings.onlineAI ? <Text style={[styles.smallNote, { color: colors.destructive }]}>Analysis চালাতে Online AI চালু করতে হবে।</Text> : null}
              {developerAnalysisEngine ? <Text style={[styles.smallNote, { color: colors.primary }]}>Selected execution: {developerAnalysisEngine}</Text> : null}
              {developerAnalysisTaskId ? <Text selectable style={[styles.smallNote, { color: colors.mutedForeground }]}>Task ID: {developerAnalysisTaskId}</Text> : null}
              {developerAnalysisFallback ? <Text style={[styles.smallNote, { color: colors.mutedForeground }]}>{developerAnalysisFallback}</Text> : null}
              {developerAnalysisError ? (
                <View style={{ gap: 7 }}>
                  <Text style={[styles.smallNote, { color: colors.destructive }]}>{developerAnalysisError}</Text>
                  {settings.developerEngine === 'copilot' ? (
                    <Pressable
                      onPress={() => {
                        updateSettings({ developerEngine: 'native' });
                        void handleDeveloperAnalysis('native');
                      }}
                      style={[styles.secondaryButton, { backgroundColor: colors.secondary }]}
                    >
                      <Feather name="refresh-cw" size={14} color={colors.secondaryForeground} />
                      <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>একই Task Native দিয়ে Retry করুন</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {developerAnalysisReport ? (
                <View style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 8 }]}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Analysis Report</Text>
                  <Text selectable style={[styles.body, { color: colors.foreground, marginTop: 6, lineHeight: 21 }]}>{developerAnalysisReport}</Text>
                  <Pressable
                    onPress={() => Share.share({ title: 'Badboy Developer Analysis', message: developerAnalysisReport }).catch(() => setDeveloperAnalysisError('রিপোর্ট শেয়ার করা যায়নি।'))}
                    style={[styles.secondaryButton, { backgroundColor: colors.secondary, marginTop: 8 }]}
                  >
                    <Feather name="share-2" size={14} color={colors.secondaryForeground} />
                    <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>রিপোর্ট শেয়ার করুন</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Navigation Modules Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {[
                { id: 'self', label: 'Self Dev', icon: 'cpu' },
                { id: 'web', label: 'Web Dev', icon: 'globe' },
                { id: 'android', label: 'Android APK', icon: 'smartphone' },
                { id: 'qa', label: 'Auto QA', icon: 'check-square' },
                { id: 'brain', label: 'Project Brain', icon: 'database' },
                { id: 'plugins', label: 'Plugins', icon: 'grid' },
              ].map((tab) => (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveDevTab(tab.id as ModuleCategory)}
                  style={[
                    styles.tabButtonHorizontal,
                    {
                      backgroundColor: activeDevTab === tab.id ? colors.primary : colors.secondary,
                    },
                  ]}
                >
                  <Feather
                    name={tab.icon as any}
                    size={13}
                    color={activeDevTab === tab.id ? colors.primaryForeground : colors.secondaryForeground}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color: activeDevTab === tab.id ? colors.primaryForeground : colors.secondaryForeground,
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Prompt Input Box */}
            <Text style={[styles.label, { color: colors.foreground, marginTop: 4 }]}>
              {activeDevTab === 'web'
                ? 'ওয়েব নির্দেশিকা (যেমন: Build a website for my Telegram channel)'
                : activeDevTab === 'android'
                ? 'অ্যান্ড্রয়েড নির্দেশিকা (যেমন: Create an Android app and prepare an APK)'
                : activeDevTab === 'qa'
                ? 'QA নির্দেশিকা (যেমন: Inspect this project, find bugs, and fix them)'
                : 'সেলফ নির্দেশিকা (যেমন: Badboy, add a new reminder feature to yourself)'}
            </Text>
            <TextInput
              value={featureRequestInput}
              onChangeText={setFeatureRequestInput}
              placeholder="বাংলা বা ইংরেজিতে আপনার নির্দেশ দিন…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input, minHeight: 60 }]}
            />
            <Pressable
              onPress={handleCreatePlan}
              disabled={!featureRequestInput.trim() || devBusy}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !featureRequestInput.trim() || devBusy ? 0.5 : 1 }]}
            >
              <Feather name="play" size={15} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>প্ল্যান ও ওয়ার্কফ্লো তৈরি করুন</Text>
            </Pressable>

            {/* Current Plan Viewer */}
            {currentPlan ? (
              <View style={[styles.planCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.planTitle, { color: colors.primary }]}>{currentPlan.title}</Text>
                  <View style={[styles.categoryPill, { backgroundColor: colors.secondary }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.secondaryForeground }}>{currentPlan.category.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={[styles.body, { color: colors.foreground, marginTop: 6 }]}>{currentPlan.featureDescription}</Text>

                <Text style={[styles.label, { color: colors.foreground, marginTop: 10 }]}>পরিবর্তনযোগ্য ফাইলসমূহ:</Text>
                {currentPlan.filesToModify.map((f) => (
                  <Text key={f} style={[styles.smallNote, { color: colors.mutedForeground, marginTop: 2 }]}>• {f}</Text>
                ))}

                <Text style={[styles.label, { color: colors.foreground, marginTop: 10 }]}>কাজসমূহ (Tasks):</Text>
                {currentPlan.tasks.map((t) => (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Feather name="alert-circle" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.body, { color: colors.foreground }]}>{t.title}</Text>
                  </View>
                ))}

                <View style={[styles.wakeCard, { backgroundColor: colors.secondary, marginTop: 10 }]}>
                  <Feather name="shield" size={15} color={colors.secondaryForeground} />
                  <Text style={[styles.wakeText, { color: colors.secondaryForeground }]}>{currentPlan.securityNotes}</Text>
                </View>

                <Pressable
                  onPress={handleExecutePlanAndPR}
                  disabled={devBusy}
                  style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 12 }]}
                >
                  {devBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="git-pull-request" size={15} color={colors.primaryForeground} />}
                  <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>GitHub-এ PR তৈরি করুন</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Project Brain View */}
            {activeDevTab === 'brain' && projectBrain ? (
              <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="database" size={16} color={colors.primary} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Project Brain (Knowledge Base)</Text>
                </View>
                <Text style={[styles.body, { color: colors.foreground, fontWeight: '600', marginTop: 6 }]}>{projectBrain.name}</Text>
                <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 4 }]}>{projectBrain.architecture}</Text>
                <Text style={[styles.label, { color: colors.foreground, marginTop: 8 }]}>ফ্রেমওয়ার্ক ও টেকনোলজি:</Text>
                {projectBrain.frameworks.map((fw) => (
                  <Text key={fw} style={[styles.smallNote, { color: colors.mutedForeground }]}>• {fw}</Text>
                ))}
              </View>
            ) : null}

            {/* Auto QA View */}
            {activeDevTab === 'qa' && qaResult ? (
              <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="check-square" size={16} color={colors.primary} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Auto QA & ভ্যালিডেশন সুইট</Text>
                </View>
                {qaResult.details.map((d, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <Feather name="check-circle" size={13} color={colors.primary} />
                    <Text style={[styles.body, { color: colors.foreground, fontSize: 12 }]}>{d}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Plugin Marketplace Status View */}
            {activeDevTab === 'plugins' ? (
              <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="grid" size={16} color={colors.primary} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Plugin Marketplace & Tool Registry</Text>
                </View>
                {plugins.map((p) => (
                  <View key={p.id} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.body, { color: colors.foreground, fontWeight: '700' }]}>{p.name}</Text>
                      <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>{p.status.toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.smallNote, { color: colors.mutedForeground }]}>{p.description}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Android APK & EAS CLI Guidelines Card */}
            {activeDevTab === 'android' ? (
              <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="smartphone" size={16} color={colors.primary} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Android APK / AAB বিল্ড কনফিগারেশন</Text>
                </View>
                <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
                  Expo/EAS বিল্ড প্রফাইল সম্পূর্ণ কনফিগার করা আছে। টার্মিনালে সরাসরি নিচের কমান্ড দিয়ে APK ফাইল তৈরি করা যাবে:
                </Text>
                <Text style={[styles.logText, { color: colors.primary, marginTop: 4 }]}>
                  npx eas-cli build --platform android --profile preview
                </Text>
              </View>
            ) : null}

            {/* Web Dev & Cloudflare Pages Guidelines Card */}
            {activeDevTab === 'web' ? (
              <View style={[styles.infoCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="globe" size={16} color={colors.primary} />
                  <Text style={[styles.label, { color: colors.foreground }]}>Cloudflare Pages হোস্ট অ্যান্ড ডিপ্লয়</Text>
                </View>
                <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 6 }]}>
                  Cloudflare Pages Functions এবং Static Web Export সমন্বিত রয়েছে। ডিপ্লয় করতে কমান্ড রান করুন:
                </Text>
                <Text style={[styles.logText, { color: colors.primary, marginTop: 4 }]}>
                  pnpm run build && pnpm run deploy
                </Text>
              </View>
            ) : null}

            {/* GitHub Credentials Management */}
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>GitHub Personal Access Token (PAT)</Text>
            {githubToken ? (
              <View style={{ gap: 6 }}>
                <View style={[styles.connectedPill, { backgroundColor: colors.secondary }]}>
                  <Feather name="check" size={14} color={colors.primary} />
                  <Text style={{ color: colors.secondaryForeground, fontSize: 13, fontWeight: '600' }}>
                    GitHub PAT সংযুক্ত আছে (••••{githubToken.slice(-4)})
                  </Text>
                </View>
                <Pressable onPress={handleRemoveGithubToken} style={styles.textButton}>
                  <Text style={{ color: colors.destructive, fontWeight: '600' }}>টোকেন মুছুন</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={githubTokenDraft}
                  onChangeText={setGithubTokenDraft}
                  placeholder="ghp_xxxxxxxxxxxx"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry
                  style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input }]}
                />
                <Pressable
                  onPress={handleSaveGithubToken}
                  disabled={!githubTokenDraft.trim()}
                  style={[styles.secondaryButton, { backgroundColor: colors.secondary, opacity: !githubTokenDraft.trim() ? 0.5 : 1 }]}
                >
                  <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>টোকেন সংরক্ষণ করুন</Text>
                </Pressable>
              </View>
            )}

            {/* Diagnostic Logs & Errors */}
            {devError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{devError}</Text> : null}

            {prResult?.success && prResult.prUrl ? (
              <View style={[styles.prSuccessCard, { borderColor: colors.primary, backgroundColor: colors.secondary }]}>
                <Feather name="check-circle" size={18} color={colors.primary} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontWeight: '700' }}>{prResult.summary}</Text>
                  <Pressable onPress={() => void Linking.openURL(prResult.prUrl!)}>
                    <Text style={{ color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' }}>
                      GitHub-এ PR দেখুন: #{prResult.prNumber}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {devStatusLog.length > 0 ? (
              <View style={[styles.logBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground, fontSize: 11 }]}>টেকনিক্যাল লবস (Technical Logs):</Text>
                {devStatusLog.map((log, idx) => (
                  <Text key={idx} style={[styles.logText, { color: colors.mutedForeground }]}>{log}</Text>
                ))}
              </View>
            ) : null}

            {devHistory.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>পূর্ববর্তী ডেভেলপমেন্ট হিস্ট্রি:</Text>
                {devHistory.map((item, idx) => (
                  <View key={idx} style={[styles.historyItem, { borderColor: colors.border }]}>
                    <Text style={[styles.body, { color: colors.foreground, fontWeight: '600' }]}>{item.plan.title} ({item.date})</Text>
                    {item.prUrl ? (
                      <Pressable onPress={() => void Linking.openURL(item.prUrl!)}>
                        <Text style={{ color: colors.primary, fontSize: 12, textDecorationLine: 'underline' }}>PR লিঙ্ক খুলুন</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.smallNote, { color: colors.mutedForeground }]}>
            এই মোড অন করলে আপনি ভয়েস বা টেক্সটে নির্দেশনা দিয়ে ফিচার যোগ ও Pull Request তৈরি করার সুবিধা পাবেন।
          </Text>
        )}
      </View>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="mic" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Voice Control Center</Text>
        </View>
        <SettingSwitch colors={colors} title="Voice Processing Consent" subtitle="ভয়েস ফিচার ব্যবহারের অনুমতি। রেকর্ড করা অডিও transcription-এর জন্য অনলাইন AI সার্ভারে পাঠানো হতে পারে।" value={settings.voiceProcessingConsent} onValueChange={(value) => updateSettings({ voiceProcessingConsent: value })} />
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <SettingSwitch colors={colors} title="Voice Input" subtitle="মাইক্রোফোন দিয়ে বাংলা/ইংরেজি কথা থেকে লেখা তৈরি।" value={settings.voiceInputEnabled} onValueChange={(value) => updateSettings({ voiceInputEnabled: value })} />
        <SettingSwitch colors={colors} title="Voice Output" subtitle="Badboy-এর উত্তর TTS দিয়ে পড়ে শোনানো এবং Play/Stop নিয়ন্ত্রণ।" value={settings.voiceOutputEnabled} onValueChange={(value) => updateSettings({ voiceOutputEnabled: value })} />
        <SettingSwitch colors={colors} title="Auto Speak Replies" subtitle="নতুন AI উত্তর এলে নিজে থেকে পড়ে শোনাবে।" value={settings.autoSpeakReplies} onValueChange={(value) => updateSettings({ autoSpeakReplies: value })} />
        <SettingSwitch colors={colors} title="Auto Submit Voice Input" subtitle="কথা শেষ হলে transcription স্বয়ংক্রিয়ভাবে AI-তে পাঠাবে। বন্ধ থাকলে লেখা draft-এ থাকবে।" value={settings.autoSubmitVoice} onValueChange={(value) => updateSettings({ autoSubmitVoice: value })} />
        <SettingSwitch colors={colors} title="Hey Badboy Wake Word" subtitle="সম্মতি ও microphone permission থাকলে Android-এ wake-word listener চালু রাখবে।" value={settings.wakeWordEnabled} onValueChange={(value) => updateSettings({ wakeWordEnabled: value })} />
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground, marginBottom: 8 }]}>ভাষা নির্বাচন · Language</Text>
        <TextInput value={languageSearch} onChangeText={setLanguageSearch} placeholder="ভাষা খুঁজুন / Search language..." placeholderTextColor={colors.mutedForeground} style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input, marginTop: 0, marginBottom: 8 }]} accessibilityLabel="ভাষা খুঁজুন" />
        <ScrollView nestedScrollEnabled style={{ maxHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }} contentContainerStyle={{ padding: 6, gap: 5 }}>
          {VOICE_LANGUAGES.filter((item) => !languageSearch.trim() || item.label.toLocaleLowerCase().includes(languageSearch.trim().toLocaleLowerCase()) || item.code.toLocaleLowerCase().includes(languageSearch.trim().toLocaleLowerCase())).map((item) => {
            const selected = settings.voiceLanguage === item.code;
            return <Pressable key={item.code} onPress={() => { updateSettings({ voiceLanguage: item.code, voiceIdentifier: null }); setLanguageSearch(''); }} accessibilityRole="button" accessibilityState={{ selected }} style={{ minHeight: 42, borderRadius: 9, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: selected ? '800' : '500' }}>{item.label}</Text><Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{item.code}</Text></View>
              {selected ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
            </Pressable>;
          })}
        </ScrollView>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.foreground, marginBottom: 4 }]}>পছন্দের কণ্ঠস্বর · Voice</Text>
        <Text style={[styles.smallNote, { color: colors.mutedForeground, marginTop: 0, marginBottom: 8 }]}>ফোনে ইনস্টল করা TTS voice-গুলো এখানে দেখাবে। ভাষা অনুযায়ী উপলভ্য কণ্ঠস্বর আলাদা হতে পারে।</Text>
        {voiceListLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <ScrollView nestedScrollEnabled style={{ maxHeight: 190, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }} contentContainerStyle={{ padding: 6, gap: 5 }}>
          <Pressable onPress={() => updateSettings({ voiceIdentifier: null })} style={{ minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: settings.voiceIdentifier ? colors.border : colors.primary, backgroundColor: settings.voiceIdentifier ? colors.background : colors.secondary, paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: settings.voiceIdentifier ? '500' : '800' }}>ডিফল্ট / Cloud voice</Text>
          </Pressable>
          {availableVoices.filter((voice) => voice.language.toLowerCase().split(/[-_]/)[0] === settings.voiceLanguage.toLowerCase().split(/[-_]/)[0]).map((voice) => {
            const selected = settings.voiceIdentifier === voice.identifier;
            return <View key={voice.identifier} style={{ minHeight: 48, borderRadius: 9, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => updateSettings({ voiceIdentifier: voice.identifier })} style={{ flex: 1, justifyContent: 'center', minHeight: 42 }}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: selected ? '800' : '500' }}>{voice.name}</Text><Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{voice.language}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`নমুনা শুনুন: ${voice.name}`} onPress={() => { updateSettings({ voiceIdentifier: voice.identifier }); speak(settings.voiceLanguage.startsWith('bn') ? 'হ্যালো, আমি ব্যাডবয়। তোমার কেমন লাগছে?' : 'Hello, I am Badboy. How do you like this voice?', settings.voiceLanguage, {}, voice.identifier); }} style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.primary }}>
                <Feather name="play" size={14} color={colors.primaryForeground} />
              </Pressable>
            </View>;
          })}
          {!voiceListLoading && availableVoices.filter((voice) => voice.language.toLowerCase().split(/[-_]/)[0] === settings.voiceLanguage.toLowerCase().split(/[-_]/)[0]).length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 12, padding: 10 }}>এই ভাষার কোনো installed voice পাওয়া যায়নি। ডিফল্ট voice ব্যবহার হবে। Android-এর Text-to-Speech settings থেকে voice install করতে পারো।</Text> : null}
        </ScrollView>
        <Pressable onPress={() => stopSpeaking()} style={[styles.secondaryButton, { backgroundColor: colors.secondary, marginTop: 8 }]}>
          <Feather name="square" size={13} color={colors.secondaryForeground} /><Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>নমুনা বন্ধ করুন</Text>
        </Pressable>
        <View style={[styles.wakeCard, { backgroundColor: colors.accent }]}>
          <Feather name="shield" size={16} color={colors.accentForeground} />
          <Text style={[styles.wakeText, { color: colors.accentForeground }]}>
            Wake Word চালু করতে Voice Consent, microphone permission এবং সমর্থিত Android build দরকার। Settings-এর সুইচ বন্ধ করলে listener আর শুরু হবে না।
          </Text>
        </View>
      </View>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="layers" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Future Development Roadmap</Text>
        </View>
        <Text style={[styles.body, { color: colors.mutedForeground, marginBottom: 10 }]}>
          এগুলো ভবিষ্যৎ উন্নয়নের জন্য তোমার পছন্দ সংরক্ষণ করবে। সংশ্লিষ্ট ফিচার তৈরি ও সংযুক্ত না হওয়া পর্যন্ত সুইচ অন করলেই ফিচার চালু হবে না।
        </Text>
        {([
          ['webDevelopment', 'Web Development', 'ওয়েব অ্যাপ, API ও Cloudflare উন্নয়ন'],
          ['appDevelopment', 'App Development', 'Android / iOS অ্যাপ ও APK workflow'],
          ['selfDevelopment', 'Self Development', 'Badboy-এর নিজের সক্ষমতা উন্নয়ন'],
          ['autonomousAgent', 'Autonomous Task Manager', 'অনুমোদিত কাজ পরিকল্পনা ও ধাপে ধাপে সম্পাদন'],
          ['projectBrain', 'Project Brain', 'প্রজেক্ট ফাইল, আর্কিটেকচার ও সিদ্ধান্তের জ্ঞানভান্ডার'],
          ['autoQA', 'Auto QA & Testing', 'স্বয়ংক্রিয় পরীক্ষা, bug detection ও validation'],
          ['pluginMarketplace', 'Plugin Marketplace', 'নতুন টুল ও external app সংযোগ'],
          ['providerManager', 'AI Provider Manager', 'একাধিক AI provider, model ও fallback নিয়ন্ত্রণ'],
          ['automationHub', 'Automation Hub', 'রিমাইন্ডার, সময়সূচি ও recurring workflow'],
          ['releaseRecovery', 'Release & Recovery', 'Preview, release, rollback ও recovery workflow'],
          ['integrations', 'App Integrations', 'Telegram এবং ভবিষ্যতের app integrations'],
          ['localMemoryControls', 'Advanced Memory', 'মেমোরি review, edit, export ও delete controls'],
        ] as const).map(([key, title, subtitle]) => (
          <SettingSwitch
            key={key}
            colors={colors}
            title={title}
            subtitle={subtitle}
            value={settings.roadmap[key]}
            onValueChange={(value) => updateSettings({ roadmap: { ...settings.roadmap, [key]: value } })}
          />
        ))}
      </View>

      <View style={[styles.section, sectionCard]}>
        <View style={styles.sectionTitleRow}>
          <Feather name="send" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Telegram bot</Text>
        </View>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          নিজের bot token দিন। Token এই ফোনের Secure Storage-এ থাকবে। এটি bot-এর DM সমর্থন করে—ব্যক্তিগত Telegram chat পড়ে না।
        </Text>
        {telegramConnected ? (
          <>
            <View style={[styles.connectedPill, { backgroundColor: colors.secondary }]}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={{ color: colors.secondaryForeground, fontSize: 13, fontWeight: '600' }}>
                সংযুক্ত {botUsername ? `· @${botUsername}` : '· এই ডিভাইসে'}
              </Text>
            </View>
            <Pressable
              onPress={() => void refreshTelegram()}
              disabled={telegramBusy}
              style={[styles.secondaryButton, { backgroundColor: colors.secondary, marginTop: 12 }]}
            >
              {telegramBusy ? <ActivityIndicator size="small" color={colors.secondaryForeground} /> : <Feather name="inbox" size={16} color={colors.secondaryForeground} />}
              <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>Inbox দেখুন</Text>
            </Pressable>
            <Text style={[styles.smallNote, { color: colors.mutedForeground }]}>
              প্রথমে Telegram-এ আপনার bot-কে /start পাঠান। নতুন বার্তা শুধু আপনি “Inbox দেখুন” চাপলে আনা হবে।
            </Text>
            {telegramItems.map((item) => (
              <View key={item.id} style={[styles.telegramItem, { borderColor: colors.border }]}>
                <Text style={[styles.messageSender, { color: colors.foreground }]}>{item.sender}</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }]}>{item.text}</Text>
              </View>
            ))}
            <TextInput
              value={telegramMessage}
              onChangeText={setTelegramMessage}
              placeholder="Bot-এ বার্তা লিখুন"
              placeholderTextColor={colors.mutedForeground}
              maxLength={4000}
              style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input }]}
            />
            <Pressable
              onPress={sendTelegram}
              disabled={!telegramMessage.trim() || telegramBusy}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !telegramMessage.trim() || telegramBusy ? 0.5 : 1 }]}
            >
              <Feather name="send" size={15} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>অনুমতি দিয়ে পাঠান</Text>
            </Pressable>
            <Pressable onPress={disconnectBot} style={styles.textButton}>
              <Text style={{ color: colors.destructive, fontWeight: '600' }}>Bot বিচ্ছিন্ন করুন</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={botTokenDraft}
              onChangeText={setBotTokenDraft}
              placeholder="Bot token"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.telegramInput, { color: colors.foreground, borderColor: colors.input }]}
              accessibilityLabel="Telegram bot token"
            />
            <Pressable
              onPress={connectBot}
              disabled={!botTokenDraft.trim() || telegramBusy}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !botTokenDraft.trim() || telegramBusy ? 0.5 : 1 }]}
            >
              {telegramBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="link" size={15} color={colors.primaryForeground} />}
              <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Bot সংযোগ করুন</Text>
            </Pressable>
          </>
        )}
        {telegramError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{telegramError}</Text> : null}
      </View>

      <Pressable
        onPress={() => Alert.alert('চ্যাট ইতিহাস মুছবেন?', 'এই ফোনে সংরক্ষিত সব chat history মুছে যাবে।', [
          { text: 'বাতিল', style: 'cancel' },
          { text: 'মুছুন', style: 'destructive', onPress: () => void clearChat() },
        ])}
        style={[styles.dangerButton, { borderColor: colors.border }]}
      >
        <Feather name="trash-2" size={16} color={colors.destructive} />
        <Text style={{ color: colors.destructive, fontWeight: '700' }}>চ্যাট ইতিহাস মুছুন</Text>
      </Pressable>

      <Pressable
        onPress={() => Alert.alert('Owner Login থেকে বের হবেন?', 'আবার Badboy ব্যবহার করতে Owner Token দিতে হবে। ফোনের Chat History ও Memory মুছবে না।', [
          { text: 'বাতিল', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
        ])}
        style={[styles.dangerButton, { borderColor: colors.border }]}
      >
        <Feather name="log-out" size={16} color={colors.destructive} />
        <Text style={{ color: colors.destructive, fontWeight: '700' }}>Owner Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettingSwitch({
  colors,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  colors: ReturnType<typeof useColors>;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={[styles.label, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.card}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 13 },
  brandHeader: { minHeight: 68, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 5 },
  brandMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  brandCopy: { flex: 1, gap: 3 },
  brandName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  brandCaption: { fontSize: 12 },
  settingsPill: { width: 34, height: 34, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 1 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: -7 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: -5, marginBottom: 7 },
  section: { borderWidth: 1, borderRadius: 20, padding: 15 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5 },
  switchCopy: { flex: 1, gap: 4 },
  label: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  rule: { height: 1, marginVertical: 12 },
  personalityInput: { borderWidth: 1, borderRadius: 15, minHeight: 90, marginTop: 9, padding: 11, textAlignVertical: 'top', fontSize: 14, lineHeight: 20 },
  secondaryButton: { minHeight: 43, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  smallNote: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  wakeCard: { flexDirection: 'row', gap: 9, borderRadius: 13, padding: 11, marginTop: 13 },
  wakeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  connectedPill: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  telegramInput: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, marginTop: 4, fontSize: 14 },
  primaryButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  textButton: { alignSelf: 'center', padding: 8, marginTop: 2 },
  telegramItem: { borderBottomWidth: 1, paddingVertical: 10 },
  messageSender: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  errorText: { fontSize: 12, lineHeight: 18, marginTop: 9 },
  dangerButton: { borderWidth: 1, borderRadius: 15, minHeight: 46, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  tabButtonHorizontal: { paddingHorizontal: 12, height: 34, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 12, fontWeight: '700' },
  categoryPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  planCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 },
  planTitle: { fontSize: 15, fontWeight: '700' },
  infoCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10 },
  prSuccessCard: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  logBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10, gap: 4 },
  logText: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  historyItem: { borderBottomWidth: 1, paddingVertical: 8, gap: 2 },
});
