import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeInput,
  formatMinutes,
  mondayOf,
  addDays,
  columnDates,
} from './time.ts';

test('parseTimeInput: hours and minutes', () => {
  assert.equal(parseTimeInput('2h 30m'), 150);
  assert.equal(parseTimeInput('2h'), 120);
  assert.equal(parseTimeInput('30m'), 30);
  assert.equal(parseTimeInput('90m'), 90);
});

test('parseTimeInput: colon format', () => {
  assert.equal(parseTimeInput('2:30'), 150);
  assert.equal(parseTimeInput('0:45'), 45);
});

test('parseTimeInput: decimals and bare numbers', () => {
  assert.equal(parseTimeInput('1.5h'), 90);
  assert.equal(parseTimeInput('1.5'), 90);
  assert.equal(parseTimeInput('2'), 120);
});

test('parseTimeInput: empty and junk -> 0', () => {
  assert.equal(parseTimeInput(''), 0);
  assert.equal(parseTimeInput('   '), 0);
  assert.equal(parseTimeInput('abc'), 0);
});

test('formatMinutes: normalizes and pads', () => {
  assert.equal(formatMinutes(150), '2h 30m');
  assert.equal(formatMinutes(90), '1h 30m');
  assert.equal(formatMinutes(0), '0h 00m');
  assert.equal(formatMinutes(60), '1h 00m');
});

test('mondayOf and addDays', () => {
  assert.equal(mondayOf(new Date('2026-06-17T12:00:00Z')), '2026-06-15');
  assert.equal(addDays('2026-06-15', 7), '2026-06-22');
  assert.equal(addDays('2026-06-15', -7), '2026-06-08');
});

test('columnDates labels', () => {
  const cols = columnDates('2026-06-15');
  assert.equal(cols.mon, 'Mon 15');
  assert.equal(cols.fri, 'Fri 19');
});
