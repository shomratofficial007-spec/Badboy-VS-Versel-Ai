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
}

export const DEFAULT_SETTINGS: AssistantSettings = {
  theme: 'badboy',
  onlineAI: true,
  personality: 'Warm, thoughtful, clear, and practical. Always reply in Bangla (Bengali).',
  autoImprove: true,
  developerMode: false,
  voiceProcessingConsent: false,
};
