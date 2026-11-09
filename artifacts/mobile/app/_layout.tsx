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
  const { ready, authenticated } = useOwnerAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071426' }}>
        <ActivityIndicator color="#00D9FF" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      {authenticated ? (
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      ) : (
        <Stack.Screen name="owner-login" options={{ headerShown: false }} />
      )}
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
