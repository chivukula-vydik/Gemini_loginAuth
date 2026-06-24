# RM Dashboard Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated Reporting Manager dashboard that replaces the generic Home page for RM users, showing team attendance stats, pending approval counts, inline leave approval, and a weekly team availability calendar.

**Architecture:** Single backend endpoint `GET /manager/dashboard` aggregates all data scoped to the RM's direct reportees. Frontend renders a new `RMDashboard` component at the `/` route for `reporting_manager` role only, reusing existing `.dash-*` CSS classes and extending with `.rm-*` styles.

**Tech Stack:** Express.js, Mongoose, React 19, TypeScript, react-router-dom v7

## Global Constraints

- Backend route pattern: `export function createXRouter()` factory, mounted in `auth-api/src/app.js`.
- Frontend API pattern: `authed(path, method?, body?)` from `web/src/fetchHelper.ts`.
- Role type: `'admin' | 'pm' | 'employee' | 'reporting_manager'`.
- Auth middleware: `requireAuth` from `../middleware/requireAuth.js`, `requireRole` from `../middleware/requireRole.js`.
- Async handler: `asyncHandler` from `../middleware/asyncHandler.js`.
- Shift start: 9:30 AM hardcoded (constants in `Attendance.js`: `SHIFT_START_HOUR=9`, `SHIFT_START_MINUTE=30`). No grace period.
- Today string: `todayStr()` from `../models/Attendance.js` returns `"YYYY-MM-DD"`.
- Current week Monday: `currentMonday()` from `../services/timesheetRows.js`.
- Leave types: `casual`, `sick`, `earned`, `unpaid`.
- Do NOT touch `auth-api/src/models/Timesheet.js` — pre-existing uncommitted change.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `auth-api/src/routes/manager.js` | Create | `GET /manager/dashboard` endpoint |
| `auth-api/src/app.js` | Modify (lines 22, 91) | Import + mount manager router |
| `web/src/dashboard/managerApi.ts` | Create | Types + API helper for RM dashboard |
| `web/src/dashboard/RMDashboard.tsx` | Create | RM dashboard page component |
| `web/src/AppShell.tsx` | Modify (lines 1, 16, 85) | Import RMDashboard, conditional route |
| `web/src/styles.css` | Modify (append) | `.rm-*` CSS classes |

---

### Task 1: Backend — `GET /manager/dashboard` Endpoint

**Files:**
- Create: `auth-api/src/routes/manager.js`
- Modify: `auth-api/src/app.js:22,91`

**Interfaces:**
- Consumes: `User`, `Attendance`, `Leave`, `Timesheet`, `EditRequest` models; `todayStr()`, `currentMonday()`, `DAYS` helpers; `requireAuth`, `requireRole`, `asyncHandler` middleware
- Produces: `GET /manager/dashboard?week=YYYY-MM-DD` returning `{ greeting, teamMembers, stats, pendingCounts, pendingLeaves, calendar }`

- [ ] **Step 1: Create `auth-api/src/routes/manager.js`**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Attendance, todayStr, SHIFT_START_HOUR, SHIFT_START_MINUTE } from '../models/Attendance.js';
import { Leave, workingDays } from '../models/Leave.js';
import { Timesheet } from '../models/Timesheet.js';
import { EditRequest } from '../models/EditRequest.js';
import { User } from '../models/User.js';
import { DAYS } from '../services/timesheetRows.js';

