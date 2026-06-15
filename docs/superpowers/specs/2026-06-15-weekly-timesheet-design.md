# Weekly Timesheet Module — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Summary

A weekly timesheet inside the existing authenticated web app. Tasks are rows,
weekdays (Mon–Fri) are columns, and each cell is a smart time input accepting
hours/minutes. Row totals, daily column totals, and a header grand total
recalculate live as the user types. Users can add/delete tasks, switch weeks
(prev/next), "Copy last week" task rows into the current week, and everything
persists per user in MongoDB with autosave so entries survive reloads and reload
by week.

## Goals

- Grid: task rows × weekday columns (Mon–Fri), one smart time input per cell.
- Live totals: per-row (across the week), per-column (across tasks), and a header
  grand total ("This Week · 39h 00m"). Recompute on every keystroke.
- Add a task (new row) and delete a task (remove row + its entries).
- Flexible time entry that normalizes (e.g. `90m` → `1h 30m`); empty cell = 0.
- Switch weeks with prev/next and per-column date labels.
- "Copy last week" pulls the previous week's task names into the current week.
- Persistence per user in MongoDB; autosave; reloadable by week.

## Non-Goals

- No automated test suite for app code (consistent with the existing project),
  EXCEPT the pure time-parsing helpers, which get lightweight unit tests because
  they are pure and bug-prone. (See Testing.)
- No reporting/exports, approvals, billing, weekend days, or sub-task hierarchy.
- No cross-week drag/copy beyond "Copy last week".

## Decisions

| Topic            | Decision                                                       |
|------------------|----------------------------------------------------------------|
| Placement        | New post-login app shell with a sidebar; Timesheet is a section |
| Storage          | MongoDB, per user, keyed by `(userId, weekStart)`               |
| Week id          | `weekStart` = Monday of the ISO week, `YYYY-MM-DD`             |
| Columns          | Mon–Fri (5 columns), each with a date label                    |
| Time storage     | Integer **minutes** per cell (never floats)                    |
| Cell input       | Single smart text field, parses + normalizes on blur           |
| Saves            | **Autosave**, debounced ~500ms, with a "Saved" indicator       |
| Copy last week   | Task **names only** → fresh rows, blank entries                |
| API auth         | Existing `requireAuth` (Bearer access token)                   |

## Architecture

The timesheet is a self-contained feature added to the existing `web/` React app
and `auth-api/` Express backend. After login, an `AppShell` renders a sidebar +
content region; the Timesheet section owns its own week state and talks to a new
auth-protected `/timesheets` API. Time math lives in pure helpers so it can be
unit-tested and reused by every total.

```
AppShell (sidebar + content)
└─ TimesheetPage         owns week state, load/save (autosave)
   ├─ WeekNav            prev/next + week label + grand total
   └─ TimesheetGrid      column date headers + rows + daily-total footer + Add task
      └─ TaskRow         name field + 5 TimeCell + row total + delete
         └─ TimeCell     smart input (parse on blur, show normalized)
time.ts                  parseTimeInput(), formatMinutes(), weekday/date helpers
timesheetApi.ts          getWeek(), saveWeek()
```

## Data model

**Mongo `Timesheet`** (`auth-api/src/models/Timesheet.js`)

```
{
  userId: ObjectId,          // ref User
  weekStart: string,         // 'YYYY-MM-DD', the Monday
  tasks: [
    {
      id: string,            // client-generated uuid, stable across saves
      name: string,
      entries: {             // minutes; missing day = 0
        mon: number, tue: number, wed: number, thu: number, fri: number
      }
    }
  ],
  updatedAt: Date
}
```

Unique compound index on `(userId, weekStart)`. One document per user per week.

## API

Mounted at `/timesheets`, all routes behind `requireAuth` (so `req.user.sub` =
the user id). `:weekStart` is validated as `YYYY-MM-DD` and must be a Monday.

- `GET /timesheets/:weekStart`
  → `{ weekStart, tasks }`. If no document exists, returns `{ weekStart, tasks: [] }`
  (an empty week — never 404 for a valid week).
