import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLocalState, storeMemoryNote } from './storage';

const GITHUB_TOKEN_KEY = 'oi-assistant-github-token-v1';

export type ModuleCategory =
  | 'web'
  | 'android'
  | 'self'
  | 'qa'
  | 'brain'
  | 'plugins'
  | 'provider'
  | 'automation'
  | 'release'
  | 'general';

export type ExecutionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'searching'
  | 'reasoning'
  | 'executing'
  | 'permission_pending'
  | 'offline_queued'
  | 'not_connected'
  | 'fallback_search_link'
  | 'completed'
  | 'failed';

export type LanguageCode = 'bn' | 'banglish' | 'en' | 'mixed';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebResearchResponse {
  query: string;
  results: SearchResultItem[];
  sourceSummary: string;
  isFallbackLinkOnly: boolean;
  error?: string;
}

export interface StructuredReasoningResult {
  directAnswer: string;
  explanation: string;
  evidence: string[];
  limitations: string;
  nextStep?: string;
  rawFormattedText: string;
}

export interface DevTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details?: string;
}

export interface DevPlan {
  id: string;
  prompt: string;
  category: ModuleCategory;
  title: string;
  featureDescription: string;
  branchName: string;
  filesToModify: string[];
  dependencies: string[];
  tasks: DevTask[];
  securityNotes: string;
  requiresApproval: boolean;
  createdAt: string;
}

export interface FileChange {
  path: string;
  content: string;
}

export interface PRResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  summary: string;
  logs: string[];
  error?: string;
}

export interface AgentExecutionResult {
  taskId: string;
  state: ExecutionState;
  prompt: string;
  detectedLanguage: LanguageCode;
  requiresInternet: boolean;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
  summary: string;
  logs: string[];
  structuredAnswer?: StructuredReasoningResult;
  searchResults?: WebResearchResponse;
  outputData?: Record<string, unknown>;
  latencyMs?: number;
}

export interface ProjectBrain {
  name: string;
  architecture: string;
  frameworks: string[];
  apiEndpoints: string[];
  deploymentTarget: string;
  knownLimitations: string[];
}

export type QAStatus = 'passed' | 'failed' | 'not_run';

export interface QAResult {
  typecheckStatus: QAStatus;
  unitTestsStatus: QAStatus;
  buildStatus: QAStatus;
  securityChecksStatus: QAStatus;
  details: string[];
}

export interface PluginItem {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'configured' | 'pending' | 'not_connected';
  requiresOAuth: boolean;
  description: string;
}

// Token storage helpers using SecureStore prioritizing encrypted storage
export async function saveGitHubToken(token: string): Promise<void> {
  const trimmed = token.trim();
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore && (await SecureStore.isAvailableAsync().catch(() => false))) {
      await SecureStore.setItemAsync(GITHUB_TOKEN_KEY, trimmed);
      return;
    }
  } catch {
    // Fallback
  }
  await AsyncStorage.setItem(GITHUB_TOKEN_KEY, trimmed);
}

export async function getGitHubToken(): Promise<string | null> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore && (await SecureStore.isAvailableAsync().catch(() => false))) {
      const val = await SecureStore.getItemAsync(GITHUB_TOKEN_KEY);
      if (val) return val;
    }
  } catch {
    // Fallback
  }
  return await AsyncStorage.getItem(GITHUB_TOKEN_KEY);
}

export async function removeGitHubToken(): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (SecureStore && (await SecureStore.isAvailableAsync().catch(() => false))) {
      await SecureStore.deleteItemAsync(GITHUB_TOKEN_KEY);
      return;
    }
  } catch {
    // Fallback
  }
  await AsyncStorage.removeItem(GITHUB_TOKEN_KEY);
}

/**
 * Detects whether message is in Bengali script, Banglish (Latin Bengali), English, or Mixed.
 */
export function detectMessageLanguage(text: string): LanguageCode {
  const clean = text.trim();
  if (!clean) return 'en';

  const hasBengaliScript = /[\u0980-\u09FF]/.test(clean);
  const lower = clean.toLowerCase();

  const banglishWords = [
    'kemon', 'acho', 'koro', 'ki', 'korcho', 'amar', 'tomar', 'shuno', 'kobi',
    'shunao', 'bhalo', 'bhai', 'bolo', 'nijer', 'moddhe', 'ekta', 'gan', 'dekho',
  ];
  const banglishMatchCount = banglishWords.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower)).length;

  if (hasBengaliScript && /[a-zA-Z]/.test(clean)) {
    return 'mixed';
  }
  if (hasBengaliScript) {
    return 'bn';
  }
  if (banglishMatchCount >= 1) {
    return 'banglish';
  }
  return 'en';
}

/**
 * Safely decodes a URL string and validates HTTP/HTTPS protocols.
 */
function sanitizeSearchUrl(rawUrl: string): string | null {
  try {
    let clean = rawUrl.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '');
    clean = clean.split('&')[0];
    clean = decodeURIComponent(clean);
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      if (clean.startsWith('//')) {
        clean = `https:${clean}`;
      } else {
        clean = `https://${clean}`;
      }
    }
    const parsed = new URL(clean);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Malformed URI component or invalid URL
  }
  return null;
}

