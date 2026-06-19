import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPACITY_HOURS, committedHours, classifyAvailability } from '../src/services/staffing.js';

test('CAPACITY_HOURS is 40 (8h x 5 days)', () => {
  assert.equal(CAPACITY_HOURS, 40);
});

test('committedHours: sums submitted per-assignee estimates over active tasks', () => {
  const entries = [
    { status: 'in_progress', estimatedHours: 8, taskEstimatedHours: 0, sharePct: 50 },
    { status: 'todo', estimatedHours: 12, taskEstimatedHours: 0, sharePct: 100 },
  ];
  assert.equal(committedHours(entries), 20);
});

test('committedHours: falls back to share math when a per-assignee estimate is missing', () => {
  // estimatedHours null -> assigneeHours(40, 50) = 20
  const entries = [{ status: 'todo', estimatedHours: null, taskEstimatedHours: 40, sharePct: 50 }];
  assert.equal(committedHours(entries), 20);
});

test('committedHours: never counts done tasks', () => {
  const entries = [
    { status: 'done', estimatedHours: 40, taskEstimatedHours: 0, sharePct: 100 },
    { status: 'in_progress', estimatedHours: 8, taskEstimatedHours: 0, sharePct: 100 },
  ];
  assert.equal(committedHours(entries), 8);
});

test('committedHours: empty is 0', () => {
  assert.equal(committedHours([]), 0);
});

test('classifyAvailability: under 20h is available with a load bar percentage', () => {
  assert.deepEqual(classifyAvailability(8), { status: 'available', loadPct: 20, hours: 8, capacity: 40 });
});

test('classifyAvailability: 20h to under 34h is standby', () => {
  assert.equal(classifyAvailability(20).status, 'standby');
  assert.equal(classifyAvailability(20).loadPct, 50);
  assert.equal(classifyAvailability(33.9).status, 'standby');
});

test('classifyAvailability: 34h and over is busy', () => {
  assert.equal(classifyAvailability(34).status, 'busy');
  assert.equal(classifyAvailability(40).status, 'busy');
});

test('classifyAvailability: over capacity clamps loadPct at 100, stays busy', () => {
  const c = classifyAvailability(48);
  assert.equal(c.status, 'busy');
  assert.equal(c.loadPct, 100);
});

test('classifyAvailability: boundary at 20 flips available -> standby', () => {
  assert.equal(classifyAvailability(19.9).status, 'available');
  assert.equal(classifyAvailability(20).status, 'standby');
});
