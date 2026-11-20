import assert from 'node:assert';
import { mock, test } from 'node:test';

const legacyStorage = new Map<string, string>();
const asyncStorage = {
  getItem: async (key: string) => legacyStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => { legacyStorage.set(key, value); },
  removeItem: async (key: string) => { legacyStorage.delete(key); },
};
mock.module('@react-native-async-storage/async-storage', { defaultExport: asyncStorage });
mock.module('./storage', {
  namedExports: {
    readLocalState: async () => ({ messages: [], settings: {}, memories: [] }),
    storeMemoryNote: async () => undefined,
  },
});
const {
  generateDevelopmentPlan,
  getProjectBrainSummary,
  runAutoQASuite,
  getPluginRegistryStatus,
  executeAgentTask,
  detectMessageLanguage,
  performLiveWebResearch,
  buildStructuredReasoning,
  DEFAULT_REPO_CONFIG,
  createGitHubPullRequest,
  previewGitHubChanges,
} = await import('./developer');

test('detectMessageLanguage - identifies Bengali, Banglish, English, and mixed script', () => {
  assert.strictEqual(detectMessageLanguage('আজকের খবর কী?'), 'bn');
  assert.strictEqual(detectMessageLanguage('Kemon acho bhai, ki korcho?'), 'banglish');
  assert.strictEqual(detectMessageLanguage('What is the weather today?'), 'en');
  assert.strictEqual(detectMessageLanguage('Hello ভাই কেমন আছেন?'), 'mixed');
});

test('buildStructuredReasoning - generates 5-point structured reasoning response', () => {
  const res = buildStructuredReasoning({
    prompt: 'How to deploy Expo app?',
    lang: 'bn',
    answerText: 'Expo web export pnpm run build দিয়ে প্রস্তুত করুন।',
    explanationText: 'Cloudflare Workers static assets একই Worker থেকে API-এর সঙ্গে serve করা হয়।',
    sources: ['[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)'],
  });

  assert.ok(res.rawFormattedText.includes('১. মূল উত্তর'));
  assert.ok(res.rawFormattedText.includes('২. ব্যাখ্যা'));
  assert.ok(res.rawFormattedText.includes('৩. তথ্যসূত্র ও উৎস'));
  assert.ok(res.rawFormattedText.includes('৪. সীমাবদ্ধতা'));
});

