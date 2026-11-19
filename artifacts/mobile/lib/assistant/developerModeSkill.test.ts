import assert from 'node:assert/strict';
import test from 'node:test';
import { getDeveloperModeSkillContext } from './developerModeSkill';

test('automatically provides implementation, debugging, security and QA workflows', () => {
  const context = getDeveloperModeSkillContext();
  assert.match(context, /BADBOY DEVELOPER MODE/);
  assert.match(context, /Code implementation/);
  assert.match(context, /Debugging/);
  assert.match(context, /Code review and security/);
  assert.match(context, /Testing and QA/);
});

test('keeps tool access, owner approval and truthful reporting boundaries', () => {
  const context = getDeveloperModeSkillContext();
  assert.match(context, /Never claim/);
  assert.match(context, /Do not invent tool capabilities/);
  assert.match(context, /Ask before destructive actions/);
});
