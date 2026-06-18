# Per-assignee hour estimates → summed task estimate + per-assignee deadlines

**Date:** 2026-06-18
**Status:** Design (awaiting review)

## Problem

Today work distribution is purely a **percentage split**: the PM gives each
assignee a `sharePct`, and an assignee's planned hours are *derived* from the
task's single estimate (`assigneeHours = estimatedHours × sharePct`). The task
deadline comes from one task-level estimate.

We want to invert this. The PM still distributes the work as a **% per
assignee**, but each assignee then submits **their own estimate of hours** for
their slice. Once every assignee has submitted, the task's **total estimated
time** is the *sum* of those estimates. Each assignee's **deadline** is derived
from the hours *they* gave (anchored at the task start date), not from "today".

## Decisions (resolved during brainstorming)

1. **Keep `sharePct`** as the PM's work distribution. Add a per-assignee
   `estimatedHours` that the assignee submits themselves.
2. The task's total estimate = **sum** of assignee estimates, and is only
   finalized **once every assignee has submitted** ("locked until all submit").
   No separate PM approval step.
3. Each assignee's deadline = `endDateFrom(task.startDate, theirEstimatedHours)`
   — same start (task start date), finish varies by their own hours.
4. Retire the older task-level `/estimate` proposal path **for assigned tasks**;
   keep it for unassigned/claimable tasks.
5. Task-level auto due date = the **latest** (max) per-assignee deadline
   (assignees work in parallel; total *effort* ≠ *duration*).
6. The per-assignee deadline is **display/urgency only** — it does NOT lock
   timesheet cells after it. (The existing start-date lower-bound gate stays.)

## Data model

`auth-api/src/models/Task.js` — extend the assignee subdocument:

```js
assignees: [{
  user,                                    // unchanged
  sharePct,                                // unchanged (PM work distribution)
  estimatedHours: { type: Number, default: null },   // null = not yet submitted
}]
```

Derived (not stored, computed where needed):

- `allEstimatesIn = assignees.length > 0 && assignees.every(a => a.estimatedHours != null)`
- Task **total estimate** = `sum(assignees.estimatedHours)` when `allEstimatesIn`,
  otherwise **pending** (rendered as "—" / "X of N submitted").
- When `allEstimatesIn` flips true, write the sum into the existing
  `task.estimatedHours` field (keeps downstream reporting/My Tasks working).
  When an assignee is added (or clears their estimate) so it's no longer
  complete, the task reverts to pending (`estimatedHours` = 0 / not official).

## Server

### New endpoint — assignee submits their own estimate
`PATCH /tasks/:id/my-estimate` body `{ value, unit }` (`unit ∈ hours|days|weeks`)

- Auth: requester must be an assignee of the task; 403 otherwise.
- Sets `assignees[me].estimatedHours = round(toHours(value, unit))`.
- Recomputes `allEstimatesIn`; if true, set `task.estimatedHours = sum`,
  recompute auto `dueDate` (see below); else leave pending.
- Assignee may call again to update their estimate (recomputes total).

### Deadlines (`auth-api/src/services/estimate.js`)
- New helper `assigneeDueDate(task, assignee)` =
  `endDateFrom(toISODate(task.startDate), assignee.estimatedHours)`
  (returns null if no startDate or estimate not submitted).
- Task auto due date = `max(assigneeDueDate over all assignees)` when
  `allEstimatesIn`; `effectiveDueDate` keeps honoring a manual `dueDate` first.

### Assignment editor path (`PATCH /tasks/:id/assignees`)
- Still accepts the `{ user, sharePct }` list and normalizes shares.
- Preserve an existing assignee's already-submitted `estimatedHours` when the
  list is re-saved (match by user id); new assignees start at `null`.

### My Tasks list (`GET /tasks` "mine")
- Replace `myPlannedHours = assigneeHours(estimatedHours, sharePct)` with the
  assignee's own submitted `estimatedHours` (or null/pending).
- Add per-row fields: `myEstimatedHours`, `myDue` (= `assigneeDueDate`),
  `estimatesPending` (= `!allEstimatesIn`), `submittedCount`/`assigneeCount`.

### Retire old proposal path for assigned tasks
- `PATCH /tasks/:id/estimate` and `/estimate/decision`: if the task has
  assignees, return 409 ("use per-assignee estimates"); otherwise behave as
  today (claimable/unassigned tasks keep the propose→approve flow).

## Web

### AssigneesEditor (`web/src/pm/AssigneesEditor.tsx`)
- Unchanged behavior for the % split. Optionally show each assignee's submitted
  hours next to their % as read-only context ("12h" or "pending").

### My Tasks (`web/src/pm/MyTasks.tsx`)
- Add a "Your estimate" control (number + unit select) that calls
  `PATCH /tasks/:id/my-estimate`.
- Once submitted, show **your deadline** (`myDue`).
- While the task total is pending, show "Waiting on N of M teammates" and show
  the total estimate as "—".

### Projects task table (`web/src/pm/Projects.tsx` / `ProjectTasks.tsx`)
- Assignee chips show each person's submitted hours or "pending".
- Task total estimate column shows the sum, or "X of N submitted" while pending.

### pmApi (`web/src/pm/pmApi.ts`)
- Add `setMyEstimate(taskId, value, unit)`.
- Extend task/assignee types with `estimatedHours`, and the My Tasks row with
  `myEstimatedHours`, `myDue`, `estimatesPending`, counts.

## Edge cases

- **Add assignee after others submitted** → task reverts to pending until the
  new person submits.
- **Remove an assignee** → recompute; if the rest are all in, finalize the sum.
- **Change a `sharePct`** → does not invalidate anyone's submitted hours (hours
  are each person's own estimate, independent of the %).
- **startDate not set** → per-assignee deadline is null (shown as "—"); total
  estimate can still finalize, just no auto deadline until a start date exists.
- **Estimate of 0** → treat 0 as a valid submitted value (distinct from `null`
  "not submitted"). Submission requires an explicit action.

## Testing

- `estimate.js`: `assigneeDueDate` (start + own hours, weekend skipping, null
  start / null estimate), task auto due = max of per-assignee deadlines.
- Rollup helper: `allEstimatesIn` and sum across submitted/partial/empty.
- Assignment merge preserves submitted hours by user id; new assignee → null.
- Route guards: non-assignee 403 on `/my-estimate`; `/estimate` 409 when the
  task has assignees.
- Web: My Tasks shows pending state vs. submitted deadline; pmApi serialization.

## Out of scope

- No change to the timesheet editability rules beyond what already ships
  (start-date lower bound). Deadlines are display-only.
- No notifications/reminders to assignees who haven't submitted (could be a
  follow-up).
