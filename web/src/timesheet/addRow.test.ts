import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankRow, rowFromAssignable, addableTasks } from './addRow.ts';

test('blankRow: an unlinked, editable row with the given name and zeroed entries', () => {
  const r = blankRow('Standup');
  assert.equal(r.name, 'Standup');
  assert.equal(r.taskId ?? null, null);
  assert.ok(!r.locked);
  assert.deepEqual(r.entries, { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 });
  assert.ok(r.id);
});

test('blankRow: defaults to an empty name ("No task assigned")', () => {
  assert.equal(blankRow().name, '');
});

test('rowFromAssignable: a locked row linked to the task, named after it', () => {
  const r = rowFromAssignable({ taskId: 't1', title: 'Build API', projectName: 'P', status: 'in_progress', estimatedHours: 8 });
  assert.equal(r.taskId, 't1');
  assert.equal(r.name, 'Build API');
  assert.equal(r.locked, true);
  assert.equal(r.status, 'in_progress');
  assert.equal(r.estimatedHours, 8);
  assert.deepEqual(r.entries, { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 });
});

test('addableTasks: hides tasks already present as a row in the week', () => {
  const assignable = [
    { taskId: 't1', title: 'A', projectName: 'P1', status: 'todo', estimatedHours: 8 },
    { taskId: 't2', title: 'B', projectName: 'P2', status: 'todo', estimatedHours: 4 },
  ];
  const rows = [{ id: 'r', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  assert.deepEqual(addableTasks(assignable, rows).map((a) => a.taskId), ['t2']);
});

test('addableTasks: unlinked rows never hide anything', () => {
  const assignable = [{ taskId: 't1', title: 'A', projectName: 'P1', status: 'todo', estimatedHours: 8 }];
  const rows = [{ id: 'r', name: 'Email', taskId: null, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  assert.deepEqual(addableTasks(assignable, rows).map((a) => a.taskId), ['t1']);
});
