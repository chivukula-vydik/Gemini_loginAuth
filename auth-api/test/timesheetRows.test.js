import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWeekRows, sanitizeRows, currentMonday, todayDayFor, computeRowLock, canSubmit, weekLocked } from '../src/services/timesheetRows.js';

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

test('todayDayFor: returns the weekday matching today, else null', () => {
  assert.equal(todayDayFor('2026-06-15', '2026-06-17'), 'wed');
  assert.equal(todayDayFor('2026-06-08', '2026-06-17'), null); // past week
});

test('computeRowLock: in the current week, today and earlier days apply freely', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 99, tue: 0, wed: 60, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants: [] });
  assert.equal(rows[0].entries.wed, 60); // today applied
  assert.equal(rows[0].entries.mon, 99); // earlier day of the same week applied — no grant needed
  assert.deepEqual(consumed, []);
});

test('computeRowLock: in the current week, a future day stays locked without a grant', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 120 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const { rows } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants: [] });
  assert.equal(rows[0].entries.fri, 0); // future day not editable
});

test('computeRowLock: a future day in the current week stays locked even with a matching grant', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 120 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const grants = [{ day: 'fri', projectId: 'pA' }];
  const { rows } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants });
  assert.equal(rows[0].entries.fri, 0); // grants do not apply in the current week
});

test('computeRowLock: a granted project day in a past week applies and is consumed on change', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const grants = [{ day: 'mon', projectId: 'pA' }];
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: null, grants });
  assert.equal(rows[0].entries.mon, 120); // granted day applied
  assert.deepEqual(consumed, [{ day: 'mon', projectId: 'pA' }]); // consumed
});

test('computeRowLock: a no-op save does not consume an existing grant', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 45, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 45, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const grants = [{ day: 'mon', projectId: 'pA' }];
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: null, grants });
  assert.equal(rows[0].entries.mon, 45); // granted day, unchanged value stays
  assert.deepEqual(consumed, []); // no change → not consumed
});

test('computeRowLock: an unrelated project change does not apply or consume another project grant', () => {
  const submitted = [{ id: 'r2', name: 'B', taskId: 't2', entries: { mon: 90, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r2', name: 'B', taskId: 't2', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t2', 'pB']]);
  const grants = [{ day: 'mon', projectId: 'pA' }]; // grant is for pA, row is pB
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: null, grants });
  assert.equal(rows[0].entries.mon, 0); // pB mon locked
  assert.deepEqual(consumed, []); // pA grant untouched
});

test('computeRowLock: a day before the task start date is locked even in the current week', () => {
  // week of Mon 2026-06-15; task t1 assigned from Wed 2026-06-17
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 99, tue: 0, wed: 60, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const taskStartById = new Map([['t1', '2026-06-17']]);
  const { rows } = computeRowLock({
    submittedRows: submitted, savedRows: saved, taskProjectById, taskStartById,
    weekStart: '2026-06-15', todayDay: 'wed', grants: [],
  });
  assert.equal(rows[0].entries.mon, 0); // before start date → locked
  assert.equal(rows[0].entries.wed, 60); // start day → editable
});

test('computeRowLock: an ad-hoc cell in a past week is always locked and never consumed', () => {
  const submitted = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const grants = [{ day: 'mon', projectId: 'pA' }];
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById: new Map(), todayDay: null, grants });
  assert.equal(rows[0].entries.mon, 0); // ad-hoc, no grant possible → locked
  assert.deepEqual(consumed, []);
});

test('mergeWeekRows: injects startDate and computed endDate', () => {
  const assigned = [{ _id: 't1', title: 'Build', percentComplete: 0, estimatedHours: 40, actualMinutes: 0, status: 'todo', startDate: '2026-06-16' }];
  const rows = mergeWeekRows({ savedRows: [], assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  assert.equal(rows[0].startDate, '2026-06-16');
  assert.equal(rows[0].endDate, '2026-06-22'); // 40h = 5 working days from Tue
});

test('mergeWeekRows: rows carry projectId (null for ad-hoc)', () => {
  const assigned = [{ _id: 't1', title: 'Build', percentComplete: 0, estimatedHours: 8, actualMinutes: 0, status: 'todo', projectId: 'pA' }];
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const rows = mergeWeekRows({ savedRows: saved, assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  const taskRow = rows.find((r) => r.taskId === 't1');
  const adhoc = rows.find((r) => r.taskId === null);
  assert.equal(taskRow.projectId, 'pA');
  assert.equal(adhoc.projectId, null);
});

test('canSubmit: draft/returned for a started week are submittable', () => {
  assert.equal(canSubmit('draft', '2026-06-08', '2026-06-15'), true);
  assert.equal(canSubmit('returned', '2026-06-15', '2026-06-15'), true);
});

test('canSubmit: future weeks and submitted/approved are not submittable', () => {
  assert.equal(canSubmit('draft', '2026-06-22', '2026-06-15'), false);
  assert.equal(canSubmit('submitted', '2026-06-15', '2026-06-15'), false);
  assert.equal(canSubmit('approved', '2026-06-08', '2026-06-15'), false);
});

test('weekLocked: only submitted and approved are locked', () => {
  assert.equal(weekLocked('submitted'), true);
  assert.equal(weekLocked('approved'), true);
  assert.equal(weekLocked('draft'), false);
  assert.equal(weekLocked('returned'), false);
});
