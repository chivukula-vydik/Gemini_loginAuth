import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayrollInput } from '../src/services/payrollBridge.js';

// June 2026: 22 weekdays (Mon-Fri), no holidays
test('computePayrollInput: full month, no absences, no holidays', () => {
  const holidays = [];
  const attendances = [];
  // Generate 22 present days (all weekdays of June 2026)
  const weekdays = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = `2026-06-${String(d).padStart(2, '0')}`;
      weekdays.push(ymd);
      attendances.push({ date: ymd, status: 'present' });
    }
  }
  const leaves = [];
  const timesheets = [];

  const result = computePayrollInput({ holidays, attendances, leaves, timesheets, month: 6, year: 2026 });

  assert.equal(result.payableDays, 22);
  assert.equal(result.presentDays, 22);
  assert.equal(result.paidLeaveDays, 0);
  assert.equal(result.lopDays, 0);
  assert.equal(result.billableHours, 0);
});

test('computePayrollInput: 2 holidays reduce payable days', () => {
  const holidays = [
    { date: '2026-06-01', name: 'H1', year: 2026 },
    { date: '2026-06-02', name: 'H2', year: 2026 },
  ];
  const attendances = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6 && d !== 1 && d !== 2) {
      attendances.push({ date: `2026-06-${String(d).padStart(2, '0')}`, status: 'present' });
    }
  }

  const result = computePayrollInput({ holidays, attendances, leaves: [], timesheets: [], month: 6, year: 2026 });

  assert.equal(result.payableDays, 20);
  assert.equal(result.presentDays, 20);
  assert.equal(result.lopDays, 0);
});

test('computePayrollInput: 3 absent days with 1 paid leave = 2 LOP', () => {
  const attendances = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      if (d <= 3) continue; // skip first 3 weekdays
      attendances.push({ date: `2026-06-${String(d).padStart(2, '0')}`, status: 'present' });
    }
  }
  const leaves = [
    { startDate: '2026-06-01', endDate: '2026-06-01', status: 'approved', type: 'casual', requestedDays: 1 },
  ];

  const result = computePayrollInput({ holidays: [], attendances, leaves, timesheets: [], month: 6, year: 2026 });

  assert.equal(result.payableDays, 22);
  assert.equal(result.presentDays, 19);
  assert.equal(result.paidLeaveDays, 1);
  assert.equal(result.lopDays, 2);
});

test('computePayrollInput: unpaid leave does NOT count as paid leave days', () => {
  const attendances = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      if (d === 1) continue;
      attendances.push({ date: `2026-06-${String(d).padStart(2, '0')}`, status: 'present' });
    }
  }
  const leaves = [
    { startDate: '2026-06-01', endDate: '2026-06-01', status: 'approved', type: 'unpaid', requestedDays: 1 },
  ];

  const result = computePayrollInput({ holidays: [], attendances, leaves, timesheets: [], month: 6, year: 2026 });

  assert.equal(result.paidLeaveDays, 0);
  assert.equal(result.lopDays, 1);
});

test('computePayrollInput: WFH counts as present', () => {
  const attendances = [
    { date: '2026-06-01', status: 'wfh' },
    { date: '2026-06-02', status: 'wfh-partial' },
    { date: '2026-06-03', status: 'present' },
  ];

  const result = computePayrollInput({ holidays: [], attendances, leaves: [], timesheets: [], month: 6, year: 2026 });

  assert.equal(result.presentDays, 3);
});

test('computePayrollInput: billable hours summed from timesheets', () => {
  const timesheets = [
    {
      weekStart: '2026-06-01',
      entries: [
        { billable: { mon: true, tue: true, wed: false, thu: false, fri: false }, minutes: { mon: 480, tue: 480, wed: 480, thu: 0, fri: 0 } },
      ],
    },
  ];

  const result = computePayrollInput({ holidays: [], attendances: [], leaves: [], timesheets, month: 6, year: 2026 });

  assert.equal(result.billableHours, 16); // 960 minutes / 60
});
