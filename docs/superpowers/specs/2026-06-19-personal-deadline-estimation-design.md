# Personal deadline estimation (per-assignee completion forecast)

**Date:** 2026-06-19
**Status:** Design (awaiting review)

## Problem

A task has a PM-assigned deadline (`dueDate`, or the auto `effectiveDueDate`
from start + estimate). We also *derive* a per-assignee completion date
(`myDue`) from each assignee's approved hours. Neither captures the employee's
own forecast of **when they actually expect to finish** their slice.

We want employees to provide a self-set, freely-updatable **personal estimated
completion datetime**, give PMs visibility into it, and flag early when an
employee expects to finish *after* the PM deadline so the timeline can be
discussed before it slips.

## Decisions (resolved during brainstorming)

1. **New independent field.** The personal estimate is separate from the
   hours-derived `myDue` (which stays as advisory context) and separate from the
   "Request more time" extension proposal. It is the employee's own forecast.
2. **Date + time.** Stored as a full datetime (`etaAt`). The PM deadline is
   date-only, so comparison treats the deadline as **end of that day**.
3. **No approval.** Employees set and update their estimate freely as work
   progresses; it does not require PM sign-off and does not change the task's
   estimate or auto due date.
4. **Flag + discuss CTA.** When the personal estimate is later than the PM
   deadline, My Tasks shows a warning and surfaces the existing "Request more
   time" extension flow (broadened to be available in this case, not only when
   overdue) so discussing with the PM is one click.
5. **PM surface.** The PM "dashboard" is the project task table
   (`ProjectTasks`). It highlights tasks where any assignee's estimate is later
   than the deadline, and shows each assignee's ETA.
6. **Comparison anchor.** The deadline used is `effectiveDueDate` (covers both
   the PM's manual `dueDate` and the computed auto date).

## Data model

`auth-api/src/models/Task.js` — extend the assignee subdocument:

```js
assignees: [{
  user,
  sharePct,
  estimatedHours,          // unchanged (approved estimate)
  pending* ,               // unchanged (estimate-change request)
  etaAt: { type: Date, default: null },   // employee's own estimated completion datetime; null = not provided
}]
```

`etaAt` is advisory: it is **not** summed or rolled into `task.estimatedHours`
or the task auto due date.

## Server (`auth-api/src/routes/tasks.js`)

### Employee sets/updates/clears their estimate — `PATCH /tasks/:id/my-eta`
Body `{ etaAt }` where `etaAt` is an ISO datetime string, or `null` to clear.

- Auth: requester must be an assignee of the task; 403 otherwise.
- Sets the caller's `etaAt = etaAt ? new Date(etaAt) : null`. Invalid date → 400.
- No approval; callable repeatedly. Returns the task.

### My Tasks list — `GET /tasks/mine`
- Add `myEtaAt`: the caller's assignee `etaAt` as an ISO string (or `null`).

### Project detail — `GET /projects/:id`
- No route change: assignee subdocs already serialize via `toObject()`, so each
  assignee carries `etaAt` automatically.

## Web

### `eta.ts` (new helper, unit-tested)
```ts
etaStatus(etaAt: string | null, deadlineDate: string | null): 'none' | 'ontrack' | 'late'
```
- `none` when `etaAt` is null/empty.
- Otherwise compare `new Date(etaAt)` to the deadline's **end of day**
  (`deadlineDate` + `T23:59:59.999`): strictly after → `late`, else `ontrack`.
- No deadline (`deadlineDate` null) → `ontrack` (nothing to violate).

### `pmApi.ts`
- `setMyEta(id, etaAt: string | null)` → `PATCH /tasks/:id/my-eta`.
- Extend `Task` with `myEtaAt?: string | null`.
- Extend the `TaskDetail` assignee type (and `Assignee`) with `etaAt?: string | null`.

### `MyTasks.tsx` — Due column
- Add a `PersonalEta` control: a `datetime-local` input with **Save** and
  **Clear**, pre-filled from `myEtaAt`. Below it, status text:
  - `ontrack` → `✓ on track` (muted/positive).
  - `late` → `⚠ Your estimate is later than the deadline` warning.
- When `late` and the task is not done, broaden the existing `ExtensionRequest`
  via a small `forceOffer` prop so "Request more time" shows even when the task
  is not overdue. Done tasks are never flagged.
- Compare using `etaStatus(t.myEtaAt, deadline)` where `deadline` is
  `t.dueDate?.slice(0,10) ?? t.effectiveDueDate`.

### `ProjectTasks.tsx` — PM highlight
- For each assignee in the assignee cell, show their ETA (date, compact) and a
  `⚠` when `etaStatus(a.etaAt, taskDeadline) === 'late'`.
- When any assignee is late, show a compact `⚠ ETA past deadline` badge on the
  row (near the Due cell). `taskDeadline = t.dueDate?.slice(0,10) ?? t.effectiveDueDate`.

## Testing

- `auth-api/test/routes.test.js`:
  - `/my-eta` stores `etaAt` for an assignee and clears on `null`; non-assignee
    → 403; invalid datetime → 400.
  - `/tasks/mine` exposes `myEtaAt`.
  - `getProject` returns `etaAt` on the assignee subdoc.
- `web/src/pm/eta.test.ts`: `etaStatus` for none / on-track / late / no-deadline
  / end-of-day boundary (an `etaAt` on the deadline date but before midnight is
  `ontrack`; the next day is `late`).

## Out of scope

- Notifications / emails to the PM.
- Any change to the estimate-approval workflow or timesheet editability rules.
- Rolling the personal ETA into the task's auto due date (it stays advisory).
- A dedicated standalone PM dashboard page (we highlight within the existing
  project task table).
