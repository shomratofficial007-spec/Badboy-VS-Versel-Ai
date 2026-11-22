export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  ytUrl?: string;
  ytAppUrl?: string;
  attachments?: ChatAttachmentReference[];
}

export interface ChatAttachmentReference {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface MemoryNote {
  id: string;
  title: string;
  createdAt: string;
  content: string;
}

export type DeveloperEngineMode = 'native' | 'copilot' | 'auto';

export type ThemeName = 'badboy' | 'neon' | 'ocean' | 'purple' | 'emerald' | 'sunset' | 'light';

export interface AssistantSettings {
  /** Selected provider; server preserves the existing owner-managed OpenRouter route. */
  aiProvider: 'server' | 'openai' | 'openrouter' | 'gemini' | 'groq' | 'together' | 'cerebras' | 'sambanova' | 'mistral' | 'cloudflare' | 'cohere' | 'nvidia' | 'custom';
  aiModel: string;
  aiBaseUrl: string;
  aiFallbackProvider: 'none' | 'openai' | 'openrouter' | 'gemini' | 'groq' | 'together' | 'cerebras' | 'sambanova' | 'mistral' | 'cloudflare' | 'cohere' | 'nvidia';
  aiFallbackModel: string;
  localOmniRouteEnabled: boolean;
  localOmniRouteBaseUrl: string;
  localOmniRouteModel: string;
  localOmniRouteFallbackEnabled: boolean;
  localOmniRouteFallbackModel: string;
  theme: ThemeName;
  onlineAI: boolean;
  personality: string;
  autoImprove: boolean;
  developerMode: boolean;
  developerEngine: DeveloperEngineMode;
  voiceProcessingConsent: boolean;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  autoSpeakReplies: boolean;
  wakeWordEnabled: boolean;
  floatingAssistantEnabled: boolean;
  autoSubmitVoice: boolean;
  voiceLanguage: string;
  /** Installed device/browser TTS voice; null uses the default/cloud voice. */
  voiceIdentifier?: string | null;
  /** Last selected installed TTS voice for each language family (e.g. en, bn). */
  voiceIdentifiersByLanguage?: Record<string, string>;
  roadmap: {
    webDevelopment: boolean;
    appDevelopment: boolean;
    selfDevelopment: boolean;
    autonomousAgent: boolean;
    projectBrain: boolean;
    autoQA: boolean;
    pluginMarketplace: boolean;
    providerManager: boolean;
    automationHub: boolean;
    releaseRecovery: boolean;
    integrations: boolean;
    localMemoryControls: boolean;
  };
}

export const DEFAULT_SETTINGS: AssistantSettings = {
  aiProvider: 'server',
  aiModel: 'openrouter/free',
  aiBaseUrl: '',
  aiFallbackProvider: 'none',
  aiFallbackModel: '',
  localOmniRouteEnabled: false,
  localOmniRouteBaseUrl: '',
  localOmniRouteModel: '',
  localOmniRouteFallbackEnabled: true,
  localOmniRouteFallbackModel: 'openrouter/free',
  theme: 'badboy',
  onlineAI: true,
  personality: 'Warm, thoughtful, clear, and practical. Always reply in Bangla (Bengali).',
  autoImprove: true,
  developerMode: false,
  developerEngine: 'native',
  voiceProcessingConsent: false,
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  autoSpeakReplies: false,
  wakeWordEnabled: true,
  floatingAssistantEnabled: false,
  autoSubmitVoice: true,
  voiceLanguage: 'bn-BD',
  voiceIdentifier: null,
  roadmap: {
    webDevelopment: true,
    appDevelopment: true,
    selfDevelopment: true,
    autonomousAgent: true,
    projectBrain: true,
    autoQA: true,
    pluginMarketplace: true,
    providerManager: true,
    automationHub: true,
    releaseRecovery: true,
    integrations: true,
    localMemoryControls: true,
  },
};
