import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AssistantProvider, useAssistant } from '@/context/AssistantContext';
import { OwnerAuthProvider, useOwnerAuth } from '@/context/OwnerAuthContext';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { getOwnerRouteRedirect, getOwnerToken } from '@/lib/assistant/ownerAuth';
import { canDrawFloatingAssistant, startFloatingAssistant, stopFloatingAssistant } from '@/lib/assistant/jarvis';
import { Stack, useRouter, useSegments } from 'expo-router';

const domain = process.env.EXPO_PUBLIC_DOMAIN;
setBaseUrl(domain ? `https://${domain}` : null);
setAuthTokenGetter(getOwnerToken);

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { ready, authenticated } = useOwnerAuth();
  const { ready: assistantReady, settings } = useAssistant();
  const segments = useSegments();
  const router = useRouter();
  const redirect = getOwnerRouteRedirect(authenticated, segments);

  useEffect(() => {
    if (Platform.OS !== 'android' || !assistantReady) return;
    if (!settings.floatingAssistantEnabled) {
      void stopFloatingAssistant().catch(() => undefined);
      return;
    }
    if (!canDrawFloatingAssistant()) return;
    void startFloatingAssistant().catch(() => undefined);
    return () => { void stopFloatingAssistant().catch(() => undefined); };
  }, [assistantReady, settings.floatingAssistantEnabled]);

  useEffect(() => {
    if (!ready || !redirect) return;
    router.replace(redirect as never);
  }, [ready, redirect, router]);

  return (
    <Stack initialRouteName="owner-login" screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}>
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
