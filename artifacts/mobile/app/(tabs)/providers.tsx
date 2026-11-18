import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  PROVIDERS, getConnectedProviderIds, getProviderBaseUrl, getCloudflareAccountId, saveCloudflareAccountId,
  saveProviderBaseUrl, removeProviderKey, saveProviderKey, saveDiscoveredModels, type ProviderId,
} from '@/lib/assistant/providerManager';
import { testProviderConnection, type ProviderModel } from '@/lib/assistant/providerChat';

type TestResult = { message: string; models: ProviderModel[] };

const freeLabel = (kind: string) => kind === 'trial' ? 'Trial'
  : kind === 'quota' ? 'Quota-based'
    : kind === 'account-dependent' ? 'Account-based'
      : kind === 'self-hosted' ? 'Local / Self-hosted' : 'Free tier';

export default function ProviderManagerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [connected, setConnected] = useState<ProviderId[]>([]);
  const [expanded, setExpanded] = useState<ProviderId | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [bases, setBases] = useState<Partial<Record<ProviderId, string>>>({});
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [results, setResults] = useState<Partial<Record<ProviderId, TestResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<ProviderId, string>>>({});

  const refresh = useCallback(async () => {
    try {
      setConnected(await getConnectedProviderIds());
      setAccountId((await getCloudflareAccountId()) || '');
    } catch (cause) {
      Alert.alert('Provider তালিকা লোড হয়নি', cause instanceof Error ? cause.message : 'Secure Storage পড়া যায়নি।');
    }
  }, []);
  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const openProvider = async (id: ProviderId) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    // Show the saved base URL (or the vetted default) so updating only the API key never requires retyping it.
    if (next && (id === 'omniroute' || id === 'custom') && !bases[id]) {
      try {
        const stored = await getProviderBaseUrl(id);
        setBases((value) => ({ ...value, [id]: value[id] || stored }));
      } catch {
        // Keep the manual entry field empty when Secure Storage is unavailable.
      }
    }
  };

  const save = async (id: ProviderId) => {
    const key = drafts[id]?.trim();
    if (!key) { Alert.alert('API Key প্রয়োজন', 'Provider-এর API Key লিখুন।'); return; }
    setBusy(id);
    setErrors((value) => ({ ...value, [id]: '' }));
    try {
      const base = bases[id]?.trim();
      if ((id === 'omniroute' || id === 'custom') && base) await saveProviderBaseUrl(id, base);
      if (id === 'custom' && !base) throw new Error('Custom Provider-এর API Base URL লিখুন।');
      if (id === 'cloudflare' && accountId.trim()) await saveCloudflareAccountId(accountId);
      await saveProviderKey(id, key);
      setDrafts((value) => ({ ...value, [id]: '' }));
      await refresh();
      Alert.alert('Key সংরক্ষিত', 'এখন Test Connection চাপো। Key Android Secure Storage-এ আছে।');
    } catch (cause) {
      Alert.alert('সংরক্ষণ ব্যর্থ', cause instanceof Error ? cause.message : 'Could not save provider.');
    } finally {
      setBusy(null);
    }
  };

  const test = async (id: ProviderId) => {
    setTesting(id);
    setErrors((value) => ({ ...value, [id]: '' }));
    try {
      const result = await testProviderConnection(id);
      await saveDiscoveredModels(id, result.models.map((model) => ({ providerId: id, modelId: model.id, label: model.name || model.id })));
      setResults((value) => ({ ...value, [id]: result }));
    } catch (cause) {
      setErrors((value) => ({ ...value, [id]: cause instanceof Error ? cause.message : 'Connection test failed.' }));
      setResults((value) => ({ ...value, [id]: undefined }));
    } finally {
      setTesting(null);
    }
  };

  const disconnect = (id: ProviderId) => Alert.alert('Provider disconnect করবেন?', 'সংরক্ষিত API Key মুছে যাবে।', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Disconnect',
      style: 'destructive',
      onPress: async () => {
        try {
          await removeProviderKey(id);
          setResults((value) => ({ ...value, [id]: undefined }));
          await refresh();
        } catch (cause) {
          setErrors((value) => ({ ...value, [id]: cause instanceof Error ? cause.message : 'Key মোছা যায়নি।' }));
        }
      },
    },
  ]);

  const field = [styles.input, { color: colors.foreground, borderColor: colors.border }];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 18, paddingTop: Math.max(insets.top, 12) + 10, paddingBottom: 40, gap: 12 }}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Feather name="arrow-left" size={19} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>Settings</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Model Provider</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>Provider সংযোগ করো, API পরীক্ষা করো এবং উপলব্ধ Model স্বয়ংক্রিয়ভাবে আনো। Free quota ও account eligibility provider অনুযায়ী বদলায়।</Text>
      {PROVIDERS.map((provider) => {
        const active = connected.includes(provider.id);
        const open = expanded === provider.id;
        const result = results[provider.id];
        const needsBase = provider.id === 'omniroute' || provider.id === 'custom';
        return (
          <View key={provider.id} style={[styles.card, { backgroundColor: colors.card, borderColor: result ? colors.primary : colors.border }]}>
            <Pressable onPress={() => { openProvider(provider.id).catch(() => undefined); }} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name="cpu" size={19} color={colors.primary} /></View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{provider.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{freeLabel(provider.freeTier)} · {provider.description}</Text>
              </View>
              {result ? <Feather name="check-circle" color={colors.primary} size={18} /> : active ? <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: '800' }}>KEY SAVED</Text> : null}
              <Feather name={open ? 'chevron-up' : 'chevron-right'} size={19} color={colors.mutedForeground} />
            </Pressable>
            {open ? (
              <View style={{ gap: 9, paddingTop: 12 }}>
                {needsBase ? (
                  <>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{provider.id === 'custom' ? 'Custom API Base URL (HTTPS required)' : 'API Base URL (same phone: http://127.0.0.1:20128/v1)'}</Text>
                    <TextInput value={bases[provider.id] ?? ''} onChangeText={(value) => setBases((current) => ({ ...current, [provider.id]: value }))} placeholder={provider.baseUrl || 'https://your-provider.example/v1'} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={field} />
                  </>
                ) : null}
                {provider.id === 'cloudflare' ? (
                  <>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Cloudflare Account ID (32-character ID)</Text>
                    <TextInput value={accountId} onChangeText={setAccountId} placeholder="Account ID" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={field} />
                  </>
                ) : null}
                <TextInput value={drafts[provider.id] ?? ''} onChangeText={(value) => setDrafts((current) => ({ ...current, [provider.id]: value }))} placeholder={active ? 'নতুন API Key দিলে replace হবে' : 'API Key'} placeholderTextColor={colors.mutedForeground} secureTextEntry autoCapitalize="none" autoCorrect={false} style={field} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => { save(provider.id).catch(() => undefined); }} disabled={busy === provider.id} style={[styles.primary, { backgroundColor: colors.primary, flex: 1 }]}>
                    {busy === provider.id ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="lock" size={15} color={colors.primaryForeground} />}
                    <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>Save Key</Text>
                  </Pressable>
                  <Pressable onPress={() => { test(provider.id).catch(() => undefined); }} disabled={!active || testing === provider.id} style={[styles.secondary, { borderColor: colors.border, opacity: active ? 1 : 0.5 }]}>
                    {testing === provider.id ? <ActivityIndicator color={colors.primary} /> : <Feather name="activity" size={15} color={colors.primary} />}
                    <Text style={{ color: colors.foreground, fontWeight: '700' }}>Test</Text>
                  </Pressable>
                </View>
                {errors[provider.id] ? <Text style={{ color: colors.destructive, fontSize: 12 }}>{errors[provider.id]}</Text> : null}
                {result ? (
                  <View style={{ backgroundColor: colors.secondary, borderRadius: 12, padding: 10, gap: 5 }}>
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>CONNECTION VERIFIED</Text>
                    <Text style={{ color: colors.foreground, fontSize: 12 }}>{result.message}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Discovered models: {result.models.length}</Text>
                    {result.models.slice(0, 5).map((model) => <Text key={model.id} style={{ color: colors.foreground, fontSize: 12 }}>• {model.id}</Text>)}
                    {result.models.length > 5 ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>আরও {result.models.length - 5}টি Model Default Models-এ পাওয়া যাবে।</Text> : null}
                  </View>
                ) : null}
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>API Key ডিভাইসের Secure Storage-এ থাকে। Test সফল না হওয়া পর্যন্ত Provider-কে Connected ধরা হবে না।</Text>
                {active ? <Pressable onPress={() => disconnect(provider.id)}><Text style={{ color: colors.destructive, fontWeight: '700', fontSize: 12 }}>Disconnect and delete key</Text></Pressable> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      <Pressable onPress={() => router.push('/(tabs)/models' as never)} style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name="sliders" size={19} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>Default Models</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Discovered model বেছে নাও</Text>
        </View>
        <Feather name="chevron-right" size={19} color={colors.mutedForeground} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { fontSize: 27, fontWeight: '900' },
  card: { borderWidth: 1, borderRadius: 18, padding: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  primary: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  secondary: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
});