- `PUT /timesheets/:weekStart`
  Body `{ tasks }`. Upserts the document for `(userId, weekStart)`, replacing
  `tasks`, sets `updatedAt`. Returns `{ ok: true, updatedAt }`.

Validation: reject a `weekStart` that isn't `YYYY-MM-DD` or isn't a Monday with
`400`. Clamp/coerce entry minutes to non-negative integers on save.

## Frontend behavior

### Time parsing & formatting (`web/src/timesheet/time.ts`)

`parseTimeInput(raw: string): number` (returns minutes):
- `"2h 30m"`, `"2h"`, `"30m"`, `"90m"` → unit-based.
- `"2:30"` → H:MM colon format.
- `"1.5h"` or bare `"1.5"` → decimal hours (rounded to nearest minute).
- bare integer `"2"` → hours (`2` = 120m).
- empty / unparseable → `0`.

`formatMinutes(min: number): string` → `"Hh MMm"` with zero-padded minutes
(e.g. `150` → `"2h 30m"`, `90` → `"1h 30m"`, `0` → `"0h 00m"`). Cells render
empty when 0; totals render via `formatMinutes`.

### Totals (live)
Derived on every render from the in-memory `tasks` array:
- Row total = sum of that task's 5 entries.
- Column total = sum of all tasks' entry for that day.
- Grand total = sum of all entries. Shown in `WeekNav` as `This Week · {formatMinutes}`.

No total is stored; all are computed from minutes then formatted once.

### Week switching
`WeekNav` prev/next change `weekStart` by ∓7 days. On change, `TimesheetPage`
loads that week via `getWeek`. Column headers show each weekday's date derived
from `weekStart` (e.g. `Mon 16`, `Tue 17`).

### Add / delete task
- Add task → append `{ id: uuid, name: '', entries: {} }`; focus the new name field.
- Delete task → remove the row (and its entries) from `tasks`.
Both mutate local state and trigger autosave.

### Autosave
A debounced effect (~500ms after the last change) calls `saveWeek(weekStart, tasks)`.
A small status indicator shows `Saving…` → `Saved`. Loading a different week
flushes/cancels pending saves for the previous week first. On initial load and on
reload, the current week is fetched, so entries survive reloads.

### Copy last week
Fetches `weekStart − 7 days` via `getWeek`, maps its task **names** into new rows
with fresh ids and empty entries, and sets them as the current week's tasks
(then autosave persists). If the previous week has no tasks, show a brief
"Nothing to copy" message.

## Components (`web/src/timesheet/`)

- `TimesheetPage.tsx` — week state, data load, autosave orchestration, copy-last-week.
- `WeekNav.tsx` — prev/next, week label, grand total, save status.
- `TimesheetGrid.tsx` — header row (weekday + date), task rows, daily-total footer, Add task.
- `TaskRow.tsx` — name input, 5 `TimeCell`s, row total, delete.
- `TimeCell.tsx` — controlled smart input; parses on blur, shows normalized value.
- `time.ts` — pure parse/format + week/date helpers.
- `timesheetApi.ts` — `getWeek`, `saveWeek` (uses the existing access-token fetch helper).

App shell:
- `web/src/AppShell.tsx` — sidebar + content; renders after login (used by `App.tsx`).
- Sidebar nav: Timesheet (active), plus the signed-in user + sign-out (reuses `useAuth`).

## Error handling

- API GET failure → show an inline error in the content area with a Retry button;
  keep the grid usable with an empty week.
- Autosave failure → status shows `Save failed — retry`, retries on next edit;
  never silently drop edits.
- Invalid `weekStart` from the client → backend `400`; the client only ever sends
  Monday dates it computed, so this is a guard, not a normal path.
- Unparseable cell input → coerced to 0 and the cell reverts to its prior value
  on blur.

## Testing

- Pure unit tests for `time.ts` (`parseTimeInput`, `formatMinutes`) covering the
  examples above (`90m`→`1h 30m`, `2:30`, `1.5h`, empty, bare integer). These are
  fast, pure, and where the subtle bugs live — worth the small exception to the
  project's no-test stance.
- Everything else verified manually: add/delete rows, live totals, week switching,
  copy last week, autosave + reload persistence.
