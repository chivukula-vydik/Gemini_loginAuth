import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, weekLocked } from './submit.ts';

test('canSubmit: draft/returned for a started week', () => {
  assert.equal(canSubmit('draft', '2026-06-08', '2026-06-15'), true);
  assert.equal(canSubmit('returned', '2026-06-15', '2026-06-15'), true);
});

test('canSubmit: future week or non-editable status is false', () => {
  assert.equal(canSubmit('draft', '2026-06-22', '2026-06-15'), false);
  assert.equal(canSubmit('submitted', '2026-06-15', '2026-06-15'), false);
  assert.equal(canSubmit('approved', '2026-06-08', '2026-06-15'), false);
});

test('weekLocked: only submitted/approved are locked', () => {
  assert.equal(weekLocked('submitted'), true);
  assert.equal(weekLocked('approved'), true);
  assert.equal(weekLocked('draft'), false);
  assert.equal(weekLocked('returned'), false);
});
