import { authed } from '../fetchHelper';

export type RMStats = {
  total: number;
  present: number;
  late: number;
  onTime: number;
  wfh: number;
  remoteClockIns: number;
  onLeave: number;
  absent: number;
};

export type PendingCounts = {
  leave: number;
  timesheets: number;
  regularise: number;
  editRequests: number;
};

export type PendingLeave = {
  _id: string;
  user: { displayName: string; email: string };
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  halfDay: string;
  reason: string;
  requestedAt: string;
};

export type CalendarCell = {
  status: string;
  punchType?: string;
  leaveType?: string;
} | null;

export type CalendarMember = {
  _id: string;
  name: string;
  cells: Record<string, CalendarCell>;
};

export type RMDashboardData = {
  greeting: string;
  teamMembers: { _id: string; displayName: string; email: string }[];
  stats: RMStats;
  pendingCounts: PendingCounts;
  pendingLeaves: PendingLeave[];
  calendar: {
    weekStart: string;
    days: string[];
    members: CalendarMember[];
  };
};

export const getRMDashboard = (week?: string): Promise<RMDashboardData> =>
  authed(`/manager/dashboard${week ? `?week=${week}` : ''}`);

export type TeamMember = {
  _id: string;
  displayName: string;
  email: string;
  employeeCode?: string;
  phone?: string;
  employmentType?: string;
  dateOfJoining?: string;
  department?: string;
  designation?: string;
  location?: string;
  locationCity?: string;
  todayStatus: string;
};

export const getMyTeam = (): Promise<TeamMember[]> => authed('/manager/team');
