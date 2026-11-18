import { Redirect, useLocalSearchParams } from 'expo-router';

export default function JarvisDeepLink() {
  const params = useLocalSearchParams<{ screen_context?: string | string[] }>();
  const context = Array.isArray(params.screen_context) ? params.screen_context[0] : params.screen_context;
  return <Redirect href={context ? { pathname: '/(tabs)', params: { screen_context: context } } : '/(tabs)'} />;
}
