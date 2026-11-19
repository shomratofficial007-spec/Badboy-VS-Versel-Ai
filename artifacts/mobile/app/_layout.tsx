import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AssistantProvider } from '@/context/AssistantContext';
import { OwnerAuthProvider, useOwnerAuth } from '@/context/OwnerAuthContext';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { getOwnerToken } from '@/lib/assistant/ownerAuth';
import { Stack } from 'expo-router';

const domain = process.env.EXPO_PUBLIC_DOMAIN;
setBaseUrl(domain ? `https://${domain}` : null);
setAuthTokenGetter(getOwnerToken);

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { ready } = useOwnerAuth();

  // Do not let Expo Router render a deep-linked screen until the persisted
  // owner session has been restored and verified.
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071426' }}>
        <ActivityIndicator color="#00D9FF" />
      </View>
    );
  }

  // Keep both routes registered. The login screen and tabs layout enforce
  // their own redirects after session restoration.
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}>
      <Stack.Screen name="owner-login" options={{ headerShown: false, title: 'Owner Login' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Badboy AI' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <OwnerAuthProvider>
                <AssistantProvider>
                  <RootLayoutNav />
                </AssistantProvider>
              </OwnerAuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
