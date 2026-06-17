import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekBarSegment } from './bar.ts';

// week of Mon 2026-06-15 .. Fri 2026-06-19
test('fully inside the week', () => {
  assert.deepEqual(weekBarSegment('2026-06-15', '2026-06-16', '2026-06-18'),
    { startCol: 1, endCol: 3, continuesLeft: false, continuesRight: false });
});

test('continues into next week', () => {
  assert.deepEqual(weekBarSegment('2026-06-15', '2026-06-16', '2026-06-22'),
    { startCol: 1, endCol: 4, continuesLeft: false, continuesRight: true });
});

test('continues from a previous week', () => {
  assert.deepEqual(weekBarSegment('2026-06-15', '2026-06-08', '2026-06-17'),
    { startCol: 0, endCol: 2, continuesLeft: true, continuesRight: false });
});

test('not intersecting this week returns null', () => {
  assert.equal(weekBarSegment('2026-06-15', '2026-07-01', '2026-07-03'), null);
});

test('null dates return null', () => {
  assert.equal(weekBarSegment('2026-06-15', null, '2026-06-17'), null);
  assert.equal(weekBarSegment('2026-06-15', '2026-06-16', null), null);
});
