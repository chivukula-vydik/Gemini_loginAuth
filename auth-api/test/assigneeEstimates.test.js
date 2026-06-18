import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allEstimatesIn, sumEstimatedHours, submittedCount } from '../src/services/assigneeEstimates.js';

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
