# Timesheet Approval Workflows — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Branch:** `project-management`
**Builds on:** `2026-06-16-timesheet-pm-integration-design.md`

## Context

Two PM-governance workflows on top of the existing timesheet + PM tasks:

1. **Past-day edit lock + permission.** Today an employee can edit any day in the current
   week. We want only **today** editable by default; editing any earlier (past) day
   requires a PM/Admin-approved request. Enforced server-side, not just hidden in the UI.
2. **Employee-proposed estimates with PM approval.** Today the PM types a task's estimate
   at creation. We want the **assignee to propose** the estimate and the **PM to approve**
   it; the approved value drives Planned-vs-Actual.

## Goals

- Time cells are editable only for **today** plus any **past day** an employee has an
  approved edit request for. Future-day cells are never editable.
- Employees request edit access for a specific locked past day (with a reason); PMs/Admins
  approve or deny from a **Requests** view.
- The timesheet `PUT` preserves locked-day values regardless of payload (server-enforced).
- Tasks carry a `proposedHours` + `estimateStatus`; the assignee proposes, the PM/Admin
  approves (→ sets `estimatedHours`) or rejects. PMs no longer enter estimates at creation.

## Non-Goals

- Auto-expiry/revocation of approved edit requests (an approval unlocks that day until used;
  no timer). Marketplace, dashboards, dependency alerts remain later slices.

## Part A — Past-day edit lock + permission

### Editability model

For a given employee + `weekStart`, the backend computes **`editableDays`** (subset of
`['mon','tue','wed','thu','fri']`):

- the weekday whose date **equals today** (UTC), if it falls in this week; plus
- any weekday whose date is **before today** and has an **approved** `EditRequest` for
  `(userId, weekStart, day)`.

Future-day cells are never editable and are **not** requestable. A time cell is editable
iff its day ∈ `editableDays`.

Separately, **structural edits** (add ad-hoc row, rename, delete) are allowed when the week
is **not past** (current or future, for planning) OR the week has at least one approved
day. `readOnly` (structural) = `isPastWeek(weekStart) && editableDays.length === 0`.

### Data model

```
EditRequest (new)
  userId:    ObjectId -> User (the employee)
  weekStart: String (Monday, YYYY-MM-DD)
  day:       'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  status:    'pending' | 'approved' | 'denied', default 'pending'
  reason:    String, default ''
  decidedBy: ObjectId -> User | null
  decidedAt: Date | null
  createdAt: Date, default now
index: { userId, weekStart, day }   (lookups + dedupe)
```

### API

```
POST /timesheets/:weekStart/edit-requests   (employee)
  body { day, reason? }
  - day must be a valid weekday and its date must be strictly before today (a past day).
  - reject if an approved request already exists (already editable) or a pending one exists
    (no duplicates) -> 409.
  - else create pending. 201.

GET  /edit-requests?status=pending           (requireRole pm/admin)
  - list requests (default pending), each with employee { displayName, email }, weekStart,
    day, reason, createdAt.

PATCH /edit-requests/:id                       (requireRole pm/admin)
  body { decision: 'approved' | 'denied' }
  - sets status, decidedBy = caller, decidedAt = now. 200.

GET /timesheets/:weekStart                     (employee; extended)
  - response gains: editableDays: Day[], readOnly: boolean (structural).
```

Pure helper `editableDaysFor(weekStart, today, approvedDays)` in `services/timesheetRows.js`
(unit-tested): returns the set per the rules above. `approvedDays` is the list of days with
an approved `EditRequest` for that user+week, passed in by the route.

### Server enforcement on PUT

`PUT /timesheets/:weekStart` must not let a locked day change. Pure helper
`applyDayLock(submittedRows, savedRows, editableDays)` (unit-tested): for each submitted
row, for every day **not** in `editableDays`, replace the submitted minutes with the
previously-saved value for that row (matched by `id`), defaulting to 0 for a new row. Days
in `editableDays` accept the submitted value. The route computes `editableDays` for the
caller+week, loads the saved doc, applies the lock, then persists. This makes the lock
authoritative even against crafted requests.

