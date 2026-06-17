# Task Scheduling: Estimate Units, Timeline Bars, Single-Active-Task Assignment

**Date:** 2026-06-17
**Status:** Approved (design)

## Summary

Three related capabilities layered onto the existing PM/timesheet system:

- **A — Estimate units.** A task estimate can be entered in **hours, days, or weeks**, not just hours.
- **C — Timeline bar.** Each assigned task shows a bar across the weekly timesheet grid spanning the working days it runs, on every week it touches.
- **B — One active task at a time.** An employee with an active (assigned, not-done) task cannot be *directly assigned* more work; a PM assignment becomes a pending **offer** the employee Accepts/Declines. Marketplace claims are unaffected (claiming is opting in).

Built in dependency order **A → C → B** (C needs A's duration; B is independent but sequenced last).

## Conventions

- Backend in `auth-api/` (Node 20 ESM, Express 4, Mongoose 8). Tests: `node:test` + `mongodb-memory-server` + `supertest`, run with `cd auth-api && npm test`.
- Frontend in `web/` (React 18 + TS + Vite). `req.user = { sub, email, name, role }`. ObjectIds compared as strings.
- Working week is **Mon–Fri** (matches the timesheet). **1 day = 8 working hours, 1 week = 5 days = 40 hours.**

---

## A — Estimate Units

### Data model (`Task`)

Add:

```js
estimateValue: { type: Number, default: 0 },
estimateUnit:  { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
startDate:     { type: Date, default: null },
```

`estimatedHours` is retained and becomes **derived** from `estimateValue`/`estimateUnit` on every write:

```
estimatedHours = estimateValue * { hours: 1, days: 8, weeks: 40 }[estimateUnit]
```

All existing readers of `estimatedHours` (actuals comparison, summary tiles, marketplace listing) keep working unchanged. Existing documents (which have only `estimatedHours`) read as `estimateValue = estimatedHours, estimateUnit = 'hours'` — no migration required; the values simply default and are reconciled the next time the estimate is edited.

The existing propose-estimate flow fields gain a unit: `proposedHours` is kept derived, and we add

```js
proposedValue: { type: Number, default: 0 },
proposedUnit:  { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
```

### Pure helper — `auth-api/src/services/estimate.js`

```
UNIT_HOURS = { hours: 1, days: 8, weeks: 40 }

toHours(value, unit)            -> Number   // value * UNIT_HOURS[unit], 0 for unknown
estimateWorkingDays(hours)      -> Number   // Math.ceil(hours / 8), min 0
endDateFrom(startISO, hours)    -> ISO date // walk forward Mon–Fri only, inclusive span
                                            //   of estimateWorkingDays(hours); returns the
                                            //   ISO date of the last working day. Null start
                                            //   or 0 days -> returns startISO (or null).
```

`endDateFrom` skips Saturday/Sunday. Example: start = Tue, 1 week (5 working days) → Tue, Wed, Thu, Fri, **next Mon** = end.

Unit-tested: conversions per unit, `estimateWorkingDays` rounding (20h→3, 24h→3, 30h→4), `endDateFrom` weekend-skipping and the cross-week case.

### Estimate entry points

- **PM task create/edit** (`web/src/pm/Projects.tsx` task form): number input + unit `<select>`; also a `startDate` date input. Sends `{ estimateValue, estimateUnit, startDate }`.
- **Employee propose-estimate** (`web/src/pm/MyTasks.tsx`): number input + unit `<select>`; sends `{ proposedValue, proposedUnit }`.
- On the backend, the task create/edit route and `PATCH /tasks/:id/estimate` accept `value`+`unit`, recompute the derived hours. `PATCH /tasks/:id/estimate/decision` (approve) copies `proposedValue`/`proposedUnit` → `estimateValue`/`estimateUnit` and recomputes `estimatedHours`.

---

## C — Timeline Bar in the Weekly Timesheet

### Backend

The weekly timesheet payload's task-linked rows already carry `estimatedHours`, `status`, `percentComplete`. Add to each task row:

```
startDate: ISO | null
endDate:   ISO | null   // endDateFrom(startDate, estimatedHours)
```

Computed in the row-merge layer (`services/timesheetRows.js`) using the estimate helper. Rows with no `startDate` carry `null`/`null` and render no bar.

### Pure helper — per-week bar segment

Add to `timesheetRows.js` (so it is unit-testable):

```
weekBarSegment(weekStartISO, startISO, endISO) -> { startCol, endCol, continuesLeft, continuesRight } | null
```

- Columns are `0..4` for Mon..Fri of the displayed week.
- Returns `null` if `[startISO, endISO]` does not intersect this week.
- `startCol` = first weekday column on/after `startISO` (clamped to 0); `endCol` = last weekday column on/before `endISO` (clamped to 4).
- `continuesLeft` true if the task started before this week's Monday; `continuesRight` true if it ends after this week's Friday.

Unit-tested: fully-inside week, starts mid-week, spans into next week (`continuesRight`), spans from a prior week (`continuesLeft`), and a non-intersecting week (`null`).

### Frontend (`web/src/timesheet/TimesheetGrid.tsx`)

For each task row with a non-null segment, render a thin bar overlaying the Mon–Fri cells from `startCol` to `endCol`. Open/flush edges:

- `continuesLeft` → left edge is flush/arrow (no rounded cap).
- `continuesRight` → right edge is flush/arrow.

The bar is **tinted by `status`** (`todo`, `in_progress`, `blocked`, `done`), using existing CSS variables where available. It is visual only — it does not change hour-entry behavior. Ad-hoc rows (no `taskId`) render no bar.

```
Task        Mon  Tue  Wed  Thu  Fri
Build API   [=========================>   (continuesRight)
Write docs        [===============]        (Tue–Thu, fully inside)
```

---

## B — One Active Task at a Time (PM Offer / Employee Accept)

### Definitions

- **Active task** = a `Task` with `assignee = userId` and `status !== 'done'`.
- Helper `hasActiveTask(userId)` (in `services/authz.js` or a small new module) returns boolean.

### Data model — `AssignmentOffer`

```js
{
  taskId:   ObjectId ref Task,  required,
  userId:   ObjectId ref User,  required,   // the employee being offered the task
  offeredBy:ObjectId ref User,  default null,
  status:   enum ['pending','accepted','declined'] default 'pending',
  decidedAt:Date default null,
  createdAt:Date default Date.now,
}
```

Index `{ userId: 1, status: 1 }` and `{ taskId: 1, status: 1 }`.

### Assignment behavior

Direct assignment happens in two places: `PATCH /tasks/:id` (setting `assignee`) and task creation with an `assignee`. Both route through the same guard:

- Target employee **not** busy (`!hasActiveTask`) → assign directly (current behavior).
- Target employee **busy** → **do not** set `assignee`; create a pending `AssignmentOffer { taskId, userId: target, offeredBy: req.user.sub }` (dedupe: skip if a pending offer for the same task+user already exists). Response indicates an offer was created rather than a direct assignment.

Existing project-membership validation for the assignee is unchanged and still applies before an offer is made.

### Employee offer endpoints (new router `routes/assignmentOffers.js`, mounted at `/assignment-offers`)

- `GET /assignment-offers/mine` — pending offers for `req.user.sub`, populated with task title + project name.
- `PATCH /assignment-offers/:id` `{ decision: 'accept' | 'decline' }` — must be the offer's `userId`.
  - `accept`: re-check the task is still unassigned and not done; set `task.assignee = userId`; mark offer `accepted`. (Accepting overrides the busy rule — the employee chose to.)
  - `decline`: mark offer `declined`. No PM-facing notification surface (the offer simply resolves).
  - Conflict (task already assigned since the offer) → `409`.

### Marketplace interaction

Unchanged. A busy employee may still claim via the Marketplace (claiming = opting in), and PM approval of a claim assigns normally — the busy guard does **not** apply to the claim-approval path.

### Frontend (`web/src/pm/MyTasks.tsx`)

A "Task offers" section listing pending offers with **Accept** / **Decline** buttons, calling the two endpoints and reloading. PM-side assignment UI surfaces the "offer sent" outcome (e.g., a small notice) instead of an immediate assignment when the employee is busy.

---

## Testing Strategy

- **Pure helpers (unit):** `estimate.js` (conversions, working-day count, `endDateFrom`); `weekBarSegment` (intersection cases). `node --test`.
- **Routes (integration):** estimate value+unit recompute on create/edit and on propose/approve; assignment-to-busy creates an offer (not an assignment); accept assigns + declines free; non-owner/non-target authorization; marketplace claim approval still assigns a busy employee.
- **Frontend:** nav/render checks where feasible; `tsc --noEmit` + `npm run build` green.

## Out of Scope (deferred)

- Project-level rollup estimates / aggregate bars.
- Bar filling by `% complete` (we tint by status only).
- PM notifications for declined offers.
- Configurable hours-per-day (fixed at 8).

## Implementation Slicing (for the plan)

1. **Slice A:** `estimate.js` helper + `Task` schema fields + estimate routes/UI (units).
2. **Slice C:** timesheet row `startDate`/`endDate` + `weekBarSegment` + grid bar rendering.
3. **Slice B:** `AssignmentOffer` model + assignment guard + offer endpoints + My Tasks offers UI.
