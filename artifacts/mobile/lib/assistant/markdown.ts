export interface InlineMarkdownToken {
  text: string;
  emphasis: 'bold' | 'italic' | 'code' | 'plain';
}

/** Parse common inline Markdown without treating unmatched markers as formatting. */
export function parseInlineMarkdown(input: string): InlineMarkdownToken[] {
  const tokens: InlineMarkdownToken[] = [];
  const pattern = /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3|`([^`\n]+)`/g;
  let cursor = 0;
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: input.slice(cursor, index), emphasis: 'plain' });
    if (match[2] !== undefined) tokens.push({ text: match[2], emphasis: 'bold' });
    else if (match[4] !== undefined) tokens.push({ text: match[4], emphasis: 'italic' });
    else if (match[5] !== undefined) tokens.push({ text: match[5], emphasis: 'code' });
    cursor = index + match[0].length;
  }
  if (cursor < input.length) tokens.push({ text: input.slice(cursor), emphasis: 'plain' });
  return tokens;
}
