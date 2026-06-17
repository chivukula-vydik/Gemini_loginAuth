import type { Day } from './time';
import type { Grant } from './timesheetApi';

export function isCellEditable(
  day: Day,
  projectId: string | null | undefined,
  todayDay: Day | null,
  grants: Grant[],
): boolean {
  if (day === todayDay) return true;
  if (!projectId) return false;
  return grants.some((g) => g.day === day && g.projectId === projectId);
}
