import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpertReviewPrompt, selectRelevantRepositoryPaths } from './expertReview';

test('selectRelevantRepositoryPaths excludes generated folders and limits results', () => {
  const paths = [
    'node_modules/react/index.js',
    'artifacts/mobile/app/(tabs)/settings.tsx',
    'functions/api/[[path]].ts',
    'README.md',
    'dist/bundle.js',
    'artifacts/mobile/lib/assistant/api.ts',
  ];
  assert.deepEqual(selectRelevantRepositoryPaths(paths, 3), [
    'artifacts/mobile/app/(tabs)/settings.tsx',
    'artifacts/mobile/lib/assistant/api.ts',
    'functions/api/[[path]].ts',
  ]);
});

test('expert review prompt distinguishes evidence from assumptions and forbids actions', () => {
  const prompt = buildExpertReviewPrompt(
    'Badboy said it cannot add this feature.',
    {
      status: 'verified',
      repository: 'shomratofficial007-spec/Badboy-VS-Versel-Ai',
      defaultBranch: 'main',
      checkedAt: '2026-11-06T00:00:00.000Z',
      filePaths: ['artifacts/mobile/app/(tabs)/settings.tsx'],
      note: 'File paths only; source contents were not inspected.',
    },
    'Expo React Native app with Cloudflare Worker API.',
  );

  assert.match(prompt, /VERIFIED FACTS/);
  assert.match(prompt, /Do not create or modify code/);
  assert.match(prompt, /File paths only/);
  assert.match(prompt, /PR পরিকল্পনা/);
});
