import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
} from '@/lib/assistant/providerSettings';

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

  useEffect(() => {
    setBaseUrl(settings.aiBaseUrl || preset?.baseUrl || '');
    setModel(settings.aiModel || '');
    setKeyDraft('');
    setModels([]);
    setError('');
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
  }, [providerId, settings.aiBaseUrl, settings.aiModel, preset?.baseUrl]);

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
    setBusy(true);
    setError('');
    try {
      const key = await getProviderApiKey(providerId);
      if (!key) throw new Error('প্রথমে API Key সংরক্ষণ করুন।');
      const found = await fetchProviderModels(baseUrl, key);
      setModels(found);
      if (found.length === 0) setError('এই Provider কোনো Model ফেরত দেয়নি। Model ID নিজে লিখতে পারো।');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Model list পাওয়া যায়নি।');
    } finally {
      setBusy(false);
    }
  };

  const saveSelection = () => {
    try {
      const normalizedBaseUrl = providerId === 'server' ? '' : normalizeProviderBaseUrl(baseUrl);
      updateSettings({ aiProvider: providerId, aiBaseUrl: normalizedBaseUrl, aiModel: model.trim() });
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
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>OpenAI-compatible endpoint প্রয়োজন। Custom proxy-ও এখানে বসাতে পারবে; নিরাপত্তার জন্য HTTPS ব্যবহার করো।</Text>
          <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>API Key</Text>
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingRight: 10 }}>
            <TextInput value={keyDraft} onChangeText={setKeyDraft} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={keyConfigured ? 'Saved key আছে • নতুন Key দিলে replace হবে' : 'Paste your provider API key'} placeholderTextColor={colors.mutedForeground} style={{ flex: 1, padding: 11, color: colors.foreground, fontSize: 13 }} />
            <Feather name="lock" size={15} color={colors.primary} />
          </View>
          {keyConfigured ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Feather name="check-circle" size={12} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11 }}>API Key Secure Storage-এ সংরক্ষিত (সম্পূর্ণ Key দেখানো হয় না)।</Text></View> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => void saveKey()} disabled={!keyDraft.trim() || busy} style={{ flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: !keyDraft.trim() || busy ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontWeight: '800', fontSize: 12 }}>Save API Key</Text>}
            </Pressable>
            {keyConfigured ? <Pressable onPress={() => void removeKey()} style={{ minHeight: 42, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: colors.destructive, justifyContent: 'center' }}><Text style={{ color: colors.destructive, fontWeight: '700', fontSize: 12 }}>Remove</Text></Pressable> : null}
          </View>
          <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>Model ID</Text>
          <TextInput value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} placeholder="e.g. gpt-4o-mini / gemini-2.5-flash" placeholderTextColor={colors.mutedForeground} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, color: colors.foreground, fontSize: 13 }} />
          <Pressable onPress={() => void loadModels()} disabled={busy || !keyConfigured} style={{ minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: busy || !keyConfigured ? 0.5 : 1 }}>
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={14} color={colors.primary} />}
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>Fetch available models</Text>
          </Pressable>
          {models.length > 0 ? <ScrollView nestedScrollEnabled style={{ maxHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 11 }} contentContainerStyle={{ padding: 6, gap: 4 }}>
            {models.map((item) => <Pressable key={item} onPress={() => setModel(item)} style={{ padding: 9, borderRadius: 8, backgroundColor: model === item ? colors.secondary : colors.background }}>
              <Text style={{ color: model === item ? colors.primary : colors.foreground, fontSize: 12, fontWeight: model === item ? '800' : '500' }}>{item}</Text>
            </Pressable>)}
          </ScrollView> : null}
        </>
      )}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, lineHeight: 17 }}>{error}</Text> : null}
      <Pressable onPress={saveSelection} disabled={providerId !== 'server' && (!model.trim() || !baseUrl.trim() || !keyConfigured)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: providerId !== 'server' && (!model.trim() || !baseUrl.trim() || !keyConfigured) ? 0.45 : 1 }}>
        <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>Save Provider & Model</Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>API Key শুধু এই Provider-এর জন্য Secure Storage-এ রাখা হয়। Chat request-এ Owner Login যাচাই করার পর Key সরাসরি নির্বাচিত HTTPS provider/proxy-তে পাঠানো হয়; Owner Token তৃতীয় পক্ষের কাছে পাঠানো হয় না। Server AI mode-এ Agent tools থাকে; custom provider mode-এ provider-এর OpenAI-compatible text chat ব্যবহৃত হয়।</Text>
    </View>
  );
}
