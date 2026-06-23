# Timesheet attendance row: live hours, missed checkouts, display polish

**Date:** 2026-06-23
**Status:** Design (awaiting review)

## Problem

The attendance row shipped in `2026-06-23-timesheet-attendance-row-design.md`
surfaces real data, but real usage exposed two correctness gaps and two
display rough edges:

1. **In-progress days show 0 hours.** `effectiveMinutes` is only computed on
   checkout (`auth-api/src/routes/attendance.js:160-163`). A day where the
   employee is still clocked in shows `PARTIAL · 0h 00m`, which reads as "did
   nothing" rather than "still working."
2. **Missed checkouts look identical to days with no real session.** If an
   employee forgets to check out, the day is frozen at `checkIn` set,
   `checkOut` null, `effectiveMinutes: 0` forever (the existing `/checkin`
   re-punch logic just resets state on the *next* check-in — it never
   reconciles the missed day). There's no signal on the timesheet that this
   is a data problem rather than an actual zero-hour day.
3. **The hours line is noise when it's 0.** `0h 00m` next to a badge adds no
   information.
4. **The status icon is hard to read at small size** on the dark theme.

## Decisions

### 1. Live elapsed hours — computed in `/attendance/range` only

`AttendancePage.tsx:298-315` already computes a live effective-minutes value
client-side (`liveGross - liveBreak`, ticking every render) for the
logged-in user's *own* current session. The timesheet doesn't need
second-level ticking — it's a once-per-load snapshot — so the same formula
is computed server-side instead, in the `/range` route handler only (not the
shared `fetchRange` helper used by `/month`, so `/month`'s behavior is
unchanged):

For each item in the `/range` response where `checkIn` is set, `checkOut` is
null, and `date === todayStr()`:
```
openBreakElapsed = openBreak ? (now - openBreak.start) : 0
liveBreakMinutes = breakMinutes + openBreakElapsed
liveGrossMinutes = now - checkIn
effectiveMinutes = max(0, liveGrossMinutes - liveBreakMinutes)
```
This overrides only the response item's `effectiveMinutes` field — the
underlying stored `Attendance` doc is never written by a GET request.

### 2. Missed checkouts — derived flag, no new infrastructure

No background job, no new persisted field, no auto-set checkout (auto-
closing would invent hours the employee may not have worked). Instead, the
`/range` handler marks any item where `checkIn` is set, `checkOut` is null,
and `date < todayStr()` (a *past* day — today's still-open session is
handled by decision 1, not this) with `needsRegularise: true`. This is
purely derived at read time from data that already exists.

The underlying `status` (`partial`, `wfh-partial`, etc.) is left as-is — it's
still the correct classification, just incomplete. The frontend badge
appends `· No checkout` to the existing label when `needsRegularise` is
true, e.g. `◑ Partial · No checkout`.

This is scoped to the timesheet's `/range` response only. `AttendancePage`
already has its own always-visible `Regularise` link per day
(`AttendancePage.tsx:641`) and isn't touched by this change.

### 3. Hide the hours line at zero

In `TimesheetGrid.tsx`'s attendance cell, render `ts-attendance-hours` only
when `effectiveMinutes > 0`. Combined with decision 1, a day only shows
`0h 00m`-equivalent (i.e. nothing) when there's genuinely no worked time to
report — a live in-progress day will show a real, non-zero elapsed value
almost immediately after check-in.

### 4. Icon contrast

The icon already inherits the badge span's text color (it's rendered inside
the same `<span className={attendanceBadgeClass(...)}>` as the label), so
this isn't a color bug — it's the glyph rendering small at the badge's
`font-size`. Wrap the icon in its own `<span className="ts-attendance-icon">`
with a larger `font-size` (e.g. `1.15em` relative to the badge), no color
change needed.

## Data shape changes

`AttendanceDoc` (`web/src/attendance/attendanceApi.ts`) gains one optional
field, present only on `/range` responses:
```ts
needsRegularise?: boolean;
```

`AttendanceCell` (`web/src/timesheet/attendanceRow.ts`) gains the same field,
threaded through by `resolveAttendanceRow`:
```ts
export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean } | null;
```

## Out of scope

- `AttendancePage`'s own day-log table and live ticker (unchanged; it has
  its own established live-computation pattern that already covers this for
  the user's own current view).
- `/attendance/month`, `/attendance/today`, `/attendance/stats`,
  `/attendance/team` — none of these are touched; only `/attendance/range`'s
  handler gains the post-processing step.
- Any backend write/auto-correction of stale `Attendance` docs.
