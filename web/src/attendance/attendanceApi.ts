import { getAccessToken } from '../api';

const API = 'http://localhost:4000';

async function authed(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.error) || `request failed (${r.status})`);
  return data;
}

// --- Types ---

export type PunchType = 'office' | 'remote' | 'wfh';

export type AttendanceStatus =
  | 'present' | 'partial' | 'absent'
  | 'wfh' | 'wfh-partial'
  | 'leave' | 'holiday' | 'weekend';

export type Break = { start: string; end: string | null };

export type RegulariseStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type Person = { _id: string; displayName: string; email: string };

export type AttendanceDoc = {
  _id: string;
  userId: string;
  date: string;                    // "2026-06-22"
  checkIn: string | null;          // ISO date string
  checkOut: string | null;
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  status: AttendanceStatus;
  punchType: PunchType;
  breaks: Break[];
  note: string;
  regularise: {
    status: RegulariseStatus;
    reason: string;
    correctedCheckIn: string | null;
    correctedCheckOut: string | null;
    requestedAt: string | null;
    decidedBy: string | null;
    decidedAt: string | null;
  };
};

// As returned by /regularise/pending, where userId is populated.
export type RegularisePending = Omit<AttendanceDoc, 'userId'> & { userId: Person };

export type MonthStats = {
  present: number;
  partial: number;
  absent: number;
  wfh: number;
  lateCount: number;
  totalMinutes: number;
  avgMinutesPerDay: number;
  onTimePct: number;
};

// --- API Calls ---

export const getToday = () =>
  authed('/attendance/today') as Promise<AttendanceDoc>;

export const checkIn = (punchType: PunchType) =>
  authed('/attendance/checkin', 'POST', { punchType }) as Promise<AttendanceDoc>;

export const checkOut = () =>
  authed('/attendance/checkout', 'POST') as Promise<AttendanceDoc>;

export const startBreak = () =>
  authed('/attendance/break/start', 'POST') as Promise<AttendanceDoc>;

export const endBreak = () =>
  authed('/attendance/break/end', 'POST') as Promise<AttendanceDoc>;

export const getMonth = (year: number, month: number) =>
  authed(`/attendance/month?year=${year}&month=${month}`) as Promise<AttendanceDoc[]>;

export const getStats = (year: number, month: number) =>
  authed(`/attendance/stats?year=${year}&month=${month}`) as Promise<MonthStats>;

export const requestRegularise = (
  date: string, reason: string,
  correctedCheckIn?: string, correctedCheckOut?: string,
) =>
  authed('/attendance/regularise', 'POST', { date, reason, correctedCheckIn, correctedCheckOut }) as Promise<AttendanceDoc>;

export const getPendingRegularise = () =>
  authed('/attendance/regularise/pending') as Promise<RegularisePending[]>;

export const decideRegularise = (id: string, decision: 'approved' | 'rejected') =>
  authed(`/attendance/regularise/${id}/decide`, 'PATCH', { decision }) as Promise<AttendanceDoc>;
