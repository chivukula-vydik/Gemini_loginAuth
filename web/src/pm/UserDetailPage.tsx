import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  IconUser,
  IconBriefcase,
  IconBuilding,
  IconClock,
  IconMail,
  IconPhone,
  IconCalendar,
  IconMapPin,
  IconId,
  IconShield,
  IconStarFilled,
  IconArrowLeft,
} from '@tabler/icons-react';
import { authed } from '../fetchHelper';
import './UserDetailPage.css';

type PopRef = { _id: string; name: string } | null;
type ManagerRef = { _id: string; displayName: string; email: string } | null;
type ShiftRef = { _id: string; name: string; startTime?: string; endTime?: string } | null;

interface ProfileData {
  _id: string;
  email: string;
  displayName: string;
  phone: string;
  roles: string[];
  skills: { _id: string; name: string }[];
  employeeCode: string;
  employmentType: string;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
  probationEndDate: string | null;
  departmentId: PopRef;
  designationId: PopRef;
  locationId: PopRef;
  legalEntityId: PopRef;
  businessUnitId: PopRef;
  shiftId: ShiftRef;
  reportingManagerId: ManagerRef;
  providers: { provider: string }[];
  createdAt: string;
  active?: boolean;
}

interface AttendanceRecord {
  _id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  effectiveMinutes: number;
  punchType: string;
  totalMinutes: number;
  breakMinutes: number;
}

interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  wfhDays: number;
  avgEffective: number;
}

interface LeaveRecord {
  _id: string;
  type: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  reason: string;
  status: string;
}

interface LeaveBalance {
  year: number;
  casual: { total: number; used: number };
  sick: { total: number; used: number };
  earned: { total: number; used: number };
}

interface TaskRecord {
  _id: string;
  title: string;
  status: string;
  project: { _id: string; name: string } | string;
  dueDate: string | null;
  percentComplete: number;
  estimatedHours: number;
}

interface TimesheetTask {
  id: string;
  name: string;
  entries: { mon: number; tue: number; wed: number; thu: number; fri: number };
  notes?: { mon: string; tue: string; wed: string; thu: string; fri: string };
  billable?: { mon: boolean | null; tue: boolean | null; wed: boolean | null; thu: boolean | null; fri: boolean | null };
}

interface TimesheetRecord {
  _id: string;
  weekStart: string;
  status: string;
  tasks: TimesheetTask[];
  submittedAt: string | null;
  reviewedAt: string | null;
}

interface UserDetail {
  profile: ProfileData;
  attendance: AttendanceRecord[];
  attendanceStats: AttendanceStats;
  leaves: LeaveRecord[];
  leaveBalance: LeaveBalance;
  tasks: TaskRecord[];
  timesheets: TimesheetRecord[];
}

type Tab = 'overview' | 'attendance' | 'leave' | 'tasks' | 'timesheets';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

function empTypeLabel(t: string): string {
  const map: Record<string, string> = {
    'full-time': 'Full Time', 'part-time': 'Part Time',
    contract: 'Contract', intern: 'Intern', freelance: 'Freelance',
  };
  return map[t] || t;
}

