import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useAssistant } from '@/context/AssistantContext';
import { useColors } from '@/hooks/useColors';
import {
  AI_PROVIDER_PRESETS,
  deleteProviderApiKey,
  fetchProviderModels,
  getProviderApiKey,
  saveProviderApiKey,
  normalizeProviderBaseUrl,
  type AIProviderId,
  saveLocalOmniRouteApiKey,
  getLocalOmniRouteApiKey,
  deleteLocalOmniRouteApiKey,
  getProviderApiKey as getStoredProviderApiKey,
} from '@/lib/assistant/providerSettings';
import { isFreeOpenRouterModel, normalizeLocalOmniRouteBaseUrl } from '@/lib/assistant/localOmniRouteCore';

const PROVIDERS: Array<{ id: AIProviderId; label: string }> = [
  { id: 'server', label: 'Server AI' },
  ...AI_PROVIDER_PRESETS.map(({ id, label }) => ({ id, label })),
];

export function ProviderManagerSection() {
  const colors = useColors();
  const { settings, updateSettings } = useAssistant();
  const providerId = settings.aiProvider ?? 'server';
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === providerId);
  const [baseUrl, setBaseUrl] = useState(settings.aiBaseUrl || preset?.baseUrl || '');
  const [model, setModel] = useState(settings.aiModel || 'openrouter/free');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fallbackProvider, setFallbackProvider] = useState(settings.aiFallbackProvider ?? 'none');
  const [fallbackModel, setFallbackModel] = useState(settings.aiFallbackModel ?? '');
  const [fallbackKeyConfigured, setFallbackKeyConfigured] = useState(false);
  const [localUrl, setLocalUrl] = useState(settings.localOmniRouteBaseUrl ?? '');
  const [localModel, setLocalModel] = useState(settings.localOmniRouteModel ?? '');
  const [localFallbackModel, setLocalFallbackModel] = useState(settings.localOmniRouteFallbackModel ?? 'openrouter/free');
  const [localKeyDraft, setLocalKeyDraft] = useState('');
  const [localKeyConfigured, setLocalKeyConfigured] = useState(false);
  const [freeBackupKeyConfigured, setFreeBackupKeyConfigured] = useState(false);

  useEffect(() => {
    setLocalUrl(settings.localOmniRouteBaseUrl ?? '');
    setLocalModel(settings.localOmniRouteModel ?? '');
    setLocalFallbackModel(settings.localOmniRouteFallbackModel ?? 'openrouter/free');
    let active = true;
    void Promise.all([getLocalOmniRouteApiKey(), getStoredProviderApiKey('openrouter')]).then(([localKey, backupKey]) => {
      if (active) {
        setLocalKeyConfigured(Boolean(localKey));
        setFreeBackupKeyConfigured(Boolean(backupKey));
      }
    }).catch(() => {
      if (active) { setLocalKeyConfigured(false); setFreeBackupKeyConfigured(false); }
    });
    return () => { active = false; };
  }, [settings.localOmniRouteBaseUrl, settings.localOmniRouteModel, settings.localOmniRouteFallbackModel]);

  useEffect(() => {
    setBaseUrl(settings.aiBaseUrl || preset?.baseUrl || '');
    setModel(settings.aiModel || '');
    setKeyDraft('');
    setModels([]);
    setError('');
    setFallbackProvider(settings.aiFallbackProvider ?? 'none');
    setFallbackModel(settings.aiFallbackModel ?? '');
    let active = true;
    if (providerId !== 'server') {
      void getProviderApiKey(providerId).then((key) => {
        if (active) setKeyConfigured(Boolean(key));
      }).catch(() => {
        if (active) setKeyConfigured(false);
      });
    } else {
      setKeyConfigured(false);
    }
    return () => { active = false; };
  }, [providerId, settings.aiBaseUrl, settings.aiModel, settings.aiFallbackProvider, settings.aiFallbackModel, preset?.baseUrl]);

  useEffect(() => {
    if (fallbackProvider === 'none') { setFallbackKeyConfigured(false); return; }
    let active = true;
    void getProviderApiKey(fallbackProvider).then((key) => {
      if (active) setFallbackKeyConfigured(Boolean(key));
    }).catch(() => { if (active) setFallbackKeyConfigured(false); });
    return () => { active = false; };
  }, [fallbackProvider]);

  const selectProvider = (id: AIProviderId) => {
    const nextPreset = AI_PROVIDER_PRESETS.find((item) => item.id === id);
    const nextBaseUrl = id === 'server' ? '' : (nextPreset?.baseUrl ?? '');
    updateSettings({
      aiProvider: id,
      aiBaseUrl: nextBaseUrl,
      aiModel: id === 'server' ? 'openrouter/free' : '',
    });
    setBaseUrl(nextBaseUrl);
    setModel(id === 'server' ? 'openrouter/free' : '');
  };

  const saveKey = async () => {
    if (!keyDraft.trim() || providerId === 'server') return;
    setBusy(true);
    setError('');
    try {
      await saveProviderApiKey(providerId, keyDraft);
      setKeyConfigured(true);
      setKeyDraft('');
      Alert.alert('সংরক্ষিত', 'API Key ফোনের Secure Storage-এ সংরক্ষণ হয়েছে।');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'API Key সংরক্ষণ করা যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    if (providerId === 'server') return;
    try {
      await deleteProviderApiKey(providerId);
      setKeyConfigured(false);
      setKeyDraft('');
      Alert.alert('মুছে ফেলা হয়েছে', 'এই Provider-এর API Key সরানো হয়েছে।');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'API Key মুছতে সমস্যা হয়েছে।');
    }
  };

  const loadModels = async () => {
    if (providerId === 'server') return;
    setBusy(true);
    setError('');
    try {
      const key = await getProviderApiKey(providerId);
      if (!key) throw new Error('প্রথমে API Key সংরক্ষণ করুন।');
      const found = await fetchProviderModels(baseUrl, key, providerId);
      setModels(found);
      if (found.length === 0) setError('এই Provider কোনো Model ফেরত দেয়নি। Model ID নিজে লিখতে পারো।');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Model list পাওয়া যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  const saveLocalConfiguration = () => {
    try {
      const normalized = normalizeLocalOmniRouteBaseUrl(localUrl);
      if (!localModel.trim() || !/^[\w./:-]{1,200}$/.test(localModel.trim())) throw new Error('Local OmniRoute Model ID সঠিক নয়।');
      if (settings.localOmniRouteFallbackEnabled && (!isFreeOpenRouterModel(localFallbackModel) || !freeBackupKeyConfigured)) {
        throw new Error('Backup-এর জন্য OpenRouter SecureStore-এ Key এবং openrouter/free বা :free Model প্রয়োজন।');
      }
      updateSettings({
        localOmniRouteBaseUrl: normalized,
        localOmniRouteModel: localModel.trim(),
        localOmniRouteFallbackModel: localFallbackModel.trim(),
      });
      Alert.alert('Local OmniRoute সংরক্ষিত', 'লোকাল Router configuration এই ফোনে সংরক্ষণ হয়েছে।');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local OmniRoute configuration সঠিক নয়।');
    }
  };

  const saveLocalKey = async () => {
    if (!localKeyDraft.trim()) return;
    setBusy(true);
    try {
      await saveLocalOmniRouteApiKey(localKeyDraft);
      setLocalKeyConfigured(true);
      setLocalKeyDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local API Key সংরক্ষণ করা যায়নি।');
    } finally { setBusy(false); }
  };

  const removeLocalKey = async () => {
    try {
      await deleteLocalOmniRouteApiKey();
      setLocalKeyConfigured(false);
      setLocalKeyDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local API Key সরানো যায়নি।');
    }
  };

  const saveSelection = () => {
    try {
      const normalizedBaseUrl = providerId === 'server' ? '' : normalizeProviderBaseUrl(baseUrl);
      if (fallbackProvider !== 'none' && (providerId === 'server' || fallbackProvider === providerId || !fallbackModel.trim() || !fallbackKeyConfigured)) {
        throw new Error('Fallback চালাতে আলাদা Provider, Model এবং সেই Provider-এর Secure Storage API Key প্রয়োজন।');
      }
      updateSettings({ aiProvider: providerId, aiBaseUrl: normalizedBaseUrl, aiModel: model.trim(), aiFallbackProvider: fallbackProvider, aiFallbackModel: fallbackProvider === 'none' ? '' : fallbackModel.trim() });
      Alert.alert('AI সেটিংস সংরক্ষিত', 'পরবর্তী Chat request-এ নির্বাচিত Provider ও Model ব্যবহার হবে।');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Provider configuration সঠিক নয়।');
    }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 15, gap: 11, backgroundColor: colors.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Feather name="cpu" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '800' }}>AI Provider Manager</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Provider, Model, API Key ও নিজের Proxy নির্বাচন করুন</Text>
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 13 }}>On-device Local OmniRoute</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>ফোন থেকে সরাসরি local router-এ request যাবে; Worker-এ localhost পাঠানো হবে না।</Text>
          </View>
          <Switch value={settings.localOmniRouteEnabled} onValueChange={(value) => updateSettings({ localOmniRouteEnabled: value })} />
        </View>
        <TextInput value={localUrl} onChangeText={setLocalUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.10:8080/v1" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 10, color: colors.foreground, fontSize: 12 }} />
        <TextInput value={localModel} onChangeText={setLocalModel} autoCapitalize="none" autoCorrect={false} placeholder="Local model ID" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 10, color: colors.foreground, fontSize: 12 }} />
        <TextInput value={localKeyDraft} onChangeText={setLocalKeyDraft} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={localKeyConfigured ? 'Local API Key saved · replace if needed' : 'Optional Local OmniRoute API Key'} placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 10, color: colors.foreground, fontSize: 12 }} />
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <Pressable onPress={() => void saveLocalKey()} disabled={!localKeyDraft.trim() || busy} style={{ flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', opacity: !localKeyDraft.trim() || busy ? 0.5 : 1 }}>
            <Text style={{ color: colors.secondaryForeground, fontSize: 11, fontWeight: '700' }}>Save Local Key</Text>
          </Pressable>
          {localKeyConfigured ? <Pressable onPress={() => void removeLocalKey()} style={{ paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.destructive, justifyContent: 'center' }}><Text style={{ color: colors.destructive, fontSize: 11 }}>Remove Key</Text></Pressable> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '600' }}>Free-only API backup</Text>
          <Switch value={settings.localOmniRouteFallbackEnabled} onValueChange={(value) => updateSettings({ localOmniRouteFallbackEnabled: value })} />
        </View>
        <TextInput value={localFallbackModel} onChangeText={setLocalFallbackModel} autoCapitalize="none" autoCorrect={false} placeholder="openrouter/free" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 10, color: colors.foreground, fontSize: 12 }} />
        <Text style={{ color: freeBackupKeyConfigured ? colors.primary : colors.mutedForeground, fontSize: 10 }}>{freeBackupKeyConfigured ? 'OpenRouter backup key SecureStore-এ আছে।' : 'Backup ব্যবহারের জন্য Provider Manager-এ OpenRouter key সংরক্ষণ করুন।'}</Text>
        <Pressable onPress={saveLocalConfiguration} style={{ minHeight: 40, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primaryForeground, fontWeight: '800', fontSize: 12 }}>Save Local OmniRoute</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>PROVIDER</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {PROVIDERS.map((provider) => {
          const selected = provider.id === providerId;
          return (
            <Pressable key={provider.id} onPress={() => selectProvider(provider.id)} accessibilityRole="button" accessibilityState={{ selected }} style={{ borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background, borderRadius: 12, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' }}>
              <Text style={{ color: selected ? colors.primary : colors.foreground, fontSize: 12, fontWeight: selected ? '800' : '600' }}>{provider.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {providerId === 'server' ? (
        <View style={{ borderRadius: 12, padding: 12, backgroundColor: colors.secondary, gap: 4 }}>
          <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>Owner-managed Server AI</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>বর্তমান Server OpenRouter route ব্যবহার হবে। Server-এর API Key ফোনে দেখানো বা সংরক্ষণ করা হয় না।</Text>
        </View>
      ) : (
        <>
          <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>API Base URL / Proxy Endpoint</Text>
          <TextInput value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://api.example.com/v1" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, color: colors.foreground, fontSize: 13 }} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{['cloudflare', 'cohere', 'nvidia'].includes(providerId) ? (providerId === 'cloudflare' ? 'Cloudflare Workers AI Base URL-এ Account ID যুক্ত করুন: https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1 । Model ID হাতে লিখুন।' : 'এই Provider-এর Model ID হাতে লিখুন। Chat request Cloudflare Worker-এর মাধ্যমে যাবে; Worker API Key সংরক্ষণ করে না।') : 'OpenAI-compatible HTTPS endpoint প্রয়োজন। Chat ও model-list request Cloudflare Worker-এর মাধ্যমে যাবে; Worker API Key সংরক্ষণ করে না। Custom proxy-তে localhost বা private IP ব্যবহার করা যাবে না.'}</Text>
          <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>API Key</Text>
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingRight: 10 }}>
            <TextInput value={keyDraft} onChangeText={setKeyDraft} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={keyConfigured ? 'Saved key আছে • নতুন Key দিলে replace হবে' : 'Paste your provider API key'} placeholderTextColor={colors.mutedForeground} style={{ flex: 1, padding: 11, color: colors.foreground, fontSize: 13 }} />
            <Feather name="lock" size={15} color={colors.primary} />
          </View>
          {keyConfigured ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Feather name="check-circle" size={12} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11 }}>API Key ফোনের Secure Storage-এ থাকে; Worker-এ শুধু request-এর সময় পাঠানো হয় (সম্পূর্ণ Key দেখানো হয় না)।</Text></View> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => void saveKey()} disabled={!keyDraft.trim() || busy} style={{ flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: !keyDraft.trim() || busy ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '800', fontSize: 12 }}>Save API Key</Text>}
            </Pressable>
            {keyConfigured ? <Pressable onPress={() => void removeKey()} style={{ minHeight: 42, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.destructive, justifyContent: 'center' }}><Text style={{ color: colors.destructive, fontWeight: '700', fontSize: 12 }}>Remove</Text></Pressable> : null}
          </View>
          <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>Model ID</Text>
          <TextInput value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} placeholder="e.g. gpt-4o-mini / gemini-2.5-flash" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, color: colors.foreground, fontSize: 13 }} />
          {!['cloudflare', 'cohere', 'nvidia'].includes(providerId) ? (
            <Pressable onPress={() => void loadModels()} disabled={busy || !keyConfigured} style={{ minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: busy || !keyConfigured ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={14} color={colors.primary} />}
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>Fetch available models</Text>
            </Pressable>
          ) : null}
          {models.length > 0 ? <ScrollView nestedScrollEnabled style={{ maxHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 11 }} contentContainerStyle={{ padding: 6, gap: 4 }}>
            {models.map((item) => <Pressable key={item} onPress={() => setModel(item)} style={{ padding: 9, borderRadius: 8, backgroundColor: model === item ? colors.secondary : colors.background }}>
              <Text style={{ color: model === item ? colors.primary : colors.foreground, fontSize: 12, fontWeight: model === item ? '800' : '500' }}>{item}</Text>
            </Pressable>)}
          </ScrollView> : null}
        </>
      )}
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 11, gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 13 }}>Multi-AI Fallback Routing</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>External Primary provider unavailable হলে প্রথম উত্তর আসার আগেই বিকল্প Provider-এ চেষ্টা করবে। Server AI-এর fallback তার নিজস্ব server routing দিয়ে নিয়ন্ত্রিত। উত্তর আংশিক আসার পর fallback হবে না, যাতে duplicate reply না হয়।</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[{ id: 'none', label: 'Off' }, ...AI_PROVIDER_PRESETS.filter((item) => item.id !== 'custom' && item.id !== 'cloudflare').map((item) => ({ id: item.id, label: item.label }))].map((item) => {
            const selected = fallbackProvider === item.id;
            return <Pressable key={item.id} onPress={() => setFallbackProvider(item.id as typeof fallbackProvider)} disabled={providerId === 'server' && item.id !== 'none'} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background, justifyContent: 'center', opacity: providerId === 'server' && item.id !== 'none' ? 0.4 : 1 }}><Text style={{ color: selected ? colors.primary : colors.foreground, fontSize: 11, fontWeight: selected ? '800' : '600' }}>{item.label}</Text></Pressable>;
          })}
        </ScrollView>
        {fallbackProvider !== 'none' ? <View style={{ gap: 7 }}>
          <TextInput value={fallbackModel} onChangeText={setFallbackModel} autoCapitalize="none" autoCorrect={false} placeholder="Fallback Model ID" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 10, color: colors.foreground, fontSize: 12 }} />
          <Text style={{ color: fallbackKeyConfigured ? colors.primary : colors.mutedForeground, fontSize: 11 }}>{fallbackKeyConfigured ? 'Fallback API Key Secure Storage-এ আছে।' : 'Fallback Key যোগ করতে উপরে এই Provider নির্বাচন করে API Key Save করুন, তারপর Primary Provider-এ ফিরে আসুন।'}</Text>
        </View> : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, lineHeight: 17 }}>{error}</Text> : null}
      <Pressable onPress={saveSelection} disabled={(providerId !== 'server' && (!model.trim() || !baseUrl.trim() || !keyConfigured)) || (fallbackProvider !== 'none' && (providerId === 'server' || fallbackProvider === providerId || !fallbackModel.trim() || !fallbackKeyConfigured))} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: ((providerId !== 'server' && (!model.trim() || !baseUrl.trim() || !keyConfigured)) || (fallbackProvider !== 'none' && (fallbackProvider === providerId || !fallbackModel.trim() || !fallbackKeyConfigured))) ? 0.45 : 1 }}>
        <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>Save Provider & Model</Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>API Key শুধু এই Provider-এর জন্য ফোনের Secure Storage-এ রাখা হয়। Chat ও model-list request Owner Login যাচাইয়ের পর Cloudflare Worker-এর মাধ্যমে নির্বাচিত HTTPS provider/proxy-তে যায়; Worker Key persist বা application log করে না। Owner Token provider-এর কাছে পাঠানো হয় না। Server AI mode-এ Agent tools থাকে; custom provider mode-এ OpenAI-compatible text chat ব্যবহৃত হয়।</Text>
    </View>
  );
}
