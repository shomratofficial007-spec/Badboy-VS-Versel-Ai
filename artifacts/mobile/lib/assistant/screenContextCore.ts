export function normalizeVisibleScreenText(value: string): string {
  if (typeof value !== 'string') return '';
  const safeValue = Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return !(code <= 0x08 || code === 0x0B || code === 0x0C || (code >= 0x0E && code <= 0x1F) || code === 0x7F);
  }).join('');
  const lines = safeValue
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const unique = [...new Set(lines)];
  return unique.join('\n').slice(0, 4_500).trim();
}
