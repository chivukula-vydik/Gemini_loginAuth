# Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-adaptive home dashboard as the default landing page, with a greeting banner and quick-glance widget cards aggregating data from attendance, leave, timesheet, tasks, approvals, and team modules.

**Architecture:** A single new `GET /dashboard` backend endpoint aggregates all widget data server-side using per-section try/catch (missing sections are omitted, not errors). The frontend renders a `HomePage` component with a greeting banner and responsive CSS grid of clickable widget cards. Navigation adds `'home'` as the first NavKey for all roles.

**Tech Stack:** Express.js, Mongoose, React 19, TypeScript, Vite, CSS

## Global Constraints

- Backend route pattern: `export function createXRouter()` factory, mounted in `auth-api/src/app.js`.
- Backend middleware: `requireAuth` for auth, `asyncHandler` for async route handlers.
- Frontend API pattern: `authed(path, method?, body?)` from `web/src/fetchHelper.ts`.
- Navigation: `NavKey` type in `web/src/pm/nav.ts`, `viewFor()` switch in `web/src/AppShell.tsx`.
- Role type in backend: `'admin' | 'pm' | 'employee' | 'reporting_manager'`.
- Role type in frontend `authContext.tsx` currently missing `'reporting_manager'` — must be added.
- Existing CSS classes: `.ts-page`, `.ts-card`, `.ts-tile`, `.ts-tile-label`, `.ts-tile-value`, `.ts-tile-foot`, `.ts-header`.
- `currentMonday()` from `auth-api/src/services/timesheetRows.js` returns `'YYYY-MM-DD'` string for the current week's Monday.
- `DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']` from `auth-api/src/services/timesheetRows.js`.
- `todayStr()` from `auth-api/src/models/Attendance.js` returns `'YYYY-MM-DD'` for today.
- `getOrCreateBalance(userId, year)` + `remaining(balance, type)` from `auth-api/src/models/LeaveBalance.js`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `auth-api/src/routes/dashboard.js` | Create | `GET /dashboard` endpoint with role-adaptive aggregation |
| `auth-api/src/app.js` | Modify (line 22, 91) | Import and mount dashboard router |
| `web/src/authContext.tsx` | Modify (line 9) | Add `'reporting_manager'` to User role type |
| `web/src/dashboard/dashboardApi.ts` | Create | TypeScript types + `getDashboard()` API function |
| `web/src/dashboard/HomePage.tsx` | Create | Dashboard page component with greeting + widget grid |
| `web/src/pm/nav.ts` | Modify (lines 2, 10, 24, 27, 34) | Add `'home'` NavKey, prepend to all role nav arrays |
| `web/src/AppShell.tsx` | Modify (lines 14, 21, 38, 66) | Import HomePage, add viewFor case, add icon, default to 'home' |
| `web/src/styles.css` | Modify (append) | Dashboard-specific CSS classes |

---

### Task 1: Backend — Dashboard Route

**Files:**
- Create: `auth-api/src/routes/dashboard.js`
- Modify: `auth-api/src/app.js:22,91`

**Interfaces:**
- Consumes: `Attendance` model, `todayStr()`, `Leave` model, `getOrCreateBalance()`, `remaining()`, `Timesheet` model, `Task` model, `EditRequest` model, `ClaimRequest` model, `User` model, `Project` model, `currentMonday()`, `DAYS`, `requireAuth`, `asyncHandler`
- Produces: `GET /dashboard` → JSON response with fields: `greeting`, `attendance`, `leave`, `timesheet`, `tasks`, and (for pm/admin/reporting_manager) `pendingApprovals`, `teamSummary`

- [ ] **Step 1: Create the dashboard route file**

Create `auth-api/src/routes/dashboard.js`:

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Attendance, todayStr } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { getOrCreateBalance, remaining } from '../models/LeaveBalance.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { EditRequest } from '../models/EditRequest.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { currentMonday, DAYS } from '../services/timesheetRows.js';

