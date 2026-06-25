import type { TaskDetail } from './pmApi';
import { dueUrgency, type DueUrgency } from '../timesheet/due.ts';

export type TaskFilters = {
  query?: string;
  statuses?: string[];
  assignees?: string[];
  urgencies?: DueUrgency[];
};

function norm(v: string): string {
  return v.trim().toLowerCase();
}

function includesQuery(task: TaskDetail, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  if (task.title.toLowerCase().includes(q)) return true;
  return task.assignees.some((a) => {
    const name = (a.user.displayName || '').toLowerCase();
    const email = (a.user.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });
}

function includesStatus(task: TaskDetail, statuses: string[]): boolean {
  if (!statuses.length) return true;
  return statuses.includes(task.status);
}

function includesAssignee(task: TaskDetail, assigneeIds: string[]): boolean {
  if (!assigneeIds.length) return true;
  const set = new Set(assigneeIds);
  return task.assignees.some((a) => set.has(a.user._id));
}

function includesUrgency(task: TaskDetail, urgencies: DueUrgency[], today: string): boolean {
  if (!urgencies.length) return true;
  const raw = task.dueDate ? task.dueDate.slice(0, 10) : (task.effectiveDueDate ?? null);
  const urgency = dueUrgency(raw, today, task.status);
  return !!urgency && urgencies.includes(urgency);
}

export function filterTasks(tasks: TaskDetail[], filters: TaskFilters, todayISO: string): TaskDetail[] {
  const query = filters.query || '';
  const statuses = filters.statuses || [];
  const assignees = filters.assignees || [];
  const urgencies = filters.urgencies || [];

  return tasks.filter((task) => (
    includesQuery(task, query)
    && includesStatus(task, statuses)
    && includesAssignee(task, assignees)
    && includesUrgency(task, urgencies, todayISO)
  ));
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; totalPages: number } {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: safePage,
    totalPages,
  };
}
