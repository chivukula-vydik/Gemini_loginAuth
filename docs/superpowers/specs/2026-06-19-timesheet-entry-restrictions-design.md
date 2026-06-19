# Timesheet entry restrictions (current-week window + previous-week requests)

**Date:** 2026-06-19
**Status:** Design (awaiting review)

## Problem

For the current week, employees should only be able to log hours on valid
working days between a task's assignment (start) date and today. Days before the
assignment date and days in the future must be unavailable (shown as `—`,
disabled), with **no** request affordance. The "Request Timesheet Update" flow is
strictly a **previous-week** concept: modifying a past week goes through the
existing request → approval process.

Most of this already exists. This spec closes the gaps where current behavior
violates the requirement.

## Already in place (no change)

- **Start-date gate:** cells whose column date is before the task's start date
  are locked, on both the client (`isCellEditable`) and the server
  (`computeRowLock.editableFor`). Mon/Tue before a Wed assignment already render
  `—` and reject saves.
- **Current week:** today and earlier weekdays are freely editable (no request).
- **Previous weeks:** editable only via an approved grant; otherwise read-only.
- **Read-only cells already display `—`** (`TimeCell` renders `—` when not
  editable), so future/locked cells already show the dash.

## Gaps to fix

### 1. Current-week future days must never be editable
`isCellEditable` (client) and `computeRowLock.editableFor` (server) return `true`
for `day <= today`, but for a future day they **fall through to a grant check**,
so a grant could unlock a future current-week day. The requirement is that future
days are always disabled.

**Change (both client and server):** in the current week, editability is purely
`startDate <= columnDate <= today`. Grants apply **only** to previous weeks.
(In practice no future-day grant can exist — the request endpoint forbids it —
but we make the rule explicit and enforced.)

### 2. No "request" affordance in the current week
`TaskRow` computes `canRequest = !editable && isPast && taskId && projectId`. In
the current week a before-start day (e.g. Mon/Tue when assigned Wed) is
`!editable` and `isPast`, so it shows a **request** button. The requirement: no
requests in the current week.

**Change:** the request affordance appears only for **previous weeks**
(`weekStart < currentMonday`). A submitted current week is still the current week
and gets no request buttons until it actually becomes a past week.

### 3. Server allows edit-requests for the current week
`POST /timesheets/:weekStart/edit-requests` blocks today/future *days* and
requires a past day, but it does **not** block a current-week past day (Mon/Tue
before a Wed start), so such a request can be created.

**Change:** reject when `weekStart >= currentMonday()` with
`"requests are only for previous weeks"`. Previous-week past days still work.

## Components touched

### `web/src/timesheet/cellLock.ts`
- Tighten `isCellEditable`: when `todayDay` is set (current week), return
  `ORDER.indexOf(day) <= ORDER.indexOf(todayDay)` after the start-date gate — no
  grant path. Previous weeks (todayDay null) keep the grant path.
- Add a small, testable helper:
  ```ts
  canRequestEdit(weekIsPast: boolean, editable: boolean, isPast: boolean, task: Task): boolean
  // = weekIsPast && !editable && isPast && !!task.taskId && !!task.projectId
  ```

### `web/src/timesheet/TimesheetGrid.tsx` + `TaskRow.tsx`
- `TimesheetGrid` computes `weekIsPast = weekStart < mondayOf()` and passes it to
  each `TaskRow`.
- `TaskRow` uses `canRequestEdit(weekIsPast, editable, isPast, task)` to decide
  whether to render the request button / pending chip.

### `auth-api/src/services/timesheetRows.js`
- `computeRowLock.editableFor`: same current-week rule — when `todayDay` is set,
  editability is `startDate` gate + `DAYS.indexOf(day) <= DAYS.indexOf(todayDay)`,
  with **no** grant fallback; grants apply only when `todayDay` is null.

### `auth-api/src/routes/timesheets.js`
- In the `/edit-requests` handler, after validating the day, add:
  `if (weekStart >= currentMonday()) return 400 "requests are only for previous weeks"`.

## Testing

### `web/src/timesheet/cellLock.test.ts`
- Update "future day of the current week": now **never** editable, even with a
  grant (`isCellEditable('fri','pA','wed', grants) === false`).
- Keep: today and earlier editable; before-start locked; previous-week grant
  unlocks; previous week without grant locked.
- New `canRequestEdit` cases: current week (`weekIsPast=false`) → false even for a
  locked past day; previous-week locked day with task+project → true;
  previous-week day missing taskId/projectId → false; an editable day → false.

### `auth-api/test/timesheetRows.test.js`
- `computeRowLock` keeps a future current-week day locked even when a matching
  grant is present; before-start stays locked; previous-week grant still unlocks.

### `auth-api/test/routes.test.js`
- `/edit-requests` returns 400 for the current week (e.g. a Mon/Tue before today
  in the current week); still returns 201 for a past-week past day with a task on
  the project.

## Out of scope

- The submit/approve lifecycle and PM review flow.
- How grants are approved (the edit-request approval path is unchanged).
- Visual restyling of disabled cells beyond the existing `—` rendering.
