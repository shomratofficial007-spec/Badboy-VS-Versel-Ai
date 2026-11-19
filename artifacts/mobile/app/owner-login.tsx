import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useOwnerAuth } from '@/context/OwnerAuthContext';

export default function OwnerLoginScreen() {
  const { signIn } = useOwnerAuth();
  const [token, setToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Owner Login করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ImageBackground
          source={require('../assets/images/badboy-hooded-art.jpg')}
          resizeMode="cover"
          imageStyle={styles.heroArtworkImage}
          style={styles.hero}
          accessibilityLabel="Badboy AI hooded neon artwork"
        >
          <View style={styles.heroOverlay} />
          <Text style={styles.kicker}>THINK BEYOND LIMITS…</Text>
          <Text style={styles.brand}>Badboy <Text style={styles.brandAccent}>AI</Text></Text>
          <Text style={styles.tagline}>Smart  •  Secure  •  Powerful</Text>
        </ImageBackground>

        <View style={styles.loginCard}>
          <View style={styles.lockBadge}><Text style={styles.lockGlyph}>♙</Text></View>
          <Text style={styles.title}>OWNER <Text style={styles.titleAccent}>LOGIN</Text></Text>
          <Text style={styles.description}>Enter your Owner Token to access all Badboy AI features.</Text><Text style={styles.secureCaption}>Secure Sign In</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputGlyph}>⌑</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder="Paste Owner Token"
              placeholderTextColor="#a99ab8"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!tokenVisible}
              textContentType="password"
              style={styles.input}
              editable={!busy}
              accessibilityLabel="Owner Token"
            />
            <Pressable
              onPress={() => setTokenVisible((visible) => !visible)}
              accessibilityRole="button"
              accessibilityLabel={tokenVisible ? 'Hide Owner Token' : 'Show Owner Token'}
              style={styles.visibilityButton}
              hitSlop={10}
            >
              <Text style={styles.visibilityGlyph}>{tokenVisible ? '◉' : '◎'}</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={handleSignIn}
            disabled={busy || !token.trim()}
            accessibilityRole="button"
            accessibilityLabel="Login Now"
            style={({ pressed }) => [styles.button, (busy || !token.trim()) && styles.buttonDisabled, pressed && styles.buttonPressed]}
          >
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>⇥  Login Now</Text>}
          </Pressable>
          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>
          <View style={styles.warning}>
            <Text style={styles.warningIcon}>!</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Secure Owner Access</Text>
              <Text style={styles.warningText}>Without Owner Login, you cannot access the main app.</Text>
            </View>
          </View>
        </View>

        <View style={styles.features}>
          <View style={styles.feature}><Text style={styles.featureIcon}>◆</Text><Text style={styles.featureTitle}>Secure</Text><Text style={styles.featureCaption}>Access</Text></View>
          <View style={styles.feature}><Text style={styles.featureIcon}>♛</Text><Text style={styles.featureTitle}>Owner</Text><Text style={styles.featureCaption}>Control</Text></View>
          <View style={styles.feature}><Text style={styles.featureIcon}>ϟ</Text><Text style={styles.featureTitle}>Full Features</Text><Text style={styles.featureCaption}>Unlocked</Text></View>
          <View style={styles.feature}><Text style={styles.featureIcon}>◇</Text><Text style={styles.featureTitle}>Multi-AI</Text><Text style={styles.featureCaption}>Premium</Text></View>
        </View>
        <Text style={styles.version}>✦ BADBOY AI  •  V1.0.0 ✦</Text>
        <Text style={styles.footerTagline}>Built for the Real Power Users…</Text>
        <Text style={styles.note}>Token is stored securely in Android SecureStore. Chat History ও সাধারণ Memory ফোনেই থাকবে; Developer Agent-এর Project Memory ও Tasks Owner Token-সুরক্ষিত Cloudflare D1-এ সংরক্ষিত হয়.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07030d' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingTop: 28, paddingBottom: 28, gap: 18 },
  hero: { minHeight: 286, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 16, paddingTop: 22, overflow: 'hidden', borderRadius: 20, borderWidth: 1.5, borderColor: '#8b2cff', shadowColor: '#a020f0', shadowOpacity: 0.45, shadowRadius: 18, elevation: 8 },
  heroArtworkImage: { borderRadius: 18 },
  heroOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,2,12,0.18)' },
  orbitOuter: { width: 142, height: 142, borderRadius: 71, borderWidth: 2, borderColor: '#8b2cff', alignItems: 'center', justifyContent: 'center', shadowColor: '#a020f0', shadowOpacity: 0.9, shadowRadius: 22, elevation: 12, backgroundColor: '#160923' },
  orbitInner: { width: 116, height: 116, borderRadius: 58, borderWidth: 2, borderColor: '#f02b75', alignItems: 'center', justifyContent: 'center', backgroundColor: '#08030f' },
  heroMark: { color: '#f3e8ff', fontSize: 76, fontWeight: '900', textShadowColor: '#a020f0', textShadowRadius: 18 },
  kicker: { color: '#f3e8ff', fontSize: 11, fontWeight: '900', letterSpacing: 3, marginTop: 14, textShadowColor: '#8b2cff', textShadowRadius: 9 },
  brand: { color: '#ffffff', fontSize: 42, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1.8, textShadowColor: '#8b2cff', textShadowRadius: 15 },
  brandAccent: { color: '#ff315e' },
  tagline: { color: '#f1dfff', fontSize: 13, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  loginCard: { borderWidth: 1.5, borderColor: '#a52bff', borderRightColor: '#ff315e', borderRadius: 23, padding: 19, backgroundColor: '#100818', gap: 12, shadowColor: '#8b2cff', shadowOpacity: 0.32, shadowRadius: 18, elevation: 8 },
  lockBadge: { width: 48, height: 48, borderRadius: 15, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#251039', borderWidth: 1.5, borderColor: '#d946ef', marginTop: -40 },
  lockGlyph: { color: '#ffffff', fontSize: 25, fontWeight: '900' },
  title: { color: '#ffffff', fontSize: 27, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  titleAccent: { color: '#ff315e' },
  description: { color: '#d8c7e5', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  secureCaption: { color: '#d946ef', fontSize: 10, fontWeight: '800', textAlign: 'center', letterSpacing: 1.5, marginTop: -7 },
  inputWrap: { minHeight: 55, flexDirection: 'row', alignItems: 'center', borderWidth: 1.3, borderColor: '#8b2cff', borderRightColor: '#ff315e', borderRadius: 15, paddingHorizontal: 13, backgroundColor: '#08030f' },
  inputGlyph: { color: '#d946ef', fontSize: 24, marginRight: 9 },
  input: { flex: 1, minHeight: 52, color: '#ffffff', fontSize: 15 },
  visibilityButton: { minWidth: 36, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  visibilityGlyph: { color: '#d8a4ff', fontSize: 21, fontWeight: '800' },
  error: { color: '#ff718e', fontSize: 13, marginTop: -4 },
  button: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7c16d8', borderWidth: 1.5, borderColor: '#f044a3', shadowColor: '#a020f0', shadowOpacity: 0.45, shadowRadius: 13, elevation: 6 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  buttonText: { color: '#ffffff', fontSize: 19, fontWeight: '900', letterSpacing: 0.3 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#e52b50', borderRadius: 14, padding: 12, backgroundColor: '#1b0710' },
  orDivider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: '#6f2b91' },
  orText: { color: '#e9d5ff', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  footerTagline: { color: '#d8c7e5', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: -10 },
  warningIcon: { width: 29, height: 29, borderRadius: 15, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: '#ffffff', backgroundColor: '#e52b50', fontSize: 20, fontWeight: '900' },
  warningTitle: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  warningText: { color: '#ff9aaa', fontSize: 12, lineHeight: 17, marginTop: 2 },
  features: { flexDirection: 'row', gap: 7 },
  feature: { flex: 1, minHeight: 82, borderWidth: 1, borderColor: '#8b2cff', borderRadius: 13, backgroundColor: '#11081b', alignItems: 'center', justifyContent: 'center', padding: 5 },
  featureIcon: { color: '#e879f9', fontSize: 20, fontWeight: '900' },
  featureTitle: { color: '#ffffff', fontSize: 10, fontWeight: '800', marginTop: 4 },
  featureCaption: { color: '#c7a6d9', fontSize: 9 },
  version: { color: '#ed70ff', textAlign: 'center', fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  note: { color: '#a99ab8', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
