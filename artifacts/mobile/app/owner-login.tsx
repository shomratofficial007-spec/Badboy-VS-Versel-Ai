import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useOwnerAuth } from '@/context/OwnerAuthContext';

export default function OwnerLoginScreen() {
  const { signIn } = useOwnerAuth();
  const [token, setToken] = useState('');
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
      <View style={styles.card}>
        <Text style={styles.brand}>BADBOY</Text>
        <Text style={styles.title}>Owner Login</Text>
        <Text style={styles.description}>
          ব্যক্তিগত Badboy চালু করতে Cloudflare-এ সেট করা Owner Token দিন।
        </Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="Paste Owner Token"
          placeholderTextColor="#718096"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          style={styles.input}
          editable={!busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={handleSignIn}
          disabled={busy || !token.trim()}
          style={({ pressed }) => [
            styles.button,
            (busy || !token.trim()) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {busy ? <ActivityIndicator color="#071426" /> : <Text style={styles.buttonText}>Secure Sign In</Text>}
        </Pressable>
        <Text style={styles.note}>Token শুধু এই ডিভাইসের SecureStore-এ রাখা হবে। Chat History ও Memory ফোনেই থাকবে।</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#071426',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#0A1E3A',
    borderWidth: 1,
    borderColor: '#16456A',
  },
  brand: {
    color: '#00D9FF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  description: {
    color: '#B9C8D8',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 24,
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#285276',
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    backgroundColor: '#071426',
    fontSize: 15,
  },
  error: {
    color: '#FF8A8A',
    fontSize: 13,
    marginTop: 10,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D9FF',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#071426',
    fontSize: 15,
    fontWeight: '800',
  },
  note: {
    color: '#8FA6BD',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
  },
});
