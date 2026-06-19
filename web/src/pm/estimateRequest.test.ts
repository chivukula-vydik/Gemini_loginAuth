import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCellState } from './estimateRequest.ts';

test('estimateCellState: no estimate and no request -> Submit estimate', () => {
  const s = estimateCellState({ myEstimatedHours: null, myPendingHours: null });
  assert.equal(s.approvedHours, null);
  assert.equal(s.pending, null);
  assert.equal(s.buttonLabel, 'Submit estimate');
});

test('estimateCellState: pending request before any approval', () => {
  const s = estimateCellState({
    myEstimatedHours: null,
    myPendingHours: 8,
    myPendingValue: 1,
    myPendingUnit: 'days',
    myPendingReason: 'scope grew',
  });
  assert.equal(s.approvedHours, null);
  assert.deepEqual(s.pending, { value: 1, unit: 'days', hours: 8, reason: 'scope grew' });
  assert.equal(s.buttonLabel, 'Request estimate change');
});

test('estimateCellState: approved with no pending request', () => {
  const s = estimateCellState({ myEstimatedHours: 16, myPendingHours: null });
  assert.equal(s.approvedHours, 16);
  assert.equal(s.pending, null);
  assert.equal(s.buttonLabel, 'Request estimate change');
});

test('estimateCellState: approved plus a newer pending request', () => {
  const s = estimateCellState({
    myEstimatedHours: 16,
    myPendingHours: 24,
    myPendingValue: 24,
    myPendingUnit: 'hours',
    myPendingReason: '',
  });
  assert.equal(s.approvedHours, 16);
  assert.deepEqual(s.pending, { value: 24, unit: 'hours', hours: 24, reason: '' });
  assert.equal(s.buttonLabel, 'Request estimate change');
});
