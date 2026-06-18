import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allEstimatesIn, sumEstimatedHours, submittedCount, mergeAssignees } from '../src/services/assigneeEstimates.js';

test('allEstimatesIn: false when empty, false with a null, true when all submitted', () => {
  assert.equal(allEstimatesIn([]), false);
  assert.equal(allEstimatesIn([{ estimatedHours: 4 }, { estimatedHours: null }]), false);
  assert.equal(allEstimatesIn([{ estimatedHours: 4 }, { estimatedHours: 0 }]), true);
});

test('sumEstimatedHours: adds submitted, treats null as 0', () => {
  assert.equal(sumEstimatedHours([{ estimatedHours: 4 }, { estimatedHours: null }, { estimatedHours: 6 }]), 10);
});

test('submittedCount: counts non-null estimates', () => {
  assert.equal(submittedCount([{ estimatedHours: 0 }, { estimatedHours: null }, { estimatedHours: 6 }]), 2);
});

test('mergeAssignees: keeps existing hours by user id, new users get null', () => {
  const prev = [{ user: 'u1', sharePct: 50, estimatedHours: 12 }, { user: 'u2', sharePct: 50, estimatedHours: 8 }];
  const next = mergeAssignees(prev, ['u1', 'u3'], [60, 40]);
  assert.deepEqual(next, [
    { user: 'u1', sharePct: 60, estimatedHours: 12 },
    { user: 'u3', sharePct: 40, estimatedHours: null },
  ]);
});
