import { getAccessToken } from '../api';
import type { Day } from './time';

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
};

export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type WeekData = { weekStart: string; tasks: Task[]; editableDays: Day[]; readOnly: boolean };

export async function getWeek(weekStart: string): Promise<WeekData> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, { headers: authHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data = await r.json();
  return { weekStart: data.weekStart, tasks: data.tasks as Task[], editableDays: data.editableDays as Day[], readOnly: !!data.readOnly };
}

export async function createEditRequest(weekStart: string, day: Day, reason: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/edit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ day, reason }),
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
