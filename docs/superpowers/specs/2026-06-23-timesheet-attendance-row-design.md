# Timesheet: show attendance as a read-only row in the weekly grid

**Date:** 2026-06-23
**Status:** Design (awaiting review)

## Problem

Keka's weekly timesheet shows a system-populated **Attendance hours** row above
the task rows — separate from self-logged task hours — so a manager can see
worked time alongside reported time without leaving the page. Our app already
has a full attendance subsystem (`Attendance` model, check-in/out, breaks,
regularise requests, `/attendance/*` routes), but none of that data appears on
the timesheet grid (`web/src/timesheet/TimesheetGrid.tsx`). This is the single
biggest gap between "data exists" and "Keka parity" identified in the gap
audit (gap #5).

Note: our timesheet grid is **Mon–Fri only** (`web/src/timesheet/time.ts` —
`DAYS = ['mon','tue','wed','thu','fri']`), unlike Keka's Mon–Sun layout, so
weekend handling is out of scope.

## Decision

Add a **read-only attendance row** inside `TimesheetGrid`, rendered above the
editable task rows, showing each weekday's attendance status + effective
hours. It is purely informational: it is never editable from the timesheet
and never contributes to the Daily total / week total figures, which remain
task-hours-only (existing `SummaryTiles`, footer `dayTotal()`).

## Backend: `GET /attendance/range`

`auth-api/src/routes/attendance.js` currently only exposes `/month`
(calendar-month range) and `/today`. A Mon–Fri week can span two calendar
months (e.g. Mon Jan 29 – Fri Feb 2), so `/month` isn't sufficient as-is.

- Extract the existing `/month` handler's range-query + holiday-placeholder
  logic into a shared function, e.g. `fetchRange(userId, startDate, endDate)`
  in `attendance.js`, returning merged real + synthetic-holiday docs sorted by
  date (same shape as today's `/month` response).
- Add `GET /attendance/range?start=YYYY-MM-DD&end=YYYY-MM-DD` using that
  helper directly with the given bounds (no month derivation).
- Re-point `/month` to call the same helper with the month's computed
  start/end, so behavior there is unchanged.
- Both routes stay under `requireAuth`, scoped to `req.user.sub` (no new
  cross-user exposure).

## Frontend: data fetching

- `web/src/attendance/attendanceApi.ts`: add
  `getRange(start: string, end: string) => authed('/attendance/range?start=...&end=...')`
  returning `AttendanceDoc[]`.
- `web/src/timesheet/TimesheetPage.tsx`: alongside the existing `loadLeave()`
  effect, add a `loadAttendance()` effect that calls `getRange(dd.mon, dd.fri)`
  (using the already-computed `dayDates(weekStart)`) whenever `weekStart`
  changes, and `getState()` **once** on mount to capture
  `activatedDate`.
- Build an `attendance: Partial<Record<Day, AttendanceCell>>` map (one entry
  per weekday) to pass into `TimesheetGrid`, where:
  ```ts
  type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number } | null;
  ```
- Per-day resolution rules, in order:
  1. If `leaveDays[d]` is already set (existing approved-leave overlay) →
     pass `null` for that day's attendance cell; the leave badge on the
     column header already communicates it, no need to duplicate.
  2. Else if a doc exists for that date → `{ status: doc.status, effectiveMinutes: doc.effectiveMinutes }`.
  3. Else if the date is in the future, or `activatedDate` is null, or the
     date is before `activatedDate` → `null` (renders as blank `—`).
  4. Else (past date, on/after activation, no doc) → `{ status: 'absent', effectiveMinutes: 0 }`.

## Frontend: grid rendering

- `TimesheetGrid.tsx` gets a new optional prop:
  `attendance?: Partial<Record<Day, AttendanceCell>>`.
- Render a dedicated row immediately under `<thead>` (before the `tasks.map`
  body), labeled **"Attendance"** in the task-name column, not part of
  `tbody`'s task rows and excluded from `onRename`/`onCellChange`/`onDelete`
  wiring — it has no interactivity.
- Each weekday cell shows:
  - A small color-coded status badge — reusing the existing `ts-leave-badge`
    visual pattern with new status-specific classes (present/partial/wfh/
    absent/leave/holiday).
  - The formatted effective hours underneath (via existing `formatMinutes`),
    e.g. `Present` / `7h 45m`.
  - `—` (dash, muted) when the cell is `null`.
- This row is **not** included in `dayTotal()` or the `tfoot` Daily total —
  those remain task-hours-only, per the "keep fully separate" decision.

## Out of scope (for this change)

- Editing attendance from the timesheet (check-in/out stays on
  `AttendancePage`).
- Weekend columns (grid is Mon–Fri).
- Feeding attendance into `SummaryTiles`, billable %, or any other aggregate.
- Manager-facing team view changes (`/attendance/team` is untouched).
