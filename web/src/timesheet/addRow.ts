import { DAYS } from './time.ts';
import type { Task, Entries, Assignable } from './timesheetApi';

function zeroEntries(): Entries {
  const e = {} as Entries;
  DAYS.forEach((d) => { e[d] = 0; });
  return e;
}

// "No task assigned": a row the employee names themselves, tied to no task.
export function blankRow(name = ''): Task {
  return { id: crypto.randomUUID(), name, entries: zeroEntries() };
}

// A row linked to one of the employee's assigned tasks; its name is locked to
// the task and hours logged here feed that task's actuals.
export function rowFromAssignable(a: Assignable): Task {
  return {
    id: crypto.randomUUID(),
    name: a.title,
    description: a.description,
    taskId: a.taskId,
    locked: true,
    status: a.status,
    estimatedHours: a.estimatedHours,
    entries: zeroEntries(),
  };
}

// The picker only offers tasks not already added to the week. The server
// already excludes saved ones; this also hides rows added locally before a save.
export function addableTasks(assignable: Assignable[], rows: Task[]): Assignable[] {
  const inWeek = new Set(rows.filter((r) => r.taskId).map((r) => String(r.taskId)));
  return assignable.filter((a) => !inWeek.has(String(a.taskId)));
}
