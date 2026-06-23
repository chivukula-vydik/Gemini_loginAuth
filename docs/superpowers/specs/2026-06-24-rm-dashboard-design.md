# Reporting Manager Dashboard — Phase 1 Design

## Goal

Build a dedicated dashboard for Reporting Managers that replaces the generic Home page. Shows team attendance stats, pending approval counts, inline leave approval, and a weekly team availability calendar — all scoped to the RM's direct reportees.

## Scope

**Phase 1 (this spec):**
- Team attendance summary cards (Late, On Time, WFH, Remote Clock-ins)
- Pending approval counts (leave, timesheets, regularise, edit requests)
- Inline leave approval/rejection
- Weekly team availability calendar (Mon–Fri, color-coded)

**Deferred to Phase 2:**
- Overtime model and approval workflow
- Department/Location fields on User model
- Department/Location/Date range filters
- HR approval chain (RM_APPROVED → PENDING_HR → APPROVED)

## Architecture

Single backend endpoint `GET /manager/dashboard` returns all data in one response. Scoped to `User.find({ reportingManagerId: req.user.sub })`. Approve/reject actions reuse existing endpoints (`PATCH /leave/:id/decide`). Frontend renders a new `RMDashboard` component at the `/` route for `reporting_manager` role only.

## Data Scope

All queries filter by team member IDs:

```
const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id displayName email');
const teamIds = teamMembers.map(u => u._id);
```

An RM with no reportees sees an empty dashboard with zero counts.

---

## Backend

### New Route: `auth-api/src/routes/manager.js`

**Endpoint:** `GET /manager/dashboard?week=YYYY-MM-DD`

**Auth:** `requireAuth` + `requireRole('reporting_manager')`

**Query params:**
- `week` (optional) — Monday date string for the calendar week. Defaults to current Monday.

**Response:**

```json
{
  "greeting": "Good morning",
  "teamMembers": [
    { "_id": "abc123", "displayName": "Alice", "email": "alice@example.com" }
  ],
  "stats": {
    "total": 10,
    "present": 6,
    "late": 3,
    "onTime": 3,
    "wfh": 2,
    "remoteClockIns": 1,
    "onLeave": 2,
    "absent": 0
  },
  "pendingCounts": {
    "leave": 4,
    "timesheets": 2,
    "regularise": 1,
    "editRequests": 0
  },
  "pendingLeaves": [
    {
      "_id": "def456",
      "user": { "displayName": "Alice", "email": "alice@example.com" },
      "type": "casual",
      "startDate": "2026-06-25",
      "endDate": "2026-06-27",
      "days": 3,
      "halfDay": "none",
      "reason": "Family event",
      "requestedAt": "2026-06-24T10:30:00Z"
    }
  ],
  "calendar": {
    "weekStart": "2026-06-22",
    "days": ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"],
    "members": [
      {
        "_id": "abc123",
        "name": "Alice",
        "cells": {
          "2026-06-22": { "status": "present", "punchType": "office" },
          "2026-06-23": { "status": "wfh", "punchType": "wfh" },
          "2026-06-24": { "status": "leave", "leaveType": "sick" },
          "2026-06-25": null,
          "2026-06-26": null
        }
      }
    ]
  }
}
```

### Stats computation

For today's date, query `Attendance.find({ userId: { $in: teamIds }, date: todayStr() })`:

- **present**: attendance doc exists with `checkIn` not null (includes WFH)
- **late**: `checkIn` exists AND (`checkIn.getHours() > 9 || (checkIn.getHours() === 9 && checkIn.getMinutes() > 30)`) — hardcoded 9:30 AM, no grace period
- **onTime**: present count minus late count
- **wfh**: `punchType === 'wfh'`
- **remoteClockIns**: `punchType === 'remote'`
- **onLeave**: count of team members with an approved leave covering today (`Leave.find({ userId: { $in: teamIds }, status: 'approved', startDate: { $lte: today }, endDate: { $gte: today } })`)
- **absent**: `total - present - onLeave`
- **total**: `teamMembers.length`

### Pending counts

- **leave**: `Leave.countDocuments({ assignedApprover: req.user.sub, status: 'pending' })`
- **timesheets**: `Timesheet.countDocuments({ userId: { $in: teamIds }, status: 'submitted' })`
- **regularise**: `Attendance.countDocuments({ userId: { $in: teamIds }, 'regularise.status': 'pending' })`
- **editRequests**: `EditRequest.countDocuments({ userId: { $in: teamIds }, status: 'pending' })`