const TEAM_ROLES = ['admin', 'pm', 'reporting_manager'];

function greetingText() {
  const h = new Date().getHours();
  if (h >= 5 && h <= 11) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}

function deriveAttendanceStatus(doc) {
  if (!doc || !doc.checkIn) return 'idle';
  if (doc.checkOut) return 'done';
  return (doc.breaks || []).some((b) => !b.end) ? 'on-break' : 'in';
}

async function teamMemberIds(userId, role) {
  if (role === 'admin') {
    const users = await User.find({ active: { $ne: false } }).select('_id');
    return users.map((u) => u._id);
  }
  if (role === 'reporting_manager') {
    const users = await User.find({ reportingManagerId: userId }).select('_id');
    return users.map((u) => u._id);
  }
  // PM: members across owned projects
  const projects = await Project.find({ ownerPm: userId }).select('members');
  const set = new Set();
  for (const p of projects) {
    for (const m of p.members || []) set.add(String(m));
  }
  return Array.from(set);
}

export function createDashboardRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.user.sub;
    const role = req.user.role;
    const result = { greeting: greetingText() };

    // --- attendance ---
    try {
      const today = todayStr();
      const doc = await Attendance.findOne({ userId, date: today });
      const shiftDuration = req.app.locals.shiftConfig?.durationMinutes || 540;
      let effectiveMinutes = 0;
      if (doc && doc.checkIn) {
        if (doc.checkOut) {
          effectiveMinutes = doc.effectiveMinutes || 0;
        } else {
          const gross = (Date.now() - new Date(doc.checkIn).getTime()) / 60000;
          const breakMins = (doc.breakMinutes || 0) +
            ((doc.breaks || []).find((b) => !b.end)
              ? (Date.now() - new Date((doc.breaks || []).find((b) => !b.end).start).getTime()) / 60000
              : 0);
          effectiveMinutes = Math.max(0, Math.round(gross - breakMins));
        }
      }
      result.attendance = {
        status: deriveAttendanceStatus(doc),
        checkIn: doc?.checkIn || null,
        effectiveMinutes,
        shiftDuration,
      };
    } catch (_) { /* omit section */ }

    // --- leave ---
    try {
      const year = new Date().getFullYear();
      const balance = await getOrCreateBalance(userId, year);
      const pendingCount = await Leave.countDocuments({ userId, status: 'pending' });
      result.leave = {
        casual: { remaining: remaining(balance, 'casual'), total: balance.casual.total },
        sick: { remaining: remaining(balance, 'sick'), total: balance.sick.total },
        earned: { remaining: remaining(balance, 'earned'), total: balance.earned.total },
        pendingCount,
      };
    } catch (_) { /* omit section */ }

    // --- timesheet ---
    try {
      const weekStart = currentMonday();
      const ts = await Timesheet.findOne({ userId, weekStart });
      let totalMinutes = 0;
      let billableMinutes = 0;
      let submittedDays = 0;
      if (ts) {
        for (const t of ts.tasks || []) {
          for (const day of DAYS) {
            const mins = t.entries?.[day] || 0;
            totalMinutes += mins;
            if (mins > 0 && (t.billable?.[day] != null ? t.billable[day] : false)) {
              billableMinutes += mins;
            }
          }
        }
        for (const day of DAYS) {
          const s = ts.dayStatus?.[day]?.status;
          if (s === 'submitted' || s === 'approved') submittedDays++;
        }
      }
      result.timesheet = {
        weekStart,
        totalMinutes,
        targetMinutes: req.app.locals.weeklyTargetMinutes || 2400,
        submittedDays,
        billableMinutes,
      };
    } catch (_) { /* omit section */ }

    // --- tasks ---
    try {
      const agg = await Task.aggregate([
        { $match: { 'assignees.user': userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      const counts = { todo: 0, inProgress: 0, blocked: 0, done: 0 };
      for (const a of agg) {
        if (a._id === 'todo') counts.todo = a.count;
        else if (a._id === 'in_progress') counts.inProgress = a.count;
        else if (a._id === 'blocked') counts.blocked = a.count;
        else if (a._id === 'done') counts.done = a.count;
      }
      result.tasks = counts;
    } catch (_) { /* omit section */ }

    // --- team-only sections ---
    if (TEAM_ROLES.includes(role)) {
      // --- pending approvals ---
      try {
        const leaveFilter = { status: 'pending' };
        if (role === 'reporting_manager') leaveFilter.assignedApprover = userId;
        else if (role === 'pm') leaveFilter.assignedApprover = null;

        const [leaveCount, regCount, editCount, claimCount] = await Promise.all([
          Leave.countDocuments(leaveFilter),
          Attendance.countDocuments({ 'regularise.status': 'pending' }),
          EditRequest.countDocuments({ status: 'pending' }),
          ClaimRequest.countDocuments({ status: 'pending' }),
        ]);

        // Timesheet approvals: count timesheets with at least one submitted day
        let tsFilter = {};
        if (role === 'reporting_manager') {
          const teamIds = await User.find({ reportingManagerId: userId }).select('_id');
          tsFilter.userId = { $in: teamIds.map((u) => u._id) };
        }
        const submittedSheets = await Timesheet.countDocuments({
          ...tsFilter,
          $or: DAYS.map((d) => ({ [`dayStatus.${d}.status`]: 'submitted' })),
        });

        result.pendingApprovals = {
          leave: leaveCount,
          timesheets: submittedSheets,
          regularise: regCount,
          editRequests: editCount,
          claimRequests: claimCount,
        };
      } catch (_) { /* omit section */ }

      // --- team summary ---
      try {
        const memberIds = await teamMemberIds(userId, role);
        const today = todayStr();
        const presentToday = await Attendance.countDocuments({
          userId: { $in: memberIds },
          date: today,
          checkIn: { $ne: null },
        });
        const onLeaveToday = await Leave.countDocuments({
          userId: { $in: memberIds },
          status: 'approved',
          startDate: { $lte: today },
          endDate: { $gte: today },
        });

        // Avg utilization: billable / total logged across team for current week
        const weekStart = currentMonday();
        const teamSheets = await Timesheet.find({
          userId: { $in: memberIds },
          weekStart,
        });
        let totalLogged = 0;
        let totalBillable = 0;
        for (const ts of teamSheets) {
          for (const t of ts.tasks || []) {
            for (const day of DAYS) {
              const mins = t.entries?.[day] || 0;
              totalLogged += mins;
              if (mins > 0 && (t.billable?.[day] != null ? t.billable[day] : false)) {
                totalBillable += mins;
              }
            }
          }
        }
        const avgUtilization = totalLogged > 0 ? Math.round((totalBillable / totalLogged) * 100) : 0;

        result.teamSummary = {
          totalMembers: memberIds.length,
          presentToday,
          onLeaveToday,
          avgUtilization,
        };
      } catch (_) { /* omit section */ }
    }

    res.json(result);
  }));

  return router;
}
```

- [ ] **Step 2: Mount the dashboard router in app.js**

In `auth-api/src/app.js`, add the import after line 22 (after the urlTracking import):

```js
import { createDashboardRouter } from './routes/dashboard.js';
```

Add the mount after line 91 (after the url-tracking mount):

```js
  app.use('/dashboard', createDashboardRouter());
