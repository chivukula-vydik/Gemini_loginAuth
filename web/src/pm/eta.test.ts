import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etaStatus } from './eta.ts';

test('etaStatus: none when no estimate is set', () => {
  assert.equal(etaStatus(null, '2026-06-22'), 'none');
  assert.equal(etaStatus('', '2026-06-22'), 'none');
});

test('etaStatus: on track when there is no deadline to violate', () => {
  assert.equal(etaStatus('2026-06-25T17:30:00.000Z', null), 'ontrack');
});

test('etaStatus: on track when the estimate is before the deadline', () => {
  assert.equal(etaStatus('2026-06-20T09:00:00.000Z', '2026-06-22'), 'ontrack');
});

test('etaStatus: same-day estimate is on track up to end of day', () => {
  assert.equal(etaStatus('2026-06-22T23:30:00.000Z', '2026-06-22'), 'ontrack');
  assert.equal(etaStatus('2026-06-22T23:59:59.999Z', '2026-06-22'), 'ontrack');
});

test('etaStatus: late once the estimate spills into the next day', () => {
  assert.equal(etaStatus('2026-06-23T00:00:00.000Z', '2026-06-22'), 'late');
  assert.equal(etaStatus('2026-06-25T17:30:00.000Z', '2026-06-22'), 'late');
});
