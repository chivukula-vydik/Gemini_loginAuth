import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus, calcMinutes, todayStr } from '../src/models/Attendance.js';

test('deriveStatus: absent when there is no checkIn', () => {
  assert.equal(deriveStatus({ checkIn: null, checkOut: null, punchType: 'office', effectiveMinutes: 0 }), 'absent');
});

test('deriveStatus: partial when checked in but not out (office)', () => {
  assert.equal(deriveStatus({ checkIn: new Date(), checkOut: null, punchType: 'office', effectiveMinutes: 0 }), 'partial');
});

test('deriveStatus: wfh-partial when checked in but not out (wfh)', () => {
  assert.equal(deriveStatus({ checkIn: new Date(), checkOut: null, punchType: 'wfh', effectiveMinutes: 0 }), 'wfh-partial');
});

test('deriveStatus: present for an 8h+ office day', () => {
  assert.equal(deriveStatus({ checkIn: new Date(), checkOut: new Date(), punchType: 'office', effectiveMinutes: 480 }), 'present');
});

test('deriveStatus: wfh for an 8h+ wfh day', () => {
  assert.equal(deriveStatus({ checkIn: new Date(), checkOut: new Date(), punchType: 'wfh', effectiveMinutes: 480 }), 'wfh');
});

test('deriveStatus: wfh-partial for a wfh day under 8h', () => {
  assert.equal(deriveStatus({ checkIn: new Date(), checkOut: new Date(), punchType: 'wfh', effectiveMinutes: 300 }), 'wfh-partial');
});

test('deriveStatus: partial for an office day under 8h', () => {
  assert.equal(deriveStatus({ checkIn: new Date(), checkOut: new Date(), punchType: 'office', effectiveMinutes: 120 }), 'partial');
});

test('calcMinutes: zero everything when there is no checkIn', () => {
  const result = calcMinutes({ checkIn: null, checkOut: null, breakMinutes: 0 });
  assert.deepEqual(result, { totalMinutes: 0, breakMinutes: 0, effectiveMinutes: 0 });
});

test('calcMinutes: zero everything when there is no checkOut', () => {
  const result = calcMinutes({ checkIn: new Date(), checkOut: null, breakMinutes: 0 });
  assert.deepEqual(result, { totalMinutes: 0, breakMinutes: 0, effectiveMinutes: 0 });
});

test('calcMinutes: a normal day with no breaks', () => {
  const checkIn = new Date('2026-06-22T09:30:00');
  const checkOut = new Date('2026-06-22T18:30:00');
  const result = calcMinutes({ checkIn, checkOut, breakMinutes: 0 });
  assert.deepEqual(result, { totalMinutes: 540, breakMinutes: 0, effectiveMinutes: 540 });
});

test('calcMinutes: subtracts breakMinutes from the total', () => {
  const checkIn = new Date('2026-06-22T09:30:00');
  const checkOut = new Date('2026-06-22T18:30:00');
  const result = calcMinutes({ checkIn, checkOut, breakMinutes: 60 });
  assert.deepEqual(result, { totalMinutes: 540, breakMinutes: 60, effectiveMinutes: 480 });
});

test('todayStr: returns a YYYY-MM-DD string matching the current local date', () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(todayStr(), expected);
});
