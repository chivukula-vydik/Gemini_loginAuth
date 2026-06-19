import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCellState } from './estimateRequest.ts';

test('estimateCellState: empty when no estimate and no request (solo)', () => {
  const s = estimateCellState({ myEstimatedHours: null, myPendingHours: null, assigneeCount: 1 });
  assert.equal(s.state, 'empty');
  assert.equal(s.approvedHours, null);
  assert.equal(s.pendingHours, null);
  assert.equal(s.team, null);
});

test('estimateCellState: pending-new when a first request awaits approval', () => {
  const s = estimateCellState({ myEstimatedHours: null, myPendingHours: 24, assigneeCount: 1 });
  assert.equal(s.state, 'pending-new');
  assert.equal(s.pendingHours, 24);
  assert.equal(s.approvedHours, null);
});

test('estimateCellState: approved when there is an approved value and no pending request', () => {
  const s = estimateCellState({ myEstimatedHours: 24, myPendingHours: null, assigneeCount: 1 });
  assert.equal(s.state, 'approved');
  assert.equal(s.approvedHours, 24);
  assert.equal(s.pendingHours, null);
});

test('estimateCellState: pending-change when a request sits on top of an approved value', () => {
  const s = estimateCellState({ myEstimatedHours: 16, myPendingHours: 24, assigneeCount: 1 });
  assert.equal(s.state, 'pending-change');
  assert.equal(s.approvedHours, 16);
  assert.equal(s.pendingHours, 24);
});

test('estimateCellState: team present and finalized for a multi-assignee task', () => {
  const s = estimateCellState({
    myEstimatedHours: 16, myPendingHours: null, assigneeCount: 3,
    submittedCount: 3, estimatesPending: false, estimatedHours: 48,
  });
  assert.deepEqual(s.team, { total: 48, submitted: 3, count: 3, allIn: true });
});

test('estimateCellState: team pending shows counts and no total', () => {
  const s = estimateCellState({
    myEstimatedHours: null, myPendingHours: 8, assigneeCount: 4,
    submittedCount: 2, estimatesPending: true, estimatedHours: 0,
  });
  assert.deepEqual(s.team, { total: null, submitted: 2, count: 4, allIn: false });
});

test('estimateCellState: no team line for a solo assignee', () => {
  const s = estimateCellState({ myEstimatedHours: 16, myPendingHours: null, assigneeCount: 1 });
  assert.equal(s.team, null);
});
