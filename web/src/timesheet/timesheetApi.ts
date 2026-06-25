import { getAccessToken } from '../api';
import type { Day } from './time';
import type { SubmitStatus } from './submit';

export type DayStatusEntry = {
  status: SubmitStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string;
};
export type DayStatusMap = Record<Day, DayStatusEntry>;

const API = 'http://localhost:4000';

export type Entries = Record<Day, number>;
export type Notes = Record<Day, string>;
export type BillableMap = Record<Day, boolean | null>;
export type Task = {
  id: string;
  name: string;
  description?: string;
  entries: Entries;
  notes: Notes;
  taskId?: string | null;
  locked?: boolean;
  percentComplete?: number;
  estimatedHours?: number;
  actualMinutes?: number;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  projectId?: string | null;
  projectName?: string;
  clientName?: string;
  billable?: BillableMap;
  effectiveBillable?: Record<Day, boolean>;
  hidden?: boolean;
};
export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Grant = { day: Day; projectId: string };

// A task the employee may add to the week via the "Add a task" picker.
export type Assignable = {
  taskId: string; title: string; description?: string; projectName: string | null; status: string; estimatedHours: number;
};

export type ProjectRef = { _id: string; name: string };

export type Attachment = {
  fileId: string; filename: string; contentType: string; size: number; uploadedAt: string;
};

export type WeekData = {
  weekStart: string; tasks: Task[]; assignable: Assignable[]; todayDay: Day | null; grants: Grant[]; pending: Grant[];
  readOnly: boolean; status: SubmitStatus; submittedAt: string | null; reviewedAt: string | null;
  rejectionReason: string; targetMinutes: number; dayStatus: DayStatusMap; projects: ProjectRef[];
  attachments: Attachment[];
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
    rejectionReason: String(data.rejectionReason ?? ''),
    targetMinutes: Number(data.targetMinutes ?? 2400),
    dayStatus: (data.dayStatus ?? {}) as DayStatusMap,
    projects: (data.projects ?? []) as ProjectRef[],
    attachments: (data.attachments ?? []) as Attachment[],
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

export async function getProjectTasks(projectId: string): Promise<Assignable[]> {
  const r = await fetch(`${API}/timesheets/tasks?projectId=${projectId}`, { headers: authHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data: Array<{ taskId: string; title: string; description?: string; status: string; estimatedHours: number }> = await r.json();
  return data.map((t) => ({ ...t, projectName: null }));
}

export async function createTimesheetTask(title: string, projectId: string): Promise<Assignable> {
  const r = await fetch(`${API}/timesheets/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ title, projectId }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `create failed (${r.status})`);
  }
  return r.json();
}

export async function submitDays(weekStart: string, days: Day[]): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ days }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `submit failed (${r.status})`);
  }
}

export async function uploadAttachment(weekStart: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${API}/timesheets/${weekStart}/attachments`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: form,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `upload failed (${r.status})`);
  }
  return r.json();
}

export async function deleteAttachment(weekStart: string, fileId: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/attachments/${fileId}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `delete failed (${r.status})`);
  }
}

export function attachmentUrl(fileId: string): string {
  return `${API}/timesheets/attachments/${fileId}`;
}
