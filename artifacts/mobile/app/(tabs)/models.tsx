import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  PROVIDERS, getConnectedProviderIds, getAllDiscoveredModels, getCustomModels,
  getDefaultModel, saveCustomModels, saveDefaultModel,
  type ModelChoice, type ProviderId,
} from '@/lib/assistant/providerManager';

const errorText = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

export default function DefaultModelsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [connected, setConnected] = useState<ProviderId[]>([]);
  const [selected, setSelected] = useState<ModelChoice | null>(null);
  const [discovered, setDiscovered] = useState<Partial<Record<ProviderId, ModelChoice[]>>>({});
  const [customModels, setCustomModels] = useState<ModelChoice[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});

  const refresh = useCallback(async () => {
    try {
      const [ids, current, catalog, custom] = await Promise.all([
        getConnectedProviderIds(), getDefaultModel(), getAllDiscoveredModels(), getCustomModels(),
      ]);
      setConnected(ids);
      setSelected(current);
      setDiscovered(catalog);
      setCustomModels(custom);
    } catch (cause) {
      Alert.alert('Model তালিকা লোড হয়নি', errorText(cause, 'Secure Storage পড়া যায়নি।'));
    }
  }, []);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const choose = async (choice: ModelChoice) => {
    try {
      await saveDefaultModel(choice);
      setSelected(choice);
      Alert.alert('Default Model সেট হয়েছে', choice.label || choice.modelId);
    } catch (cause) {
      Alert.alert('Default Model সংরক্ষণ ব্যর্থ', errorText(cause, 'Secure Storage-এ লেখা যায়নি।'));
    }
  };

  const addCustom = async (providerId: ProviderId) => {
    const modelId = (drafts[providerId] || '').trim();
    if (!modelId) {
      Alert.alert('Model ID প্রয়োজন', 'Provider-এর সঠিক Model ID লিখুন।');
      return;
    }
    const next = [
      ...customModels.filter((item) => !(item.providerId === providerId && item.modelId === modelId)),
      { providerId, modelId, label: modelId },
    ];
    try {
      await saveCustomModels(next);
      setCustomModels(next);
      setDrafts((value) => ({ ...value, [providerId]: '' }));
    } catch (cause) {
      Alert.alert('Model সংরক্ষণ ব্যর্থ', errorText(cause, 'Secure Storage-এ লেখা যায়নি।'));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 18, paddingTop: Math.max(insets.top, 12) + 12, paddingBottom: 36, gap: 12 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Feather name="arrow-left" size={19} color={colors.foreground} />
        <Text style={{ color: colors.foreground, fontWeight: '700' }}>Model Provider</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>Default Models</Text>
      <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>Connection test থেকে পাওয়া Model বেছে নাও, অথবা নিজের Model ID যোগ করো। Default নির্বাচন Provider settings-এর একই SecureStore entry-তে সংরক্ষিত হবে।</Text>
      {selected ? (
        <View style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.card }]}>
          <Feather name="check-circle" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 10, letterSpacing: 1 }}>ACTIVE DEFAULT MODEL</Text>
            <Text style={{ color: colors.foreground, fontWeight: '800', marginTop: 3 }}>{selected.label || selected.modelId}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{selected.providerId} · {selected.modelId}</Text>
          </View>
        </View>
      ) : null}
      {connected.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.mutedForeground }}>এখনো কোনো Provider Key সংরক্ষণ করা হয়নি। আগে Model Provider থেকে সংযোগ করো।</Text>
        </View>
      ) : null}
      {connected.map((id) => {
        const provider = PROVIDERS.find((item) => item.id === id);
        if (!provider) return null;
        const catalog = discovered[id] || [];
        const manual = customModels.filter((item) => item.providerId === id);
        const all = [...catalog, ...manual.filter((item) => !catalog.some((model) => model.modelId === item.modelId))];
        return (
          <View key={id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.name, { color: colors.foreground, flex: 1 }]}>{provider.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: '800' }}>{catalog.length ? `${catalog.length} DISCOVERED` : 'NO LIVE CATALOG'}</Text>
            </View>
            {all.map((item) => {
              const active = selected?.providerId === id && selected.modelId === item.modelId;
              return (
                <Pressable key={item.modelId} onPress={() => { choose(item).catch(() => undefined); }} style={[styles.modelRow, { borderColor: colors.border, backgroundColor: active ? colors.secondary : 'transparent' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontWeight: active ? '800' : '500' }}>{item.label || item.modelId}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{item.modelId}</Text>
                  </View>
                  <Feather name={active ? 'check-circle' : 'circle'} color={colors.primary} size={17} />
                </Pressable>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 7, marginTop: 10 }}>
              <TextInput
                value={drafts[id] || ''}
                onChangeText={(value) => setDrafts((current) => ({ ...current, [id]: value }))}
                placeholder="Add model ID manually"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, flex: 1 }]}
              />
              <Pressable onPress={() => { addCustom(id).catch(() => undefined); }} style={[styles.add, { backgroundColor: colors.primary }]}>
                <Feather name="plus" size={17} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </View>
        );
      })}
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Model catalog provider-এর API response থেকে আসে। Free/Paid access, rate limit ও quota provider account অনুযায়ী নির্ধারিত হয়।</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 27, fontWeight: '900' },
  card: { borderWidth: 1, borderRadius: 18, padding: 13 },
  selected: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  modelRow: { borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minWidth: 0 },
  add: { width: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
