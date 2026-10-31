import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAssistant } from '@/context/AssistantContext';
import { useColors } from '@/hooks/useColors';

export default function MemoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { memories, saveMemory, updateMemory, deleteMemory, storageError } = useAssistant();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredMemories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return memories;
    return memories.filter(
      (m) =>
        m.title.toLowerCase().includes(query) ||
        m.content.toLowerCase().includes(query)
    );
  }, [memories, search]);

  const startEditing = (note: { id: string; title: string; content: string }) => {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
  };

  const confirmSave = () => {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent || saving) return;
    Alert.alert(
      editingId ? 'নোট আপডেট করবেন?' : 'মেমোরিতে সংরক্ষণ করবেন?',
      'এই তথ্যটি কেবল আপনার ডিভাইসের এনক্রিপ্টেড স্টোরেজে থাকবে। AI সার্ভিস বা সার্ভারে পাঠানো হবে না।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: editingId ? 'আপডেট' : 'সংরক্ষণ',
          onPress: () => {
            setSaving(true);
            const processAction = async () => {
              if (editingId) {
                await updateMemory(editingId, cleanTitle, cleanContent);
              } else {
                await saveMemory(cleanTitle, cleanContent);
              }
            };
            void processAction()
              .then(() => {
                setEditingId(null);
                setTitle('');
                setContent('');
              })
              .catch(() => Alert.alert('সংরক্ষণ ব্যর্থ', 'ফোনের নিরাপদ স্টোরেজে স্থান পরীক্ষা করুন।'))
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  const confirmDelete = (id: string, noteTitle: string) => {
    Alert.alert(
      'নোট মুছে ফেলবেন?',
      `"${noteTitle}" নোটটি ফোন থেকে স্থায়ীভাবে মুছে যাবে।`,
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'স্থায়ীভাবে মুছুন',
          style: 'destructive',
          onPress: () => {
            void deleteMemory(id).catch(() =>
              Alert.alert('মুছতে সমস্যা হয়েছে', 'পুনরায় চেষ্টা করুন।')
            );
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top, 12) + 14,
          paddingBottom: Math.max(insets.bottom, 20) + 90,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.eyebrow, { color: colors.primary }]}>LOCAL ENCRYPTED STORAGE</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Private Memory</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        এখানে সংরক্ষিত তথ্য সম্পূর্ণ লোকাল (ডিভাইসে)। কোনো ডেটা ক্লাউড সার্ভার বা AI মডেল ট্রেইনিংয়ে পাঠানো হয় না।
      </Text>

      {/* Form Card */}
      <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.formHeader}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            {editingId ? 'মেমোরি নোট সম্পাদনা' : 'নতুন মেমোরি তৈরি'}
          </Text>
          {editingId ? (
            <Pressable onPress={cancelEditing}>
              <Text style={{ color: colors.destructive, fontSize: 13, fontWeight: '600' }}>বাতিল</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="মেমোরির শিরোনাম (যেমন: কাজের তালিকা, ব্যাংকের নোট)"
          placeholderTextColor={colors.mutedForeground}
          maxLength={80}
          style={[styles.titleInput, { color: colors.foreground, borderColor: colors.input }]}
          accessibilityLabel="মেমোরির শিরোনাম"
        />
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="কী মনে রাখতে চান লিখুন…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={2000}
          style={[styles.noteInput, { color: colors.foreground, borderColor: colors.input }]}
          accessibilityLabel="মেমোরির বিষয়বস্তু"
        />
        <Pressable
          onPress={confirmSave}
          disabled={!title.trim() || !content.trim() || saving}
          style={[
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: !title.trim() || !content.trim() || saving ? 0.4 : 1,
            },
          ]}
        >
          <Feather name="shield" size={16} color={colors.primaryForeground} />
          <Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>
            {saving ? 'সংরক্ষণ হচ্ছে…' : editingId ? 'আপডেট করুন' : 'লোকালে সেভ করুন'}
          </Text>
        </Pressable>
      </View>

      {storageError ? (
        <Text style={{ color: colors.destructive, fontSize: 13, marginTop: 12 }}>{storageError}</Text>
      ) : null}

      {/* Memory Search & List */}
      <View style={styles.listHeading}>
        <Text style={[styles.label, { color: colors.foreground }]}>আপনার সংরক্ষিত নোটসমূহ</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>({filteredMemories.length})</Text>
      </View>

      {memories.length > 0 ? (
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="নোট খুঁজুন…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      ) : null}

      {filteredMemories.length ? (
        filteredMemories.map((note) => (
          <View
            key={note.id}
            style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.noteTop}>
              <Text style={[styles.noteTitle, { color: colors.foreground }]}>{note.title}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => startEditing(note)}
                  accessibilityRole="button"
                  accessibilityLabel={`${note.title} নোট সম্পাদনা করুন`}
                  hitSlop={8}
                >
                  <Feather name="edit-2" size={16} color={colors.primary} />
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(note.id, note.title)}
                  accessibilityRole="button"
                  accessibilityLabel={`${note.title} নোট মুছুন`}
                  hitSlop={8}
                >
                  <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
            <Text style={[styles.noteBody, { color: colors.mutedForeground }]}>{note.content}</Text>
            <Text style={[styles.date, { color: colors.mutedForeground }]}>
              সংরক্ষিত: {new Date(note.createdAt).toLocaleDateString('bn-BD')}
            </Text>
          </View>
        ))
      ) : (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="info" size={18} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {search.trim() ? 'আপনার খোঁজা অনুযায়ী কোনো নোট পাওয়া যায়নি।' : 'এখনো কোনো প্রাইভেট মেমোরি সংরক্ষিত হয়নি।'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  form: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 20 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 12 },
  noteInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginTop: 8 },
  primaryButton: { minHeight: 44, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 10 },
  count: { fontSize: 13, fontWeight: '600' },
  searchBox: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  noteCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  noteTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  noteTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  noteBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  date: { fontSize: 11, marginTop: 10 },
  empty: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 13 },
});
