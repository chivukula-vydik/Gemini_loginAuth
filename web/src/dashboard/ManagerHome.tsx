import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import { personName } from '../pm/personName';
import { getDashboard, DashboardData } from './dashboardApi';
import { pathForKey } from '../pm/nav';

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

export function ManagerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  const name = personName(user);
  const isAdmin = user?.roles?.includes('admin') ?? false;
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

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
          {/* Pending Approvals — primary card for managers */}
          {data.pendingApprovals && (
            <div className="ts-card dash-card dash-card-wide" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
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

          {/* Team Overview — primary for managers */}
          {data.teamSummary && (
            <div className="ts-card dash-card dash-card-wide" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
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

          {/* Quick links for management pages */}
          <div className="ts-card dash-card" onClick={() => navigate(pathForKey('timesheet'))} role="button" tabIndex={0}>
            <div className="dash-card-head">
              <span className="dash-card-title">Timesheets</span>
              <span className="dash-card-sub">Review</span>
            </div>
            <div className="dash-card-body">
              <span className="dash-metric-value">{data.pendingApprovals?.timesheets ?? 0}</span>
              <span className="dash-metric-sub">awaiting review</span>
            </div>
          </div>

          <div className="ts-card dash-card" onClick={() => navigate(pathForKey('projects'))} role="button" tabIndex={0}>
            <div className="dash-card-head">
              <span className="dash-card-title">Projects</span>
            </div>
            <div className="dash-card-body">
              <span className="dash-metric-sub">Manage projects & tasks</span>
            </div>
          </div>

          {isAdmin && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('users'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Users</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-sub">Manage team members</span>
              </div>
            </div>
          )}

          {/* Personal section — secondary for managers */}
          <div className="dash-section-divider">
            <span className="dash-section-label">My Workspace</span>
          </div>

          {/* Timesheet */}
          {data.timesheet && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('timesheet'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">My Timesheet</span>
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
              </div>
            </div>
          )}

          {/* Attendance */}
          {data.attendance && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">My Attendance</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value">{data.attendance.status === 'in' ? 'Clocked in' : data.attendance.status === 'done' ? 'Clocked out' : 'Not clocked in'}</span>
                {data.attendance.effectiveMinutes > 0 && (
                  <span className="dash-metric-sub">{fmtMin(data.attendance.effectiveMinutes)} logged today</span>
                )}
              </div>
            </div>
          )}

          {/* Leave Balance */}
          {data.leave && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">My Leave</span>
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
        </div>
      )}
    </div>
  );
}