test('performLiveWebResearch - deterministic mock test for successful search result', async () => {
  const originalFetch = globalThis.fetch;
  const mockHtml = `
    <html><body>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexpo.dev%2Fdocs">Expo Documentation</a>
      <a class="result__snippet">Build one project that runs natively on all devices using Expo React Native framework.</a>
    </body></html>
  `;

  globalThis.fetch = async () => new Response(mockHtml, { status: 200 });

  try {
    const research = await performLiveWebResearch('Expo React Native 52');
    assert.strictEqual(research.query, 'Expo React Native 52');
    assert.strictEqual(research.isFallbackLinkOnly, false);
    assert.strictEqual(research.results.length, 1);
    assert.strictEqual(research.results[0].title, 'Expo Documentation');
    assert.strictEqual(research.results[0].url, 'https://expo.dev/docs');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - removes nested tag delimiters from result text', async () => {
  const originalFetch = globalThis.fetch;
  const mockHtml = `
    <html><body>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Result <scrip<script>alert</script>t></a>
      <a class="result__snippet">Text <scrip<script>alert</script>t></a>
    </body></html>
  `;
  globalThis.fetch = async () => new Response(mockHtml, { status: 200 });

  try {
    const research = await performLiveWebResearch('Nested tag test');
    assert.strictEqual(research.results.length, 1);
    assert.ok(!/[<>]/.test(research.results[0].title));
    assert.ok(!/[<>]/.test(research.results[0].snippet));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for empty search results fallback link', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><body>No results</body></html>', { status: 200 });

  try {
    const research = await performLiveWebResearch('Empty Search Query');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.results.length, 1);
    assert.strictEqual(new URL(research.results[0].url).hostname, 'duckduckgo.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for malformed HTML and invalid URLs', async () => {
  const originalFetch = globalThis.fetch;
  const mockHtml = `
    <html><body>
      <a class="result__url" href="javascript:alert(1)">Invalid JS Link</a>
      <a class="result__snippet">Bad JS URL link</a>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvalid-domain.com">Valid Domain</a>
      <a class="result__snippet">Valid snippet content</a>
    </body></html>
  `;
  globalThis.fetch = async () => new Response(mockHtml, { status: 200 });

  try {
    const research = await performLiveWebResearch('Malformed HTML test');
    assert.strictEqual(research.isFallbackLinkOnly, false);
    assert.strictEqual(research.results.length, 1);
    assert.strictEqual(research.results[0].title, 'Valid Domain');
    assert.strictEqual(research.results[0].url, 'https://valid-domain.com/');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for HTTP error failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Server Error', { status: 500 });

  try {
    const research = await performLiveWebResearch('Search HTTP Fail');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.error, 'Search HTTP error 500');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for network rejection', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network Connection Refused');
  };

  try {
    const research = await performLiveWebResearch('Network Failure');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.error, 'Network Connection Refused');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for timeout/abort error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };

  try {
    const research = await performLiveWebResearch('Timeout test');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.error, 'Search request timed out');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeAgentTask - executes live web search when research prompt is detected', async () => {
  const originalFetch = globalThis.fetch;
  const mockHtml = `
    <html><body>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdevelopers.cloudflare.com%2Fworkers%2F">Cloudflare Workers</a>
      <a class="result__snippet">Build serverless applications with Cloudflare Workers.</a>
    </body></html>
  `;
  globalThis.fetch = async () => new Response(mockHtml, { status: 200 });

  try {
    const result = await executeAgentTask(' Search Cloudflare Workers docs', true);
    assert.strictEqual(result.state, 'completed');
    assert.ok(result.structuredAnswer);
    assert.ok(result.searchResults);
    assert.strictEqual(result.searchResults?.isFallbackLinkOnly, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeAgentTask - Android app launch requires explicit owner confirmation', async () => {
  const pending = await executeAgentTask('Open YouTube app', false, false);
  assert.equal(pending.state, 'permission_pending');
  assert.equal(pending.requiresConfirmation, true);
  const approved = await executeAgentTask('Open YouTube app', false, true);
  assert.equal(approved.state, 'completed');
  assert.deepEqual(approved.outputData, { action: 'open_allowed_app', appId: 'youtube' });
});

test('executeAgentTask - Android Settings shortcuts require confirmation and use an allowlist', async () => {
  const pending = await executeAgentTask('Open Wi-Fi settings', false, false);
  assert.equal(pending.state, 'permission_pending');
  const approved = await executeAgentTask('Open Wi-Fi settings', false, true);
  assert.deepEqual(approved.outputData, { action: 'open_device_settings', settingId: 'wifi' });
  const unsupported = await executeAgentTask('Open developer options settings', false, true);
  assert.equal(unsupported.outputData, undefined);
});

test('executeAgentTask - YouTube command distinguishes search opening vs in-app playback', async () => {
  const result = await executeAgentTask('Play a song on YouTube', true);
  assert.strictEqual(result.state, 'completed');
  assert.strictEqual(result.requiresInternet, true);
  assert.strictEqual(result.outputData?.action, 'open_youtube_search');
  assert.ok(result.summary.includes('YouTube অনুসন্ধান লিঙ্ক'));
});

test('executeAgentTask - queues YouTube command when offline', async () => {
  const result = await executeAgentTask('Play a song on YouTube', false);
  assert.strictEqual(result.state, 'offline_queued');
  assert.strictEqual(result.requiresInternet, true);
});

test('executeAgentTask - Gmail task returns not_connected when OAuth token is missing', async () => {
  const result = await executeAgentTask('Send an email via Gmail', true, false, undefined);
  assert.strictEqual(result.state, 'not_connected');
  assert.strictEqual(result.requiresInternet, true);
  assert.ok(result.summary.includes('Gmail API সংযুক্ত নয়'));
});

test('executeAgentTask - Gmail does not claim it can send without a structured message', async () => {
  const result = await executeAgentTask('Send an email via Gmail', true, false, 'mock-oauth-token');
  assert.strictEqual(result.state, 'failed');
  assert.strictEqual(result.requiresConfirmation, false);
  assert.match(result.summary, /কোনো email পাঠানো হয়নি/);
});

test('executeAgentTask - never claims a reminder was saved when local persistence fails', async () => {
  const result = await executeAgentTask('একটাই রিমাইন্ডার সেট করো', false);
  assert.strictEqual(result.requiresInternet, false);

  if (result.state === 'completed') {
    assert.strictEqual(result.outputData?.offlineStored, true);
    assert.ok(result.outputData?.noteId);
    assert.ok(result.summary.includes('সেভ'));
  } else {
    assert.strictEqual(result.state, 'failed');
    assert.strictEqual(result.outputData?.offlineStored, undefined);
    assert.ok(result.summary.includes('সেভ করা যায়নি'));
  }
});

test('generateDevelopmentPlan - parses Web Development request', () => {
  const plan = generateDevelopmentPlan('Build a website for my Telegram channel.');
  assert.strictEqual(plan.category, 'web');
  assert.strictEqual(plan.title, 'Telegram চ্যানল ও ওয়েব ল্যান্ডিং পেজ ওয়েবসাইট');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/server/templates/landing-page.html'));
});

test('generateDevelopmentPlan - parses Android App & APK Builder request', () => {
  const plan = generateDevelopmentPlan('Create an Android app and prepare an APK.');
  assert.strictEqual(plan.category, 'android');
  assert.strictEqual(plan.title, 'Android অ্যাপ ও APK/AAB বিল্ড কনফিগারেশন');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/app.json'));
});

test('generateDevelopmentPlan - parses Auto QA request', () => {
  const plan = generateDevelopmentPlan('Inspect this project, find bugs, and fix them.');
  assert.strictEqual(plan.category, 'qa');
  assert.strictEqual(plan.title, 'Auto QA & টেস্ট সুইট অটোমেশন');
});

test('generateDevelopmentPlan - initializes an empty dependency list for default and QA plans', () => {
  const defaultPlan = generateDevelopmentPlan('Prepare a personal assistant improvement');
  assert.strictEqual(defaultPlan.category, 'self');
  assert.deepStrictEqual(defaultPlan.dependencies, []);

  const qaPlan = generateDevelopmentPlan('Inspect and fix a broken test');
  assert.strictEqual(qaPlan.category, 'qa');
  assert.deepStrictEqual(qaPlan.dependencies, []);
});

test('getProjectBrainSummary - records the Cloudflare-only architecture', () => {
  const brain = getProjectBrainSummary();
  assert.strictEqual(brain.name, 'Badboy AI');
  assert.ok(brain.architecture.includes('one Cloudflare Worker'));
  assert.ok(brain.frameworks.includes('TypeScript'));
  assert.ok(brain.apiEndpoints.includes('/api/assistant/chat'));
  assert.match(brain.deploymentTarget, /badboy-vs-versel-ai/);
  assert.ok(brain.knownLimitations.some((item) => item.includes('Private Device Memory') && item.includes('Cloudflare D1 Project Memory')));
  assert.doesNotMatch(brain.architecture + brain.deploymentTarget, /Netlify|Express|Cloudflare Pages/i);
});

test('runAutoQASuite - does not claim checks passed when it has not executed them', () => {
  const qa = runAutoQASuite();
  assert.strictEqual(qa.typecheckStatus, 'not_run');
  assert.strictEqual(qa.unitTestsStatus, 'not_run');
  assert.strictEqual(qa.buildStatus, 'not_run');
  assert.strictEqual(qa.securityChecksStatus, 'not_run');
  assert.strictEqual(qa.details.length, 4);
  assert.ok(qa.details.every((detail) => detail.startsWith('NOT RUN')));
  assert.ok(!qa.details.some((detail) => /passing|verified|tested/i.test(detail)));
});

test('getPluginRegistryStatus - reports real setup state and Worker-only backend', () => {
  const plugins = getPluginRegistryStatus();
  assert.equal(plugins.find((p) => p.id === 'cloudflare-worker-api')?.status, 'active');
  assert.equal(plugins.find((p) => p.id === 'memory-adapter')?.status, 'active');
  assert.equal(plugins.find((p) => p.id === 'developer-analysis')?.status, 'active');
  assert.equal(plugins.find((p) => p.id === 'github-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'tavily-research-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'home-assistant-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'slack-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'discord-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'google-calendar-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'telegram-adapter')?.status, 'pending');
  assert.equal(plugins.find((p) => p.id === 'gmail-adapter')?.status, 'not_connected');
  assert.doesNotMatch(plugins.map((p) => p.name + ' ' + p.description).join(' '), /Cloudflare Pages Adapter|Netlify|Express API/i);
});

test('DEFAULT_REPO_CONFIG has target repository details', () => {
  assert.strictEqual(DEFAULT_REPO_CONFIG.owner, 'shomratofficial007-spec');
  assert.strictEqual(DEFAULT_REPO_CONFIG.repo, 'Badboy-VS-Versel-Ai');
  assert.strictEqual(DEFAULT_REPO_CONFIG.baseBranch, 'main');
});

test('previewGitHubChanges is read-only and returns the exact base SHA and file contents', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'preview-sha' } });
    if (url.includes('/contents/src/app.ts?ref=main')) {
      return Response.json({ type: 'file', encoding: 'base64', sha: 'blob-sha', content: btoa('export const ok = true;') });
    }
    throw new Error(`Unexpected preview request: ${method} ${url}`);
  };
  try {
    const result = await previewGitHubChanges({ githubToken: 'read-token', paths: ['src/app.ts'] });
    assert.equal(result.success, true);
    assert.equal(result.baseSha, 'preview-sha');
    assert.equal(result.files[0].content, 'export const ok = true;');
    assert.ok(calls.every((call) => call.method === 'GET'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('previewGitHubChanges rejects secret paths without reading them', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ object: { sha: 'sha' } }); };
  try {
    const result = await previewGitHubChanges({ githubToken: 'read-token', paths: ['.env.production'] });
    assert.equal(result.success, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GitHub default repository targets the current Badboy project', () => {
  assert.equal(DEFAULT_REPO_CONFIG.owner, 'shomratofficial007-spec');
  assert.equal(DEFAULT_REPO_CONFIG.repo, 'Badboy-VS-Versel-Ai');
});

test('GitHub write validation rejects traversal and secret paths before network access', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
  try {
    for (const path of ['../outside.ts', '.env.production', 'keys/signing.keystore']) {
      const result = await createGitHubPullRequest({
        githubToken: 'write-token',
        plan: generateDevelopmentPlan('Add a feature'),
        changes: [{ path, content: 'unsafe' }],
        approved: true,
        expectedBaseSha: 'preview-sha',
      });
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /নিরাপদ file path/);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GitHub writes stop unless owner approval is explicit', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
  try {
    const result = await createGitHubPullRequest({
      githubToken: 'write-token',
      plan: generateDevelopmentPlan('Add a feature'),
      changes: [{ path: 'src/feature.ts', content: 'export {};' }],
      approved: false,
      expectedBaseSha: 'preview-sha',
    });
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /স্পষ্ট অনুমোদন/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GitHub writes stop when the base branch changed after preview', async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_input, init) => {
    if ((init?.method ?? 'GET') !== 'GET') writes += 1;
    return Response.json({ object: { sha: 'newer-base-sha' } });
  };
  try {
    const plan = generateDevelopmentPlan('Add a feature');
    plan.branchName = 'feature/badboy-stale-preview';
    const result = await createGitHubPullRequest({
      githubToken: 'write-token',
      plan,
      changes: [{ path: 'src/feature.ts', content: 'export {};' }],
      approved: true,
      expectedBaseSha: 'older-preview-sha',
    });
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /নতুন করে read-only preview/);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createGitHubPullRequest - handles missing token gracefully', async () => {
  const plan = generateDevelopmentPlan('Add reminder');
  const result = await createGitHubPullRequest({
    githubToken: '',
    plan,
    changes: [{ path: 'test.txt', content: 'hello' }],
    approved: true,
    expectedBaseSha: 'expected-sha',
  });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes('Personal Access Token'));
});


