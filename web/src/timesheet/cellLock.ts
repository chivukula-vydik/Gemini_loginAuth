import type { Day } from './time';
import type { DayStatusEntry, Grant, Task } from './timesheetApi';

// Local copy of the weekday order so this module stays import-light and unit-testable.
const ORDER: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function isCellEditable(
  day: Day,
  projectId: string | null | undefined,
  todayDay: Day | null,
  grants: Grant[],
  columnDate?: string | null,
  startDate?: string | null,
  dayStatusEntry?: DayStatusEntry | null,
): boolean {
  // A submitted or approved day is locked regardless of where it falls in the week.
  if (dayStatusEntry && (dayStatusEntry.status === 'submitted' || dayStatusEntry.status === 'approved')) return false;
  // A task is only editable on/after the day it was assigned (its start date).
  if (startDate && columnDate && columnDate < startDate) return false;
  // Current week (todayDay is set): today and any earlier weekday are freely
  // editable; future days are always locked. Grants never apply in the current
  // week — they only unlock days in previous weeks.
  if (todayDay) return ORDER.indexOf(day) <= ORDER.indexOf(todayDay);
  if (!projectId) return false;
  return grants.some((g) => g.day === day && g.projectId === projectId);
}

// The "Request Timesheet Update" affordance is only for previous weeks: a locked,
// past day on a PM task with a project. Never offered in the current week.
export function canRequestEdit(weekIsPast: boolean, editable: boolean, isPast: boolean, task: Task): boolean {
  return weekIsPast && !editable && isPast && !!task.taskId && !!task.projectId;
}