function greetingText() {
  const h = new Date().getHours();
  if (h >= 5 && h <= 11) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

function mondayOfWeek(dateStr) {
  if (dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekDays(mondayStr) {
  const days = [];
  const d = new Date(mondayStr + 'T00:00:00');
  for (let i = 0; i < 5; i++) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isLate(checkIn) {
  if (!checkIn) return false;
  const d = new Date(checkIn);
  return d.getHours() > SHIFT_START_HOUR || (d.getHours() === SHIFT_START_HOUR && d.getMinutes() > SHIFT_START_MINUTE);
}

export function createManagerRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('reporting_manager'));

  router.get('/dashboard', asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const today = todayStr();

    const teamMembers = await User.find({ reportingManagerId: userId, active: { $ne: false } })
      .select('_id displayName email');
    const teamIds = teamMembers.map((u) => u._id);

    // --- stats ---
    const todayAttendance = await Attendance.find({ userId: { $in: teamIds }, date: today });
    let present = 0, late = 0, wfh = 0, remoteClockIns = 0;
    for (const doc of todayAttendance) {
      if (!doc.checkIn) continue;
      present++;
      if (isLate(doc.checkIn)) late++;
      if (doc.punchType === 'wfh') wfh++;
      if (doc.punchType === 'remote') remoteClockIns++;
    }
    const onLeave = await Leave.countDocuments({
      userId: { $in: teamIds },
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    });
    const stats = {
      total: teamMembers.length,
      present,
      late,
      onTime: present - late,
      wfh,
      remoteClockIns,
      onLeave,
      absent: teamMembers.length - present - onLeave,
    };

    // --- pending counts ---
    const [leaveCount, tsCount, regCount, editCount] = await Promise.all([
      Leave.countDocuments({ assignedApprover: userId, status: 'pending' }),
      Timesheet.countDocuments({ userId: { $in: teamIds }, status: 'submitted' }),
      Attendance.countDocuments({ userId: { $in: teamIds }, 'regularise.status': 'pending' }),
      EditRequest.countDocuments({ userId: { $in: teamIds }, status: 'pending' }),
    ]);
    const pendingCounts = { leave: leaveCount, timesheets: tsCount, regularise: regCount, editRequests: editCount };

    // --- pending leaves (full objects for inline approval) ---
    const pendingLeaves = await Leave.find({ assignedApprover: userId, status: 'pending' })
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    const pendingLeavesOut = pendingLeaves.map((l) => ({
      _id: l._id,
      user: l.userId,
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.requestedDays || workingDays(l.startDate, l.endDate),
      halfDay: l.halfDay,
      reason: l.reason,
      requestedAt: l.requestedAt,
    }));

    // --- calendar ---
    const weekStart = mondayOfWeek(req.query.week);
    const days = weekDays(weekStart);
    const weekEnd = days[days.length - 1];

    const weekAttendance = await Attendance.find({
      userId: { $in: teamIds },
      date: { $gte: weekStart, $lte: weekEnd },
    });
    const weekLeaves = await Leave.find({
      userId: { $in: teamIds },
      status: 'approved',
      startDate: { $lte: weekEnd },
      endDate: { $gte: weekStart },
    });

    const attMap = {};
    for (const a of weekAttendance) {
      const key = `${a.userId}_${a.date}`;
      attMap[key] = { status: a.status, punchType: a.punchType };
    }

    const members = teamMembers.map((m) => {
      const cells = {};
      for (const day of days) {
        const key = `${m._id}_${day}`;
        if (attMap[key]) {
          cells[day] = attMap[key];
        } else {
          const leave = weekLeaves.find((l) =>
            String(l.userId) === String(m._id) && l.startDate <= day && l.endDate >= day
          );
          if (leave) {
            cells[day] = { status: 'leave', leaveType: leave.type };
          } else {
            cells[day] = null;
          }
        }
      }
      return { _id: m._id, name: m.displayName || m.email, cells };
    });

    res.json({
      greeting: greetingText(),
      teamMembers: teamMembers.map((m) => ({ _id: m._id, displayName: m.displayName, email: m.email })),
      stats,
      pendingCounts,
      pendingLeaves: pendingLeavesOut,
      calendar: { weekStart, days, members },
    });
  }));

  return router;
}
```

- [ ] **Step 2: Mount the router in `auth-api/src/app.js`**

Add this import after line 22 (`import { createDashboardRouter }...`):

```js
import { createManagerRouter } from './routes/manager.js';
```

Add this mount after line 91 (`app.use('/dashboard', createDashboardRouter());`):

```js
  app.use('/manager', createManagerRouter());
```

- [ ] **Step 3: Verify the backend starts**

Run: `cd auth-api && node -e "import('./src/app.js').then(() => console.log('OK'))"`
Expected: `OK` (no import errors)

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/manager.js auth-api/src/app.js
git commit -m "feat: add GET /manager/dashboard endpoint for RM role"
```

