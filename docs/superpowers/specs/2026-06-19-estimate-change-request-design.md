# Simplified estimate-change request on My Tasks

**Date:** 2026-06-19
**Status:** Design (awaiting review)

## Problem

The My Tasks "Estimate" column stacks several controls per task and is
confusing:

1. `ProposeEstimate` — a legacy task-level "propose" input. Every My Tasks row
   is an *assigned* task, and the backend `PATCH /tasks/:id/estimate` endpoint
   returns **409** for assigned tasks, so this control is effectively dead here.
2. `MyEstimate` — a per-assignee input that submits the employee's own hours via
   `PATCH /tasks/:id/my-estimate`. Today this is a **direct self-submission with
   no approval** (the 2026-06-18 per-assignee design deliberately had "no PM
   approval step").
3. A "Total / Waiting on N teammates" sub-line.

We want a single, intuitive **"Request Estimate Change"** action: a small modal
to enter revised estimated hours + an optional reason, with the row showing the
current approved estimate and any pending request in a compact way. We also want
to **(re)introduce a PM approval gate** so an employee's estimate is a *request*,
not a unilateral change.

## Decisions (resolved during brainstorming)

1. **Scope of the change request:** the employee's *own* assigned hours (the
   per-assignee `estimatedHours`), not the task-level estimate.
2. **Approval gate:** *every* estimate — including the first — is a request a PM
   must approve. `estimatedHours` on an assignee subdoc is the **approved**
   value and stays `null` until a PM approves a request. This reverses the
   2026-06-18 "no approval step" decision for assigned tasks.
3. **One action:** a single button opens a modal with `hours value + unit
   selector (hours/days/weeks) + optional reason`. Button label is
   "Submit estimate" when nothing is approved or pending, otherwise
   "Request estimate change".
4. **Reject is silent:** rejecting clears the pending request back to
   "no request" — no separate "rejected" state is shown. (So there is **no**
   stored `requestStatus` field; "pending" is derived from `pendingHours != null`.)
5. **Surface scope:** this work covers the **My Tasks employee UI + backend**
   (data model, employee request endpoint, and a PM decision endpoint that is
   API-testable). The **PM approval *UI* is deferred** to a follow-up.

> **Deployment note / known limitation:** because approval is now required and
> the PM approval button is deferred, submitted estimates sit in `pending` with
> no in-app way to approve them until the follow-up PM surface ships. The
> decision endpoint exists and is exercised by tests; approval can be driven via
> the API in the meantime. This is an accepted, explicit interim state.

## Data model

`auth-api/src/models/Task.js` — extend the assignee subdocument:

```js
assignees: [{
  user,                                  // unchanged
  sharePct,                              // unchanged (PM work distribution)
  estimatedHours: { type: Number, default: null },  // APPROVED value; null = none approved
  pendingValue:  { type: Number, default: 0 },      // request as entered
  pendingUnit:   { type: String, enum: ['hours','days','weeks'], default: 'hours' },
  pendingHours:  { type: Number, default: null },   // rounded hours of request; null = no open request
  pendingReason: { type: String, default: '' },     // optional
}]
```

Derived state (not stored):

- An assignee has a **pending request** iff `pendingHours != null`.
- Rollup is unchanged from 2026-06-18: `allEstimatesIn` /
  `sumEstimatedHours` key off `estimatedHours != null`, so **only approved**
  estimates roll into `task.estimatedHours` and the auto due date. A submitted
  (pending) request does **not** affect totals until approved.

## Server (`auth-api/src/routes/tasks.js`)

### Employee submits a request — `PATCH /tasks/:id/my-estimate` (new semantics)
Body `{ value, unit, reason? }` (`unit ∈ hours|days|weeks`).

- Auth: requester must be an assignee of the task; 403 otherwise.
- Writes `pendingValue`, `pendingUnit`, `pendingHours = round(toHours(value,unit))`,
  `pendingReason` on the caller's assignee subdoc.
- Does **not** touch `estimatedHours`, `task.estimatedHours`, or the due date.
- Calling again overwrites the open request (re-request / edit before decision).

### PM decides — `PATCH /tasks/:id/my-estimate/decision` (new route)
Body `{ userId, decision }` (`decision ∈ approve|reject`).

