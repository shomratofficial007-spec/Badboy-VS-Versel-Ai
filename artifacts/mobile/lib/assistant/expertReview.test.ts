import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

let token: string | null = null;
mock.module('./developer', {
  namedExports: {
    getGitHubToken: async () => token,
  },
});

const { buildExpertReviewPrompt, inspectBadboyRepository, selectRelevantRepositoryPaths } =
  await import('./expertReview');

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  token = null;
});

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

test('selectRelevantRepositoryPaths handles zero and negative limits without including generated assets', () => {
  const paths = ['README.md', 'node_modules/pkg/index.js', 'artifacts/mobile/app/index.tsx'];
  assert.deepEqual(selectRelevantRepositoryPaths(paths, 0), []);
  assert.deepEqual(selectRelevantRepositoryPaths(paths, -1), ['README.md', 'artifacts/mobile/app/index.tsx']);
});

test('expert review prompt separates evidence, assumptions and forbidden actions', () => {
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
  assert.match(prompt, /PASTED BADBOY RESPONSE/);
});

test('inspectBadboyRepository returns not_connected without making a network request', async () => {
  token = null;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called without a token');
  };

  const evidence = await inspectBadboyRepository();
  assert.equal(evidence.status, 'not_connected');
  assert.equal(evidence.repository, 'shomratofficial007-spec/Badboy-VS-Versel-Ai');
  assert.deepEqual(evidence.filePaths, []);
  assert.match(evidence.note, /not connected/i);
  assert.equal(fetchCalls, 0);
});

test('inspectBadboyRepository verifies metadata and filters the live Git tree', async () => {
  token = 'test-owner-token';
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get('Authorization') });
    if (url === 'https://api.github.com/repos/shomratofficial007-spec/Badboy-VS-Versel-Ai') {
      return Response.json({ default_branch: 'trunk' });
    }
    if (url.includes('/git/trees/trunk?recursive=1')) {
      return Response.json({
        truncated: false,
        tree: [
          { type: 'blob', path: 'artifacts/mobile/app/index.tsx' },
          { type: 'blob', path: 'functions/api/[[path]].ts' },
          { type: 'blob', path: 'node_modules/pkg/index.js' },
          { type: 'tree', path: 'artifacts/mobile/lib' },
          { type: 'blob', path: 'assets/logo.png' },
          { type: 'blob', path: 'README.md' },
        ],
      });
    }
    throw new Error(`Unexpected GitHub URL: ${url}`);
  };

  const evidence = await inspectBadboyRepository();
  assert.equal(evidence.status, 'verified');
  assert.equal(evidence.defaultBranch, 'trunk');
  assert.deepEqual(evidence.filePaths, [
    'artifacts/mobile/app/index.tsx',
    'functions/api/[[path]].ts',
    'README.md',
  ]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.authorization === 'Bearer test-owner-token'));
  assert.match(evidence.note, /file paths were checked live/i);
  assert.ok(Number.isNaN(Date.parse(evidence.checkedAt)) === false);
});

test('inspectBadboyRepository reports a truncated tree as partial evidence', async () => {
  token = 'test-owner-token';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/Badboy-VS-Versel-Ai')) return Response.json({ default_branch: '' });
    return Response.json({ truncated: true, tree: [{ type: 'blob', path: 'README.md' }] });
  };

  const evidence = await inspectBadboyRepository();
  assert.equal(evidence.status, 'verified');
  assert.equal(evidence.defaultBranch, 'main');
  assert.match(evidence.note, /partial file inventory/i);
});

test('inspectBadboyRepository returns failed evidence for repository and tree HTTP errors', async (t) => {
  token = 'test-owner-token';
  await t.test('repository metadata denied', async () => {
    globalThis.fetch = async () => new Response('forbidden', { status: 403 });
    const evidence = await inspectBadboyRepository();
    assert.equal(evidence.status, 'failed');
    assert.deepEqual(evidence.filePaths, []);
    assert.match(evidence.note, /HTTP 403/);
  });

  await t.test('tree endpoint unavailable', async () => {
    globalThis.fetch = async (input) => {
      if (String(input).endsWith('/Badboy-VS-Versel-Ai')) return Response.json({ default_branch: 'main' });
      return new Response('not found', { status: 404 });
    };
    const evidence = await inspectBadboyRepository();
    assert.equal(evidence.status, 'failed');
    assert.match(evidence.note, /HTTP 404/);
  });
});

test('inspectBadboyRepository converts network and malformed-response failures to failed evidence', async (t) => {
  token = 'test-owner-token';
  await t.test('network failure', async () => {
    globalThis.fetch = async () => { throw new Error('socket unavailable'); };
    const evidence = await inspectBadboyRepository();
    assert.equal(evidence.status, 'failed');
    assert.equal(evidence.note, 'socket unavailable');
  });

  await t.test('non-Error rejection', async () => {
    globalThis.fetch = async () => { throw 'unexpected failure'; };
    const evidence = await inspectBadboyRepository();
    assert.equal(evidence.status, 'failed');
    assert.equal(evidence.note, 'GitHub repository verification failed.');
  });
});
