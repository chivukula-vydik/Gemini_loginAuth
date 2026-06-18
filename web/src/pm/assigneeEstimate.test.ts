import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSummary } from './assigneeEstimate.ts';

test('estimateSummary: counts submitted, sums hours, allIn only when complete', () => {
  assert.deepEqual(
    estimateSummary([{ estimatedHours: 8 }, { estimatedHours: null }]),
    { submitted: 1, total: 8, count: 2, allIn: false },
  );
  assert.deepEqual(
    estimateSummary([{ estimatedHours: 8 }, { estimatedHours: 0 }]),
    { submitted: 2, total: 8, count: 2, allIn: true },
  );
  assert.deepEqual(estimateSummary([]), { submitted: 0, total: 0, count: 0, allIn: false });
});
