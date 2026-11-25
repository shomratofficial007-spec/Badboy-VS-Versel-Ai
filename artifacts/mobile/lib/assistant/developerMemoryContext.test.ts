import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeveloperMemoryContext } from './developerMemoryContext';

test('Developer Mode OFF skips every project-memory network lookup', async () => {
  let projectReads = 0;
  let memoryReads = 0;
  const context = await buildDeveloperMemoryContext(
    false,
    'hello',
    async () => { projectReads += 1; return [{ project_id: 'p1', name: 'project' }]; },
    async () => { memoryReads += 1; return [{ category: 'note', content: 'secret project note' }]; },
  );
  assert.equal(context, '');
  assert.equal(projectReads, 0);
  assert.equal(memoryReads, 0);
});

test('Developer Mode ON searches bounded project memory and caps context size', async () => {
  const searched: string[] = [];
  const projects = Array.from({ length: 11 }, (_, index) => ({
    project_id: 'p' + index,
    name: 'project-' + index,
  }));
  const context = await buildDeveloperMemoryContext(
    true,
    'find notes',
    async (limit) => {
      assert.equal(limit, 20);
      return projects;
    },
    async (projectId, query, limit) => {
      searched.push(projectId);
      assert.equal(query, 'find notes');
      assert.equal(limit, 3);
      return Array.from({ length: 3 }, (_, index) => ({
        category: 'note',
        content: 'x'.repeat(1_000) + index,
      }));
    },
  );
  assert.equal(searched.length, 10);
  assert.ok(!searched.includes('p10'));
  assert.ok(context.length <= 5_000);
  assert.equal(context.split('\n').length, 6);
});

test('project-memory lookup failures leave ordinary chat context empty', async () => {
  const context = await buildDeveloperMemoryContext(
    true,
    'query',
    async () => { throw new Error('storage unavailable'); },
    async () => [],
  );
  assert.equal(context, '');
});
