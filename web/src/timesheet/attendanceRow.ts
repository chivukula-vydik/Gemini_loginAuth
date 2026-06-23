import type { Day } from './time';
import type { AttendanceDoc, AttendanceStatus } from '../attendance/attendanceApi';

export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number } | null;

const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Resolves what the timesheet's read-only attendance row should show for
// each weekday. Precedence: an already-known leave day wins (the column
// header already shows it) > a real attendance doc > blank for today (not
// yet over)/future/pre-activation days > absent for any other past day
// with no doc.
export function resolveAttendanceRow(
  dayDates: Record<Day, string>,
  docs: AttendanceDoc[],
  leaveDays: Partial<Record<Day, string>>,
  activatedDate: string | null,
  today: string,
): Partial<Record<Day, AttendanceCell>> {
  const byDate = new Map(docs.map((d) => [d.date, d]));
  const out: Partial<Record<Day, AttendanceCell>> = {};

  for (const day of DAYS) {
    const date = dayDates[day];
    if (leaveDays[day]) { out[day] = null; continue; }

    const doc = byDate.get(date);
    if (doc) { out[day] = { status: doc.status, effectiveMinutes: doc.effectiveMinutes }; continue; }

    if (date >= today || !activatedDate || date < activatedDate) { out[day] = null; continue; }

    out[day] = { status: 'absent', effectiveMinutes: 0 };
  }

  return out;
}

const LABELS: Record<AttendanceStatus, string> = {
  present: 'Present', partial: 'Partial', absent: 'Absent',
  wfh: 'WFH', 'wfh-partial': 'WFH', leave: 'Leave', holiday: 'Holiday', weekend: 'Weekend',
};

export function attendanceLabel(status: AttendanceStatus): string {
  return LABELS[status];
}

const ICONS: Record<AttendanceStatus, string> = {
  present: '✓', partial: '◑', absent: '✕',
  wfh: '⌂', 'wfh-partial': '⌂', leave: '✦', holiday: '★', weekend: '',
};

export function attendanceIcon(status: AttendanceStatus): string {
  return ICONS[status];
}

const BADGE_CLASS: Record<AttendanceStatus, string> = {
  present: 'att-tag att-tag-present', partial: 'att-tag att-tag-partial', absent: 'att-tag att-tag-absent',
  wfh: 'att-tag att-tag-wfh', 'wfh-partial': 'att-tag att-tag-wfh',
  leave: 'att-tag att-tag-leave', holiday: 'att-tag att-tag-holiday', weekend: 'att-tag',
};

export function attendanceBadgeClass(status: AttendanceStatus): string {
  return BADGE_CLASS[status];
}
