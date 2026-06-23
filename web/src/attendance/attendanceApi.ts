import { authed } from '../fetchHelper';

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
  needsRegularise?: boolean;       // set only by /attendance/range, for a past day with a missed checkout
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

export type AttendanceState = {
  activatedDate: string | null;   // "2026-06-22" — day the feature went live for this user
  hasClockIn: boolean;            // has the user ever clocked in?
};

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

export type ShiftConfig = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  durationMinutes: number;
};

export const getShiftConfig = () =>
  authed('/attendance/config') as Promise<ShiftConfig>;

export const getState = () =>
  authed('/attendance/state') as Promise<AttendanceState>;

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

export const getRange = (start: string, end: string) =>
  authed(`/attendance/range?start=${start}&end=${end}`) as Promise<AttendanceDoc[]>;

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

export type TeamMemberStats = {
  userId: string;
  displayName: string;
  email: string;
  presentCount: number;
  lateCount: number;
  avgMinutesPerDay: number;
  onTimePct: number;
};

export const getTeamStats = (year: number, month: number) =>
  authed(`/attendance/team?year=${year}&month=${month}`) as Promise<TeamMemberStats[]>;
