import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntry, upsertPending, stampOutcome, summarize } from '../src/services/reestimations.js';

const at = new Date('2026-06-21T10:00:00Z');

test('buildEntry: captures the ask as a pending entry (from → to, reason, when)', () => {
  const e = buildEntry({
    taskId: 't1', taskTitle: 'Build API', projectId: 'p1', projectName: 'Apollo',
    fromHours: 16, value: 3, unit: 'days', toHours: 24, reason: 'scope grew', at,
  });
  assert.equal(e.taskId, 't1');
  assert.equal(e.taskTitle, 'Build API');
  assert.equal(e.projectName, 'Apollo');
  assert.equal(e.fromHours, 16);
  assert.equal(e.value, 3);
  assert.equal(e.unit, 'days');
  assert.equal(e.toHours, 24);
  assert.equal(e.reason, 'scope grew');
  assert.equal(e.status, 'pending');
  assert.equal(e.requestedAt, at);
  assert.equal(e.decidedAt, null);
});

test('upsertPending: a first ask is appended', () => {
  const e = buildEntry({ taskId: 't1', toHours: 24, at });
  const next = upsertPending([], e);
  assert.equal(next.length, 1);
  assert.equal(next[0].taskId, 't1');
});

test('upsertPending: re-asking the same task while still pending replaces, never duplicates', () => {
  const first = buildEntry({ taskId: 't1', toHours: 24, reason: 'a', at });
  const history = upsertPending([], first);
  const second = buildEntry({ taskId: 't1', toHours: 32, reason: 'b', at });
  const next = upsertPending(history, second);
  assert.equal(next.length, 1);
  assert.equal(next[0].toHours, 32);
  assert.equal(next[0].reason, 'b');
});

test('upsertPending: a new ask after a decided one is a separate entry (full history kept)', () => {
  let history = upsertPending([], buildEntry({ taskId: 't1', toHours: 24, at }));
  history = stampOutcome(history, 't1', 'approve', at);
  history = upsertPending(history, buildEntry({ taskId: 't1', toHours: 40, at }));
  assert.equal(history.length, 2);
  assert.equal(history[0].status, 'approved');
  assert.equal(history[1].status, 'pending');
});

test('upsertPending: a pending ask on a different task is its own entry', () => {
  let history = upsertPending([], buildEntry({ taskId: 't1', toHours: 24, at }));
  history = upsertPending(history, buildEntry({ taskId: 't2', toHours: 8, at }));
  assert.equal(history.length, 2);
});

test('stampOutcome: approves the matching pending entry and stamps when', () => {
  const decidedAt = new Date('2026-06-22T09:00:00Z');
  let history = upsertPending([], buildEntry({ taskId: 't1', toHours: 24, at }));
  history = stampOutcome(history, 't1', 'approve', decidedAt);
  assert.equal(history[0].status, 'approved');
  assert.equal(history[0].decidedAt, decidedAt);
});

test('stampOutcome: reject stamps rejected', () => {
  let history = upsertPending([], buildEntry({ taskId: 't1', toHours: 24, at }));
  history = stampOutcome(history, 't1', 'reject', at);
  assert.equal(history[0].status, 'rejected');
});

test('stampOutcome: only the pending entry for that task is touched', () => {
  let history = upsertPending([], buildEntry({ taskId: 't1', toHours: 24, at }));
  history = stampOutcome(history, 't1', 'approve', at);
  history = upsertPending(history, buildEntry({ taskId: 't1', toHours: 40, at }));
  history = stampOutcome(history, 't1', 'reject', at);
  assert.deepEqual(history.map((h) => h.status), ['approved', 'rejected']);
});

test('stampOutcome: no pending entry for the task leaves history unchanged', () => {
  const history = upsertPending([], buildEntry({ taskId: 't1', toHours: 24, at }));
  const next = stampOutcome(history, 't2', 'approve', at);
  assert.deepEqual(next, history);
});

test('summarize: rolls up totals by outcome', () => {
  let h = [];
  h = upsertPending(h, buildEntry({ taskId: 't1', toHours: 24, at }));
  h = stampOutcome(h, 't1', 'approve', at);
  h = upsertPending(h, buildEntry({ taskId: 't2', toHours: 8, at }));
  h = stampOutcome(h, 't2', 'reject', at);
  h = upsertPending(h, buildEntry({ taskId: 't3', toHours: 12, at }));
  assert.deepEqual(summarize(h), { total: 3, approved: 1, rejected: 1, pending: 1 });
});

test('summarize: empty history is all zeros', () => {
  assert.deepEqual(summarize([]), { total: 0, approved: 0, rejected: 0, pending: 0 });
});
