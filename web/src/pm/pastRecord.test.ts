import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastRecordLabel, isScopingRisk } from './pastRecord.ts';

test('pastRecordLabel: null when there is no history (keeps the row clean)', () => {
  assert.equal(pastRecordLabel(undefined), null);
  assert.equal(pastRecordLabel({ total: 0, approved: 0, rejected: 0, pending: 0 }), null);
});

test('pastRecordLabel: summarizes count and outcomes', () => {
  assert.equal(
    pastRecordLabel({ total: 12, approved: 8, rejected: 3, pending: 1 }),
    'asked re-estimation 12× · 8 approved, 3 rejected, 1 pending',
  );
});

test('pastRecordLabel: omits zero outcomes', () => {
  assert.equal(
    pastRecordLabel({ total: 2, approved: 2, rejected: 0, pending: 0 }),
    'asked re-estimation 2× · 2 approved',
  );
});

test('isScopingRisk: true at or above the threshold, false below', () => {
  assert.equal(isScopingRisk({ total: 3, approved: 0, rejected: 0, pending: 3 }), true);
  assert.equal(isScopingRisk({ total: 2, approved: 0, rejected: 0, pending: 2 }), false);
  assert.equal(isScopingRisk(undefined), false);
});
