import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalShares, normalizeShares, assigneeHours } from './workload.ts';

test('equalShares sums to 100, remainder first', () => {
  assert.deepEqual(equalShares(0), []);
  assert.deepEqual(equalShares(1), [100]);
  assert.deepEqual(equalShares(3), [34, 33, 33]);
});

test('normalizeShares clamps/scales to 100', () => {
  assert.deepEqual(normalizeShares([1, 1]), [50, 50]);
  assert.deepEqual(normalizeShares([0, 0]), [50, 50]);
  assert.deepEqual(normalizeShares([3, 3, 3]), [34, 33, 33]);
});

test('assigneeHours splits estimate by share', () => {
  assert.equal(assigneeHours(40, 50), 20);
  assert.equal(assigneeHours(40, 33), 13.2);
  assert.equal(assigneeHours(40, 0), 0);
});