### Frontend

- `getWeek` returns `editableDays` + `readOnly`. The grid locks each `TimeCell` whose day ∉
  `editableDays` (this replaces the current client-side future-day computation). `readOnly`
  governs add/rename/delete as today.
- A locked **past** day column shows a small **"Request edit"** affordance (in the day
  header). Clicking prompts for an optional reason and calls the edit-request endpoint;
  afterward a "Requested" indicator shows until approved (then the day unlocks on reload).
- New **Requests** view + nav item for PM/Admin: a table of pending requests
  (employee · week · day · reason) with **Approve / Deny**. `navForRole` adds `requests`
  for `pm` and `admin`.

## Part B — Employee-proposed estimate, PM approval

### Data model

```
Task (extend)
  + proposedHours:  Number, default 0
  + estimateStatus: 'none' | 'proposed' | 'approved' | 'rejected', default 'none'
    estimatedHours stays the APPROVED value (default 0).
```

### Flow & API

- PM task creation no longer accepts `estimatedHours` (ignored); a new task is
  `estimatedHours: 0, estimateStatus: 'none'`.
- `PATCH /tasks/:id/estimate`            (assignee only — `canLogProgress`)
  body `{ proposedHours }` → `proposedHours = max(0, round(n))`, `estimateStatus = 'proposed'`.
- `PATCH /tasks/:id/estimate/decision`   (PM/Admin of the task's project — `canEditProject`)
  body `{ decision: 'approve' | 'reject' }`
  - approve → `estimatedHours = proposedHours`, `estimateStatus = 'approved'`.
  - reject  → `estimateStatus = 'rejected'` (estimatedHours unchanged).
- `GET /tasks/mine` and `GET /projects/:id` task enrichment already return the task fields;
  add `proposedHours` + `estimateStatus` to the populated/`toObject` payloads (they come for
  free via `toObject`).

### Frontend

- **My Tasks (employee):** show `estimateStatus` and (when proposed) the proposed value; add
  a "Propose estimate (hrs)" input + button → `PATCH /tasks/:id/estimate`. Allowed when
  status is `none`, `rejected`, or `approved` (re-propose).
- **Project detail (PM):** the task table's estimate column shows the status; when
  `proposed`, show `proposedHours` with **Approve / Reject** buttons →
  `PATCH /tasks/:id/estimate/decision`. When approved, show `estimatedHours`.
- The create-task form drops the "Est. hrs" input.
- Timesheet PM-row "Planned" continues to read approved `estimatedHours` (0 until approved).

## Authorization summary

- Edit requests: created by the owning employee (`userId = req.user.sub`); approved/denied
  by any PM/Admin (`requireRole('pm','admin')`). Day-lock enforced for the caller's own week.
- Estimate propose: assignee only (`canLogProgress`). Estimate decision: project owner PM or
  Admin (`canEditProject`).

## Testing

- **Backend unit:** `editableDaysFor` (today only; today + approved past day; future never),
  `applyDayLock` (locked-day minutes preserved, editable-day minutes applied, new row locked
  day → 0).
- **Backend route:** POST edit-request rejects a future/non-past day and dedupes; PATCH
  decision flips status; `PUT /timesheets` ignores changes to a locked day but applies them
  after approval; `GET /edit-requests` is 403 for an employee; estimate propose is 403 for a
  non-assignee; estimate decision is 403 for a non-owner; approve sets `estimatedHours`.
- **Frontend unit:** `navForRole` includes `requests` for pm/admin.
- Existing timesheet/PM behavior stays green.

## Migration

None required: new `Task` fields default; existing tasks read `estimateStatus: 'none'`,
`estimatedHours` unchanged. No `EditRequest` rows means only today is editable — the
intended default.
