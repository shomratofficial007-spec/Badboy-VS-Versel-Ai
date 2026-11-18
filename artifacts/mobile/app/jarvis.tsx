import { Redirect, useLocalSearchParams } from 'expo-router';
import { useOwnerAuth } from '@/context/OwnerAuthContext';

export default function JarvisDeepLink() {
  const { ready, authenticated } = useOwnerAuth();
  const params = useLocalSearchParams<{ screen_context?: string | string[] }>();
  const context = Array.isArray(params.screen_context) ? params.screen_context[0] : params.screen_context;
  if (!ready) return null;
  if (!authenticated) return <Redirect href="/owner-login" />;
  return <Redirect href={context ? { pathname: '/(tabs)', params: { screen_context: context } } : '/(tabs)'} />;
}
