# Home Dashboard Design

## Goal

Add a role-adaptive home/dashboard page as the default landing page after login, providing a Keka-style quick-glance summary of all modules (attendance, leave, timesheet, tasks, approvals, utilization).

## Architecture

Single new `GET /dashboard` backend endpoint aggregates all widget data server-side in one request. The frontend renders a greeting banner followed by a responsive grid of widget cards. Data is role-filtered server-side — employees see personal stats only; PM/Admin/RM see additional team-level summaries and pending approval counts.

## Tech Stack

- Backend: Express.js route, Mongoose queries across existing models (Attendance, Leave, LeaveBalance, Timesheet, Task, User, Project)
- Frontend: React component (`HomePage.tsx`), new `dashboardApi.ts`, integrated into existing `AppShell.tsx` navigation

---

## Backend

### `GET /dashboard`

**Auth**: `requireAuth` (all authenticated users).

**Response shape**:

```json
{
  "greeting": "Good morning",

  "attendance": {
    "status": "in | idle | on-break | done",
    "checkIn": "ISO string | null",
    "effectiveMinutes": 245,
    "shiftDuration": 540
  },

  "leave": {
    "casual": { "remaining": 5, "total": 12 },
    "sick": { "remaining": 3, "total": 6 },
    "earned": { "remaining": 8, "total": 15 },
    "pendingCount": 1
  },

  "timesheet": {
    "weekStart": "2026-06-22",
    "totalMinutes": 1200,
    "targetMinutes": 2400,
    "submittedDays": 3,
    "billableMinutes": 800
  },

  "tasks": {
    "todo": 3,
    "inProgress": 2,
    "blocked": 1,
    "done": 5
  },

  "pendingApprovals": {
    "leave": 4,
    "timesheets": 2,
    "regularise": 1,
    "editRequests": 0,
    "claimRequests": 0
  },

  "teamSummary": {
    "totalMembers": 12,
    "presentToday": 9,
    "onLeaveToday": 2,
    "avgUtilization": 72
  }
}
```

**Role-based fields**:
- All roles: `greeting`, `attendance`, `leave`, `timesheet`, `tasks`
- PM/Admin/RM only: `pendingApprovals`, `teamSummary`

**Aggregation logic**:

- **greeting**: Derived from server hour — "Good morning" (5-11), "Good afternoon" (12-16), "Good evening" (17+).
- **attendance**: Query today's `Attendance` doc for the user. Derive status from checkIn/checkOut/breaks presence.
- **leave**: Call `getOrCreateBalance()` for current year + count `Leave.countDocuments({ userId, status: 'pending' })`.
- **timesheet**: Find current week's timesheet. Sum task entries for totalMinutes. Count days where `dayStatus[day].status === 'submitted' || 'approved'` for submittedDays. Sum billable minutes using effectiveBillable resolution. `targetMinutes` from `app.locals.weeklyTargetMinutes`.
- **tasks**: `Task.aggregate` grouped by status, filtered to tasks where user is in `assignees.user`.
- **pendingApprovals** (PM/Admin/RM):
  - `leave`: `Leave.countDocuments` with role-scoped filter (admin=all pending, RM=assigned, PM=unassigned).
  - `timesheets`: Count timesheets with any day having `dayStatus.*.status === 'submitted'`, scoped by role.
  - `regularise`: Count attendance docs with `regularise.status === 'pending'`, scoped.
  - `editRequests`: `EditRequest.countDocuments({ status: 'pending' })`.
  - `claimRequests`: `ClaimRequest.countDocuments({ status: 'pending' })`.
- **teamSummary** (PM/Admin/RM):
  - PM: members across owned projects. Admin: all users. RM: users with `reportingManagerId === userId`.
  - `presentToday`: count team members with today's attendance checkIn.
  - `onLeaveToday`: count approved leave overlapping today.
  - `avgUtilization`: average billable/(billable+nonBillable) across team for current week, or 0 if no data.

**Error handling**: Each section is wrapped in try/catch. If one section fails, its key is omitted from the response rather than failing the entire request. The frontend treats missing keys as "no data".

### Route mounting

