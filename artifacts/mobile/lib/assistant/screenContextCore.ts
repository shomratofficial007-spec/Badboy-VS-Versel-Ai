export function normalizeVisibleScreenText(value: string): string {
  if (typeof value !== 'string') return '';
  const lines = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const unique = [...new Set(lines)];
  return unique.join('\n').slice(0, 4_500).trim();
}
