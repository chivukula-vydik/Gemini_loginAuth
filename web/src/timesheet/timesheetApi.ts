import { getAccessToken } from '../api';
import type { Day } from './time';
import type { SubmitStatus } from './submit';

const API = 'http://localhost:4000';

export type Entries = Record<Day, number>;
export type Task = {
  id: string;
  name: string;
  entries: Entries;
  taskId?: string | null;
  locked?: boolean;
  percentComplete?: number;
  estimatedHours?: number;
  actualMinutes?: number;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  projectId?: string | null;
};
export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Grant = { day: Day; projectId: string };

// A task the employee may add to the week via the "Add a task" picker.
export type Assignable = {
  taskId: string; title: string; projectName: string | null; status: string; estimatedHours: number;
};

export type WeekData = {
  weekStart: string; tasks: Task[]; assignable: Assignable[]; todayDay: Day | null; grants: Grant[]; pending: Grant[];
  readOnly: boolean; status: SubmitStatus; submittedAt: string | null; reviewedAt: string | null;
};

export async function getWeek(weekStart: string): Promise<WeekData> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, { headers: authHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data = await r.json();
  return {
    weekStart: data.weekStart,
    tasks: data.tasks as Task[],
    assignable: (data.assignable ?? []) as Assignable[],
    todayDay: (data.todayDay ?? null) as Day | null,
    grants: (data.grants ?? []) as Grant[],
    pending: (data.pending ?? []) as Grant[],
    readOnly: !!data.readOnly,
    status: (data.status ?? 'draft') as SubmitStatus,
    submittedAt: (data.submittedAt ?? null) as string | null,
    reviewedAt: (data.reviewedAt ?? null) as string | null,
  };
}

export async function createEditRequest(weekStart: string, day: Day, projectId: string, reason: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/edit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ day, projectId, reason }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `request failed (${r.status})`);
  }
}

export async function saveWeek(weekStart: string, tasks: Task[]): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ tasks }),
  });
  if (!r.ok) throw new Error(`save failed (${r.status})`);
}

export async function submitWeek(weekStart: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `submit failed (${r.status})`);
  }
}
