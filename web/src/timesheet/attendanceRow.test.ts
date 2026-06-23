import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAttendanceRow, attendanceLabel, attendanceBadgeClass, attendanceIcon } from './attendanceRow.ts';
import type { AttendanceDoc } from '../attendance/attendanceApi.ts';

const dayDates = { mon: '2026-06-22', tue: '2026-06-23', wed: '2026-06-24', thu: '2026-06-25', fri: '2026-06-26' };

function doc(date: string, status: AttendanceDoc['status'], effectiveMinutes = 0): AttendanceDoc {
  return {
    _id: date, userId: 'u1', date, checkIn: null, checkOut: null,
    totalMinutes: 0, breakMinutes: 0, effectiveMinutes, status, punchType: 'office',
    breaks: [], note: '',
    regularise: { status: 'none', reason: '', correctedCheckIn: null, correctedCheckOut: null, requestedAt: null, decidedBy: null, decidedAt: null },
  };
}

test('resolveAttendanceRow: a day with a doc shows its status and effective minutes', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, {}, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'present', effectiveMinutes: 480 });
});

test('resolveAttendanceRow: a past day with no doc, on/after activation, is absent', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.tue, { status: 'absent', effectiveMinutes: 0 });
});

test('resolveAttendanceRow: a future day with no doc is blank', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, '2026-01-01', '2026-06-23');
  assert.equal(row.thu, null); // thu = 06-25, today = 06-23
});

test('resolveAttendanceRow: today with no doc is blank (the day is not over yet)', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, '2026-01-01', '2026-06-23');
  assert.equal(row.tue, null); // tue = 06-23 = today
});

test('resolveAttendanceRow: today WITH a doc still shows its real status', () => {
  const docs = [doc('2026-06-23', 'partial', 240)];
  const row = resolveAttendanceRow(dayDates, docs, {}, '2026-01-01', '2026-06-23');
  assert.deepEqual(row.tue, { status: 'partial', effectiveMinutes: 240 });
});

test('resolveAttendanceRow: before activation (or no activation yet) is blank, even in the past', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, null, '2026-06-26');
  assert.equal(row.mon, null);

  const rowLateActivation = resolveAttendanceRow(dayDates, [], {}, '2026-06-24', '2026-06-26');
  assert.equal(rowLateActivation.mon, null);   // mon = 06-22, before activation 06-24
  assert.deepEqual(rowLateActivation.wed, { status: 'absent', effectiveMinutes: 0 }); // wed = 06-24, on activation day
});

test('resolveAttendanceRow: a day already marked as leave is blank regardless of any doc', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, { mon: 'Casual' }, '2026-01-01', '2026-06-26');
  assert.equal(row.mon, null);
});

test('attendanceLabel: maps every status to a display label', () => {
  assert.equal(attendanceLabel('present'), 'Present');
  assert.equal(attendanceLabel('wfh-partial'), 'WFH');
  assert.equal(attendanceLabel('holiday'), 'Holiday');
});

test('attendanceBadgeClass: maps every status to an att-tag class', () => {
  assert.equal(attendanceBadgeClass('present'), 'att-tag att-tag-present');
  assert.equal(attendanceBadgeClass('absent'), 'att-tag att-tag-absent');
});

test('attendanceIcon: maps every status to a distinct icon', () => {
  assert.equal(attendanceIcon('present'), '✓');
  assert.equal(attendanceIcon('partial'), '◑');
  assert.equal(attendanceIcon('absent'), '✕');
  assert.equal(attendanceIcon('wfh'), '⌂');
  assert.equal(attendanceIcon('wfh-partial'), '⌂');
  assert.equal(attendanceIcon('leave'), '✦');
  assert.equal(attendanceIcon('holiday'), '★');
});
