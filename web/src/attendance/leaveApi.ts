import { authed } from '../fetchHelper';

export type LeaveType = 'casual' | 'sick' | 'earned' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type HalfDay = 'none' | 'first' | 'second';

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
  halfDay: HalfDay;
  requestedDays: number;
  reason: string;
  status: LeaveStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  days: number;            // working days in the range (server-computed)
};

// As returned by /leave/pending, where userId is populated.
export type LeavePending = Omit<LeaveRequest, 'userId'> & { userId: Person };

export type LeaveBalanceCounter = { total: number; used: number; remaining: number };
export type LeaveBalance = {
  year: number;
  casual: LeaveBalanceCounter;
  sick: LeaveBalanceCounter;
  earned: LeaveBalanceCounter;
};

export const getBalance = (year?: number) =>
  authed(`/leave/balance${year ? `?year=${year}` : ''}`) as Promise<LeaveBalance>;

export const applyLeave = (
  type: LeaveType, startDate: string, endDate: string, reason: string, halfDay: HalfDay = 'none',
) =>
  authed('/leave', 'POST', { type, startDate, endDate, reason, halfDay }) as Promise<LeaveRequest>;

export const getMyLeave = () =>
  authed('/leave/mine') as Promise<LeaveRequest[]>;

export const getPendingLeave = () =>
  authed('/leave/pending') as Promise<LeavePending[]>;

export const decideLeave = (id: string, decision: 'approved' | 'rejected') =>
  authed(`/leave/${id}/decide`, 'PATCH', { decision }) as Promise<LeaveRequest>;

export const cancelLeave = (id: string) =>
  authed(`/leave/${id}`, 'DELETE');
