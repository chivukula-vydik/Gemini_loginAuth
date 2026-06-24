import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import { personName } from '../pm/personName';
import { pathForKey } from '../pm/nav';
import { getRMDashboard, RMDashboardData } from './managerApi';
import { decideLeave } from '../attendance/leaveApi';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual', sick: 'Sick', earned: 'Earned', unpaid: 'Unpaid',
};

const CELL_COLORS: Record<string, string> = {
  present: '#22c55e',
  partial: '#86efac',
  wfh: '#06b6d4',
  'wfh-partial': '#67e8f9',
  absent: '#d1d5db',
  'leave-casual': '#f59e0b',
  'leave-sick': '#10b981',
  'leave-earned': '#3b82f6',
  'leave-unpaid': '#9ca3af',
};

function cellColor(cell: { status: string; punchType?: string; leaveType?: string } | null): string {
  if (!cell) return 'transparent';
  if (cell.status === 'leave' && cell.leaveType) return CELL_COLORS[`leave-${cell.leaveType}`] || '#9ca3af';
  return CELL_COLORS[cell.status] || '#d1d5db';
}

function cellLabel(cell: { status: string; punchType?: string; leaveType?: string } | null): string {
  if (!cell) return '';
  if (cell.status === 'leave' && cell.leaveType) return LEAVE_TYPE_LABELS[cell.leaveType] || cell.leaveType;
  if (cell.status === 'wfh' || cell.status === 'wfh-partial') return 'WFH';
  if (cell.status === 'present' || cell.status === 'partial') return 'Present';
  if (cell.status === 'absent') return 'Absent';
  return cell.status;
}

function shiftWeek(weekStart: string, delta: number): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function RMDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<RMDashboardData | null>(null);
  const [error, setError] = useState('');
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [deciding, setDeciding] = useState<string | null>(null);

  function load(w?: string) {
    getRMDashboard(w).then(setData).catch((e) => setError(e.message));
  }

  useEffect(() => { load(week); }, [week]);

  async function handleDecide(id: string, decision: 'approved' | 'rejected') {
    setDeciding(id);
    try {
      await decideLeave(id, decision);
      load(week);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeciding(null);
    }
  }

  const name = personName(user);
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
        <>
          {/* Stats Cards */}
          <section className="rm-stats-row">
            <div className="rm-stat-card rm-stat-late">
              <span className="rm-stat-count">{data.stats.late}</span>
              <span className="rm-stat-label">Late Arrivals</span>
            </div>
            <div className="rm-stat-card rm-stat-ontime">
              <span className="rm-stat-count">{data.stats.onTime}</span>
              <span className="rm-stat-label">On Time</span>
            </div>
            <div className="rm-stat-card rm-stat-wfh">
              <span className="rm-stat-count">{data.stats.wfh}</span>
              <span className="rm-stat-label">WFH</span>
              {data.stats.remoteClockIns > 0 && (
                <span className="rm-stat-sub">{data.stats.remoteClockIns} remote</span>
              )}
            </div>
            <div className="rm-stat-card rm-stat-leave">
              <span className="rm-stat-count">{data.stats.onLeave}</span>
              <span className="rm-stat-label">On Leave</span>
            </div>
          </section>

          {/* Pending Approvals */}
          <section className="rm-pending-row">
            <h2 className="rm-section-title">Pending Approvals</h2>
            <div className="rm-pending-grid">
              <div className="ts-card rm-pending-card" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
                <span className="rm-pending-count">{data.pendingCounts.leave}</span>
                <span className="rm-pending-label">Leave</span>
              </div>
              <div className="ts-card rm-pending-card" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
                <span className="rm-pending-count">{data.pendingCounts.timesheets}</span>
                <span className="rm-pending-label">Timesheets</span>
              </div>
              <div className="ts-card rm-pending-card" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
                <span className="rm-pending-count">{data.pendingCounts.regularise}</span>
                <span className="rm-pending-label">Regularise</span>
              </div>
              <div className="ts-card rm-pending-card" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
                <span className="rm-pending-count">{data.pendingCounts.editRequests}</span>
                <span className="rm-pending-label">Edit Requests</span>
              </div>
            </div>
          </section>

          {/* Leave Requests */}
          <section className="rm-leave-section">
            <h2 className="rm-section-title">Leave Requests</h2>
            {data.pendingLeaves.length === 0 ? (
              <p className="ts-empty">No pending leave requests.</p>
            ) : (
              <div className="ts-table-wrap">
                <table className="ts-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingLeaves.map((l) => (
                      <tr key={l._id}>
                        <td>{l.user.displayName || l.user.email}</td>
                        <td>{LEAVE_TYPE_LABELS[l.type] || l.type}</td>
                        <td>{formatDate(l.startDate)} – {formatDate(l.endDate)}</td>
                        <td>{l.days}</td>
                        <td>{l.reason || '—'}</td>
                        <td className="rm-leave-actions">
                          <button className="ts-btn ts-btn-sm ts-btn-primary"
                            disabled={deciding === l._id}
                            onClick={() => handleDecide(l._id, 'approved')}>
                            Approve
                          </button>
                          <button className="ts-btn ts-btn-sm ts-btn-danger"
                            disabled={deciding === l._id}
                            onClick={() => handleDecide(l._id, 'rejected')}>
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Team Calendar */}
          <section className="rm-calendar-section">
            <div className="rm-cal-header">
              <h2 className="rm-section-title">{formatWeekLabel(data.calendar.weekStart)}</h2>
              <div className="rm-cal-nav">
                <button className="ts-btn ts-btn-sm" onClick={() => setWeek(shiftWeek(data.calendar.weekStart, -1))}>◀</button>
                <button className="ts-btn ts-btn-sm" onClick={() => setWeek(shiftWeek(data.calendar.weekStart, 1))}>▶</button>
              </div>
            </div>
            {data.calendar.members.length === 0 ? (
              <p className="ts-empty">No team members.</p>
            ) : (
              <div className="ts-table-wrap">
                <table className="ts-table rm-cal-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      {DAY_HEADERS.map((d, i) => (
                        <th key={d}>{d}<br /><span className="rm-cal-date">{formatDate(data.calendar.days[i])}</span></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.calendar.members.map((m) => (
                      <tr key={m._id}>
                        <td>{m.name}</td>
                        {data.calendar.days.map((day) => {
                          const cell = m.cells[day];
                          return (
                            <td key={day} className="rm-cal-cell" style={{ background: cellColor(cell) }} title={cellLabel(cell)}>
                              <span className="rm-cal-cell-text">{cellLabel(cell)}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="rm-cal-legend">
              <span className="rm-legend-item"><span className="rm-legend-dot" style={{ background: '#22c55e' }} />Present</span>
              <span className="rm-legend-item"><span className="rm-legend-dot" style={{ background: '#06b6d4' }} />WFH</span>
              <span className="rm-legend-item"><span className="rm-legend-dot" style={{ background: '#f59e0b' }} />Casual</span>
              <span className="rm-legend-item"><span className="rm-legend-dot" style={{ background: '#10b981' }} />Sick</span>
              <span className="rm-legend-item"><span className="rm-legend-dot" style={{ background: '#3b82f6' }} />Earned</span>
              <span className="rm-legend-item"><span className="rm-legend-dot" style={{ background: '#d1d5db' }} />Absent</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
