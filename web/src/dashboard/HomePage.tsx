import { useEffect, useState } from 'react';
import { useAuth } from '../authContext';
import { personName } from '../pm/personName';
import { getDashboard, DashboardData } from './dashboardApi';
import type { NavKey } from '../pm/nav';

type Props = { onNavigate: (key: NavKey) => void };

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

const STATUS_LABEL: Record<string, string> = {
  in: 'Clocked in',
  idle: 'Not clocked in',
  'on-break': 'On break',
  done: 'Clocked out',
};

const STATUS_COLOR: Record<string, string> = {
  in: 'var(--success, #22c55e)',
  idle: 'var(--muted, #888)',
  'on-break': 'var(--warning, #f59e0b)',
  done: 'var(--info, #3b82f6)',
};

export function HomePage({ onNavigate }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  const name = personName(user);
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const isTeam = user?.role === 'admin' || user?.role === 'pm' || user?.role === 'reporting_manager';

  return (
    <div className="ts-page dash-page">
      <header className="dash-greeting">
        <div>
          <h1 className="dash-hello">{data?.greeting ?? 'Hello'}, {name}</h1>
          <p className="dash-date">{dateStr}</p>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {!data && !error && <p className="dash-loading">Loading dashboard...</p>}

      {data && (
        <div className="dash-grid">
          {/* Attendance */}
          {data.attendance && (
            <div className="ts-card dash-card" onClick={() => onNavigate('attendance')} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-status-dot" style={{ background: STATUS_COLOR[data.attendance.status] }} />
                <span className="dash-card-title">Attendance</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value">{STATUS_LABEL[data.attendance.status]}</span>
                {data.attendance.checkIn && (
                  <span className="dash-metric-sub">
                    In at {new Date(data.attendance.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <div className="dash-progress">
                  <div className="dash-progress-fill" style={{
                    width: `${data.attendance.shiftDuration > 0 ? Math.min(100, Math.round((data.attendance.effectiveMinutes / data.attendance.shiftDuration) * 100)) : 0}%`,
                  }} />
                </div>
                <span className="dash-metric-sub">{fmtMin(data.attendance.effectiveMinutes)} / {fmtMin(data.attendance.shiftDuration)}</span>
              </div>
            </div>
          )}

          {/* Leave Balance */}
          {data.leave && (
            <div className="ts-card dash-card" onClick={() => onNavigate('attendance')} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Leave Balance</span>
                {data.leave.pendingCount > 0 && (
                  <span className="dash-badge">{data.leave.pendingCount} pending</span>
                )}
              </div>
              <div className="dash-card-body dash-leave-grid">
                <div className="dash-leave-item">
                  <span className="dash-leave-count">{data.leave.casual.remaining}</span>
                  <span className="dash-leave-label">Casual <span className="dash-leave-total">/ {data.leave.casual.total}</span></span>
                </div>
                <div className="dash-leave-item">
                  <span className="dash-leave-count">{data.leave.sick.remaining}</span>
                  <span className="dash-leave-label">Sick <span className="dash-leave-total">/ {data.leave.sick.total}</span></span>
                </div>
                <div className="dash-leave-item">
                  <span className="dash-leave-count">{data.leave.earned.remaining}</span>
                  <span className="dash-leave-label">Earned <span className="dash-leave-total">/ {data.leave.earned.total}</span></span>
                </div>
              </div>
            </div>
          )}

          {/* Timesheet */}
          {data.timesheet && (
            <div className="ts-card dash-card" onClick={() => onNavigate('timesheet')} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Timesheet</span>
                <span className="dash-card-sub">This week</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value">{fmtMin(data.timesheet.totalMinutes)}</span>
                <div className="dash-progress">
                  <div className="dash-progress-fill" style={{
                    width: `${data.timesheet.targetMinutes > 0 ? Math.min(100, Math.round((data.timesheet.totalMinutes / data.timesheet.targetMinutes) * 100)) : 0}%`,
                  }} />
                </div>
                <span className="dash-metric-sub">Target: {fmtMin(data.timesheet.targetMinutes)}</span>
                <span className="dash-metric-sub">{data.timesheet.submittedDays}/5 days submitted</span>
                {data.timesheet.billableMinutes > 0 && (
                  <span className="dash-metric-sub">{fmtMin(data.timesheet.billableMinutes)} billable</span>
                )}
              </div>
            </div>
          )}

          {/* Tasks */}
          {data.tasks && (
            <div className="ts-card dash-card" onClick={() => onNavigate('my-tasks')} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">My Tasks</span>
              </div>
              <div className="dash-card-body dash-tasks-grid">
                <div className="dash-task-chip dash-chip-todo">
                  <span className="dash-chip-count">{data.tasks.todo}</span>
                  <span className="dash-chip-label">To Do</span>
                </div>
                <div className="dash-task-chip dash-chip-progress">
                  <span className="dash-chip-count">{data.tasks.inProgress}</span>
                  <span className="dash-chip-label">In Progress</span>
                </div>
                <div className="dash-task-chip dash-chip-blocked">
                  <span className="dash-chip-count">{data.tasks.blocked}</span>
                  <span className="dash-chip-label">Blocked</span>
                </div>
                <div className="dash-task-chip dash-chip-done">
                  <span className="dash-chip-count">{data.tasks.done}</span>
                  <span className="dash-chip-label">Done</span>
                </div>
              </div>
            </div>
          )}

          {/* Pending Approvals — team roles only */}
          {isTeam && data.pendingApprovals && (
            <div className="ts-card dash-card" onClick={() => onNavigate('requests')} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Pending Approvals</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value dash-metric-hero">
                  {data.pendingApprovals.leave + data.pendingApprovals.timesheets + data.pendingApprovals.regularise + data.pendingApprovals.editRequests + data.pendingApprovals.claimRequests}
                </span>
                <span className="dash-metric-sub">total pending</span>
                <div className="dash-approval-breakdown">
                  {data.pendingApprovals.leave > 0 && <span className="dash-approval-item">{data.pendingApprovals.leave} leave</span>}
                  {data.pendingApprovals.timesheets > 0 && <span className="dash-approval-item">{data.pendingApprovals.timesheets} timesheets</span>}
                  {data.pendingApprovals.regularise > 0 && <span className="dash-approval-item">{data.pendingApprovals.regularise} regularise</span>}
                  {data.pendingApprovals.editRequests > 0 && <span className="dash-approval-item">{data.pendingApprovals.editRequests} edits</span>}
                  {data.pendingApprovals.claimRequests > 0 && <span className="dash-approval-item">{data.pendingApprovals.claimRequests} claims</span>}
                </div>
              </div>
            </div>
          )}

          {/* Team Overview — team roles only */}
          {isTeam && data.teamSummary && (
            <div className="ts-card dash-card" onClick={() => onNavigate('attendance')} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Team Overview</span>
                <span className="dash-card-sub">Today</span>
              </div>
              <div className="dash-card-body dash-team-grid">
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.presentToday}</span>
                  <span className="dash-team-label">Present</span>
                </div>
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.onLeaveToday}</span>
                  <span className="dash-team-label">On Leave</span>
                </div>
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.totalMembers}</span>
                  <span className="dash-team-label">Total</span>
                </div>
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.avgUtilization}%</span>
                  <span className="dash-team-label">Utilization</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
