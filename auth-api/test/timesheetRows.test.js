import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWeekRows, sanitizeRows, currentMonday } from '../src/services/timesheetRows.js';

const z = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };

test('mergeWeekRows: editable week injects assigned tasks as locked rows', () => {
  const assigned = [{ _id: 't1', title: 'Build API', percentComplete: 25, estimatedHours: 8, actualMinutes: 120, status: 'in_progress' }];
  const rows = mergeWeekRows({ savedRows: [], assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, 't1');
  assert.equal(rows[0].name, 'Build API');
  assert.equal(rows[0].locked, true);
  assert.equal(rows[0].percentComplete, 25);
  assert.equal(rows[0].actualMinutes, 120);
  assert.equal(rows[0].status, 'in_progress');
  assert.deepEqual(rows[0].entries, z);
});

test('mergeWeekRows: merges saved minutes into the assigned row', () => {
  const saved = [{ id: 't1', name: 'old', taskId: 't1', entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const assigned = [{ _id: 't1', title: 'Build API', percentComplete: 0, estimatedHours: 8, actualMinutes: 60, status: 'todo' }];
  const rows = mergeWeekRows({ savedRows: saved, assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entries.mon, 60);
  assert.equal(rows[0].name, 'Build API');
});

test('mergeWeekRows: keeps ad-hoc rows and does not inject when not editable', () => {
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const rows = mergeWeekRows({ savedRows: saved, assignedTasks: [], taskInfoById: new Map(), editable: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, null);
  assert.equal(rows[0].locked, false);
  assert.equal(rows[0].entries.mon, 30);
});

test('sanitizeRows: keeps taskId only when assigned, cleans minutes', () => {
  const rows = sanitizeRows(
    [
      { id: 'x', name: 'A', taskId: 't1', entries: { mon: '60', tue: -5, wed: 0, thu: 0, fri: 0 } },
      { id: 'y', name: 'B', taskId: 'tHACK', entries: {} },
      { id: 'z', name: 'C', entries: { mon: 15 } },
    ],
    ['t1'],
  );
  assert.equal(rows[0].taskId, 't1');
  assert.equal(rows[0].entries.mon, 60);
  assert.equal(rows[0].entries.tue, 0);
  assert.equal(rows[1].taskId, null);
  assert.equal(rows[2].taskId, null);
  assert.equal(rows[2].entries.mon, 15);
});

test('currentMonday returns a Monday ISO date', () => {
  const m = currentMonday();
  assert.match(m, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${m}T00:00:00Z`).getUTCDay(), 1);
});
