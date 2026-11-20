import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let platformOS = 'android';
let nativeCalls: string[] = [];
let overlayPermission = true;
let overlaySettingsOpened = true;
let overlayStarted = true;
let screenAwarenessEnabled = true;
let accessibilitySettingsOpened = true;
let screenText = '  Dashboard  \nDashboard\nAccount status  ';
let nativeModuleAvailable = true;

const nativeModule = {
  canDrawOverlays: () => { nativeCalls.push('canDrawOverlays'); return overlayPermission; },
  openOverlayPermissionSettings: async () => { nativeCalls.push('openOverlayPermissionSettings'); return overlaySettingsOpened; },
  startFloatingAssistant: async () => { nativeCalls.push('startFloatingAssistant'); return overlayStarted; },
  stopFloatingAssistant: async () => { nativeCalls.push('stopFloatingAssistant'); return true; },
  isAccessibilityEnabled: () => { nativeCalls.push('isAccessibilityEnabled'); return screenAwarenessEnabled; },
  openAccessibilitySettings: async () => { nativeCalls.push('openAccessibilitySettings'); return accessibilitySettingsOpened; },
  readVisibleScreenText: async () => { nativeCalls.push('readVisibleScreenText'); return screenText; },
};

mock.module('react-native', {
  namedExports: { Platform: { get OS() { return platformOS; } } },
});
mock.module('expo-modules-core', {
  namedExports: {
    requireNativeModule: (name: string) => {
      if (!nativeModuleAvailable) throw new Error('Native module unavailable');
      if (name !== 'BadboyJarvis') throw new Error('Unexpected native module');
      return nativeModule;
    },
  },
});

const jarvisPromise = import('./jarvis');

test('floating assistant permission checks are Android-only and fail closed when native access is unavailable', async () => {
  const jarvis = await jarvisPromise;
  platformOS = 'android';
  overlayPermission = true;
  nativeModuleAvailable = true;
  assert.equal(jarvis.canDrawFloatingAssistant(), true);

  overlayPermission = false;
  assert.equal(jarvis.canDrawFloatingAssistant(), false);

  platformOS = 'ios';
  assert.equal(jarvis.canDrawFloatingAssistant(), false);
  platformOS = 'android';
  nativeModuleAvailable = false;
  assert.equal(jarvis.canDrawFloatingAssistant(), false);
  nativeModuleAvailable = true;
});

test('overlay permission settings report failure and start requires granted permission', async () => {
  const jarvis = await jarvisPromise;
  platformOS = 'android';
  overlaySettingsOpened = false;
  await assert.rejects(jarvis.openFloatingAssistantPermissionSettings(), /permission settings could not be opened/);
  overlaySettingsOpened = true;
  await jarvis.openFloatingAssistantPermissionSettings();

  overlayPermission = false;
  await assert.rejects(jarvis.startFloatingAssistant(), /Display over other apps permission/);
  overlayPermission = true;
  overlayStarted = false;
  await assert.rejects(jarvis.startFloatingAssistant(), /could not start/);
  overlayStarted = true;
  await jarvis.startFloatingAssistant();
});

test('stopFloatingAssistant calls native stop only on Android', async () => {
  const jarvis = await jarvisPromise;
  nativeCalls = [];
  platformOS = 'ios';
  await jarvis.stopFloatingAssistant();
  assert.deepEqual(nativeCalls, []);
  platformOS = 'android';
  await jarvis.stopFloatingAssistant();
  assert.deepEqual(nativeCalls, ['stopFloatingAssistant']);
});

test('screen awareness status and settings reflect native permission state', async () => {
  const jarvis = await jarvisPromise;
  platformOS = 'android';
  nativeModuleAvailable = true;
  screenAwarenessEnabled = true;
  assert.equal(jarvis.isScreenAwarenessEnabled(), true);
  screenAwarenessEnabled = false;
  assert.equal(jarvis.isScreenAwarenessEnabled(), false);
  platformOS = 'ios';
  assert.equal(jarvis.isScreenAwarenessEnabled(), false);
  platformOS = 'android';
  nativeModuleAvailable = false;
  assert.equal(jarvis.isScreenAwarenessEnabled(), false);
  nativeModuleAvailable = true;

  accessibilitySettingsOpened = false;
  await assert.rejects(jarvis.openScreenAwarenessSettings(), /Accessibility settings could not be opened/);
  accessibilitySettingsOpened = true;
  await jarvis.openScreenAwarenessSettings();
});

test('readVisibleScreenText normalizes the returned screen context and rejects empty text', async () => {
  const jarvis = await jarvisPromise;
  platformOS = 'android';
  screenText = '  Dashboard  \nDashboard\nAccount status  ';
  assert.equal(await jarvis.readVisibleScreenText(), 'Dashboard\nAccount status');
  screenText = '  \n  ';
  await assert.rejects(jarvis.readVisibleScreenText(), /পড়ার মতো কোনো লেখা পাওয়া যায়নি/);
});
