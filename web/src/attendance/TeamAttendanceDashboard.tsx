import { useEffect, useState } from 'react';
import {
  getTeamToday, getTeamCalendar, getTeamStats,
  TodayStats, TeamCalendar, CalendarCell, TeamMemberStats,
  getPendingOvertime, decideOvertime, OvertimePending,
} from './attendanceApi';
import { getPendingLeave, decideLeave, LeavePending, LEAVE_TYPE_LABELS } from './leaveApi';
import { getPendingRegularise, decideRegularise, RegularisePending } from './attendanceApi';
import { useAuth } from '../authContext';

type Tab = 'dashboard' | 'approvals' | 'overtime' | 'time-off' | 'reports';

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'time-off', label: 'Time Off' },
  { key: 'reports', label: 'Reports' },
];

const OT_REASON_LABELS: Record<string, string> = {
  'work-overload': 'Work Overload',
  deadline: 'Deadline',
  'client-request': 'Client Request',
  maintenance: 'Maintenance',
  other: 'Other',
};

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtHM(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// ─── Cell colors for the calendar ───
const CELL_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  present:      { bg: '#dcfce7', fg: '#166534', label: 'P' },
  partial:      { bg: '#fef9c3', fg: '#854d0e', label: '½' },
  wfh:          { bg: '#cffafe', fg: '#155e75', label: 'W' },
  'wfh-partial':{ bg: '#e0f2fe', fg: '#0369a1', label: 'W½' },
  leave:        { bg: '#fce7f3', fg: '#9d174d', label: 'L' },
  holiday:      { bg: '#f3e8ff', fg: '#6b21a8', label: 'H' },
  weekend:      { bg: '#f1f5f9', fg: '#94a3b8', label: '' },
  absent:       { bg: '#fee2e2', fg: '#991b1b', label: 'A' },
};

function cellStyle(cell: CalendarCell): React.CSSProperties {
  if (!cell || !cell.status) return { background: 'transparent' };
  const c = CELL_COLORS[cell.status] || CELL_COLORS.absent;
  return { background: c.bg, color: c.fg };
}

function cellLabel(cell: CalendarCell): string {
  if (!cell || !cell.status) return '';
  if (cell.status === 'leave' && cell.leaveType) return LEAVE_TYPE_LABELS[cell.leaveType as keyof typeof LEAVE_TYPE_LABELS]?.[0] || 'L';
  return CELL_COLORS[cell.status]?.label || '';
}

// ─── Today Stats Section ───
function TodayStatsCards({ stats }: { stats: TodayStats }) {
  const cards: { label: string; value: number; cls: string }[] = [
    { label: 'Late Arrivals', value: stats.late, cls: 'rm-stat-late' },
    { label: 'On Time', value: stats.onTime, cls: 'rm-stat-ontime' },
    { label: 'WFH / Remote', value: stats.wfh + stats.remoteClockIns, cls: 'rm-stat-wfh' },
    { label: 'On Leave', value: stats.onLeave, cls: 'rm-stat-leave' },
    { label: 'Absent', value: stats.absent, cls: 'rm-stat-absent' },
    { label: 'Total', value: stats.total, cls: '' },
  ];
  return (
    <section className="rm-stats-row">
      {cards.map((c) => (
        <div key={c.label} className={`rm-stat-card ${c.cls}`}>
          <span className="rm-stat-count">{c.value}</span>
          <span className="rm-stat-label">{c.label}</span>
        </div>
      ))}
    </section>
  );
}

