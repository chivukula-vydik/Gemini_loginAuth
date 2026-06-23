import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAttendanceRow, attendanceLabel, attendanceIcon, attendanceIconColorClass, attendanceTooltip } from './attendanceRow.ts';
import type { AttendanceDoc } from '../attendance/attendanceApi.ts';

const dayDates = { mon: '2026-06-22', tue: '2026-06-23', wed: '2026-06-24', thu: '2026-06-25', fri: '2026-06-26' };

function doc(date: string, status: AttendanceDoc['status'], effectiveMinutes = 0, opts: { needsRegularise?: boolean; note?: string } = {}): AttendanceDoc {
  return {
    _id: date, userId: 'u1', date, checkIn: null, checkOut: null,
    totalMinutes: 0, breakMinutes: 0, effectiveMinutes, needsRegularise: opts.needsRegularise, status, punchType: 'office',
    breaks: [], note: opts.note ?? '',
    regularise: { status: 'none', reason: '', correctedCheckIn: null, correctedCheckOut: null, requestedAt: null, decidedBy: null, decidedAt: null },
  };
}

test('resolveAttendanceRow: a day with a doc shows its status, effective minutes, needsRegularise, and note', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'present', effectiveMinutes: 480, needsRegularise: undefined, note: '' });
});

test('resolveAttendanceRow: a leave day resolves directly from the doc (no separate leaveDays input)', () => {
  const docs = [doc('2026-06-22', 'leave', 0, { note: 'casual leave' })];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'leave', effectiveMinutes: 0, needsRegularise: undefined, note: 'casual leave' });
});

test('resolveAttendanceRow: a doc with needsRegularise passes the flag through', () => {
  const docs = [doc('2026-06-22', 'partial', 0, { needsRegularise: true })];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-26');
  assert.equal(row.mon?.needsRegularise, true);
});

test('resolveAttendanceRow: a past day with no doc, on/after activation, is absent', () => {
  const row = resolveAttendanceRow(dayDates, [], '2026-01-01', '2026-06-26');
  assert.deepEqual(row.tue, { status: 'absent', effectiveMinutes: 0 });
});

test('resolveAttendanceRow: a future day with no doc is blank', () => {
  const row = resolveAttendanceRow(dayDates, [], '2026-01-01', '2026-06-23');
  assert.equal(row.thu, null); // thu = 06-25, today = 06-23
});

test('resolveAttendanceRow: today with no doc is blank (the day is not over yet)', () => {
  const row = resolveAttendanceRow(dayDates, [], '2026-01-01', '2026-06-23');
  assert.equal(row.tue, null); // tue = 06-23 = today
});

test('resolveAttendanceRow: today WITH a doc still shows its real status', () => {
  const docs = [doc('2026-06-23', 'partial', 240)];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-23');
  assert.deepEqual(row.tue, { status: 'partial', effectiveMinutes: 240, needsRegularise: undefined, note: '' });
});

test('resolveAttendanceRow: before activation (or no activation yet) is blank, even in the past', () => {
  const row = resolveAttendanceRow(dayDates, [], null, '2026-06-26');
  assert.equal(row.mon, null);

  const rowLateActivation = resolveAttendanceRow(dayDates, [], '2026-06-24', '2026-06-26');
  assert.equal(rowLateActivation.mon, null);   // mon = 06-22, before activation 06-24
  assert.deepEqual(rowLateActivation.wed, { status: 'absent', effectiveMinutes: 0 }); // wed = 06-24, on activation day
});

test('attendanceLabel: maps every status to a display label', () => {
  assert.equal(attendanceLabel('present'), 'Present');
  assert.equal(attendanceLabel('wfh-partial'), 'WFH');
  assert.equal(attendanceLabel('holiday'), 'Holiday');
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

test('attendanceIconColorClass: present and wfh share the success color; leave shares the partial/warning color', () => {
  assert.equal(attendanceIconColorClass('present'), 'ts-th-icon-present');
  assert.equal(attendanceIconColorClass('wfh'), 'ts-th-icon-present');
  assert.equal(attendanceIconColorClass('partial'), 'ts-th-icon-partial');
  assert.equal(attendanceIconColorClass('leave'), 'ts-th-icon-partial');
  assert.equal(attendanceIconColorClass('absent'), 'ts-th-icon-absent');
  assert.equal(attendanceIconColorClass('holiday'), 'ts-th-icon-holiday');
});

test('attendanceTooltip: shows label + hours when there are meaningful hours', () => {
  assert.equal(attendanceTooltip('present', 495), 'Present — 8h 15m');
});

test('attendanceTooltip: omits hours when they are zero and meaningless', () => {
  assert.equal(attendanceTooltip('absent', 0), 'Absent');
  assert.equal(attendanceTooltip('partial', 0), 'Partial');
});

test('attendanceTooltip: leave shows its capitalized note instead of the generic label', () => {
  assert.equal(attendanceTooltip('leave', 0, false, 'casual leave'), 'Casual leave');
  assert.equal(attendanceTooltip('leave', 0, false, undefined), 'Leave');
});

test('attendanceTooltip: holiday shows label plus its note', () => {
  assert.equal(attendanceTooltip('holiday', 0, false, 'Founders Day'), 'Holiday — Founders Day');
  assert.equal(attendanceTooltip('holiday', 0, false, undefined), 'Holiday');
});

test('attendanceTooltip: needsRegularise overrides hours with the no-checkout message', () => {
  assert.equal(attendanceTooltip('partial', 480, true), 'Partial — no checkout, please regularise');
});
