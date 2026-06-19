import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCellEditable, canRequestEdit } from './cellLock.ts';

const grants = [{ day: 'fri', projectId: 'pA' }] as const;
const pmTask = { taskId: 't1', projectId: 'pA' } as never;

test('today is always editable', () => {
  assert.equal(isCellEditable('wed', 'pA', 'wed', []), true);
});

test('a previous day of the current week is freely editable (no request)', () => {
  assert.equal(isCellEditable('mon', 'pA', 'wed', []), true);
  assert.equal(isCellEditable('tue', 'pB', 'wed', []), true);
});

test('a previous day with no project is still editable', () => {
  assert.equal(isCellEditable('mon', null, 'wed', []), true);
});

test('a future day of the current week is always locked (grants do not apply in the current week)', () => {
  assert.equal(isCellEditable('fri', 'pA', 'wed', []), false);
  assert.equal(isCellEditable('fri', 'pA', 'wed', grants as never), false);
});

test('canRequestEdit: a locked past day in a previous week can be requested', () => {
  assert.equal(canRequestEdit(true, false, true, pmTask), true);
});

test('canRequestEdit: never available in the current week', () => {
  assert.equal(canRequestEdit(false, false, true, pmTask), false);
});

test('canRequestEdit: not offered for an editable day', () => {
  assert.equal(canRequestEdit(true, true, true, pmTask), false);
});

test('canRequestEdit: not offered for an ad-hoc row without a PM task/project', () => {
  assert.equal(canRequestEdit(true, false, true, { taskId: null, projectId: null } as never), false);
});

test('past weeks (no todayDay) are only editable via a grant', () => {
  assert.equal(isCellEditable('mon', 'pA', null, []), false);
  assert.equal(isCellEditable('fri', 'pA', null, grants as never), true);
  assert.equal(isCellEditable('mon', null, null, grants as never), false);
});

test('a day before the task start date is never editable', () => {
  // week of Mon 2026-06-15 ... Fri 2026-06-19, task assigned from Wed 2026-06-17
  // Mon/Tue are before the start date → locked even though they are past days of the current week
  assert.equal(isCellEditable('mon', 'pA', 'wed', [], '2026-06-15', '2026-06-17'), false);
  assert.equal(isCellEditable('tue', 'pA', 'wed', [], '2026-06-16', '2026-06-17'), false);
  // the start day itself and later are editable
  assert.equal(isCellEditable('wed', 'pA', 'wed', [], '2026-06-17', '2026-06-17'), true);
});

test('the assignment gate also blocks a granted day before the start date', () => {
  const g = [{ day: 'mon', projectId: 'pA' }];
  assert.equal(isCellEditable('mon', 'pA', null, g as never, '2026-06-15', '2026-06-17'), false);
});