- Auth: `canEditProject(req.user, project)`; the decider may not be the
  requesting assignee (can't approve your own).
- 400 if that assignee has no pending request (`pendingHours == null`).
- **approve**: `estimatedHours = pendingHours`; clear pending fields
  (`pendingHours = null`, `pendingValue = 0`, `pendingReason = ''`); recompute
  rollup — if `allEstimatesIn`, `task.estimatedHours = sum` and, when no manual
  `dueDate`, `dueDate = maxAssigneeDueDate(task)` (mirrors current finalize
  logic); else `task.estimatedHours = 0`.
- **reject**: clear pending fields only (silent reset); `estimatedHours`
  unchanged.

### My Tasks list — `GET /tasks/mine`
Add to each row, from the caller's assignee subdoc:

- `myPendingValue`, `myPendingUnit`, `myPendingHours`, `myPendingReason`
- `myEstimateStatus` = `myPendingHours != null ? 'pending' : 'none'` (derived
  convenience for the client)

Existing `myEstimatedHours` (approved), `myDue`, `estimatesPending`,
`submittedCount`, `assigneeCount` are unchanged. Note `estimatesPending` /
`submittedCount` now reflect *approved* estimates (they already key on
`estimatedHours`), which is the intended meaning.

## Web

### `pmApi.ts`
- `setMyEstimate(id, value, unit, reason?)` — include optional `reason` in body.
- Add `decideMyEstimate(id, userId, decision)` →
  `PATCH /tasks/:id/my-estimate/decision`.
- Extend `Task` with `myPendingValue`, `myPendingUnit`, `myPendingHours`,
  `myPendingReason`, `myEstimateStatus`.

### `MyTasks.tsx`
- Delete the `ProposeEstimate` and `MyEstimate` components and the dead
  `proposeEstimate` propose path / import.
- New compact estimate cell:
  - Line 1: `Approved: {myEstimatedHours}h` or `No approved estimate yet`.
  - Line 2 (only if pending): `⏳ Pending: {myPendingValue} {myPendingUnit}
    ({myPendingHours}h)`, with `myPendingReason` shown as a `title` tooltip.
  - Keep the rollup sub-line: `Total: {estimatedHours}h` or
    `Waiting on N of M teammates`.
  - One button → opens `EstimateRequestModal`. Label: `Submit estimate` when
    `myEstimatedHours == null && myPendingHours == null`, else
    `Request estimate change`.
- Extract the cell's display derivation into a small pure helper (e.g.
  `estimateCellState(task)` in a new `web/src/pm/estimateRequest.ts`) so it is
  unit-testable without rendering.

### `EstimateRequestModal` (new component, `web/src/pm/EstimateRequestModal.tsx`)
- Small centered modal over a dimmed overlay (new minimal CSS: `.modal-overlay`
  + reuse `ts-card` for the panel; buttons use existing `btn btn-primary` /
  `link-btn`).
- Fields: number input (revised hours), unit `<select>` (hours/days/weeks),
  optional reason `<textarea>`. Pre-fill the number/unit from the current
  pending request if any, else from the approved value, else blank/hours.
- Actions: Submit (calls `setMyEstimate(id, value, unit, reason)` then closes &
  reloads) and Cancel. Close on overlay click / Esc.

The extension / "Request more time" deadline workflow is **untouched**.

## Testing

- `auth-api/test/routes.test.js`:
  - Rewrite the `/my-estimate` test to assert **request** semantics: submitting
    sets the pending fields and leaves `estimatedHours` / `task.estimatedHours`
    untouched; non-assignee → 403.
  - New decision tests: approve sets the assignee's `estimatedHours` and, once
    all assignees are approved, finalizes `task.estimatedHours` (sum) +
    `dueDate`; reject clears the pending request and leaves `estimatedHours`
    unchanged; 400 when no pending request; non-PM → 403; proposer approving own
    request → 403.
  - Update the `/tasks/mine` row test: after a submit, `myEstimatedHours` is
    `null`, `myEstimateStatus === 'pending'`, `myPendingHours` set; after
    approval, `myEstimatedHours` set and `myEstimateStatus === 'none'`.
- `web/src/pm/estimateRequest.test.ts` (new): unit-test `estimateCellState`
  across none / pending / approved / approved-with-new-pending cases and the
  button label.
- `estimate.js` and `assigneeEstimates.js` helper tests are unaffected (those
  helpers don't change) and must stay green.

## Out of scope

- PM approval **web UI** (the decision endpoint ships and is testable; the PM
  button/surface is a follow-up).
- Deadline / extension ("Request more time") workflow.
- Timesheet editability rules.