### Pending leaves (full objects)

`Leave.find({ assignedApprover: req.user.sub, status: 'pending' }).populate('userId', 'displayName email')` — returns full leave objects for inline approval UI.

### Calendar

For the given week (Mon–Fri, 5 days):

1. Query `Attendance.find({ userId: { $in: teamIds }, date: { $gte: weekStart, $lte: weekEnd } })`
2. Query `Leave.find({ userId: { $in: teamIds }, status: 'approved', startDate: { $lte: weekEnd }, endDate: { $gte: weekStart } })`
3. For each member × each day: if attendance doc exists → use its `status` and `punchType`. Else if an approved leave covers that day → `{ status: 'leave', leaveType: leave.type }`. Else → `null` (absent or future day).

### Mount

In `auth-api/src/app.js`: `import { createManagerRouter } from './routes/manager.js'` and `app.use('/manager', createManagerRouter())`.

---

## Frontend

### New file: `web/src/dashboard/managerApi.ts`

```ts
export type RMStats = {
  total: number; present: number; late: number; onTime: number;
  wfh: number; remoteClockIns: number; onLeave: number; absent: number;
};

export type PendingCounts = {
  leave: number; timesheets: number; regularise: number; editRequests: number;
};

export type PendingLeave = {
  _id: string;
  user: { displayName: string; email: string };
  type: string; startDate: string; endDate: string;
  days: number; halfDay: string; reason: string; requestedAt: string;
};

export type CalendarCell = {
  status: string; punchType?: string; leaveType?: string;
} | null;

export type CalendarMember = {
  _id: string; name: string; cells: Record<string, CalendarCell>;
};

export type RMDashboardData = {
  greeting: string;
  teamMembers: { _id: string; displayName: string; email: string }[];
  stats: RMStats;
  pendingCounts: PendingCounts;
  pendingLeaves: PendingLeave[];
  calendar: { weekStart: string; days: string[]; members: CalendarMember[] };
};

export const getRMDashboard = (week?: string) =>
  authed(`/manager/dashboard${week ? `?week=${week}` : ''}`) as Promise<RMDashboardData>;
```

### New file: `web/src/dashboard/RMDashboard.tsx`

**Layout (top to bottom):**

1. **Greeting banner** — reuses `.dash-greeting` styles: "Good morning, John" + today's date.

2. **Stats cards row** — 4 cards in a `.dash-grid` (2×2 on mobile, 4-col on desktop):
   - Late Arrivals — red accent, count number
   - On Time — green accent, count number
   - WFH / Remote — blue accent, shows `wfh` count (subtitle: `remoteClockIns` remote)
   - On Leave — orange accent, count number

3. **Pending Approvals row** — 4 smaller metric cards. Each shows a count. Clicking any card navigates to `/requests` via `useNavigate()`.

4. **Leave Requests section** — table with columns: Employee, Type, Dates, Days, Reason, Actions. Each row has Approve/Reject buttons. On click, calls `PATCH /leave/:id/decide` with `{ decision: 'approved' | 'rejected' }`, then re-fetches dashboard data.

5. **Team Calendar section** — header shows "Week of Jun 22, 2026" with ◀ ▶ nav arrows. Table: first column = employee name, then Mon–Fri columns. Each cell is color-coded:
   - Green background = present (office)
   - Cyan background = WFH
   - Orange background = casual leave
   - Green-dark background = sick leave
   - Blue background = earned leave
   - Gray background = absent / no data
   - Empty = future date with no data

   Clicking ◀/▶ updates the `week` state and re-fetches.

### CSS

Add styles to `web/src/styles.css` under a `.rm-dash-*` namespace. Reuse existing `.dash-greeting`, `.dash-grid`, `.ts-card` classes where possible.

### Modified file: `web/src/AppShell.tsx`

Change the `/` route to conditionally render based on role:

```tsx
<Route path="/" element={
  user?.role === 'reporting_manager' ? <RMDashboard /> : <HomePage />
} />
```

Import `RMDashboard` at the top.

---

## Scope Exclusions

- No overtime model or approval workflow (Phase 2)
- No department/location fields or filters (Phase 2)
- No HR approval chain — RM approve = final approved (Phase 2)
- No configurable shift times or grace periods
- No date range filter on stats (always today)
- No pagination on pending leaves (typically small count)
