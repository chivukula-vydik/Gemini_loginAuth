import type { Day } from './time.ts';
import { formatMinutes } from './time.ts';
import type { AttendanceDoc, AttendanceStatus } from '../attendance/attendanceApi.ts';

export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean; note?: string } | null;

const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Resolves what the timesheet's column-header icon should show for each
// weekday. Precedence: a real attendance doc — present/partial/absent/wfh/
// leave/holiday, however it was set (leave and holiday are stamped onto
// real docs by existing approval flows, same as a check-in) — wins. With no
// doc: blank for today (not yet over)/future/pre-activation days, else
// absent for any other past day with no doc.
export function resolveAttendanceRow(
  dayDates: Record<Day, string>,
  docs: AttendanceDoc[],
  activatedDate: string | null,
  today: string,
): Partial<Record<Day, AttendanceCell>> {
  const byDate = new Map(docs.map((d) => [d.date, d]));
  const out: Partial<Record<Day, AttendanceCell>> = {};

  for (const day of DAYS) {
    const date = dayDates[day];

    const doc = byDate.get(date);
    if (doc) {
      out[day] = { status: doc.status, effectiveMinutes: doc.effectiveMinutes, needsRegularise: doc.needsRegularise, note: doc.note };
      continue;
    }

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

const ICON_COLOR_CLASS: Record<AttendanceStatus, string> = {
  present: 'ts-th-icon-present', partial: 'ts-th-icon-partial', absent: 'ts-th-icon-absent',
  wfh: 'ts-th-icon-present', 'wfh-partial': 'ts-th-icon-present',
  leave: 'ts-th-icon-partial', holiday: 'ts-th-icon-holiday', weekend: '',
};

export function attendanceIconColorClass(status: AttendanceStatus): string {
  return ICON_COLOR_CLASS[status];
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function attendanceTooltip(
  status: AttendanceStatus,
  effectiveMinutes: number,
  needsRegularise?: boolean,
  note?: string,
): string {
  if (needsRegularise) return `${attendanceLabel(status)} — no checkout, please regularise`;
  if (status === 'leave') return note ? capitalize(note) : attendanceLabel(status);
  if (status === 'holiday') return note ? `${attendanceLabel(status)} — ${note}` : attendanceLabel(status);
  if (effectiveMinutes > 0) return `${attendanceLabel(status)} — ${formatMinutes(effectiveMinutes)}`;
  return attendanceLabel(status);
}
