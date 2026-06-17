import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalShares, normalizeShares, assigneeHours } from '../src/services/workload.js';

test('equalShares sums to 100 with remainder on the first entries', () => {
  assert.deepEqual(equalShares(0), []);
  assert.deepEqual(equalShares(1), [100]);
  assert.deepEqual(equalShares(2), [50, 50]);
  assert.deepEqual(equalShares(3), [34, 33, 33]);
  assert.deepEqual(equalShares(4), [25, 25, 25, 25]);
});

test('normalizeShares scales/clamps to a total of 100', () => {
  assert.deepEqual(normalizeShares([]), []);
  assert.deepEqual(normalizeShares([50, 50]), [50, 50]);
  assert.deepEqual(normalizeShares([1, 1]), [50, 50]);
  assert.deepEqual(normalizeShares([0, 0]), [50, 50]); // all-zero -> equal
  assert.deepEqual(normalizeShares([3, 3, 3]), [34, 33, 33]);
  assert.deepEqual(normalizeShares([100]), [100]);
});

test('assigneeHours splits an estimate by share, rounded to 1 decimal', () => {
  assert.equal(assigneeHours(40, 50), 20);
  assert.equal(assigneeHours(40, 33), 13.2);
  assert.equal(assigneeHours(0, 50), 0);
  assert.equal(assigneeHours(40, 0), 0);
  assert.equal(assigneeHours(-5, 50), 0);
});
