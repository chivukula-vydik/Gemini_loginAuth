import { authed } from '../fetchHelper';

export type AttendanceWidget = {
  status: 'in' | 'idle' | 'on-break' | 'done';
  checkIn: string | null;
  effectiveMinutes: number;
  shiftDuration: number;
};

export type LeaveWidget = {
  casual: { remaining: number; total: number };
  sick: { remaining: number; total: number };
  earned: { remaining: number; total: number };
  pendingCount: number;
};

export type TimesheetWidget = {
  weekStart: string;
  totalMinutes: number;
  targetMinutes: number;
  submittedDays: number;
  billableMinutes: number;
};

export type TasksWidget = {
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
};

export type PendingApprovalsWidget = {
  leave: number;
  timesheets: number;
  regularise: number;
  editRequests: number;
  claimRequests: number;
};

export type TeamSummaryWidget = {
  totalMembers: number;
  presentToday: number;
  onLeaveToday: number;
  avgUtilization: number;
};

export type DashboardData = {
  greeting: string;
  attendance?: AttendanceWidget;
  leave?: LeaveWidget;
  timesheet?: TimesheetWidget;
  tasks?: TasksWidget;
  pendingApprovals?: PendingApprovalsWidget;
  teamSummary?: TeamSummaryWidget;
};

export async function getDashboard(): Promise<DashboardData> {
  return authed('/dashboard');
}
