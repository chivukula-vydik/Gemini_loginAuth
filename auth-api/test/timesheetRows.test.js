import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWeekRows, assignableTasks, sanitizeRows, currentMonday, todayDayFor, computeRowLock, canSubmit, weekLocked } from '../src/services/timesheetRows.js';

const z = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };

test('mergeWeekRows: does not auto-inject assigned tasks — only saved rows appear', () => {
  // A task the user is assigned to but has not added/saved must NOT show up.
  const rows = mergeWeekRows({ savedRows: [], taskInfoById: new Map([['t1', { title: 'Build API' }]]) });
  assert.deepEqual(rows, []);
});

test('mergeWeekRows: a saved linked row renders locked with task metadata', () => {
  const saved = [{ id: 't1', name: 'old', taskId: 't1', entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const info = new Map([['t1', { title: 'Build API', percentComplete: 25, estimatedHours: 8, actualMinutes: 120, status: 'in_progress' }]]);
  const rows = mergeWeekRows({ savedRows: saved, taskInfoById: info });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, 't1');
  assert.equal(rows[0].name, 'Build API'); // name comes from the task, not the saved 'old'
  assert.equal(rows[0].locked, true);
  assert.equal(rows[0].percentComplete, 25);
  assert.equal(rows[0].actualMinutes, 120);
  assert.equal(rows[0].status, 'in_progress');
  assert.equal(rows[0].entries.mon, 60);
});

test('mergeWeekRows: keeps an ad-hoc (unlinked) row', () => {
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const rows = mergeWeekRows({ savedRows: saved, taskInfoById: new Map() });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, null);
  assert.equal(rows[0].locked, false);
  assert.equal(rows[0].entries.mon, 30);
});

test('assignableTasks: excludes tasks already saved in the week, keeps the rest', () => {
  const assigned = [
    { _id: 't1', title: 'A', projectName: 'P1', status: 'todo', estimatedHours: 8 },
    { _id: 't2', title: 'B', projectName: 'P2', status: 'in_progress', estimatedHours: 4 },
  ];
  const saved = [{ id: 'r1', taskId: 't1', entries: z }];
  assert.deepEqual(assignableTasks(assigned, saved), [
    { taskId: 't2', title: 'B', projectName: 'P2', status: 'in_progress', estimatedHours: 4 },
  ]);
});

test('assignableTasks: empty when every assigned task is already in the week', () => {
  const assigned = [{ _id: 't1', title: 'A', projectName: 'P1', status: 'todo', estimatedHours: 8 }];
  const saved = [{ id: 'r1', taskId: 't1', entries: z }];
  assert.deepEqual(assignableTasks(assigned, saved), []);
});

test('assignableTasks: never offers a done task', () => {
  const assigned = [{ _id: 't1', title: 'A', projectName: 'P', status: 'done', estimatedHours: 8 }];
  assert.deepEqual(assignableTasks(assigned, []), []);
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

test('mergeWeekRows: a saved linked row carries startDate + computed endDate', () => {
  const saved = [{ id: 't1', name: '', taskId: 't1', entries: z }];
  const info = new Map([['t1', { title: 'Build', estimatedHours: 40, startDate: '2026-06-16' }]]);
  const rows = mergeWeekRows({ savedRows: saved, taskInfoById: info });
  assert.equal(rows[0].startDate, '2026-06-16');
  assert.equal(rows[0].endDate, '2026-06-22'); // 40h = 5 working days from Tue
});

test('mergeWeekRows: a saved linked row carries projectId; ad-hoc is null', () => {
  const saved = [
    { id: 't1', name: '', taskId: 't1', entries: z },
    { id: 'a', name: 'Email', taskId: null, entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ];
  const info = new Map([['t1', { title: 'Build', projectId: 'pA' }]]);
  const rows = mergeWeekRows({ savedRows: saved, taskInfoById: info });
  assert.equal(rows.find((r) => r.taskId === 't1').projectId, 'pA');
  assert.equal(rows.find((r) => r.taskId === null).projectId, null);
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
