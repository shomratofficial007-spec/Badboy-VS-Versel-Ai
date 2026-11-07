import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useAssistant } from '@/context/AssistantContext';
import {
  loginWithEmail,
  logoutFirebaseAccount,
  registerWithEmail,
  sendPasswordReset,
} from '@/lib/assistant/firebaseAccount';
import { useColors } from '@/hooks/useColors';

export function FirebaseAccountPanel() {
  const colors = useColors();
  const { accountUser, authReady, cloudSyncError, cloudSyncing } = useAssistant();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const runAuth = async () => {
    if (!email.trim() || password.length < 6 || busy) {
      setMessage('সঠিক ইমেইল দিন এবং অন্তত ৬ অক্ষরের পাসওয়ার্ড লিখুন।');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (creating) await registerWithEmail(email, password);
      else await loginWithEmail(email, password);
      setPassword('');
      setMessage(creating ? 'Badboy Account তৈরি হয়েছে।' : 'Login সফল হয়েছে।');
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'এই ইমেইলে আগে থেকেই Account আছে। Login করুন।',
        'auth/invalid-email': 'ইমেইল ঠিকানাটি সঠিক নয়।',
        'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।',
        'auth/weak-password': 'পাসওয়ার্ড আরও শক্তিশালী করুন।',
        'auth/network-request-failed': 'ইন্টারনেট সংযোগ পরীক্ষা করুন।',
        'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
      };
      setMessage(messages[code] ?? 'Firebase Account অনুরোধ সম্পন্ন হয়নি। আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setMessage('Password Reset Link পেতে আগে ইমেইল লিখুন।');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await sendPasswordReset(email);
      setMessage('Password Reset Link ইমেইলে পাঠানো হয়েছে।');
    } catch {
      setMessage('Reset ইমেইল পাঠানো যায়নি। ইমেইল ও ইন্টারনেট পরীক্ষা করুন।');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    Alert.alert('Logout করবেন?', 'আপনার Local Data ফোনেই থাকবে।', [
      { text: 'থাক', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => { void logoutFirebaseAccount().catch(() => setMessage('Logout করা যায়নি। আবার চেষ্টা করুন।')); },
      },
    ]);
  };

  const fieldStyle = {
    borderWidth: 1,
    borderColor: colors.input,
    color: colors.foreground,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  } as const;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, padding: 15, gap: 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Feather name="cloud" size={18} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: '700', flex: 1 }}>Firebase Account & Cloud Backup</Text>
        <View style={{ backgroundColor: colors.secondary, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: colors.secondaryForeground, fontSize: 10, fontWeight: '700' }}>OPTIONAL</Text>
        </View>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
        Badboy-এর AI, Voice ও Engine আগের মতোই অ্যাপ/নিজস্ব Backend চালাবে। Firebase শুধু Account এবং তোমার ব্যক্তিগত App Data Backup/Sync করবে।
      </Text>

      {!authReady ? (
        <View style={{ minHeight: 42, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : accountUser ? (
        <>
          <View style={{ borderRadius: 12, backgroundColor: colors.background, padding: 12, gap: 4 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>SIGNED IN AS</Text>
            <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 14 }}>{accountUser.email ?? 'Firebase user'}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              {cloudSyncing ? 'Cloud Data Sync হচ্ছে…' : cloudSyncError ? 'Cloud Sync-এর জন্য Firestore Rules/Connection পরীক্ষা দরকার।' : 'Account সক্রিয়'}
            </Text>
          </View>
          {cloudSyncError ? (
            <Text style={{ color: colors.destructive, fontSize: 12, lineHeight: 18 }}>{cloudSyncError}</Text>
          ) : null}
          <Pressable onPress={signOut} disabled={busy} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Feather name="log-out" size={15} color={colors.secondaryForeground} />
            <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>Logout</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="ইমেইল ঠিকানা"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={fieldStyle}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            textContentType={creating ? 'newPassword' : 'password'}
            style={fieldStyle}
          />
          <Pressable onPress={runAuth} disabled={busy} style={{ minHeight: 45, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="shield" size={15} color={colors.primaryForeground} />}
            <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{creating ? 'Account তৈরি করুন' : 'Login করুন'}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Pressable onPress={() => { setCreating((value) => !value); setMessage(''); }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{creating ? 'আগে থেকেই Account আছে? Login' : 'নতুন Account তৈরি করুন'}</Text>
            </Pressable>
            {!creating ? (
              <Pressable onPress={resetPassword} disabled={busy}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600' }}>পাসওয়ার্ড ভুলে গেছেন?</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
      {message ? <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{message}</Text> : null}
    </View>
  );
}