- New file: `auth-api/src/routes/dashboard.js`
- Export: `createDashboardRouter()`
- Mount in `app.js`: `app.use('/dashboard', createDashboardRouter())`

---

## Frontend

### Navigation changes

**`nav.ts`**:
- Add `'home'` to `NavKey` type.
- Add `{ key: 'home', label: 'Home' }` as the first item in every role's nav array.

**`AppShell.tsx`**:
- Import `HomePage` component.
- Add `case 'home': return <HomePage onNavigate={setActive} />;` to `viewFor()`.
- Add home icon to `NAV_ICONS`.
- Default `active` state initializes to `'home'` instead of `items[0].key`.

### New files

**`web/src/dashboard/dashboardApi.ts`**:
- Types: `DashboardData`, `AttendanceWidget`, `LeaveWidget`, `TimesheetWidget`, `TasksWidget`, `PendingApprovalsWidget`, `TeamSummaryWidget`.
- `getDashboard(): Promise<DashboardData>` — calls `authed('/dashboard')`.

**`web/src/dashboard/HomePage.tsx`**:

Props: `{ onNavigate: (key: NavKey) => void }` — allows widget clicks to switch tabs.

Structure:
```
<div className="dash-page">
  <header className="dash-greeting">
    <h1>"Good morning, {displayName}"</h1>
    <p>{formatted current date}</p>
  </header>

  <div className="dash-grid">
    <AttendanceCard />    — click → onNavigate('attendance')
    <LeaveCard />         — click → onNavigate('attendance')
    <TimesheetCard />     — click → onNavigate('timesheet')
    <TasksCard />         — click → onNavigate('my-tasks')
    
    {/* PM/Admin/RM only */}
    <ApprovalsCard />     — click → onNavigate('requests')
    <TeamCard />          — click → onNavigate('projects') or attendance
  </div>
</div>
```

### Widget card designs

Each widget is a `ts-card` with:
- A title row (icon + label)
- 2-3 key numbers
- A subtle progress bar or gauge where applicable
- Clickable — entire card navigates to the relevant tab

**Attendance Card**:
- Status indicator dot (green=in, yellow=break, gray=idle, blue=done)
- Check-in time or "Not clocked in"
- Progress bar: effective minutes / shift duration

**Leave Balance Card**:
- Three inline items: Casual, Sick, Earned with remaining/total
- Badge if pendingCount > 0: "{n} pending"

**Timesheet Card**:
- "{totalMinutes formatted} / {targetMinutes formatted}" with progress bar
- "{submittedDays}/5 days submitted"
- Billable line if billableMinutes > 0

**Tasks Card**:
- Four count chips: To Do, In Progress, Blocked, Done
- Color-coded (blue, yellow, red, green)

**Approvals Card** (PM/Admin/RM):
- Total pending count as hero number
- Breakdown: leave, timesheets, regularise, etc. as small labels
- Only shown if user has any approval permissions

**Team Overview Card** (PM/Admin/RM):
- Present/Total members today
- On leave count
- Avg utilization % with small progress bar

### Styling

**`web/src/styles.css`** additions:

- `.dash-page` — same padding as other pages
- `.dash-greeting` — flexbox, greeting text + date
- `.dash-grid` — CSS grid, `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, gap 1rem
- `.dash-card` — extends `ts-card`, cursor pointer, hover shadow transition
- `.dash-status-dot` — 8px circle, color by status
- `.dash-metric` — large number + small label pattern (reuses `ts-tile` sizing)

---

## Pre-requisite fix

The `User` type in `web/src/authContext.tsx` defines `role: 'admin' | 'pm' | 'employee'` — it is missing `'reporting_manager'`. This must be updated to `role: 'admin' | 'pm' | 'employee' | 'reporting_manager'` so the frontend can correctly gate team-level widgets. This is a one-line fix in Task 1.

## Scope exclusions

- No charts or graphs — numbers and progress bars only.
- No inline actions (clock in, approve, etc.) — users navigate to the full page.
- No real-time polling — data loads once on mount; switching away and back refreshes.
- No URL activity widget — low value for a quick-glance dashboard.
- No notification/alert system — out of scope.