```

- [ ] **Step 3: Verify the server starts without errors**

Run: `cd auth-api && node -e "import('./src/routes/dashboard.js').then(() => console.log('OK')).catch(e => console.error(e))"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/dashboard.js auth-api/src/app.js
git commit -m "feat: add GET /dashboard endpoint with role-adaptive aggregation"
```

---

### Task 2: Frontend — Auth Context Fix + Dashboard API

**Files:**
- Modify: `web/src/authContext.tsx:9`
- Create: `web/src/dashboard/dashboardApi.ts`

**Interfaces:**
- Consumes: `authed()` from `web/src/fetchHelper.ts`
- Produces: Types `DashboardData`, `AttendanceWidget`, `LeaveWidget`, `TimesheetWidget`, `TasksWidget`, `PendingApprovalsWidget`, `TeamSummaryWidget`; function `getDashboard(): Promise<DashboardData>`

- [ ] **Step 1: Fix the User role type in authContext.tsx**

In `web/src/authContext.tsx`, change line 9 from:

```ts
  role: 'admin' | 'pm' | 'employee';
```

to:

```ts
  role: 'admin' | 'pm' | 'employee' | 'reporting_manager';
```

- [ ] **Step 2: Create the dashboard API module**

Create `web/src/dashboard/dashboardApi.ts`:

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add web/src/authContext.tsx web/src/dashboard/dashboardApi.ts
git commit -m "feat: add reporting_manager to frontend role type and dashboard API module"
```

