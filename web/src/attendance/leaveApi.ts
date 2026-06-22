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

export type LeaveType = 'casual' | 'sick' | 'earned' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: 'Casual', sick: 'Sick', earned: 'Earned', unpaid: 'Unpaid',
};

export type Person = { _id: string; displayName: string; email: string };

export type LeaveRequest = {
  _id: string;
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  days: number;            // working days in the range (server-computed)
};

// As returned by /leave/pending, where userId is populated.
export type LeavePending = Omit<LeaveRequest, 'userId'> & { userId: Person };

export const applyLeave = (type: LeaveType, startDate: string, endDate: string, reason: string) =>
  authed('/leave', 'POST', { type, startDate, endDate, reason }) as Promise<LeaveRequest>;

export const getMyLeave = () =>
  authed('/leave/mine') as Promise<LeaveRequest[]>;

export const getPendingLeave = () =>
  authed('/leave/pending') as Promise<LeavePending[]>;

export const decideLeave = (id: string, decision: 'approved' | 'rejected') =>
  authed(`/leave/${id}/decide`, 'PATCH', { decision }) as Promise<LeaveRequest>;