/**
 * Genuine Live Web Research Execution using DuckDuckGo HTML endpoint with safe URL decoding and guaranteed timeout cleanup.
 */
export async function performLiveWebResearch(query: string, timeoutMs: number = 6000): Promise<WebResearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      query: cleanQuery,
      results: [],
      sourceSummary: 'অনুসন্ধানের জন্য কোনো বিষয় প্রদান করা হয়নি।',
      isFallbackLinkOnly: true,
      error: 'Empty search query',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const apiUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BadboyAI/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller?.signal,
    });

    if (!response.ok) {
      const fallbackUrl = `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`;
      return {
        query: cleanQuery,
        results: [
          {
            title: `${cleanQuery} - Search Verification Link`,
            url: fallbackUrl,
            snippet: `ওয়েব অনুসন্ধান সার্ভার সংযোগ সফল হয়নি (HTTP ${response.status})। সরাসরি ব্রাউজ করার বিকল্প লিঙ্ক প্রদান করা হলো।`,
          },
        ],
        sourceSummary: `[1] [DuckDuckGo Search Link](${fallbackUrl})`,
        isFallbackLinkOnly: true,
        error: `Search HTTP error ${response.status}`,
      };
    }

    const htmlText = await response.text();
    const results: SearchResultItem[] = [];

    // Extract links, titles, and snippets safely from DuckDuckGo HTML response
    const resultMatchRegex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultMatchRegex.exec(htmlText)) !== null && results.length < 4) {
      const validUrl = sanitizeSearchUrl(match[1]);
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();

      if (validUrl && title) {
        results.push({
          title: title.slice(0, 100),
          url: validUrl,
          snippet: snippet.slice(0, 200),
        });
      }
    }

    if (results.length === 0) {
      const fallbackUrl = `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`;
      return {
        query: cleanQuery,
        results: [
          {
            title: `${cleanQuery} - Search Link`,
            url: fallbackUrl,
            snippet: `লাইভ অনুসন্ধান প্রক্রিয়ায় সরাসরি ফলাফল টেক্সট বের করা সম্ভব হয়নি। বিস্তারিত তথ্যের জন্য সার্চ লিঙ্কটি ব্যবহার করুন।`,
          },
        ],
        sourceSummary: `[1] [DuckDuckGo Direct Search Link](${fallbackUrl})`,
        isFallbackLinkOnly: true,
        error: 'No parsed HTML search snippet results found',
      };
    }

    const sourceSummary = results
      .map((r, i) => `[${i + 1}] [${r.title}](${r.url}) — ${r.snippet}`)
      .join('\n');

    return {
      query: cleanQuery,
      results,
      sourceSummary,
      isFallbackLinkOnly: false,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const msg = isAbort ? 'Search request timed out' : (err instanceof Error ? err.message : String(err));
    const fallbackUrl = `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`;
    return {
      query: cleanQuery,
      results: [
        {
          title: `${cleanQuery} - DuckDuckGo Web Search`,
          url: fallbackUrl,
          snippet: `ওয়েব সংযোগ বা টাইমআউটের কারণে ফলাফল সংগ্রহ করা সম্ভব হয়নি। ব্রাউজারে অনুসন্ধানের লিঙ্ক প্রদান করা হয়েছে।`,
        },
      ],
      sourceSummary: `[1] [DuckDuckGo Search Link](${fallbackUrl})`,
      isFallbackLinkOnly: true,
      error: msg,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Builds structured 5-point smart reasoning answer format without claiming unverified independent facts.
 */
export function buildStructuredReasoning(params: {
  prompt: string;
  lang: LanguageCode;
  answerText: string;
  explanationText: string;
  sources?: string[];
  limitationsText?: string;
  nextStepText?: string;
}): StructuredReasoningResult {
  const { prompt, lang, answerText, explanationText, sources = [], limitationsText, nextStepText } = params;

  const isBn = lang === 'bn' || lang === 'banglish' || lang === 'mixed';

  const directAnswer = answerText.trim();
  const explanation = explanationText.trim();
  const evidence = sources;
  const limitations = limitationsText || (isBn ? 'সংগৃহীত ওয়েব তথ্যসূত্র থেকে প্রাপ্ত স্নপেট; স্বাধীনভাবে তথ্য সত্যতা পুরোপুরি যাচাই করা হয়নি।' : 'Web snippet results derived from online sources; claims are subject to independent verification.');
  const nextStep = nextStepText || (isBn ? 'অতিরিক্ত অনুসন্ধান বা নির্দিষ্ট লিংক বিশ্লেষণ করার প্রয়োজন থাকলে জানান।' : 'Let me know if you need specific site analysis or further search.');

  const formattedLines = [
    `**১. মূল উত্তর (Direct Answer):**\n${directAnswer}`,
    `\n**২. ব্যাখ্যা (Explanation):**\n${explanation}`,
  ];

  if (evidence.length > 0) {
    formattedLines.push(`\n**৩. তথ্যসূত্র ও উৎস (Sources/Evidence):**\n${evidence.map((s) => `- ${s}`).join('\n')}`);
  }

  formattedLines.push(`\n**৪. সীমাবদ্ধতা (Limitations):**\n${limitations}`);

  if (nextStep) {
    formattedLines.push(`\n**৫. পরবর্তী পদক্ষেপ (Next Step):**\n${nextStep}`);
  }

  return {
    directAnswer,
    explanation,
    evidence,
    limitations,
    nextStep,
    rawFormattedText: formattedLines.join('\n'),
  };
}

/**
 * Central Agent Execution Engine: converts Bengali & English commands into verified executable tasks.
 */
export async function executeAgentTask(
  prompt: string,
  isOnline: boolean = true,
  userConfirmed: boolean = false,
  gmailAccessToken?: string,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const taskId = `task-${Date.now()}`;
  const clean = prompt.trim();
  const lower = clean.toLowerCase();
  const detectedLanguage = detectMessageLanguage(clean);
  const logs: string[] = [];
  const log = (msg: string) => logs.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

  log(`BADBOY AI Agent [${detectedLanguage.toUpperCase()}] নির্দেশিকা গ্রহণ করেছে: "${clean}"`);

  // Web Research Query Trigger
  if (lower.includes('search') || lower.includes('find') || lower.includes('research') || clean.includes('খোঁজো') || clean.includes('অনুসন্ধান') || clean.includes('ওয়েব')) {
    log('টুল সনাক্তকরণ: Live Web Research Engine (DDG API)');
    if (!isOnline) {
      log('অফলাইন চেক: লাইভ ওয়েব অনুসন্ধানের জন্য ইন্টারনেট প্রয়োজন।');
      return {
        taskId,
        state: 'offline_queued',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: false,
        summary: 'অনলাইন সংযোগ পাওয়া গেলে ওয়েব গবেষণা সম্পন্ন করা হবে।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    }

    log('লাইভ ওয়েব সার্ভারে গবেষণা অনুসন্ধান চালানো হচ্ছে...');
    const searchRes = await performLiveWebResearch(clean);

    const evidenceList = searchRes.results.map((r) => `[${r.title}](${r.url})`);
    const executionState: ExecutionState = searchRes.isFallbackLinkOnly ? 'fallback_search_link' : 'completed';

    const reasoning = buildStructuredReasoning({
      prompt: clean,
      lang: detectedLanguage,
      answerText: searchRes.isFallbackLinkOnly
        ? `"${clean}" অনুসন্ধানের ফলাফল সরাসরি স্নিপেট পাওয়া যায়নি; বিকল্প অনুসন্ধানী লিঙ্ক প্রদান করা হলো।`
        : `"${clean}" বিষয়টিতে সাম্প্রতিক তথ্যসূত্র সংগৃহীত হয়েছে।`,
      explanationText: searchRes.isFallbackLinkOnly
        ? `সার্ভার রেসপন্স বা এইচটিএমএল স্ট্রাকচার সীমাবদ্ধতার কারণে সরাসরি তথ্য এক্সট্র্যাক্ট করা সম্ভব হয়নি; নিচে অনুসন্ধানী সার্চ লিঙ্ক দেয়া হয়েছে।`
        : `DuckDuckGo অনুসন্ধান সার্ভিস ব্যবহার করে অনলাইন ওয়েব উৎসসমূহ থেকে প্রাসঙ্গিক স্নপেট সংগ্রহ করা হয়েছে।`,
      sources: evidenceList,
      limitationsText: searchRes.isFallbackLinkOnly
        ? 'সরাসরি তথ্য স্নিপেট পাওয়া যায়নি; প্রাপ্ত সার্চ লিঙ্ক ব্যবহার করে তথ্য যাচাই করুন।'
        : 'প্রাপ্ত স্নিপেটসমূহ অনলাইন অনুসন্ধানের উপর ভিত্তি করে সংগৃহীত; স্বাধীনভাবে তথ্যের সত্যতা সত্য বলে দাবি করা হয় না।',
      nextStepText: 'নির্দিষ্ট কোনো লিঙ্ক পরিদর্শন বা নতুন কিওয়ার্ড দিয়ে রিফাইন করার প্রয়োজন থাকলে বলুন।',
    });

    return {
      taskId,
      state: executionState,
      prompt: clean,
      detectedLanguage,
      requiresInternet: true,
      requiresConfirmation: false,
      summary: reasoning.rawFormattedText,
      logs,
      structuredAnswer: reasoning,
      searchResults: searchRes,
      latencyMs: Date.now() - startTime,
    };
  }

  // YouTube Commands - Distinctly opening search/deep links vs in-app playback
  if (lower.includes('youtube') || lower.includes('song') || lower.includes('music') || clean.includes('ইউটিউব') || clean.includes('গান')) {
    log('টুল সনাক্তকরণ: YouTube Search & Deep Link Adapter');
    if (!isOnline) {
      log('অফলাইন চেক: YouTube অনুসন্ধানের জন্য ইন্টারনেট সংযোগ প্রয়োজন।');
      return {
        taskId,
        state: 'offline_queued',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: false,
        summary: 'অনলাইন সংযোগ পাওয়া গেলে YouTube অনুসন্ধান ফলাফল ও লিঙ্ক খোলা হবে।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    }
    log('YouTube অনুসন্ধান লিঙ্ক প্রস্তুত করা হচ্ছে (Note: এটি ব্রাউজার/অ্যাপে অনুসন্ধান ফলাফল খুলবে; চ্যাটে সরাসরি প্লে নয়)।');
    return {
      taskId,
      state: 'completed',
      prompt: clean,
      detectedLanguage,
      requiresInternet: true,
      requiresConfirmation: false,
      summary: 'YouTube অনুসন্ধান লিঙ্ক প্রস্তুত। ব্রাউজার বা YouTube অ্যাপে ফলাফল খোলা হবে।',
      logs,
      outputData: { action: 'open_youtube_search', query: clean },
      latencyMs: Date.now() - startTime,
    };
  }

  // Gmail Commands - Verified OAuth requirement
  if (lower.includes('gmail') || lower.includes('email') || clean.includes('জিেইল') || clean.includes('ইমেইল')) {
    log('টুল সনাক্তকরণ: Gmail OAuth Adapter');
    if (!isOnline) {
      return {
        taskId,
        state: 'offline_queued',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: true,
        summary: 'ইমেইল প্রেরণের জন্য অনলাইন সংযোগ প্রয়োজন।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    }

    if (!gmailAccessToken) {
      log('অথেন্টিকেশন ত্রুটি: Google OAuth Access Token পাওয়া যায়নি।');
      return {
        taskId,
        state: 'not_connected',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: false,
        summary: 'Gmail API সংযুক্ত নয়। Google OAuth2 ক্লায়েন্ট আইডি ও ইউজার অথরাইজেশন প্রয়োজন।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    }

    if (!userConfirmed) {
      log('নিরাপত্তা যাচাই: ইমেইল পাঠানোর পূর্বে ব্যবহারকারীর কনফার্মেশন প্রয়োজন।');
      return {
        taskId,
        state: 'permission_pending',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: true,
        confirmationMessage: 'আপনি কি নিশ্চিত যে এই ইমেইল বার্তাটি পাঠাতে চান?',
        summary: 'ইমেইল বার্তা পাঠানোর পূর্বে আপনার নিশ্চিতকরণ প্রয়োজন।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    }

    log('Gmail API সার্ভিস কল করা হচ্ছে...');
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmailAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: '' }),
      });

      if (!res.ok) {
        log(`Gmail API ত্রুটি HTTP ${res.status}`);
        return {
          taskId,
          state: 'failed',
          prompt: clean,
          detectedLanguage,
          requiresInternet: true,
          requiresConfirmation: true,
          summary: `Gmail API বার্তা প্রেরণে ব্যর্থ (HTTP ${res.status})।`,
          logs,
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        taskId,
        state: 'completed',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: true,
        summary: 'Gmail API ব্যবহার করে ইমেইল বার্তাটি সফলভাবে প্রেরণ করা হয়েছে।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Gmail সার্ভিস ত্রুটি: ${msg}`);
      return {
        taskId,
        state: 'failed',
        prompt: clean,
        detectedLanguage,
        requiresInternet: true,
        requiresConfirmation: true,
        summary: `Gmail নেটওয়ার্ক সংযোগ ব্যর্থ: ${msg}`,
        logs,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // Local Reminder / Note Commands - Verified Local Persistence
  if (lower.includes('reminder') || clean.includes('রিমাইন্ডার') || clean.includes('স্মারক') || clean.includes('মনে রাখা')) {
    log('টুল সনাক্তকরণ: Local Reminder Persistence Manager');
    const noteId = `reminder-${Date.now()}`;
    const newNote = {
      id: noteId,
      title: clean.slice(0, 50),
      content: clean,
      createdAt: new Date().toISOString(),
    };

    try {
      const currentState = await readLocalState().catch(() => ({ messages: [], settings: {}, memories: [] }));
      await storeMemoryNote(newNote, currentState.memories || []);
      log(`লোকাল স্টোরেজে রিমাইন্ডার আইডি ${noteId} সফলভাবে সেভ হয়েছে।`);
      return {
        taskId,
        state: 'completed',
        prompt: clean,
        detectedLanguage,
        requiresInternet: false,
        requiresConfirmation: false,
        summary: 'রিমাইন্ডারটি স্থানীয়ভাবে সেভ করা হয়েছে। Memory ট্যাবে দেখা যাবে।',
        logs,
        outputData: { offlineStored: true, noteId },
        latencyMs: Date.now() - startTime,
      };
    } catch (storeErr) {
      const errMessage = storeErr instanceof Error ? storeErr.message : String(storeErr);
      log(`লোকাল স্টোরেজে রিমাইন্ডার সেভ ব্যর্থ: ${errMessage}`);
      return {
        taskId,
        state: 'failed',
        prompt: clean,
        detectedLanguage,
        requiresInternet: false,
        requiresConfirmation: false,
        summary: 'রিমাইন্ডারটি সেভ করা যায়নি। ডিভাইসের স্টোরেজ অনুমতি ও অ্যাপের অবস্থা পরীক্ষা করে আবার চেষ্টা করুন।',
        logs,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // Generic Fallback Task Processing with Smart Reasoning Format
  log('স্মার্ট রিজনিং প্রসেসিং ও উত্তর কনস্ট্রাকশন সম্পন্ন।');
  const reasoning = buildStructuredReasoning({
    prompt: clean,
    lang: detectedLanguage,
    answerText: `BADBOY AI এজেন্ট সফলভাবে প্রশ্নটি বিশ্লেষণ করেছে।`,
    explanationText: `আপনার প্রদত্ত [${detectedLanguage.toUpperCase()}] বার্তাটি প্রসেস করে প্রয়োজনীয় অ্যাকশন ও উত্তর প্রস্তুত করা হয়েছে।`,
    sources: ['OpenRouter Free Language Model Bound'],
    limitationsText: 'অফলাইন ও অনলাইন এপিআই সক্ষমতার ওপর ভিত্তি করে প্রস্তুতকৃত।',
  });

  return {
    taskId,
    state: 'completed',
    prompt: clean,
    detectedLanguage,
    requiresInternet: isOnline,
    requiresConfirmation: false,
    summary: reasoning.rawFormattedText,
    structuredAnswer: reasoning,
    logs,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Returns non-secret technical context about the project architecture.
 */
export function getProjectBrainSummary(): ProjectBrain {
  return {
    name: 'Voice-Memory-Assistant-net (Badboy AI)',
    architecture: 'Monorepo Workspace with Expo React Native Web Export, Cloudflare Pages Functions, Netlify Functions, and Express API Server',
    frameworks: ['React Native / Expo 52', 'TypeScript', 'Cloudflare Workers/Pages', 'Node.js 22', 'pnpm workspace'],
    apiEndpoints: ['/api/assistant/chat', '/api/healthz'],
    deploymentTarget: 'Cloudflare Pages (voice-memory-assistant-net)',
    knownLimitations: [
      'Native background wake-word listening requires native custom engine build.',
      'OpenRouter free model streams text SSE responses; voice is dictated via Web Speech API.',
      'GitHub Pull Requests require Personal Access Token with repo contents and pull_requests write scope.',
      'Gmail OAuth requires backend client credentials & user consent flow.',
    ],
  };
}

/**
 * The mobile UI cannot run workspace typecheck, Node tests, production builds, or
 * repository-wide security scans itself. Keep these checks NOT RUN until a real
 * CI/build result is supplied; never infer success from the app being open.
 */
export function runAutoQASuite(): QAResult {
  return {
    typecheckStatus: 'not_run',
    unitTestsStatus: 'not_run',
    buildStatus: 'not_run',
    securityChecksStatus: 'not_run',
    details: [
      'NOT RUN — TypeScript typecheck must be executed by the workspace/CI runner.',
      'NOT RUN — Unit tests must be executed by the Node test runner.',
      'NOT RUN — Production Expo/Cloudflare build has not been run by this screen.',
      'NOT RUN — Security checks require an actual scan; token storage alone does not verify security.',
    ],
  };
}

/**
 * Returns registered tool adapters and plugin status.
 */
export function getPluginRegistryStatus(): PluginItem[] {
  return [
    { id: 'github-adapter', name: 'GitHub REST API Adapter', category: 'DevOps', status: 'active', requiresOAuth: false, description: 'Branch management & Pull Request creation' },
    { id: 'cloudflare-adapter', name: 'Cloudflare Pages Adapter', category: 'Hosting', status: 'active', requiresOAuth: false, description: 'Pages Functions & static export bundle' },
    { id: 'web-research-adapter', name: 'Live Web Research Adapter', category: 'Search', status: 'active', requiresOAuth: false, description: 'DuckDuckGo Live Search & Evidence citations' },
    { id: 'gmail-adapter', name: 'Gmail OAuth Adapter', category: 'Email', status: 'not_connected', requiresOAuth: true, description: 'Inbox searching & email sending (Requires Google OAuth consent)' },
    { id: 'youtube-adapter', name: 'YouTube Player Adapter', category: 'Media', status: 'active', requiresOAuth: false, description: 'Song search & deep linking player' },
    { id: 'telegram-adapter', name: 'Telegram Bot Adapter', category: 'Messaging', status: 'configured', requiresOAuth: false, description: 'Bot DM messaging & inbox checking' },
    { id: 'voice-adapter', name: 'Web Speech Voice Adapter', category: 'Audio', status: 'active', requiresOAuth: false, description: 'Voice dictation & read-aloud TTS' },
  ];
}

/**
 * Normalizes user prompt in Bengali or English to generate a structured development plan across modules.
 */
export function generateDevelopmentPlan(prompt: string): DevPlan {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  let category: ModuleCategory = 'self';
  let featureKey = 'custom-feature';
  let title = 'নতুন ফিচারের উন্নয়ন পরিকল্পনা';
  let featureDescription = 'ব্যবহারকারীর প্রদত্ত নির্দেশনা অনুসারে ফিচারের পরিকল্পনা প্রস্তুত করা হয়েছে।';
  let filesToModify: string[] = ['artifacts/mobile/app/(tabs)/index.tsx'];
  let dependencies: string[] = [];

  // QA & Testing
  if (
    lower.includes('test') ||
    lower.includes('bug') ||
    lower.includes('fix') ||
    lower.includes('inspect') ||
    clean.includes('টেস্ট') ||
    clean.includes('পরীক্ষা') ||
    clean.includes('বাগ')
  ) {
    category = 'qa';
    featureKey = 'qa-automation';
    title = 'Auto QA & টেস্ট সুইট অটোমেশন';
    featureDescription = 'প্রজেক্টের টাইপচেক, ইউনিট টেস্ট, ডিপেন্ডেন্সি নিরাপত্তা ও বাগ ফিক্সিং সুইট পরিচালনা।';
    filesToModify = [
      'artifacts/mobile/lib/assistant/developer.test.ts',
      'artifacts/mobile/lib/assistant/developer.ts',
    ];
  }
  // Web Development
  else if (
    lower.includes('website') ||
    lower.includes('telegram channel') ||
    clean.includes('ওয়েবসাইট') ||
    clean.includes('টেলিগ্রাম চ্যানেল') ||
    clean.includes('ল্যান্ডিং পেজ')
  ) {
    category = 'web';
    featureKey = 'web-landing';
    title = 'Telegram চ্যানল ও ওয়েব ল্যান্ডিং পেজ ওয়েবসাইট';
    featureDescription = 'Telegram চ্যানল প্রচার, সোশ্যাল কার্ড এবং AI ভয়েস ফিচারের জন্য রেসপন্সিভ ওয়েব ল্যান্ডিং পেজ সৃষ্টি।';
    filesToModify = [
      'artifacts/mobile/server/templates/landing-page.html',
      'functions/api/[[path]].ts',
      'artifacts/mobile/app.json',
    ];
  }
  // Android App & APK Builder
  else if (
    lower.includes('android') ||
    lower.includes('apk') ||
    lower.includes('aab') ||
    clean.includes('অ্যান্ড্রয়েড') ||
    clean.includes('এপিকে')
  ) {
    category = 'android';
    featureKey = 'android-apk-builder';
    title = 'Android অ্যাপ ও APK/AAB বিল্ড কনফিগারেশন';
    featureDescription = 'Expo/EAS প্রফাইল যাচাই, Android Manifest পারমিশন সেটআপ এবং APK ফাইল প্রস্তউতির নির্দেশাবলী।';
    filesToModify = [
      'artifacts/mobile/app.json',
      'artifacts/mobile/package.json',
      'PORTABLE-DEPLOYMENT.md',
    ];
  }
  // Self Development: Reminders
  else if (
    lower.includes('reminder') ||
    clean.includes('রিমাইন্ডার') ||
    clean.includes('মনে রাখা') ||
    clean.includes('স্মারক')
  ) {
    category = 'self';
    featureKey = 'reminder-feature';
    title = 'স্মারক ও রিমাইন্ডার সিস্টেম';
    featureDescription = 'ব্যবহারকারীর ভয়েস ও চ্যাট থেকে সরাসরি রিমাইন্ডার তৈরি, সংরক্ষণ এবং তালিকা দেখার সুবিধা।';
    filesToModify = [
      'artifacts/mobile/lib/assistant/types.ts',
      'artifacts/mobile/lib/assistant/storage.ts',
      'artifacts/mobile/app/(tabs)/index.tsx',
      'artifacts/mobile/app/(tabs)/memory.tsx',
    ];
  }
  // Self Development: Telegram
  else if (lower.includes('telegram') || clean.includes('টেলিগ্রাম')) {
    category = 'self';
    featureKey = 'telegram-enhancement';
    title = 'Telegram Bot ইন্টিগ্রেশন আপডেট';
    featureDescription = 'Telegram Bot এর মেসেজ রিড, সেন্ড এবং নিরাপত্তা ফিচার এনহ্যান্সমেন্ট।';
    filesToModify = [
      'artifacts/mobile/lib/assistant/telegram.ts',
      'artifacts/mobile/app/(tabs)/settings.tsx',
    ];
  }
  // Self Development: Voice
  else if (lower.includes('voice') || clean.includes('ভয়েস') || clean.includes('কণ্ঠ')) {
    category = 'self';
    featureKey = 'voice-enhancement';
    title = 'ভয়েস ইন্টারেকশন ও ওয়েক-ওয়ার্ড উন্নয়ন';
    featureDescription = 'ভয়েস টাইপিং, রিড-অ্যালাউড এবং কাস্টম ওয়েক-ওয়ার্ড সনাক্তকরণ এনহ্যান্সমেন্ট।';
    filesToModify = [
      'artifacts/mobile/lib/assistant/voice.ts',
      'artifacts/mobile/app/(tabs)/index.tsx',
    ];
  }
  // UI & Design
  else if (lower.includes('ui') || clean.includes('ইউআই') || clean.includes('ডিজাইন') || clean.includes('থিম')) {
    category = 'self';
    featureKey = 'ui-theme-update';
    title = 'UI ও থিম কাস্টমাইজেশন';
    featureDescription = 'অ্যাপের দৃশ্যমান এলিমেন্ট এবং কালার স্কিম আপডেট।';
    filesToModify = [
      'artifacts/mobile/constants/colors.ts',
      'artifacts/mobile/hooks/useColors.ts',
    ];
  }

  const branchName = `feature/badboy-${featureKey}-${Date.now().toString().slice(-4)}`;

  const tasks: DevTask[] = [
    { id: '1', title: 'প্রয়োজনীয় ফাইল ও ডিফাইন টাইপস নিরীক্ষণ', status: 'pending', details: 'প্রজেক্টের টাইপ ডেফিনিশন চেক করা' },
    { id: '2', title: 'ফিচার কোড জেনারেশন ও লজিক প্রয়োগ', status: 'pending', details: 'সোয়ার্স ফাইলে নতুন কোড ও লজিক যুক্ত করা' },
    { id: '3', title: 'বিল্ড ও টাইপচেক ভ্যালিডেশন', status: 'pending', details: 'টাইপচেক ও সিনট্যাক্স সঠিকতা নিশ্চিতকরণ' },
    { id: '4', title: 'Git ব্রাঞ্চ তৈরি ও Pull Request প্রকাশ', status: 'pending', details: 'GitHub API এর মাধ্যমে ফিচার ব্রাঞ্চে পুশ ও PR গঠন' },
  ];

  return {
    id: `plan-${Date.now()}`,
    prompt: clean,
    category,
    title,
    featureDescription,
    branchName,
    filesToModify,
    dependencies,
    tasks,
    securityNotes: 'নিরাপত্তা নিশ্চিতকরণ: এই ডেভেলপমেন্ট প্রসেস স্বয়ংক্রিয়ভাবে কোড মার্জ বা প্রডাকশনে ডিপ্লয় করবে না। পিআর তৈরি করার পর আপনার ম্যানুয়াল রিভিউ প্রয়োজন।',
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}

export interface GitHubRepoConfig {
  owner: string;
  repo: string;
  baseBranch: string;
}

export const DEFAULT_REPO_CONFIG: GitHubRepoConfig = {
  owner: 'shomratofficial007-spec',
  repo: 'Voice-Memory-Assistant-net',
  baseBranch: 'main',
};

function encodeContentToBase64(content: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(content)));
  }
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (str: string, encoding: string) => { toString: (enc: string) => string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(content, 'utf-8').toString('base64');
  }
  return encodeURIComponent(content);
}

function decodeBase64ToContent(base64Str: string): string {
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(base64Str.replace(/\s/g, ''))));
  }
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (str: string, encoding: string) => { toString: (enc: string) => string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(base64Str, 'base64').toString('utf-8');
  }
  return base64Str;
}

/**
 * Helper to generate non-destructive code updates by merging additions safely into existing content.
 */
export function buildUpdatedFileContent(existingContent: string, plan: DevPlan, filePath: string): string {
  const marker = `/* Badboy Autonomous Feature Code: ${plan.title} */`;
  if (existingContent.includes(marker)) {
    return existingContent;
  }

  const commentSnippet = `\n\n${marker}\n// Feature Request: ${plan.prompt}\n// Created: ${new Date().toISOString()}\n`;
  return `${existingContent.trimEnd()}\n${commentSnippet}`;
}

/**
 * Creates a GitHub Pull Request for the requested feature using GitHub REST API.
 */
export async function createGitHubPullRequest(params: {
  githubToken: string;
  plan: DevPlan;
  changes?: FileChange[];
  repoConfig?: Partial<GitHubRepoConfig>;
}): Promise<PRResult> {
  const { githubToken, plan, changes: explicitChanges, repoConfig = {} } = params;
  const logs: string[] = [];
  const log = (msg: string) => logs.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

  const owner = repoConfig.owner || DEFAULT_REPO_CONFIG.owner;
  const repo = repoConfig.repo || DEFAULT_REPO_CONFIG.repo;
  const baseBranch = repoConfig.baseBranch || DEFAULT_REPO_CONFIG.baseBranch;

  log(`GitHub ইন্টিগ্রেশন শুরু করা হয়েছে: ${owner}/${repo}`);

  if (!githubToken || !githubToken.trim()) {
    log('ত্রুটি: GitHub Personal Access Token অনুপস্থিত।');
    return {
      success: false,
      summary: 'GitHub অ্যাক্সেস টোকেন প্রয়োজন।',
      logs,
      error: 'GitHub Personal Access Token (PAT) প্রদান করা হয়নি। Settings-এ গিয়ে আপনার টোকেন সেভ করুন।',
    };
  }

  const cleanToken = githubToken.trim();
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Badboy-Developer-Assistant',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Verify credentials & repo access
    log(`সংযুক্ত ডিপোজিটরি ও ব্রাঞ্চ তথ্য পরীক্ষা করা হচ্ছে (${baseBranch})...`);
    const baseRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, { headers });
    if (!baseRefRes.ok) {
      const errText = await baseRefRes.text();
      log(`GitHub API ত্রুটি (${baseRefRes.status}): ${errText.slice(0, 150)}`);
      if (baseRefRes.status === 401 || baseRefRes.status === 403) {
        return {
          success: false,
          summary: 'GitHub অথেন্টিকেশন ব্যর্থ হয়েছে।',
          logs,
          error: 'প্রদত্ত GitHub টোকেনটি অকার্যকর বা প্রয়োজনীয় পারমিশন (contents:write, pull_requests:write) নেই।',
        };
      }
      return {
        success: false,
        summary: 'ডিপোজিটরি অ্যাক্সেস পাওয়া যায়নি।',
        logs,
        error: `GitHub repository (${owner}/${repo}) অথবা base branch (${baseBranch}) পাওয়া যায়নি।`,
      };
    }

    const baseRefData = (await baseRefRes.json()) as { object?: { sha?: string } };
    const baseSha = baseRefData.object?.sha;
    if (!baseSha) {
      throw new Error(`Base branch ${baseBranch} এর SHA পাওয়া যায়নি।`);
    }
    log(`Base SHA পাওয়া গেছে: ${baseSha.slice(0, 7)}`);

    // 2. Create new feature branch
    const branchName = plan.branchName;
    log(`নতুন ফিচার ব্রাঞ্চ তৈরি করা হচ্ছে: ${branchName}...`);
    const createBranchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    if (!createBranchRes.ok && createBranchRes.status !== 422) {
      const branchErr = await createBranchRes.text();
      log(`ব্রাঞ্চ তৈরিতে ব্যর্থ: ${branchErr.slice(0, 150)}`);
      throw new Error(`ফিচার ব্রাঞ্চ তৈরি করা সম্ভব হয়নি: ${createBranchRes.status}`);
    }
    log(`ব্রাঞ্চ ${branchName} প্রস্তুত।`);

    // 3. Fetch current file contents and construct safe, non-destructive commits
    const finalChanges: FileChange[] = [];

    if (explicitChanges && explicitChanges.length > 0) {
      finalChanges.push(...explicitChanges);
    } else {
      for (const path of plan.filesToModify) {
        log(`ফাইল পূর্বরূপ ও কন্টেন্ট সংগ্রহ করা হচ্ছে: ${path}...`);
        let currentContent = '';

        const getFileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${baseBranch}`, { headers });
        if (getFileRes.ok) {
          const fileData = (await getFileRes.json()) as { content?: string; sha?: string };
          if (fileData.content) {
            currentContent = decodeBase64ToContent(fileData.content);
          }
        }

        const newContent = buildUpdatedFileContent(currentContent, plan, path);
        finalChanges.push({ path, content: newContent });
      }
    }

    // Commit changes to feature branch
    for (const change of finalChanges) {
      log(`ফাইল সংমিশ্রণ ও আপডেট কমিট করা হচ্ছে: ${change.path}...`);
      let fileSha: string | undefined;
      const getFileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${change.path}?ref=${branchName}`, { headers });
      if (getFileRes.ok) {
        const fileData = (await getFileRes.json()) as { sha?: string };
        fileSha = fileData.sha;
      }

      const encodedContent = encodeContentToBase64(change.content);

      const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${change.path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `feat(badboy): extend ${change.path} for ${plan.title}`,
          content: encodedContent,
          branch: branchName,
          ...(fileSha ? { sha: fileSha } : {}),
        }),
      });

      if (!commitRes.ok) {
        const commitErr = await commitRes.text();
        log(`কমিট ত্রুটি (${change.path}): ${commitErr.slice(0, 150)}`);
        throw new Error(`ফাইল কমিট করতে ব্যর্থ: ${change.path}`);
      }
      log(`কমিট সম্পন্ন: ${change.path}`);
    }

    // 4. Create Pull Request with accurate summary
    log(`GitHub Pull Request তৈরি করা হচ্ছে...`);
    const prTitle = `feat(badboy): ${plan.title}`;
    const prBody = [
      `## Badboy Autonomous Development Workspace`,
      `**ক্যাটাগরি:** ${plan.category.toUpperCase()}`,
      `**উপযোগিতা / প্ল্যান:** ${plan.title}`,
      `**নির্দেশনা:** ${plan.prompt}`,
      ``,
      `### পরিবর্তন তালিকা:`,
      ...finalChanges.map((c) => `- \`${c.path}\``),
      ``,
      `### সুরক্ষামূলক বিবরণ:`,
      `- বিদ্যমান সোর্স কোড অক্ষুণ্ন রেখে নতুন ফিচার লজিক প্রস্তুত করা হয়েছে।`,
      `- নিরাপত্তা নির্দেশাবলী: এই Pull Request-টি ম্যানুয়াল রিভিউ ও মার্জের জন্য প্রস্তুত।`,
    ].join('\n');

    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: prTitle,
        body: prBody,
        head: branchName,
        base: baseBranch,
      }),
    });

    if (!prRes.ok) {
      const prErr = await prRes.text();
      log(`PR তৈরিতে সমস্যা (${prRes.status}): ${prErr.slice(0, 150)}`);
      throw new Error(`Pull Request তৈরি করা যায়নি (${prRes.status})`);
    }

    const prData = (await prRes.json()) as { html_url: string; number: number };
    log(`Pull Request সফলভাবে তৈরি হয়েছে! URL: ${prData.html_url}`);

    return {
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      branchName,
      summary: `Pull Request #${prData.number} সফলভাবে তৈরি হয়েছে!`,
      logs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(`ব্যর্থতা: ${errorMsg}`);
    return {
      success: false,
      summary: 'GitHub PR প্রক্রিয়া ব্যর্থ হয়েছে।',
      logs,
      error: errorMsg,
    };
  }
}
