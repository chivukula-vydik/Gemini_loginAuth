import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHours, estimateWorkingDays, endDateFrom, effectiveDueDate, taskHours, proposedDueDate, assigneeDueDate, maxAssigneeDueDate } from '../src/services/estimate.js';

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

test('taskHours: prefers approved estimate, falls back to estimatedHours', () => {
  assert.equal(taskHours({ estimateValue: 2, estimateUnit: 'days' }), 16);
  assert.equal(taskHours({ estimatedHours: 12 }), 12);
  assert.equal(taskHours({}), 0);
});

test('effectiveDueDate: uses manual dueDate when set', () => {
  const out = effectiveDueDate({ dueDate: '2026-07-01T00:00:00Z', startDate: '2026-06-16', estimatedHours: 40 });
  assert.deepEqual(out, { date: '2026-07-01', auto: false });
});

test('effectiveDueDate: computes start + estimate when no manual date', () => {
  // 2026-06-16 Tue + 40h (1 week, 5 working days) -> 2026-06-22, flagged auto
  const out = effectiveDueDate({ dueDate: null, startDate: '2026-06-16', estimateValue: 1, estimateUnit: 'weeks' });
  assert.deepEqual(out, { date: '2026-06-22', auto: true });
});

test('effectiveDueDate: null when no manual date and no start date', () => {
  const out = effectiveDueDate({ dueDate: null, startDate: null, estimatedHours: 40 });
  assert.deepEqual(out, { date: null, auto: true });
});

test('proposedDueDate: null unless a proposal is pending', () => {
  assert.equal(proposedDueDate({ dueProposalStatus: 'none' }), null);
  assert.equal(proposedDueDate({ dueProposalStatus: 'approved', dueProposalValue: 1, dueProposalUnit: 'weeks', dueProposalAt: '2026-06-16' }), null);
});

test('proposedDueDate: anchor + duration when proposed', () => {
  // anchor Tue 2026-06-16 + 1 week (5 working days) -> 2026-06-22
  const out = proposedDueDate({ dueProposalStatus: 'proposed', dueProposalValue: 1, dueProposalUnit: 'weeks', dueProposalAt: '2026-06-16T10:00:00Z' });
  assert.equal(out, '2026-06-22');
});

test('assigneeDueDate: start date + own hours (skips weekends)', () => {
  // Mon 2026-06-15, 16h = 2 working days -> Tue 2026-06-16
  assert.equal(assigneeDueDate({ startDate: '2026-06-15' }, { estimatedHours: 16 }), '2026-06-16');
});

test('assigneeDueDate: null when no start date or no estimate', () => {
  assert.equal(assigneeDueDate({ startDate: null }, { estimatedHours: 16 }), null);
  assert.equal(assigneeDueDate({ startDate: '2026-06-15' }, { estimatedHours: null }), null);
});

test('maxAssigneeDueDate: latest deadline across assignees', () => {
  const task = { startDate: '2026-06-15', assignees: [{ estimatedHours: 8 }, { estimatedHours: 40 }] };
  // 8h -> Mon 06-15; 40h (5 days) -> Fri 06-19; max = 06-19
  assert.equal(maxAssigneeDueDate(task), '2026-06-19');
});
