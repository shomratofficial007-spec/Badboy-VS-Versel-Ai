import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
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
import { VOICE_LANGUAGES, getAvailableSpeechVoices, removeVoiceForLanguage, selectVoiceForLanguage, speak, stopSpeaking, type AvailableSpeechVoice } from '@/lib/assistant/voice';
import { streamDeveloperAnalysis, streamReply } from '@/lib/assistant/api';
import {
  addDeveloperProjectMemory,
  deleteDeveloperProjectMemory,
  getDeveloperAgentPrompt,
  listDeveloperProjectMemory,
  listDeveloperProjects,
  listDeveloperTasks,
  saveDeveloperProject,
  type DeveloperProjectMemoryRecord,
  type DeveloperProjectRecord,
  type DeveloperTaskRecord,
} from '@/lib/assistant/developerData';
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
  PBResult,
  PluginTree,
  ProjectRate,
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
  const { settings, updateSettings, clearChat, expertReviewDraft, clearExpertReviewDraft } =
    useAssistant();
  const { signOut } = useOwnerAuth();
  const [personalityDraft, setPersonalityDraft] = useState(settings.personality);
  const [botTokenDraft, setBotTokenDraft] = useState('');
  const [githubTokenDraft, setGithubTokenDraft] = useState('');
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramItems, setTelegramItems] = useState<LocalTelegramMessage[]>([]);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [languageSearch, setLanguageSearch] = useState('');
  const [availableVoices, setAvailableVoices] = useState<AvailableSpeechVoice[]>([]);
  const [voiceListLoading, setVoiceListLoading] = useState(false);

  // Agent Execution System Status
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentResult, setAgentResult] = useState<AgentExecutionResult | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);

  // Developer Control Center States
  const [activeDevTab, setActiveDevTab] = useState<ModuleCategory>('self');
  const [githubToken, setGitHubToken] = useState('');
  const [featureRequestInput, setFeatureRequestInput] = useState('');
  const [currentPlan, setCurrentPlan] = useState<DevPlan | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [devStatusLog, setDevStatusLog] = useState<string[]>([]);
  const [qaResult, setQAResult] = useState<QAResult | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const [devHistory, setDevHistory] = useState<DeveloperTaskRecord[]>([]);

  // QA & Inspection
  const [projectRate, setProjectRate] = useState<ProjectRate | null>(null);
  const [plugins, setPlugins] = useState<PluginTree[]>([]);
  const [expertReviewInput, setExpertReviewInput] = useState('');
  const [expertReviewReport, setExpertReviewReport] = useState('');
  const [expertReviewEvidence, setExpertReviewEvidence] = useState<RepositoryEvidence | null>(null);
  const [expertReviewBusy, setExpertReviewBusy] = useState(false);
  const [expertReviewError, setExpertReviewError] = useState<string | null>(null);
  const [developerAnalysisPrompt, setDeveloperAnalysisPrompt] = useState('');
  const [developerAnalysisReport, setDeveloperAnalysisReport] = useState('');
  const [developerAnalysisError, setDeveloperAnalysisError] = useState<string | null>(null);
  const [developerAnalysisBusy, setDeveloperAnalysisBusy] = useState(false);
  const [developerAnalysisEngine, setDeveloperAnalysisEngine] = useState<DeveloperEngineMode>('native');
  const [developerAnalysisFallback, setDeveloperAnalysisFallback] = useState('');
  const [developerAnalysisTaskId, setDeveloperAnalysisTaskId] = useState('');
  const [developerTasks, setDeveloperTasks] = useState<DeveloperTaskRecord[]>([]);
  const [developerProjects, setDeveloperProjects] = useState<DeveloperProjectRecord[]>([]);
  const [selectedDeveloperProjectId, setSelectedDeveloperProjectId] = useState<string>('');
  const [developerMemories, setDeveloperMemories] = useState<DeveloperProjectMemoryRecord[]>([]);
  const [developerMemoryDraft, setDeveloperMemoryDraft] = useState('');
  const [developerDataBusy, setDeveloperDataBusy] = useState(false);
  const [developerDataError, setDeveloperDataError] = useState<string | null>(null);

  const refreshDeveloperTasks = async () => {
    try {
      setDeveloperTasks(await listDeveloperTasks());
    } catch (cause) {
      setDeveloperDataError(cause instanceof Error ? cause.message : 'Developer task history fetch failed');
    }
  };

  const refreshDeveloperProjects = async () => {
    try {
      const projects = await listDeveloperProjects();
      setDeveloperProjects(projects);
      if (selectedDeveloperProjectId && projects[0]) {
        setSelectedDeveloperProjectId(projects[0].project_id);
      }
    } catch (cause) {
      setDeveloperDataError(cause instanceof Error ? cause.message : 'Project list fetch failed');
    }
  };

  const handleSaveProjectRate = async () => {
    if (!projectRate || developerDataBusy) return;
    setDeveloperDataBusy(true);
    setDeveloperDataError(null);
    try {
      const project = await saveDeveloperProject({
        projectKey: 'badboy-main',
        name: projectRate.name,
        summary: [
          projectRate.architecture,
          ...projectRate.frameworks,
          ...projectRate.apiPatterns,
          ...projectRate.knownMitigations,
        ].join('\n').slice(0, 4000),
      });
      setSelectedDeveloperProjectId(project.project_id);
      await refreshDeveloperProjects();
    } catch (cause) {
      setDeveloperDataError(cause instanceof Error ? cause.message : 'Project state save failed');
    } finally {
      setDeveloperDataBusy(false);
    }
  };

  const handleAddDeveloperMemory = async () => {
    if (!selectedDeveloperProjectId || !developerMemoryDraft.trim() || developerDataBusy) return;
    setDeveloperDataBusy(true);
    setDeveloperDataError(null);
    try {
      await addDeveloperProjectMemory({
        projectId: selectedDeveloperProjectId,
        category: 'project-note',
        content: developerMemoryDraft.trim(),
        source: 'owner',
        privacyLevel: 'private',
      });
      setDeveloperMemoryDraft('');
      setDeveloperMemories(await listDeveloperProjectMemory(selectedDeveloperProjectId));
    } catch (cause) {
      setDeveloperDataError(cause instanceof Error ? cause.message : 'Private project memory save failed');
    } finally {
      setDeveloperDataBusy(false);
    }
  };

  const handleDeleteDeveloperMemory = async (memoryId: string) => {
    if (developerDataBusy) return;
    setDeveloperDataBusy(true);
    setDeveloperDataError(null);
    try {
      await deleteDeveloperProjectMemory(memoryId);
      setDeveloperMemories((previous) => previous.filter((item) => item.memory_id !== memoryId));
    } catch (cause) {
      setDeveloperDataError(cause instanceof Error ? cause.message : 'Project memory delete failed');
    } finally {
      setDeveloperDataBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    setVoiceListLoading(true);

    void getAvailableSpeechVoices()
      .then((voices) => {
        if (active) setAvailableVoices(voices);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setVoiceListLoading(false);
      });

    void hasTelegramBot()
      .then((connected) => {
        if (active) setTelegramConnected(connected);
      })
      .catch(() => {
        if (active) setTelegramError('Telegram connection failed');
      });

    void getGitHubToken()
      .then((token) => {
        if (active && token) {
          setGitHubToken(token);
        }
      })
      .catch(() => {});

    setProjectBrain(getProjectBrainSummary());
    setQAResult(runAutoQASuite());
    setPlugins(getPluginRegistryStatus());

    void listDeveloperTasks()
      .then((tasks) => {
        if (active) setDeveloperTasks(tasks);
      })
      .catch(() => {});

    void listDeveloperProjects()
      .then((projects) => {
        if (active && projects[0]) {
          setDeveloperProjects(projects);
          setSelectedDeveloperProjectId((current) => current || projects[0].project_id);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedDeveloperProjectId) return;
    let active = true;
    void listDeveloperProjectMemory(selectedDeveloperProjectId)
      .then((memories) => {
        if (active) setDeveloperMemories(memories);
      })
      .catch((cause) => {
        if (active) setDeveloperDataError(cause instanceof Error ? cause.message : 'Project memory load failed');
      });
    return () => {
      active = false;
    };
  }, [selectedDeveloperProjectId]);

  useEffect(() => {
    if (expertReviewDraft.trim()) {
      setExpertReviewInput(expertReviewDraft);
      setExpertReviewReport('');
      clearExpertReviewDraft();
    }
  }, [expertReviewDraft]);

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
      if (!report.trim()) throw new Error('No report received from model');
    } catch (cause) {
      setExpertReviewError(cause instanceof Error ? cause.message : 'Expert review failed');
    } finally {
      setExpertReviewBusy(false);
    }
  };

  const handleDeveloperAnalysis = async (engineOverride?: DeveloperEngineMode) => {
    const prompt = developerAnalysisPrompt.trim();
    if (!prompt || developerAnalysisBusy || !settings.onlineAI) return;

    const requestedEngine = engineOverride || developerAnalysisEngine;
    const resolution = resolveDeveloperEngine(requestedEngine, false);
    setDeveloperAnalysisError(null);
    setDeveloperAnalysisReport('');
    setDeveloperAnalysisTaskId('');
    setDeveloperAnalysisFallback(resolution.reason || '');

    if (resolution.status === 'unavailable') {
      setDeveloperAnalysisError(resolution.reason || 'Copilot SDK runtime unavailable');
      return;
    }

    setDeveloperAnalysisBusy(true);
    try {
      const brain = getProjectBrainSummary();
      const projectMemories = selectedDeveloperProjectId
        ? await listDeveloperProjectMemory(selectedDeveloperProjectId)
        : [];
      const analysisContext = {
        brain,
        developerAgentProjectId: selectedDeveloperProjectId || null,
        privateProjectNotes: getAnalysisProjectNotes(projectMemories),
      };
      let report = '';
      const result = await streamDeveloperAnalysis(
        prompt,
        JSON.stringify(analysisContext, null, 2),
        requestedEngine,
        (chunk) => {
          report += chunk;
          setDeveloperAnalysisReport(report);
        }
      );
      setDeveloperAnalysisTaskId(result.taskId || '');
      if (!report.trim()) throw new Error('No report received');
    } catch (cause) {
      setDeveloperAnalysisError(
        cause instanceof Error ? cause.message : 'Developer agent analysis failed'
      );
    } finally {
      setDeveloperAnalysisBusy(false);
      void refreshDeveloperTasks();
    }
  };

  const handleShareExpertReport = async () => {
    if (!expertReviewReport.trim()) return;
    try {
      await Share.share({ title: 'Badboy Expert Review', message: expertReviewReport });
    } catch {
      setExpertReviewError('Share failed');
    }
  };

  const handleRunAgentTask = async (overridePrompt?: string, userConfirmed: boolean = false) => {
    const prompt = (overridePrompt || agentPrompt).trim();
    if (!prompt || agentBusy) return;
    setAgentBusy(true);
    try {
      const res = await executeAgentTask(prompt, settings.onlineAI, userConfirmed);
      setAgentResult(res);
      if (res.state === 'completed' && (res.outputData?.action === 'open youtube search' || res.outputData?.action === 'open youtube')) {
        const query = encodeURIComponent(String(res.outputData.query || prompt));
        void Linking.openURL(`https://www.youtube.com/results?search_query=${query}`).catch(() => {});
      }
    } catch {
      // Ignore err
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSaveGitHubToken = async () => {
    const val = githubTokenDraft.trim();
    if (!val) return;
    await saveGitHubToken(val);
    setGitHubToken(val);
    setGithubTokenDraft('');
    Alert.alert('সফল', 'GitHub Personal Access Token সফলভাবে সংরক্ষণ করা হয়েছে।');
  };

  const handleRemoveGitHubToken = async () => {
    await removeGitHubToken();
    setGitHubToken('');
    Alert.alert('মুছে ফেলা হয়েছে', 'GitHub টোকেন সরিয়ে ফেলা হয়েছে।');
  };

  const handleCreatePlan = () => {
    const prompt = featureRequestInput.trim();
    if (!prompt) return;
    setDevError(null);
    setDevResult(null);
    const plan = generateDevelopmentPlan(prompt);
    setCurrentPlan(plan);
    setActiveDevTab(plan.category);
    setDevStatusLog((prev) => [...prev, `[${new Date().toTimeString().slice(0, 8)}] পরিকল্পনা প্রস্তুত (${plan.category.toUpperCase()}): ${plan.title}`]);
  };

  const handleExecutePlanAndPR = async () => {
    if (!currentPlan) return;
    if (!githubToken) {
      setDevError('GitHub Personal Access Token প্রদান করুন (উপরে সেভ করুন)');
      return;
    }

    Alert.alert(
      'ডেভলপমেন্ট অটোমেশন শুরু করবেন?',
      `ব্রাঞ্চ: ${currentPlan.branchName} এর জন্য GitHub PR তৈরি করা হবে। আপনি কি নিশ্চিত?`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'হ্যাঁ, শুরু করুন',
          onPress: async () => {
            setDevBusy(true);
            setDevError(null);
            setDevStatusLog((prev) => [...prev, `[${new Date().toTimeString().slice(0, 8)}] কাজ শুরু ও ব্রাঞ্চ তৈরি চলছে...`]);

            try {
              const res = await createGitHubPullRequest({
                githubToken,
                plan: currentPlan,
              });

              setPRResult(res);
              if (res.logs && res.logs.length) {
                setDevStatusLog((prev) => [...prev, ...res.logs]);
              }

              if (res.success) {
                setDevHistory((prev) => [{ plan: currentPlan, prUrl: res.prUrl, date: new Date().toLocaleTimeString() }, ...prev]);
              } else {
                setDevError(res.error || 'Pull request তৈরি করা ব্যর্থ হয়েছে');
              }
            } catch (err) {
              setDevError(err instanceof Error ? err.message : 'অজানা ত্রুটি ঘটেছে');
            } finally {
              setDevBusy(false);
            }
          }
        }
      ]
    );
  };

  const connectBot = () => {
    const token = botTokenDraft.trim();
    if (!token || telegramBusy) return;
    Alert.alert(
      'Telegram bot সংযোগ করবেন?',
      'এই টোকেন দ্বারা bot token যুক্ত হবে।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'সংযুক্ত করুন',
          onPress: () => {
            setTelegramBusy(true);
            setTelegramError(null);
            void connectTelegramBot(token)
              .then((bot) => {
                setTelegramConnected(true);
                setBotUsername(bot.username);
                setBotTokenDraft('');
              })
              .catch((cause) => setTelegramError(cause instanceof Error ? cause.message : 'Bot connect failed'))
              .finally(() => setTelegramBusy(false));
          }
        }
      ]
    );
  };

  const disconnectBot = () => {
    Alert.alert(
      'Telegram সংযোগ বিচ্ছিন্ন করবেন?',
      'এই থেকে bot token মুছে যাবে।',
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
            }).catch(() => setTelegramError('Bot token মুছতে সমস্যা হয়েছে'));
          }
        }
      ]
    );
  };

  const refreshTelegram = async () => {
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const messages = await checkTelegramMessages();
      if (messages.length) setTelegramItems((previous) => [...messages, ...previous.slice(0, 12)]);
      else setTelegramError('নতুন কোনো বার্তা নেই / /start পাঠিয়ে আবার দেখুন');
    } catch (cause) {
      setTelegramError(cause instanceof Error ? cause.message : 'Telegram inbox খোলা যায়নি');
    } finally {
      setTelegramBusy(false);
    }
  };

  const sendTelegram = () => {};

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Settings & Dev Center</Text>
    </ScrollView>
  );
}
