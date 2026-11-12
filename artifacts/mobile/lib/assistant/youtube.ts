/**
 * YouTube search & link detection helper for JARVIS AI.
 */

export interface YouTubeIntent {
  query: string;
  url: string;
  appUrl: string;
}

// NOTE: callers normalise whitespace to single spaces before matching, so the
// second pattern uses optional single spaces (` ?`) instead of `\s*`. This keeps
// the same behaviour while avoiding regex backtracking (SonarCloud S5852).
const GENERAL_MUSIC_PATTERNS = [
  /^\s*(?:গান\s*শোনাও|গান\s*প্লে\s*করুন|গান_বাজাও|প্লে\s*আ\s*সং|play\s+a\s+song|play\s+music|music\s+please|গান\s*প্লে|gan\s*shunao|gan\s*shunaw|play\s*song|gan\s*play\s*koro)\s*$/i,
  /^(?:আমাকে ?)?(?:একটি|একটা)? ?(?:গান|মিউজিক|gan|music) ?(?:শোনাও|চালান|প্লে ?করুন|বাজাও|shunao|play|play ?koro)$/i,
];

export function isGeneralMusicRequest(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return false;
  return GENERAL_MUSIC_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isSeparator(char: string): boolean {
  return char === ',' || char === '.' || /\s/.test(char);
}

/** Trims leading/trailing commas, dots and whitespace without using a backtracking regex. */
function trimSeparators(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isSeparator(value[start])) start++;
  while (end > start && isSeparator(value[end - 1])) end--;
  return value.slice(start, end);
}

export function cleanSongQuery(raw: string): string {
  if (!raw) return 'Bangla songs';
  let cleaned = trimSeparators(raw);

  // Strip trailing filler phrases and Banglish command clauses. The trailing
  // patterns intentionally have no leading `\s*`; leftover whitespace is removed
  // by trimSeparators below.
  cleaned = cleaned
    .replace(/(?:,\s*)?(?:surch|search)\s*er\s*(?:1st|first|\d+st|\d+nd|\d+rd|\d+th)?\s*(?:gan\s*ta|song\s*ta|gan|song)?\s*(?:play\s*koro|play\s*kro|play|চালান|বাজাও)?/gi, '')
    .replace(/(?:play\s*koro|play\s*kro|play\s*করুন|চালান|বাজাও|প্লে\s*করুন|প্লে|play|shunao)\s*$/gi, '')
    .replace(/(?:gan\s*ta|gan|song)\s*$/gi, '');

  cleaned = trimSeparators(cleaned);

  return cleaned.length > 0 ? cleaned : raw.trim();
}

export function getYouTubeUrls(query: string): { url: string; appUrl: string } {
  const cleanQuery = cleanSongQuery(query);
  const encoded = encodeURIComponent(cleanQuery);
  return {
    url: `https://www.youtube.com/results?search_query=${encoded}`,
    appUrl: `vnd.youtube://results?search_query=${encoded}`,
  };
}

export function extractYouTubeIntent(text: string): YouTubeIntent | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Captured groups start with `\S` so they never overlap the preceding `\s*`/`\s+`
  // (avoids quadratic backtracking). Captures are trimmed below.
  const SONG_PATTERNS = [
    /play\s+(\S.*?)(?:on\s+youtube|$)/i,
    /open\s+youtube\s*(?:for|and\s+search|and\s+play)?\s*(.*)/i,
    /youtube\s*(?:a|e|-e)?\s*(\S.*?)(?:গান|প্লে|চালান|খুলুন|সার্চ|দেখান|$)/i,
    /^(.+?)(?:গানটি|গান|মিউজিক|গানটা)\s*(?:ইউটিউবে|youtube|play|প্লে|চালান|খুলুন|সার্চ|শুনুন)/i,
    /(?:ইউটিউবে|youtube-এ|youtube-এ|youtube)\s*(\S.*?)(?:গান|ভিডিও|সার্চ|প্লে|খুলুন)/i,
  ];

  for (const pattern of SONG_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const rawQuery = match[1]
        .replace(/^(গান|মিউজিক|ভিডিও|গানটি|গানটা|প্লে|চালান|খুলুন|সার্চ|দেখান|শুনুন)\s+/i, '')
        .replace(/\s(গান|মিউজিক|ভিডিও|গানটি|গানটা|প্লে|চালান|খুলুন|সার্চ|দেখান|শুনুন)$/i, '')
        .trim();

      const query = cleanSongQuery(rawQuery);
      if (query.length > 0) {
        const urls = getYouTubeUrls(query);
        return {
          query,
          ...urls,
        };
      }
    }
  }

  // Fallback: If user mentions YouTube/play
  if (
    /youtube|ইউটিউব/i.test(trimmed) &&
    /play|open|খুলুন|চালান|প্লে|গান|মিউজিক/i.test(trimmed)
  ) {
    const rawClean = trimmed
      .replace(/youtube|ইউটিউব|খুলুন|চালান|প্লে|গান|মিউজিক|play|open/gi, '')
      .trim();

    const query = cleanSongQuery(rawClean);
    const urls = getYouTubeUrls(query);
    return {
      query,
      ...urls,
    };
  }

  return null;
}
