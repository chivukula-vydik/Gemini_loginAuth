import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHours, estimateWorkingDays, endDateFrom } from '../src/services/estimate.js';

test('toHours: converts each unit', () => {
  assert.equal(toHours(2, 'hours'), 2);
  assert.equal(toHours(2, 'days'), 16);
  assert.equal(toHours(2, 'weeks'), 80);
});

test('toHours: unknown unit or bad value is 0', () => {
  assert.equal(toHours(2, 'months'), 0);
  assert.equal(toHours(-3, 'hours'), 0);
  assert.equal(toHours('x', 'days'), 0);
});

test('estimateWorkingDays: ceil over 8h/day', () => {
  assert.equal(estimateWorkingDays(8), 1);
  assert.equal(estimateWorkingDays(20), 3);
  assert.equal(estimateWorkingDays(24), 3);
  assert.equal(estimateWorkingDays(30), 4);
  assert.equal(estimateWorkingDays(0), 0);
});

test('endDateFrom: spans working days, skipping weekends', () => {
  // 2026-06-16 is Tue. 40h = 1 week = 5 working days -> Tue,Wed,Thu,Fri,Mon
  assert.equal(endDateFrom('2026-06-16', 40), '2026-06-22');
  // 8h = 1 day -> same day
  assert.equal(endDateFrom('2026-06-16', 8), '2026-06-16');
  // 2026-06-18 is Thu. 24h = 3 days -> Thu,Fri,Mon
  assert.equal(endDateFrom('2026-06-18', 24), '2026-06-22');
});

test('endDateFrom: null start or zero hours', () => {
  assert.equal(endDateFrom(null, 40), null);
  assert.equal(endDateFrom('2026-06-16', 0), '2026-06-16');
});
