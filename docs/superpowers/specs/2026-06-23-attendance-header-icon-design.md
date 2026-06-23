# Timesheet attendance: move from a separate row to a column-header icon

**Date:** 2026-06-23
**Status:** Design (awaiting review)

## Problem

The attendance row shipped in `2026-06-23-timesheet-attendance-row-design.md`
works, but real usage showed it's the wrong layout: a full extra row (badge +
label + hours, repeated per weekday) is heavier than the information is worth
for a summary view. The status is glanceable — it doesn't need its own row.

## Decision

Delete the separate attendance `<tr>` entirely. Each day's existing column
header (`<th>` in `TimesheetGrid.tsx`) gains a small status icon next to the
day label. Hovering the icon (native `title` tooltip, same pattern already
used for the leave badge at `TimesheetGrid.tsx:87`) reveals the full detail —
status name, hours, leave type, or holiday name. Blank days (future,
pre-activation, no doc yet) show no icon at all — just the bare day label,
identical to the header before this feature existed.

```
TASK        | MON 22 ◑ | TUE 23 ✓ | WED 24   | THU 25   | FRI 26   | TOTAL
────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────
Task rows...│          │          │          │          │          │
────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────
Daily total │  4h 30m  │  8h 00m  │  0h 00m  │  0h 00m  │  0h 00m  │
```

The underlying data pipeline is unchanged: `resolveAttendanceRow` (per-day
leave/future/pre-activation/absent precedence, `needsRegularise` passthrough)
is reused as-is — only the render target moves from a row to a header cell.

## Icon legend

| Status | Icon | Color token | Tooltip example |
|---|---|---|---|
| Present | ✓ | `--success` | `Present — 8h 15m` |
| Partial | ◑ | `--warning` | `Partial — 4h 30m` |
| Absent | ✕ | `--danger` | `Absent` |
| WFH | ⌂ | `--success` | `WFH — 8h 00m` |
| WFH-Partial | ⌂ | `--success` | `WFH — 5h 10m` |
| Leave | ✦ | `--warning` | `Casual leave` (the actual leave type, not the generic word "Leave") |
| Holiday | ★ | `--st-planning` | `Holiday — Diwali` (uses the doc's `note` field) |
| No data (future / pre-activation / not yet today) | *(nothing)* | — | no icon, no tooltip — just the day label |

Needs-regularise (a past day with `checkIn` set, `checkOut` null) appends a
small `⚠` right after the status icon — e.g. `◑⚠` — without replacing the
base icon, and the tooltip gets `" — no checkout, please regularise"`
appended, e.g. `Partial — no checkout, please regularise` (hours omitted
since they're 0/meaningless for an unclosed session).

Hours are omitted from the tooltip whenever they'd be `0` and the status is
`partial` or `wfh-partial` (same "don't show a meaningless zero" rule as the
row version) — the day shows the bare label or, for needs-regularise days,
the label + the no-checkout suffix.

## Backend (unchanged from the previously-approved design)

`/attendance/range`'s route handler still does exactly what
`2026-06-23-attendance-row-live-hours-design.md` specified — this part of
that design was never invalidated, only its frontend consumer changed:

- For today's still-open session (`checkIn` set, `checkOut` null,
  `date === today`): override `effectiveMinutes` with a live calculation —
  `now - checkIn`, minus `breakMinutes` plus any currently-open break's
  elapsed time — mirroring `AttendancePage.tsx:298-315`'s existing formula.
- For a past day with a missed checkout (`checkIn` set, `checkOut` null,
  `date < today`): add `needsRegularise: true` to that response item.
- `/attendance/month`, `/attendance/today`, `/attendance/stats`,
  `/attendance/team`, and `AttendancePage`'s own live ticker are untouched.

## Leave folds into the unified icon (removes the old overlay path)

Approving a leave request already stamps the covering `Attendance` docs with
`status: 'leave'` and a descriptive `note` (e.g. `"casual leave"` or
`"casual leave (half day, morning)"`) — see `auth-api/src/routes/leave.js:113-136`.
This happens immediately on approval, for every date in the leave's range
(including future-dated ones), so the doc is already there for
`resolveAttendanceRow` to read like any other day.

This means the separate `leaveDays` machinery becomes dead weight once Leave
is unified into the icon:

- `resolveAttendanceRow` drops the `leaveDays` parameter and the "blank if
  leave" branch entirely — a leave day just resolves via the normal
  doc-found branch, status `'leave'`, exactly like present/partial/absent do.
- `TimesheetGrid`'s `leaveDays` prop, the `ts-leave-badge` element, and the
  `ts-day-leave` header tint are removed (this was the old, separate "Leave"
  text pill — now subsumed by the ✦ icon).
- `TimesheetPage`'s `myLeave` state, `loadLeave()`, and the `getMyLeave`/
  `LEAVE_TYPE_LABELS` imports are removed *for display purposes* — the
  "Apply for leave" button and `LeaveModal` are unaffected (they don't read
  `myLeave`), only the now-redundant leave-day computation goes away. A
  newly-submitted (not yet approved) leave request still shows nothing on
  the timesheet, same as before approval — leave only becomes visible once
  the `Attendance` doc is stamped, which still happens at approval time, not
  submission time.

## Frontend changes

- `attendanceRow.ts`: keep `attendanceLabel`, `attendanceIcon`. Remove
  `attendanceBadgeClass` (no longer used — there's no badge anymore).
  `resolveAttendanceRow` drops the `leaveDays` parameter (see above) and its
  `AttendanceCell` gains the doc's `note` field, since both Leave
  (`"casual leave"`) and Holiday (`"Founders Day"`) tooltips need it —
  `AttendanceDoc` already carries `note` for both cases, just unused by the
  resolver until now:
  ```ts
  export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean; note?: string } | null;
  export function resolveAttendanceRow(
    dayDates: Record<Day, string>,
    docs: AttendanceDoc[],
    activatedDate: string | null,
    today: string,
  ): Partial<Record<Day, AttendanceCell>>
  ```
  Add a new pure function for the tooltip text and a new one for the icon's
  color class:
  ```ts
  export function attendanceTooltip(
    status: AttendanceStatus,
    effectiveMinutes: number,
    needsRegularise?: boolean,
    note?: string,
  ): string
  export function attendanceIconColorClass(status: AttendanceStatus): string
  ```
- `TimesheetGrid.tsx`: delete the attendance `<tr>` (currently lines 96-116).
  In the day `<th>` map, render the icon (+ `⚠` suffix if applicable) with a
  `title` attribute built from `attendanceTooltip(...)`, only when
  `attendance[d]` is non-null.
- `styles.css`: remove `.ts-attendance-row`, `.ts-attendance-cell`,
  `.ts-attendance-hours`, `.ts-attendance-icon`, `.att-tag-present`,
  `.att-tag-partial`, `.att-tag-absent` (all dead once the row is gone — note
  `.att-tag-wfh`/`.att-tag-leave`/`.att-tag-holiday` predate this feature and
  are still used by `AttendancePage`, so those stay). Add new icon-color
  classes (`ts-th-icon-present`, `ts-th-icon-partial`, `ts-th-icon-absent`,
  `ts-th-icon-holiday` — WFH and Present share `--success` so WFH reuses
  `ts-th-icon-present`; Leave and Partial share `--warning` so Leave reuses
  `ts-th-icon-partial`).

## Out of scope

Same as the prior two specs: `AttendancePage`, `/month`/`/today`/`/stats`/
`/team`, any backend write/auto-correction of stale docs, weekend columns
(grid stays Mon–Fri).