---

### Task 3: Frontend — Navigation Changes

**Files:**
- Modify: `web/src/pm/nav.ts:2,10,24,27,34`
- Modify: `web/src/AppShell.tsx:14,21,38,66`

**Interfaces:**
- Consumes: `HomePage` component from `web/src/dashboard/HomePage.tsx` (created in Task 4 — import will compile once Task 4 lands; for now the `viewFor` case can return a placeholder `<div>Loading...</div>`)
- Produces: `'home'` NavKey available in all role nav arrays; `viewFor('home')` renders HomePage; default active tab is `'home'`

- [ ] **Step 1: Add 'home' to NavKey and all role nav arrays in nav.ts**

In `web/src/pm/nav.ts`, change line 2 from:

```ts
export type NavKey = 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'url-tracking' | 'url-categories';
```

to:

```ts
export type NavKey = 'home' | 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'url-tracking' | 'url-categories';
```

Then prepend `{ key: 'home', label: 'Home' }` as the first item in every role's array. The `navForRole` function becomes:

```ts
export function navForRole(role: Role): NavItem[] {
  const home: NavItem = { key: 'home', label: 'Home' };
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance' };
  const urlTracking: NavItem = { key: 'url-tracking', label: 'URL Activity' };
  if (role === 'admin') {
    return [
      home,
      { key: 'users', label: 'Users' },
      { key: 'skills', label: 'Skills' },
      { key: 'company-fit', label: 'Company fit' },
      { key: 'projects', label: 'Projects' },
      { key: 'requests', label: 'Requests' },
      { key: 'utilization', label: 'Utilization' },
      urlTracking,
      { key: 'url-categories', label: 'URL Categories' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [home, { key: 'projects', label: 'Projects' }, { key: 'requests', label: 'Requests' }, { key: 'utilization', label: 'Utilization' }, urlTracking, timesheet, attendance];
  }
  if (role === 'reporting_manager') {
    return [
      home,
      { key: 'requests', label: 'Requests' },
      urlTracking,
      timesheet,
      attendance,
    ];
  }
  return [
    home,
    { key: 'my-tasks', label: 'My Tasks' },
    { key: 'my-skills', label: 'My Skills' },
    { key: 'marketplace', label: 'Marketplace' },
    timesheet,
    attendance,
  ];
}
```

- [ ] **Step 2: Update AppShell.tsx — import, viewFor, icon, default**

In `web/src/AppShell.tsx`:

Add import after line 14 (after UrlCategories import):

```ts
import { HomePage } from './dashboard/HomePage';
```

Add case to `viewFor()` at the top of the switch (before 'users'):

```ts
    case 'home': return <HomePage onNavigate={setActive} />;
```

Add home icon to `NAV_ICONS` (before the `users` entry):

```ts
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />,
```

Change the `useState` default on line 66 from:

```ts
  const [active, setActive] = useState<NavKey>(items[0].key);
```

to:

```ts
  const [active, setActive] = useState<NavKey>('home');
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/nav.ts web/src/AppShell.tsx
git commit -m "feat: add 'home' nav key as default landing page for all roles"
```

---

