export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  ytUrl?: string;
  ytAppUrl?: string;
}

export interface MemoryNote {
  id: string;
  title: string;
  createdAt: string;
  content: string;
}

export type ThemeName = 'badboy' | 'neon' | 'ocean' | 'purple' | 'emerald' | 'sunset' | 'light';

export interface AssistantSettings {
  theme: ThemeName;
  onlineAI: boolean;
  personality: string;
  autoImprove: boolean;
  developerMode: boolean;
  voiceProcessingConsent: boolean;
  voiceInputEnabled: boolean;
  voiceOutputEnabled: boolean;
  autoSpeakReplies: boolean;
  wakeWordEnabled: boolean;
  autoSubmitVoice: boolean;
  voiceLanguage: 'bn-BD' | 'en-US';
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
  theme: 'badboy',
  onlineAI: true,
  personality: 'Warm, thoughtful, clear, and practical. Always reply in Bangla (Bengali).',
  autoImprove: true,
  developerMode: false,
  voiceProcessingConsent: false,
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  autoSpeakReplies: false,
  wakeWordEnabled: true,
  autoSubmitVoice: true,
  voiceLanguage: 'bn-BD',
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
