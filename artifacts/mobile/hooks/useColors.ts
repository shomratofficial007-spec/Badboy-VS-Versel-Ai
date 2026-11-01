import { useAssistant } from '@/context/AssistantContext';
import colors from '@/constants/colors';

export function useColors() {
  const { settings } = useAssistant();
  const palette = colors.themes[settings.theme] ?? colors.themes.neon;
  return { ...palette, radius: colors.radius };
}
