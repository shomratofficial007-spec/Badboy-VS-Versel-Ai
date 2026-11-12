import assert from 'node:assert';
import test from 'node:test';
import {
  cleanSongQuery,
  extractYouTubeIntent,
  getYouTubeUrls,
  isGeneralMusicRequest,
} from './youtube.ts';

test('isGeneralMusicRequest - identifies general music requests in Bangla and Banglish', () => {
  assert.strictEqual(isGeneralMusicRequest('গান শোনাও'), true);
  assert.strictEqual(isGeneralMusicRequest('গান_বাজাও'), true);
  assert.strictEqual(isGeneralMusicRequest('gan shunao'), true);
  assert.strictEqual(isGeneralMusicRequest('play a song'), true);
  assert.strictEqual(isGeneralMusicRequest('gan play koro'), true);
  assert.strictEqual(isGeneralMusicRequest('আজকের আবহাওয়া কেমন'), false);
  assert.strictEqual(isGeneralMusicRequest(''), false);
  assert.strictEqual(isGeneralMusicRequest('   '), false);
});

test('cleanSongQuery - strips Banglish filler phrases and isolates song name', () => {
  assert.strictEqual(cleanSongQuery('boro boro remix'), 'boro boro remix');
  assert.strictEqual(
    cleanSongQuery('boro boro remix, surch er 1st gan ta play koro'),
    'boro boro remix',
  );
  assert.strictEqual(cleanSongQuery('Rabindra Sangeet play koro'), 'Rabindra Sangeet');
  assert.strictEqual(cleanSongQuery(' , . Rabindra Sangeet , . '), 'Rabindra Sangeet');
});

test('getYouTubeUrls - formats web and Android app URLs', () => {
  const { url, appUrl } = getYouTubeUrls('Boro Boro Remix');
  assert.strictEqual(
    url,
    'https://www.youtube.com/results?search_query=Boro%20Boro%20Remix',
  );
  assert.strictEqual(
    appUrl,
    'vnd.youtube://results?search_query=Boro%20Boro%20Remix',
  );
});

test('extractYouTubeIntent - detects English and Banglish song requests', () => {
  const intent = extractYouTubeIntent('play Rabindra Sangeet on youtube');
  assert.ok(intent);
  if (!intent) throw new Error('Intent expected');
  assert.strictEqual(intent.query, 'Rabindra Sangeet');
  assert.ok(intent.url.includes('search_query=Rabindra%20Sangeet'));
  assert.ok(intent.appUrl.includes('vnd.youtube://'));
});

test('extractYouTubeIntent - handles YouTube-prefixed Bangla song requests', () => {
  const intent = extractYouTubeIntent('youtube a Imagine Dragons গান');
  assert.ok(intent);
  if (!intent) throw new Error('Intent expected');
  assert.strictEqual(intent.query, 'Imagine Dragons');
});


test('extractYouTubeIntent - supports Bengali song requests with bounded matching', () => {
  const banglaSuffix = extractYouTubeIntent('রবীন্দ্র সঙ্গীত গানটি ইউটিউবে');
  assert.ok(banglaSuffix);
  if (!banglaSuffix) throw new Error('Bangla suffix intent expected');
  assert.strictEqual(banglaSuffix.query, 'রবীন্দ্র সঙ্গীত');

  const youtubePrefix = extractYouTubeIntent('ইউটিউবে Imagine Dragons গান');
  assert.ok(youtubePrefix);
  if (!youtubePrefix) throw new Error('YouTube-prefixed Bangla intent expected');
  assert.strictEqual(youtubePrefix.query, 'Imagine Dragons');

  const english = extractYouTubeIntent('play Arijit Singh on youtube');
  assert.ok(english);
  if (!english) throw new Error('English intent expected');
  assert.strictEqual(english.query, 'Arijit Singh');
});

test('extractYouTubeIntent - returns null for non-YouTube queries', () => {
  const intent = extractYouTubeIntent('আজকের আবহাওয়া কেমন?');
  assert.strictEqual(intent, null);
});
