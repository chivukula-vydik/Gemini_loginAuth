# Project-Scoped, Single-Use Past-Day Edit Access — Design

**Date:** 2026-06-17
**Status:** Approved (design)
**Branch:** `project-management`
**Builds on:** `2026-06-16-timesheet-approvals-design.md`

## Context

The approved-edit-request feature (see `2026-06-16-timesheet-approvals-design.md`) lets an
employee request edit access to a locked **past day**; a PM/Admin approves, and the day
unlocks. Two properties of that feature need to change:

1. **It is global per day, not per project.** An approval for `(user, weekStart, day)`
   unlocks **every** timesheet row on that day, across all projects. We want a grant scoped
   to **one project** — unlocking only that project's task-rows on that day.
2. **It is permanent.** An approval never gets consumed ("until used; no timer" — but nothing
   used it). We want it **taken back once the employee saves an actual change** to that
   project's hours on that day (single use).

These two properties live in the same core mechanism (`editableDays` + `applyDayLock`), so
they are redesigned together.

## Goals

- An edit request targets a specific `(weekStart, day, projectId)`. Approval unlocks only that
  project's task-rows on that day.
- Editability is evaluated **per row** (a row belongs to a project via its task), not per
  day-column.
- A grant is **single-use**: the first `PUT` that actually changes that project's hours on
  that day consumes it (`status: 'used'`); the day re-locks for that project on next load.
- Locked cells stay server-enforced against crafted payloads, exactly as today.
- Ad-hoc rows (no task/project) on a past day stay locked and are **not** requestable.

## Non-Goals

- No timer-based expiry or auto-revocation of an unused approval (it stays open until a
  changing save consumes it).
- No PM manual revoke of an approved grant.
- No migration of legacy `EditRequest`s (see Migration).
- Marketplace, dashboards, dependency alerts remain later slices.

## Data model — `EditRequest` (extend)

```
EditRequest
  userId:    ObjectId -> User      (the employee)
  weekStart: String (Monday, YYYY-MM-DD)
  day:       'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  projectId: ObjectId -> Project   (NEW, required)
  status:    'pending' | 'approved' | 'used' | 'denied'   (NEW value: 'used')
  reason:    String, default ''
  decidedBy: ObjectId -> User | null
  decidedAt: Date | null
  createdAt: Date, default now
index: { userId, weekStart, day, projectId }   (lookups + dedupe)
```

Lifecycle: `pending → approved → used`, or `pending → denied`. An **active grant** is a doc
with `status: 'approved'`. Consuming it sets `status: 'used'`; a `'used'` grant no longer
unlocks anything but remains visible as history.

## Editability model (per row)

For an employee + `weekStart`, the backend computes:

- `todayDay`: the weekday (`'mon'..'fri'`) whose date **equals today** (UTC), if it falls in
  this week; else `null`.
- `grants`: the list of `{ day, projectId }` from this user's **approved** `EditRequest`s for
  this week.

A cell `(row, day)` is **editable** iff:

- `day === todayDay`, OR
- the row has a `projectId` and `grants` contains `{ day, projectId: row.projectId }`.

Future-day cells are never editable. Ad-hoc rows (`projectId == null`) are editable only on
`todayDay`; their past days are always locked and not requestable.

Structural edits (add ad-hoc row, rename, delete) stay as before: allowed when the week is
not past (current/future) OR the week has at least one active grant. `readOnly` (structural)
= `isPastWeek(weekStart) && grants.length === 0`.

## API

```
GET /timesheets/:weekStart                     (employee; CHANGED response)
  - rows now include projectId (null for ad-hoc rows).
  - response: { weekStart, tasks, todayDay, grants, readOnly }
    (replaces the flat `editableDays`; `grants` = [{ day, projectId }] of approved requests).

POST /timesheets/:weekStart/edit-requests      (employee; CHANGED body)
  body { day, projectId, reason? }
  - day must be a valid weekday whose date is strictly before today.
  - projectId must be a project the caller has a task on (else 400).
  - reject if an approved or pending request already exists for (user, week, day, projectId)
    -> 409.
  - else create pending. 201.

GET  /edit-requests?status=pending             (requireRole pm/admin; CHANGED)
  - each row additionally carries project { id, name }.

PATCH /edit-requests/:id                        (requireRole pm/admin; unchanged)
  body { decision: 'approved' | 'denied' }
```