function tenure(d: string | null): string {
  if (!d) return '';
  const start = new Date(d);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} month${m !== 1 ? 's' : ''}`;
  return `${y} yr${y !== 1 ? 's' : ''} ${m} mo`;
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    present: 'ud-badge-green', wfh: 'ud-badge-blue', absent: 'ud-badge-red', missed: 'ud-badge-red',
    approved: 'ud-badge-green', pending: 'ud-badge-yellow', rejected: 'ud-badge-red',
    todo: 'ud-badge-muted', in_progress: 'ud-badge-blue', done: 'ud-badge-green', blocked: 'ud-badge-red',
    draft: 'ud-badge-muted', submitted: 'ud-badge-yellow',
  };
  return <span className={`ud-badge ${cls[status] || 'ud-badge-muted'}`}>{status.replace(/_/g, ' ')}</span>;
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="ud-field">
      <div className="ud-field-icon">{icon}</div>
      <div className="ud-field-body">
        <span className="ud-field-label">{label}</span>
        <span className="ud-field-value">{value || '—'}</span>
      </div>
    </div>
  );
}

function tsWeekTotal(ts: TimesheetRecord): number {
  let sum = 0;
  for (const t of ts.tasks) {
    for (const v of Object.values(t.entries)) sum += v;
  }
  return sum;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function weekDates(weekStart: string): string[] {
  const d = new Date(weekStart);
  return DAYS.map((_, i) => {
    const dd = new Date(d);
    dd.setDate(dd.getDate() + i);
    return `${dd.getDate()} ${dd.toLocaleString(undefined, { month: 'short' })}`;
  });
}

function taskRowTotal(entries: Record<string, number>): number {
  return DAYS.reduce((s, d) => s + (entries[d] || 0), 0);
}

function dayColumnTotal(tasks: TimesheetTask[], day: typeof DAYS[number]): number {
  return tasks.reduce((s, t) => s + (t.entries[day] || 0), 0);
}

function TimesheetCard({ ts }: { ts: TimesheetRecord }) {
  const [expanded, setExpanded] = useState(true);
  const dates = weekDates(ts.weekStart);
  const total = tsWeekTotal(ts);

  return (
    <div className="ud-card ud-ts-card">
      <div className="ud-ts-header" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0}>
        <div className="ud-ts-header-left">
          <span className="ud-ts-week">Week of {ts.weekStart}</span>
          <StatusBadge status={ts.status} />
        </div>
        <div className="ud-ts-header-right">
          <span className="ud-ts-total">{fmtMin(total)}</span>
          <span className="ud-ts-toggle">{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <div className="ud-ts-body">
          <table className="ud-table ud-ts-table">
            <thead>
              <tr>
                <th className="ud-ts-task-col">Task</th>
                {DAYS.map((d, i) => (
                  <th key={d} className="ud-ts-day-col">
                    <span className="ud-ts-day-name">{DAY_LABELS[i]}</span>
                    <span className="ud-ts-day-date">{dates[i]}</span>
                  </th>
                ))}
                <th className="ud-ts-day-col">Total</th>
              </tr>
            </thead>
            <tbody>
              {ts.tasks.map((task) => (
                <tr key={task.id}>
                  <td className="ud-ts-task-col">{task.name}</td>
                  {DAYS.map((d) => {
                    const mins = task.entries[d] || 0;
                    return (
                      <td key={d} className={`ud-ts-day-col ${mins > 0 ? 'ud-ts-has-value' : ''}`}>
                        {mins > 0 ? fmtMin(mins) : '—'}
                      </td>
                    );
                  })}
                  <td className="ud-ts-day-col ud-ts-row-total">{fmtMin(taskRowTotal(task.entries))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ud-ts-footer-row">
                <td className="ud-ts-task-col"><strong>Daily Total</strong></td>
                {DAYS.map((d) => (
                  <td key={d} className="ud-ts-day-col ud-ts-day-total">{fmtMin(dayColumnTotal(ts.tasks, d))}</td>
                ))}
                <td className="ud-ts-day-col ud-ts-grand-total">{fmtMin(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<UserDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!id) return;
    authed(`/admin/users/${id}/detail`)
      .then((d: UserDetail) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="ud-page">
        <button className="ud-back" onClick={() => navigate('/users')}><IconArrowLeft size={16} /> Back to Users</button>
        <p className="ud-error">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ud-page">
        <button className="ud-back" onClick={() => navigate('/users')}><IconArrowLeft size={16} /> Back to Users</button>
        <p className="ud-loading">Loading user details...</p>
      </div>
    );
  }

  const p = data.profile;
  const name = p.displayName || p.email;
  const initial = (name[0] ?? '?').toUpperCase();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'attendance', label: `Attendance (${data.attendanceStats.totalDays})` },
    { key: 'leave', label: `Leave (${data.leaves.length})` },
    { key: 'tasks', label: `Tasks (${data.tasks.length})` },
    { key: 'timesheets', label: `Timesheets (${data.timesheets.length})` },
  ];

  return (
    <div className="ud-page">
      <button className="ud-back" onClick={() => navigate('/users')}><IconArrowLeft size={16} /> Back to Users</button>

      {/* Banner */}
      <div className="ud-banner">
        <div className="ud-banner-bg" />
        <div className="ud-banner-body">
          <div className="ud-banner-avatar">{initial}</div>
          <div className="ud-banner-info">
            <h1 className="ud-banner-name">{name}</h1>
            <div className="ud-banner-meta">
              {p.designationId?.name && <span className="ud-banner-tag"><IconBriefcase size={12} />{p.designationId.name}</span>}
              {p.departmentId?.name && <span className="ud-banner-tag"><IconBuilding size={12} />{p.departmentId.name}</span>}
              {p.locationId?.name && <span className="ud-banner-tag"><IconMapPin size={12} />{p.locationId.name}</span>}
              {p.employeeCode && <span className="ud-banner-tag"><IconId size={12} />{p.employeeCode}</span>}
            </div>
          </div>
          <span className={`ud-active-badge ${p.active === false ? 'ud-inactive' : 'ud-active'}`}>
            {p.active === false ? 'Inactive' : 'Active'}
          </span>
        </div>

        <div className="ud-quick-strip">
          <div className="ud-quick-item"><span className="ud-quick-val">{p.email}</span><span className="ud-quick-lbl">Email</span></div>
          <div className="ud-quick-sep" />
          <div className="ud-quick-item"><span className="ud-quick-val">{p.phone || '—'}</span><span className="ud-quick-lbl">Phone</span></div>
          <div className="ud-quick-sep" />
          <div className="ud-quick-item"><span className="ud-quick-val">{empTypeLabel(p.employmentType)}</span><span className="ud-quick-lbl">Employment</span></div>
          <div className="ud-quick-sep" />
          <div className="ud-quick-item"><span className="ud-quick-val">{fmtDate(p.dateOfJoining)}</span><span className="ud-quick-lbl">Joined</span></div>
          {p.dateOfJoining && (
            <><div className="ud-quick-sep" /><div className="ud-quick-item"><span className="ud-quick-val">{tenure(p.dateOfJoining)}</span><span className="ud-quick-lbl">Tenure</span></div></>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="ud-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`ud-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="ud-content">
          <div className="ud-grid-2">
            <div className="ud-card">
              <h2 className="ud-card-title">Personal Information</h2>
              <div className="ud-fields">
                <InfoField icon={<IconUser size={16} />} label="Full Name" value={p.displayName} />
                <InfoField icon={<IconMail size={16} />} label="Email" value={p.email} />
                <InfoField icon={<IconPhone size={16} />} label="Phone" value={p.phone} />
                <InfoField icon={<IconCalendar size={16} />} label="Date of Birth" value={fmtDate(p.dateOfBirth)} />
                <InfoField icon={<IconId size={16} />} label="Employee Code" value={p.employeeCode} />
                <InfoField icon={<IconShield size={16} />} label="Roles" value={p.roles.map((r) => r.replace(/_/g, ' ')).join(', ')} />
              </div>
            </div>

            <div className="ud-card">
              <h2 className="ud-card-title">Organisation</h2>
              <div className="ud-fields">
                <InfoField icon={<IconBuilding size={16} />} label="Department" value={p.departmentId?.name || ''} />
                <InfoField icon={<IconBriefcase size={16} />} label="Designation" value={p.designationId?.name || ''} />
                <InfoField icon={<IconMapPin size={16} />} label="Location" value={p.locationId?.name || ''} />
                <InfoField icon={<IconBuilding size={16} />} label="Legal Entity" value={p.legalEntityId?.name || ''} />
                <InfoField icon={<IconBuilding size={16} />} label="Business Unit" value={p.businessUnitId?.name || ''} />
                <InfoField icon={<IconClock size={16} />} label="Shift" value={p.shiftId ? `${p.shiftId.name}${p.shiftId.startTime ? ` (${p.shiftId.startTime} – ${p.shiftId.endTime})` : ''}` : ''} />
                {p.reportingManagerId && (
                  <InfoField icon={<IconUser size={16} />} label="Reporting Manager" value={`${p.reportingManagerId.displayName} (${p.reportingManagerId.email})`} />
                )}
              </div>
            </div>
          </div>

          <div className="ud-grid-2">
            <div className="ud-card">
              <h2 className="ud-card-title">Attendance Summary (Last 30 days)</h2>
              <div className="ud-stat-grid">
                <div className="ud-stat"><span className="ud-stat-val">{data.attendanceStats.presentDays}</span><span className="ud-stat-lbl">Present</span></div>
                <div className="ud-stat"><span className="ud-stat-val">{data.attendanceStats.wfhDays}</span><span className="ud-stat-lbl">WFH</span></div>
                <div className="ud-stat"><span className="ud-stat-val">{data.attendanceStats.totalDays - data.attendanceStats.presentDays}</span><span className="ud-stat-lbl">Absent</span></div>
                <div className="ud-stat"><span className="ud-stat-val">{fmtMin(data.attendanceStats.avgEffective)}</span><span className="ud-stat-lbl">Avg / day</span></div>
              </div>
            </div>

            <div className="ud-card">
              <h2 className="ud-card-title">Leave Balance ({data.leaveBalance.year})</h2>
              <div className="ud-stat-grid">
                <div className="ud-stat">
                  <span className="ud-stat-val">{data.leaveBalance.casual.total - data.leaveBalance.casual.used} / {data.leaveBalance.casual.total}</span>
                  <span className="ud-stat-lbl">Casual</span>
                </div>
                <div className="ud-stat">
                  <span className="ud-stat-val">{data.leaveBalance.sick.total - data.leaveBalance.sick.used} / {data.leaveBalance.sick.total}</span>
                  <span className="ud-stat-lbl">Sick</span>
                </div>
                <div className="ud-stat">
                  <span className="ud-stat-val">{data.leaveBalance.earned.total - data.leaveBalance.earned.used} / {data.leaveBalance.earned.total}</span>
                  <span className="ud-stat-lbl">Earned</span>
                </div>
              </div>
            </div>
          </div>

          {p.skills.length > 0 && (
            <div className="ud-card">
              <h2 className="ud-card-title">Skills</h2>
              <div className="ud-chips">
                {p.skills.map((s) => <span key={s._id} className="ud-chip"><IconStarFilled size={11} />{s.name}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attendance Tab */}
      {tab === 'attendance' && (
        <div className="ud-content">
          <div className="ud-card">
            <h2 className="ud-card-title">Recent Attendance</h2>
            <table className="ud-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Effective</th>
                  <th>Break</th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.length === 0 && <tr><td colSpan={7} className="ud-empty">No attendance records.</td></tr>}
                {data.attendance.map((a) => (
                  <tr key={a._id}>
                    <td>{a.date}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{a.punchType}</td>
                    <td>{fmtTime(a.checkIn)}</td>
                    <td>{fmtTime(a.checkOut)}</td>
                    <td>{fmtMin(a.effectiveMinutes)}</td>
                    <td>{fmtMin(a.breakMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Tab */}
      {tab === 'leave' && (
        <div className="ud-content">
          <div className="ud-card">
            <h2 className="ud-card-title">Leave Balance ({data.leaveBalance.year})</h2>
            <div className="ud-stat-grid" style={{ marginBottom: 20 }}>
              {(['casual', 'sick', 'earned'] as const).map((t) => (
                <div key={t} className="ud-stat">
                  <span className="ud-stat-val">{data.leaveBalance[t].total - data.leaveBalance[t].used} / {data.leaveBalance[t].total}</span>
                  <span className="ud-stat-lbl" style={{ textTransform: 'capitalize' }}>{t} (used: {data.leaveBalance[t].used})</span>
                </div>
              ))}
            </div>
          </div>
          <div className="ud-card">
            <h2 className="ud-card-title">Leave History</h2>
            <table className="ud-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.leaves.length === 0 && <tr><td colSpan={6} className="ud-empty">No leave records.</td></tr>}
                {data.leaves.map((l) => (
                  <tr key={l._id}>
                    <td style={{ textTransform: 'capitalize' }}>{l.type}</td>
                    <td>{l.startDate}</td>
                    <td>{l.endDate}</td>
                    <td>{l.requestedDays}</td>
                    <td>{l.reason}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {tab === 'tasks' && (
        <div className="ud-content">
          <div className="ud-card">
            <h2 className="ud-card-title">Assigned Tasks</h2>
            <table className="ud-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Est. Hours</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {data.tasks.length === 0 && <tr><td colSpan={6} className="ud-empty">No tasks assigned.</td></tr>}
                {data.tasks.map((t) => (
                  <tr key={t._id}>
                    <td>{t.title}</td>
                    <td>{typeof t.project === 'object' ? t.project.name : '—'}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>
                      <div className="ud-progress-wrap">
                        <div className="ud-progress-bar"><div className="ud-progress-fill" style={{ width: `${t.percentComplete || 0}%` }} /></div>
                        <span className="ud-progress-pct">{t.percentComplete || 0}%</span>
                      </div>
                    </td>
                    <td>{t.estimatedHours}h</td>
                    <td>{fmtDate(t.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timesheets Tab */}
      {tab === 'timesheets' && (
        <div className="ud-content">
          {data.timesheets.length === 0 && <div className="ud-card"><p className="ud-empty">No timesheets found.</p></div>}
          {data.timesheets.map((ts) => (
            <TimesheetCard key={ts._id} ts={ts} />
          ))}
        </div>
      )}
    </div>
  );
}
