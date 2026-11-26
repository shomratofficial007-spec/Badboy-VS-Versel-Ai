import { Text, type StyleProp, type TextStyle } from 'react-native';
import { parseInlineMarkdown } from '@/lib/assistant/markdown';

interface MarkdownTextProps {
  children: string;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
}

/** Lightweight inline Markdown renderer for native chat bubbles. */
export function MarkdownText({ children, selectable = false, style }: MarkdownTextProps) {
  const tokens = parseInlineMarkdown(children);
  return (
    <Text selectable={selectable} style={style}>
      {tokens.map((token, index) => (
        <Text
          key={index}
          style={
            token.emphasis === 'bold'
              ? { fontWeight: '700' }
              : token.emphasis === 'italic'
                ? { fontStyle: 'italic' }
                : token.emphasis === 'code'
                  ? { fontFamily: 'monospace' }
                  : undefined
          }
        >
          {token.text}
        </Text>
      ))}
    </Text>
  );
}