### Task 4: Frontend — HomePage Component + CSS

**Files:**
- Create: `web/src/dashboard/HomePage.tsx`
- Modify: `web/src/styles.css` (append)

**Interfaces:**
- Consumes: `getDashboard()` and all widget types from `web/src/dashboard/dashboardApi.ts`; `useAuth()` from `web/src/authContext.tsx`; `NavKey` from `web/src/pm/nav.ts`; `personName()` from `web/src/pm/personName.ts`
- Produces: `<HomePage onNavigate={(key: NavKey) => void} />` component

- [ ] **Step 1: Create the HomePage component**

Create `web/src/dashboard/HomePage.tsx`:

```tsx
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
                    width: `${Math.min(100, Math.round((data.attendance.effectiveMinutes / data.attendance.shiftDuration) * 100))}%`,
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
                    width: `${Math.min(100, Math.round((data.timesheet.totalMinutes / data.timesheet.targetMinutes) * 100))}%`,
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
```

- [ ] **Step 2: Add dashboard CSS to styles.css**

Append the following to `web/src/styles.css`:

```css
/* ===== Dashboard ===== */
.dash-page { padding-top: 8px; }
.dash-greeting { margin-bottom: 24px; }
.dash-hello { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.025em; color: var(--text); }
.dash-date { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
.dash-loading { color: var(--muted); font-size: 14px; }
.dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

.dash-card {
  padding: 18px 20px; cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.dash-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.18); border-color: var(--border-strong); }
.dash-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.dash-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.dash-card-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--faint); }
.dash-card-sub { font-size: 11px; color: var(--muted); margin-left: auto; }
.dash-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dash-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
  background: var(--warning, #f59e0b); color: #000; margin-left: auto;
}

.dash-card-body { display: flex; flex-direction: column; gap: 6px; }
.dash-metric-value { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.dash-metric-hero { font-size: 32px; }
.dash-metric-sub { font-size: 12px; color: var(--muted); }

.dash-progress { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
.dash-progress-fill { height: 100%; background: var(--accent, #6366f1); border-radius: 3px; transition: width 0.3s; }

.dash-leave-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.dash-leave-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dash-leave-count { font-size: 24px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.dash-leave-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.dash-leave-total { color: var(--faint); }

.dash-tasks-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.dash-task-chip {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);
}
.dash-chip-count { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dash-chip-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.dash-chip-todo { border-left: 3px solid #3b82f6; }
.dash-chip-todo .dash-chip-count { color: #3b82f6; }
.dash-chip-progress { border-left: 3px solid #f59e0b; }
.dash-chip-progress .dash-chip-count { color: #f59e0b; }
.dash-chip-blocked { border-left: 3px solid #ef4444; }
.dash-chip-blocked .dash-chip-count { color: #ef4444; }
.dash-chip-done { border-left: 3px solid #22c55e; }
.dash-chip-done .dash-chip-count { color: #22c55e; }

.dash-approval-breakdown { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.dash-approval-item {
  font-size: 11px; padding: 2px 8px; border-radius: 8px;
  background: var(--surface-2); color: var(--text); font-weight: 500;
}

.dash-team-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.dash-team-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dash-team-value { font-size: 20px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.dash-team-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }

@media (max-width: 640px) {
  .dash-grid { grid-template-columns: 1fr; }
  .dash-team-grid { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Start the dev server and verify the dashboard renders**

Run: `cd web && npm run dev`
Open browser to `http://localhost:5173`. Verify:
- Home is the default active tab in the sidebar
- Greeting banner shows "Good morning/afternoon/evening, [Name]"
- Widget cards render (with data from the backend if running, or show "Loading dashboard..." then error if backend is down)
- Clicking a widget card switches to the correct tab
- Clicking "Home" in the sidebar returns to the dashboard

- [ ] **Step 5: Commit**

```bash
git add web/src/dashboard/HomePage.tsx web/src/styles.css
git commit -m "feat: add HomePage component with greeting banner and widget cards"
```
