import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionCounts, completionStats, onTimeStats } from '../src/services/reputation.js';

test('directionCounts splits under/over/same by from->to hours', () => {
  const h = [
    { fromHours: 4, toHours: 8 },  // under-scoped
    { fromHours: 10, toHours: 6 }, // over-scoped
    { fromHours: 5, toHours: 5 },  // same
  ];
  assert.deepEqual(directionCounts(h), { under: 1, over: 1, same: 1 });
  assert.deepEqual(directionCounts([]), { under: 0, over: 0, same: 0 });
});

test('completionStats counts done over assigned', () => {
  const tasks = [{ status: 'done' }, { status: 'in_progress' }, { status: 'done' }, { status: 'todo' }];
  assert.deepEqual(completionStats(tasks), { done: 2, assigned: 4, rate: 0.5 });
  assert.deepEqual(completionStats([]), { done: 0, assigned: 0, rate: 0 });
});

test('onTimeStats only measures done tasks with completedAt and dueDate', () => {
  const day = (n) => new Date(2026, 0, n).toISOString();
  const tasks = [
    { status: 'done', dueDate: day(10), completedAt: day(9) },   // 1 day early -> on time
    { status: 'done', dueDate: day(10), completedAt: day(13) },  // 3 days late
    { status: 'done', dueDate: day(10), completedAt: null },     // unmeasured
    { status: 'in_progress', dueDate: day(10), completedAt: null },
  ];
  const s = onTimeStats(tasks);
  assert.equal(s.measured, 2);
  assert.equal(s.onTime, 1);
  assert.equal(s.rate, 0.5);
  assert.equal(s.avgDelayDays, 1.5); // (0 + 3) / 2
});

test('onTimeStats with nothing measured returns null rate/avgDelay', () => {
  assert.deepEqual(onTimeStats([]), { measured: 0, onTime: 0, rate: null, avgDelayDays: null });
});