---

### Task 2: Frontend API Types + Helper

**Files:**
- Create: `web/src/dashboard/managerApi.ts`

**Interfaces:**
- Consumes: `authed()` from `web/src/fetchHelper.ts`
- Produces: `RMDashboardData` type, `getRMDashboard(week?)` function, `PendingLeave` type, `CalendarMember` type, `CalendarCell` type, `RMStats` type, `PendingCounts` type

- [ ] **Step 1: Create `web/src/dashboard/managerApi.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/dashboard/managerApi.ts
git commit -m "feat: add managerApi types and helper for RM dashboard"
```

---

### Task 3: RMDashboard Component + CSS + Route Wiring

**Files:**
- Create: `web/src/dashboard/RMDashboard.tsx`
- Modify: `web/src/AppShell.tsx:1,16,85`
- Modify: `web/src/styles.css` (append)

**Interfaces:**
- Consumes: `getRMDashboard()`, `RMDashboardData`, `PendingLeave`, `CalendarMember`, `CalendarCell`, `RMStats`, `PendingCounts` from `web/src/dashboard/managerApi.ts`; `decideLeave()` from `web/src/attendance/leaveApi.ts`; `useAuth()` from `web/src/authContext`; `personName()` from `web/src/pm/personName`; `useNavigate()` from `react-router-dom`; `pathForKey()` from `web/src/pm/nav`
- Produces: `<RMDashboard />` component rendered at `/` for reporting_manager role

- [ ] **Step 1: Create `web/src/dashboard/RMDashboard.tsx`**

```tsx
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
```

- [ ] **Step 2: Add CSS to `web/src/styles.css`**

Append the following at the end of the file:

```css
/* ── RM Dashboard ── */
.rm-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.rm-stat-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 16px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border);
}
.rm-stat-count { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.rm-stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.rm-stat-sub { font-size: 11px; color: var(--muted); }
.rm-stat-late .rm-stat-count { color: #ef4444; }
.rm-stat-ontime .rm-stat-count { color: #22c55e; }
.rm-stat-wfh .rm-stat-count { color: #06b6d4; }
.rm-stat-leave .rm-stat-count { color: #f59e0b; }

.rm-section-title { font-size: 16px; font-weight: 600; color: var(--text); margin: 0 0 12px; }
.rm-pending-row { margin-bottom: 24px; }
.rm-pending-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.rm-pending-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 14px; cursor: pointer; text-align: center;
}
.rm-pending-count { font-size: 24px; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.rm-pending-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }

.rm-leave-section { margin-bottom: 24px; }
.rm-leave-actions { display: flex; gap: 6px; }
.ts-btn-danger { background: #ef4444; color: #fff; border: none; }
.ts-btn-danger:hover { background: #dc2626; }

.rm-calendar-section { margin-bottom: 24px; }
.rm-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rm-cal-header .rm-section-title { margin: 0; }
.rm-cal-nav { display: flex; gap: 4px; }
.rm-cal-table th { text-align: center; font-size: 12px; }
.rm-cal-date { font-size: 10px; color: var(--muted); font-weight: 400; }
.rm-cal-cell { text-align: center; padding: 6px 4px; border-radius: 4px; min-width: 60px; }
.rm-cal-cell-text { font-size: 10px; font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.rm-cal-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
.rm-legend-item { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
.rm-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

@media (max-width: 768px) {
  .rm-stats-row { grid-template-columns: repeat(2, 1fr); }
  .rm-pending-grid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 3: Modify `web/src/AppShell.tsx` to conditionally render RMDashboard**

Add this import after the `HomePage` import (line 16):

```tsx
import { RMDashboard } from './dashboard/RMDashboard';
```

Change line 85 from:

```tsx
          <Route path="/" element={<HomePage />} />
```

To:

```tsx
          <Route path="/" element={user?.role === 'reporting_manager' ? <RMDashboard /> : <HomePage />} />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web/src/dashboard/RMDashboard.tsx web/src/AppShell.tsx web/src/styles.css
git commit -m "feat: add RMDashboard page with stats, approvals, calendar"
```