test('executeAgentTask - never sends an empty Gmail payload even with an OAuth token', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return Response.json({ id: 'should-not-send' });
  };
  try {
    const result = await executeAgentTask('Send an email via Gmail', true, true, 'oauth-token');
    assert.equal(result.state, 'failed');
    assert.equal(result.requiresConfirmation, false);
    assert.match(result.summary, /কোনো Gmail API call করা হয়নি/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeAgentTask - unsupported and empty commands never report fake completion', async () => {
  const empty = await executeAgentTask('   ');
  assert.equal(empty.state, 'failed');
  assert.equal(empty.prompt, '');
  assert.equal(empty.detectedLanguage, 'en');
  assert.match(empty.summary, /কোনো কাজ সম্পন্ন/);

  const result = await executeAgentTask('আমার প্রজেক্টের অবস্থা ব্যাখ্যা করো', false);
  assert.equal(result.state, 'failed');
  assert.equal(result.requiresInternet, false);
  assert.equal(result.structuredAnswer, undefined);
  assert.match(result.summary, /কোনো কাজ করা হয়নি/);
});

test('createGitHubPullRequest - completes a mocked safe branch, file commit and PR flow', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body?: any; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body, authorization: headers.get('Authorization') });

    if (url.endsWith('/git/ref/heads/main')) {
      return Response.json({ object: { sha: 'base-commit-sha' } });
    }
    if (url.endsWith('/git/refs') && method === 'POST') {
      return Response.json({ ref: 'refs/heads/feature/badboy-test-branch' }, { status: 201 });
    }
    if (url.includes('/contents/notes.md?ref=')) {
      return Response.json({ sha: 'existing-file-sha' });
    }
    if (url.endsWith('/contents/notes.md') && method === 'PUT') {
      return Response.json({ content: { sha: 'committed-file-sha' } });
    }
    if (url.endsWith('/pulls') && method === 'POST') {
      return Response.json({ html_url: 'https://github.com/example/repo/pull/12', number: 12 });
    }
    throw new Error(`Unexpected GitHub API request: ${method} ${url}`);
  };

  try {
    const plan = generateDevelopmentPlan('Add a private project note');
    plan.branchName = 'feature/badboy-test-branch';
    const result = await createGitHubPullRequest({
      githubToken: '  test-github-token  ',
      plan,
      changes: [{ path: 'notes.md', content: 'Preserve existing project notes.' }],
      approved: true,
      expectedBaseSha: 'base-commit-sha',
    });

    assert.equal(result.success, true);
    assert.equal(result.prNumber, 12);
    assert.equal(result.prUrl, 'https://github.com/example/repo/pull/12');
    assert.equal(result.branchName, 'feature/badboy-test-branch');
    assert.ok(result.logs.some((entry) => entry.includes('সফলভাবে তৈরি হয়েছে! URL:')));
    assert.equal(calls.length, 5);
    assert.ok(calls.every((call) => call.authorization === 'Bearer test-github-token'));
    assert.equal(calls[2].method, 'GET');
    assert.equal(calls[3].body.sha, 'existing-file-sha');
    assert.equal(calls[4].body.head, 'feature/badboy-test-branch');
    assert.equal(calls[4].body.base, 'main');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createGitHubPullRequest - handles invalid credentials and missing base SHA without continuing', async (t) => {
  const originalFetch = globalThis.fetch;
  const plan = generateDevelopmentPlan('Add a private project note');
  try {
    await t.test('401 credentials return a clear authentication error', async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response('bad token', { status: 401 });
      };
      const result = await createGitHubPullRequest({
        githubToken: 'invalid-token',
        plan,
        changes: [{ path: 'notes.md', content: 'note' }],
        approved: true,
        expectedBaseSha: 'expected-base-sha',
      });
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /অকার্যকর/);
      assert.equal(calls, 1);
    });

    await t.test('missing base SHA fails before branch creation', async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return Response.json({ object: {} });
      };
      const result = await createGitHubPullRequest({
        githubToken: 'valid-token',
        plan,
        changes: [{ path: 'notes.md', content: 'note' }],
        approved: true,
        expectedBaseSha: 'expected-base-sha',
      });
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /SHA পাওয়া যায়নি/);
      assert.equal(calls, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createGitHubPullRequest - reports commit failures and does not create a PR', async () => {
  const originalFetch = globalThis.fetch;
  let pullRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'base-sha' } });
    if (url.endsWith('/git/refs')) return Response.json({ ref: 'refs/heads/feature/badboy-test' }, { status: 201 });
    if (url.includes('/contents/notes.md?ref=')) return new Response('not found', { status: 404 });
    if (url.endsWith('/contents/notes.md') && init?.method === 'PUT') {
      return new Response('write denied', { status: 403 });
    }
    if (url.endsWith('/pulls')) pullRequests += 1;
    throw new Error(`Unexpected API call: ${url}`);
  };

  try {
    const plan = generateDevelopmentPlan('Add a private project note');
    const result = await createGitHubPullRequest({
      githubToken: 'valid-token',
      plan,
      changes: [{ path: 'notes.md', content: 'note' }],
      approved: true,
      expectedBaseSha: 'base-sha',
    });
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /ফাইল কমিট করতে ব্যর্থ/);
    assert.equal(pullRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
