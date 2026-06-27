const PRESENT_STATUSES = new Set(['present', 'wfh', 'partial', 'wfh-partial']);

export function computePayrollInput({ holidays, attendances, leaves, timesheets, month, year }) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const holidayDates = new Set(holidays.map(h => h.date));

  const weekdays = [];
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      weekdays.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  const payableDays = weekdays.filter(d => !holidayDates.has(d)).length;

  const presentDays = attendances.filter(a => PRESENT_STATUSES.has(a.status)).length;

  const approvedPaidLeaves = leaves.filter(l => l.status === 'approved' && l.type !== 'unpaid');
  const paidLeaveDays = approvedPaidLeaves.reduce((sum, l) => sum + (l.requestedDays || 0), 0);

  const absentDays = payableDays - presentDays - paidLeaveDays;
  const lopDays = Math.max(0, absentDays);

  let billableMinutes = 0;
  for (const ts of timesheets) {
    for (const entry of (ts.entries || [])) {
      const bill = entry.billable || {};
      const mins = entry.minutes || {};
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
        if (bill[day] && mins[day]) {
          billableMinutes += mins[day];
        }
      }
    }
  }

  return {
    payableDays,
    presentDays,
    paidLeaveDays,
    lopDays,
    otHours: 0,
    billableHours: Math.round((billableMinutes / 60) * 100) / 100,
  };
}
