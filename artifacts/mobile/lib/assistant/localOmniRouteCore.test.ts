import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LocalAgenticWorkflowError,
  evaluateSafeExpression,
  isFreeOpenRouterModel,
  normalizeLocalOmniRouteBaseUrl,
  runLocalAgenticWorkflow,
} from './localOmniRouteCore';

test('local OmniRoute accepts loopback/private HTTP and public HTTPS only', () => {
  assert.equal(normalizeLocalOmniRouteBaseUrl('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
  assert.equal(normalizeLocalOmniRouteBaseUrl('http://localhost:8080/v1'), 'http://localhost:8080/v1');
  assert.equal(normalizeLocalOmniRouteBaseUrl('http://192.168.1.20:8080/v1'), 'http://192.168.1.20:8080/v1');
  assert.equal(normalizeLocalOmniRouteBaseUrl('https://router.example.com/v1'), 'https://router.example.com/v1');
  for (const value of [
    'http://router.example.com/v1',
    'http://8.8.8.8:8080/v1',
    'http://172.32.0.1:8080/v1',
    'http://10.0.0.1:8080/v1?token=secret',
    'http://user:pass@127.0.0.1:8080/v1',
    'http://0.0.0.0:8080/v1',
    'file:///etc/passwd',
    'not-a-url',
  ]) {
    assert.throws(() => normalizeLocalOmniRouteBaseUrl(value), value);
  }
});

test('local calculator evaluates safe arithmetic and rejects code or division by zero', () => {
  assert.equal(evaluateSafeExpression('2 + 3 * (4 - 1)'), 11);
  assert.equal(evaluateSafeExpression('-8 / 2 + 1'), -3);
  assert.throws(() => evaluateSafeExpression('globalThis.process'));
  assert.throws(() => evaluateSafeExpression('1 / 0'));
});

test('free fallback accepts only explicit OpenRouter free model identifiers', () => {
  assert.equal(isFreeOpenRouterModel('openrouter/free'), true);
  assert.equal(isFreeOpenRouterModel('cohere/north-mini-code:free'), true);
  assert.equal(isFreeOpenRouterModel('nvidia/nemotron-3.5-lightning:free'), true);
  assert.equal(isFreeOpenRouterModel('openai/gpt-4o'), false);
  assert.equal(isFreeOpenRouterModel('openrouter/auto'), false);
  assert.equal(isFreeOpenRouterModel(''), false);
});

test('Local OmniRoute executes Planner, Tool Calling, Executor, Reviewer and Synthesizer in order', async () => {
  const stages: string[] = [];
  const toolCalls: string[] = [];
  let executorRequests = 0;
  const output: string[] = [];
  await runLocalAgenticWorkflow({
    message: '2 + 2 কত?',
    personality: 'helpful',
    voiceLanguage: 'bn-BD',
    developerMode: false,
    history: [],
    memoryContext: '',
    skillContext: '',
    enabledPlugins: [],
    attachments: [],
    onStage: (agent, status) => { if (status === 'started') stages.push(agent); },
    requestCompletion: async (messages) => {
      const system = String(messages[0]?.content ?? '');
      if (system.includes('Badboy Planner')) {
        return { content: JSON.stringify({ goal: 'হিসাব', steps: [{ id: '1', task: 'হিসাব', success_criteria: 'ফল পাওয়া' }], risks: [] }), toolCalls: [] };
      }
      if (system.includes('Badboy Executor')) {
        executorRequests += 1;
        if (executorRequests === 1) {
          return { content: '', toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2 + 2"}' } }] };
        }
        return { content: 'ফলাফল ৪', toolCalls: [] };
      }
      if (system.includes('Badboy Reviewer')) return { content: 'হিসাব সঠিক', toolCalls: [] };
      throw new Error('Unexpected completion stage');
    },
    executeTool: async (name, args) => {
      toolCalls.push(name);
      assert.deepEqual(JSON.parse(args), { expression: '2 + 2' });
      return { ok: true, result: { value: 4 } };
    },
    streamFinal: async (_messages, onChunk) => { onChunk('উত্তর ৪'); },
    onChunk: (chunk) => output.push(chunk),
  });
  assert.deepEqual(stages, ['planner', 'tool-calling', 'executor', 'tool-calling', 'reviewer', 'synthesizer']);
  assert.deepEqual(toolCalls, ['calculator']);
  assert.deepEqual(output, ['উত্তর ৪']);
});

test('Local OmniRoute exposes executed-tool count so a failed workflow is never replayed on fallback', async () => {
  let executorRequests = 0;
  let executedTools = 0;
  await assert.rejects(
    () => runLocalAgenticWorkflow({
      message: '2 + 2',
      personality: '',
      voiceLanguage: 'bn-BD',
      developerMode: false,
      history: [],
      memoryContext: '',
      skillContext: '',
      enabledPlugins: [],
      attachments: [],
      requestCompletion: async (messages) => {
        const system = String(messages[0]?.content ?? '');
        if (system.includes('Badboy Planner')) {
          return { content: JSON.stringify({ goal: 'হিসাব', steps: [{ id: '1', task: 'হিসাব', success_criteria: 'ফল' }], risks: [] }), toolCalls: [] };
        }
        if (system.includes('Badboy Executor')) {
          executorRequests += 1;
          if (executorRequests === 1) {
            return { content: '', toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } }] };
          }
          throw new Error('local model disconnected');
        }
        throw new Error('Unexpected completion stage');
      },
      executeTool: async () => { executedTools += 1; return { ok: true, result: 4 }; },
      streamFinal: async () => {},
      onChunk: () => {},
    }),
    (error: unknown) => {
      assert.ok(error instanceof LocalAgenticWorkflowError);
      assert.equal(error.toolCallsExecuted, 1);
      assert.equal(executedTools, 1);
      return true;
    },
  );
});