## Server enforcement + consume on PUT

Pure helper in `services/timesheetRows.js`, unit-tested:

```
computeRowLock({ submittedRows, savedRows, taskProjectById, todayDay, grants })
  -> { rows, consumed }
```

- `taskProjectById`: Map<taskId, projectId> for the caller's tasks.
- For each submitted row, resolve its `projectId` (via `taskProjectById`; `null` for ad-hoc).
  For each day **not** editable for that row (per the editability model above), replace the
  submitted minutes with the previously-saved value for that row (matched by `id`, default 0
  for a new row). Editable days accept the submitted value. → `rows`.
- `consumed`: the subset of `grants` `{ day, projectId }` for which **at least one** row of
  that project has a submitted day-value that **differs** from its saved value. (A grant whose
  project saw no actual change is not consumed.)

The route computes `todayDay` + `grants`, builds `taskProjectById`, calls `computeRowLock`,
persists `rows`, then sets each consumed grant's `EditRequest` to `status: 'used'`. The lock
remains authoritative against crafted requests; the consume is driven by real value changes.

## Frontend

- `getWeek` returns `todayDay`, `grants`, `readOnly`, and rows carry `projectId`. The grid
  locks each `TimeCell` whose `(row, day)` is not editable (today, or an approved grant for
  the row's project). `readOnly` governs add/rename/delete as today.
- The **"Request edit"** affordance moves from the day-column header to a **locked past-day
  cell on a task row** (it is now project-specific). Clicking prompts for an optional reason
  and POSTs `{ day, projectId: row.projectId, reason }`. A "Requested" indicator shows on that
  project's cells for that day until approved; on approval those cells unlock; after the
  changing save they re-lock (grant `used`).
- Ad-hoc rows show no request affordance on past days.
- Requests view (PM/Admin): table of pending requests now shows employee · week · day ·
  **project** · reason with Approve / Deny.

## Authorization summary

- Edit requests: created by the owning employee (`userId = req.user.sub`) for a project they
  have a task on; approved/denied by any PM/Admin (`requireRole('pm','admin')`). Per-row
  day-lock + consume enforced for the caller's own week.
- Estimate propose/approve flow: unchanged.

## Testing

- **Backend unit (`computeRowLock`, editability):**
  - locked cell preserved; editable cell (today) applied; granted project's past cell applied.
  - grant consumed only when one of its project's rows changes value on that day.
  - an unrelated project's grant is untouched by a change to a different project.
  - ad-hoc past-day cell always locked (never editable, never consumed).
  - editability: today only; today + approved grant for the row's project; future never; a
    `used` grant does not unlock.
- **Backend route:**
  - POST edit-request requires a valid `projectId` the caller has a task on (400 otherwise);
    dedupes pending/approved per `(day, projectId)` (409); rejects future/non-past day.
  - PUT preserves other projects' locked days, applies the granted project's day, and flips
    that grant to `used`; a no-op save leaves the grant `approved`.
  - `GET /edit-requests` is 403 for an employee and carries project name for pm/admin.
- **Frontend unit:** grid cell lock derives from `todayDay` + `grants` + row `projectId`;
  ad-hoc past cells locked; request affordance only on locked past task-row cells.
- Existing timesheet/PM behavior stays green.

## Migration

None. New `EditRequest.projectId` has no default for legacy docs; existing `approved`
requests created under the old per-day model have no `projectId`, so they match no project
row and are effectively dead — left in place, ignored (option a). New `status: 'used'` only
applies going forward. No `EditRequest` rows still means only today is editable — the
intended default.
