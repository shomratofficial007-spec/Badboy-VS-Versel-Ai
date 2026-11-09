import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS } from './types';

test('default assistant settings preserve Badboy identity, Bangla voice and privacy-safe defaults', () => {
  assert.equal(DEFAULT_SETTINGS.theme, 'badboy');
  assert.equal(DEFAULT_SETTINGS.voiceLanguage, 'bn-BD');
  assert.equal(DEFAULT_SETTINGS.onlineAI, true);
  assert.equal(DEFAULT_SETTINGS.developerMode, false);
  assert.equal(DEFAULT_SETTINGS.developerEngine, 'native');
  assert.equal(DEFAULT_SETTINGS.voiceProcessingConsent, false);
  assert.equal(DEFAULT_SETTINGS.voiceInputEnabled, true);
  assert.equal(DEFAULT_SETTINGS.voiceOutputEnabled, true);
  assert.equal(DEFAULT_SETTINGS.autoSpeakReplies, false);
  assert.equal(DEFAULT_SETTINGS.wakeWordEnabled, true);
  assert.equal(DEFAULT_SETTINGS.autoSubmitVoice, true);
  assert.equal(DEFAULT_SETTINGS.voiceIdentifier, null);
});

test('default roadmap keeps all planned Badboy capabilities explicitly enabled', () => {
  assert.deepEqual(DEFAULT_SETTINGS.roadmap, {
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
  });
});
