import { authed, authedRaw } from '../fetchHelper';
import type { Day } from './time';
import type { SubmitStatus } from './submit';

export type DayStatusEntry = {
  status: SubmitStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string;
};
export type DayStatusMap = Record<Day, DayStatusEntry>;

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
  const data = await authed(`/timesheets/${weekStart}`);
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
  await authed(`/timesheets/${weekStart}/edit-requests`, 'POST', { day, projectId, reason });
}

export async function saveWeek(weekStart: string, tasks: Task[]): Promise<void> {
  await authed(`/timesheets/${weekStart}`, 'PUT', { tasks });
}

export async function submitWeek(weekStart: string): Promise<void> {
  await authed(`/timesheets/${weekStart}/submit`, 'POST');
}

export async function getProjectTasks(projectId: string): Promise<Assignable[]> {
  const data: Array<{ taskId: string; title: string; description?: string; status: string; estimatedHours: number }> =
    await authed(`/timesheets/tasks?projectId=${projectId}`);
  return data.map((t) => ({ ...t, projectName: null }));
}

export async function createTimesheetTask(title: string, projectId: string): Promise<Assignable> {
  return authed(`/timesheets/tasks`, 'POST', { title, projectId });
}

export async function submitDays(weekStart: string, days: Day[]): Promise<void> {
  await authed(`/timesheets/${weekStart}/submit`, 'POST', { days });
}

export async function uploadAttachment(weekStart: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  const r = await authedRaw(`/timesheets/${weekStart}/attachments`, 'POST', form);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.error) || `upload failed (${r.status})`);
  return data;
}

export async function deleteAttachment(weekStart: string, fileId: string): Promise<void> {
  await authed(`/timesheets/${weekStart}/attachments/${fileId}`, 'DELETE');
}

export function attachmentUrl(fileId: string): string {
  const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  return `${API}/timesheets/attachments/${fileId}`;
}
