import { getAccessToken } from '../api';
import type { Day } from './time';

const API = 'http://localhost:4000';

export type Entries = Record<Day, number>;
export type Task = { id: string; name: string; entries: Entries };

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getWeek(weekStart: string): Promise<Task[]> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data = await r.json();
  return data.tasks as Task[];
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
