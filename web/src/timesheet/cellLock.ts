import type { Day } from './time';
import type { Grant } from './timesheetApi';

// Local copy of the weekday order so this module stays import-light and unit-testable.
const ORDER: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function isCellEditable(
  day: Day,
  projectId: string | null | undefined,
  todayDay: Day | null,
  grants: Grant[],
  columnDate?: string | null,
  startDate?: string | null,
): boolean {
  // A task is only editable on/after the day it was assigned (its start date).
  if (startDate && columnDate && columnDate < startDate) return false;
  // Current week (todayDay is set): today and any earlier weekday of the same
  // week are freely editable — no edit request needed.
  if (todayDay && ORDER.indexOf(day) <= ORDER.indexOf(todayDay)) return true;
  if (!projectId) return false;
  return grants.some((g) => g.day === day && g.projectId === projectId);
}