// ─── Leave sidebar ───
function LeaveSidebar({ leaves, onDecide, deciding, readOnly }: { leaves: LeavePending[]; onDecide: (id: string, d: 'approved' | 'rejected') => void; deciding: string | null; readOnly?: boolean }) {
  if (leaves.length === 0) return <p className="ts-empty">No pending leave requests.</p>;
  return (
    <div className="tad-leave-list">
      {leaves.map((l) => (
        <div key={l._id} className="tad-leave-card">
          <div className="tad-leave-top">
            <span className="tad-leave-name">{l.userId.displayName || l.userId.email}</span>
            <span className={`tad-leave-type tad-leave-${l.type}`}>{LEAVE_TYPE_LABELS[l.type] || l.type}</span>
          </div>
          <div className="tad-leave-dates">{fmtDate(l.startDate)} – {fmtDate(l.endDate)} · {l.days} day{l.days !== 1 ? 's' : ''}</div>
          {l.reason && <div className="tad-leave-reason">{l.reason}</div>}
          {!readOnly && (
            <div className="tad-leave-actions">
              <button className="btn btn-auto btn-primary" disabled={deciding === l._id} onClick={() => onDecide(l._id, 'approved')}>Approve</button>
              <button className="btn btn-auto btn-outline" disabled={deciding === l._id} onClick={() => onDecide(l._id, 'rejected')}>Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Regularise sidebar ───
function RegulariseSidebar({ items, onDecide, deciding, readOnly }: { items: RegularisePending[]; onDecide: (id: string, d: 'approved' | 'rejected') => void; deciding: string | null; readOnly?: boolean }) {
  if (items.length === 0) return <p className="ts-empty">No pending regularise requests.</p>;
  return (
    <div className="tad-leave-list">
      {items.map((r) => (
        <div key={r._id} className="tad-leave-card">
          <div className="tad-leave-top">
            <span className="tad-leave-name">{r.userId.displayName || r.userId.email}</span>
            <span className="tad-leave-type tad-leave-regularise">Regularise</span>
          </div>
          <div className="tad-leave-dates">{fmtDate(r.date)}</div>
          <div className="tad-leave-reason">{r.regularise.reason}</div>
          {r.regularise.correctedCheckIn && <div className="tad-leave-reason">Check-in: {r.regularise.correctedCheckIn} · Check-out: {r.regularise.correctedCheckOut || '—'}</div>}
          {!readOnly && (
            <div className="tad-leave-actions">
              <button className="btn btn-auto btn-primary" disabled={deciding === r._id} onClick={() => onDecide(r._id, 'approved')}>Approve</button>
              <button className="btn btn-auto btn-outline" disabled={deciding === r._id} onClick={() => onDecide(r._id, 'rejected')}>Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Overtime sidebar ───
function OvertimeSidebar({ items, onDecide, deciding, readOnly }: { items: OvertimePending[]; onDecide: (id: string, d: 'approved' | 'rejected') => void; deciding: string | null; readOnly?: boolean }) {
  if (items.length === 0) return <p className="ts-empty">No pending overtime requests.</p>;
  return (
    <div className="tad-leave-list">
      {items.map((o) => (
        <div key={o._id} className="tad-leave-card">
          <div className="tad-leave-top">
            <span className="tad-leave-name">{o.userId.displayName || o.userId.email}</span>
            <span className="tad-leave-type tad-leave-overtime">{OT_REASON_LABELS[o.reason] || o.reason}</span>
          </div>
          <div className="tad-leave-dates">{fmtDate(o.date)} · {o.startTime} – {o.endTime} · {Math.floor(o.minutes / 60)}h {o.minutes % 60}m</div>
          {o.note && <div className="tad-leave-reason">{o.note}</div>}
          {!readOnly && (
            <div className="tad-leave-actions">
              <button className="btn btn-auto btn-primary" disabled={deciding === o._id} onClick={() => onDecide(o._id, 'approved')}>Approve</button>
              <button className="btn btn-auto btn-outline" disabled={deciding === o._id} onClick={() => onDecide(o._id, 'rejected')}>Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Monthly Calendar ───
function MonthlyCalendar({ calendar }: { calendar: TeamCalendar }) {
  const dayHeaders = calendar.days.map((d) => {
    const dt = new Date(d + 'T00:00:00');
    return { date: d, day: dt.getDate(), dow: dt.toLocaleDateString(undefined, { weekday: 'narrow' }) };
  });

  return (
    <div className="tad-cal-wrap">
      <table className="tad-cal-table">
        <thead>
          <tr>
            <th className="tad-cal-name-col">Employee</th>
            {dayHeaders.map((h) => (
              <th key={h.date} className="tad-cal-day-col">
                <span className="tad-cal-dow">{h.dow}</span>
                <span className="tad-cal-dom">{h.day}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendar.members.map((m) => (
            <tr key={m._id}>
              <td className="tad-cal-name-col">
                <span className="tad-cal-emp-name">{m.displayName || m.email}</span>
                {m.department && <span className="tad-cal-emp-dept">{m.department}</span>}
              </td>
              {calendar.days.map((d) => {
                const cell = m.cells[d];
                return (
                  <td key={d} className="tad-cal-cell" style={cellStyle(cell)} title={cell?.status || ''}>
                    {cellLabel(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Reports tab ───
function ReportsTab({ stats }: { stats: TeamMemberStats[] }) {
  return (
    <div className="ts-card">
      <table className="ts-table">
        <thead>
          <tr>
            <th className="ts-task">Employee</th>
            <th>Days Present</th>
            <th>Late</th>
            <th>Avg / Day</th>
            <th>On Time %</th>
          </tr>
        </thead>
        <tbody>
          {stats.length === 0 && <tr><td colSpan={5} className="ts-empty">No data.</td></tr>}
          {stats.map((m) => (
            <tr key={m.userId}>
              <td className="ts-task">{m.displayName || m.email}</td>
              <td>{m.presentCount}</td>
              <td>{m.lateCount}</td>
              <td>{fmtHM(m.avgMinutesPerDay)}</td>
              <td>{m.onTimePct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Dashboard ───
export function TeamAttendanceDashboard() {
  const { user } = useAuth();
  const roles = user?.roles ?? ['employee'];
  const isReadOnly = (roles.includes('hr') || roles.includes('director') || roles.includes('vp'))
    && !roles.includes('admin') && !roles.includes('reporting_manager') && !roles.includes('pm') && !roles.includes('team_lead');
  const now = new Date();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [calendar, setCalendar] = useState<TeamCalendar | null>(null);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [leaves, setLeaves] = useState<LeavePending[]>([]);
  const [regularise, setRegularise] = useState<RegularisePending[]>([]);
  const [overtime, setOvertime] = useState<OvertimePending[]>([]);
  const [teamStats, setTeamStats] = useState<TeamMemberStats[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getTeamToday().then(setTodayStats).catch((e) => setError(e.message));
    getPendingLeave().then(setLeaves).catch(() => {});
    getPendingRegularise().then(setRegularise).catch(() => {});
    getPendingOvertime().then(setOvertime).catch(() => {});
  }, []);

  useEffect(() => {
    getTeamCalendar(calYear, calMonth).then(setCalendar).catch((e) => setError(e.message));
    getTeamStats(calYear, calMonth).then(setTeamStats).catch(() => {});
  }, [calYear, calMonth]);

  async function handleLeaveDecide(id: string, decision: 'approved' | 'rejected') {
    setDeciding(id);
    try {
      await decideLeave(id, decision);
      setLeaves((prev) => prev.filter((l) => l._id !== id));
    } catch (e: any) { setError(e.message); }
    finally { setDeciding(null); }
  }

  async function handleRegDecide(id: string, decision: 'approved' | 'rejected') {
    setDeciding(id);
    try {
      await decideRegularise(id, decision);
      setRegularise((prev) => prev.filter((r) => r._id !== id));
    } catch (e: any) { setError(e.message); }
    finally { setDeciding(null); }
  }

  async function handleOTDecide(id: string, decision: 'approved' | 'rejected') {
    setDeciding(id);
    try {
      await decideOvertime(id, decision);
      setOvertime((prev) => prev.filter((o) => o._id !== id));
    } catch (e: any) { setError(e.message); }
    finally { setDeciding(null); }
  }

  function prevMonth() {
    if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  }
  function nextMonth() {
    if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  }

  const monthLabel = new Date(calYear, calMonth - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Team Attendance</h1>
          <p className="ts-sub">Monitor your team's attendance, approvals, and time off</p>
        </div>
      </header>

      <div className="org-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`org-tab${tab === t.key ? ' org-tab-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="ts-error">{error}</p>}

      {tab === 'dashboard' && (
        <>
          {todayStats && <TodayStatsCards stats={todayStats} />}

          <div className="tad-main-grid">
            <div className="tad-main-left">
              <div className="tad-cal-header">
                <h2 className="rm-section-title">{monthLabel}</h2>
                <div className="rm-cal-nav">
                  <button className="btn btn-auto btn-outline" onClick={prevMonth}>&#9664;</button>
                  <button className="btn btn-auto btn-outline" onClick={nextMonth}>&#9654;</button>
                </div>
              </div>
              {calendar && <MonthlyCalendar calendar={calendar} />}
              <div className="tad-cal-legend">
                {Object.entries(CELL_COLORS).filter(([k]) => k !== 'weekend').map(([k, v]) => (
                  <span key={k} className="tad-legend-item">
                    <span className="tad-legend-dot" style={{ background: v.bg, color: v.fg, border: `1px solid ${v.fg}30` }}>{v.label}</span>
                    <span>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="tad-main-right">
              <h3 className="rm-section-title">Leave Requests <span className="tad-badge">{leaves.length}</span></h3>
              <LeaveSidebar leaves={leaves} onDecide={handleLeaveDecide} deciding={deciding} readOnly={isReadOnly} />

              <h3 className="rm-section-title" style={{ marginTop: 20 }}>Overtime Requests <span className="tad-badge">{overtime.length}</span></h3>
              <OvertimeSidebar items={overtime} onDecide={handleOTDecide} deciding={deciding} readOnly={isReadOnly} />

              <h3 className="rm-section-title" style={{ marginTop: 20 }}>Regularise Requests <span className="tad-badge">{regularise.length}</span></h3>
              <RegulariseSidebar items={regularise} onDecide={handleRegDecide} deciding={deciding} readOnly={isReadOnly} />
            </div>
          </div>
        </>
      )}

      {tab === 'approvals' && (
        <>
          <h2 className="rm-section-title">Pending Leave</h2>
          <LeaveSidebar leaves={leaves} onDecide={handleLeaveDecide} deciding={deciding} readOnly={isReadOnly} />
          <h2 className="rm-section-title" style={{ marginTop: 20 }}>Pending Overtime</h2>
          <OvertimeSidebar items={overtime} onDecide={handleOTDecide} deciding={deciding} readOnly={isReadOnly} />
          <h2 className="rm-section-title" style={{ marginTop: 20 }}>Pending Regularise</h2>
          <RegulariseSidebar items={regularise} onDecide={handleRegDecide} deciding={deciding} readOnly={isReadOnly} />
        </>
      )}

      {tab === 'overtime' && (
        <>
          <h2 className="rm-section-title">Overtime Requests <span className="tad-badge">{overtime.length}</span></h2>
          <OvertimeSidebar items={overtime} onDecide={handleOTDecide} deciding={deciding} readOnly={isReadOnly} />
        </>
      )}

      {tab === 'time-off' && (
        <>
          <h2 className="rm-section-title">Leave Requests</h2>
          <LeaveSidebar leaves={leaves} onDecide={handleLeaveDecide} deciding={deciding} readOnly={isReadOnly} />
        </>
      )}

      {tab === 'reports' && (
        <>
          <div className="tad-cal-header" style={{ marginBottom: 12 }}>
            <h2 className="rm-section-title">{monthLabel}</h2>
            <div className="rm-cal-nav">
              <button className="btn btn-auto btn-outline" onClick={prevMonth}>&#9664;</button>
              <button className="btn btn-auto btn-outline" onClick={nextMonth}>&#9654;</button>
            </div>
          </div>
          <ReportsTab stats={teamStats} />
        </>
      )}
    </div>
  );
}
