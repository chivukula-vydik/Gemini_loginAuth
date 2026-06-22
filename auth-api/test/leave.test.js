import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateDays, workingDays } from '../src/models/Leave.js';

test('enumerateDays: a single-day range returns just that day', () => {
  assert.deepEqual(enumerateDays('2026-06-22', '2026-06-22'), ['2026-06-22']);
});

test('enumerateDays: a multi-day range returns every day inclusive', () => {
  assert.deepEqual(enumerateDays('2026-06-22', '2026-06-25'), [
    '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25',
  ]);
});

test('enumerateDays: a range crossing a month boundary', () => {
  assert.deepEqual(enumerateDays('2026-06-29', '2026-07-02'), [
    '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
  ]);
});

test('workingDays: a range including a weekend excludes Sat/Sun', () => {
  // 2026-06-22 is a Monday; range runs Mon..Sun (7 days, 5 weekdays).
  assert.equal(workingDays('2026-06-22', '2026-06-28'), 5);
});

test('workingDays: an all-weekday range counts every day', () => {
  // 2026-06-22 (Mon) through 2026-06-26 (Fri).
  assert.equal(workingDays('2026-06-22', '2026-06-26'), 5);
});

test('workingDays: an all-weekend range counts zero', () => {
  // 2026-06-27 (Sat) and 2026-06-28 (Sun).
  assert.equal(workingDays('2026-06-27', '2026-06-28'), 0);
});
