# Multiple Assignees + Workload Distribution — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Scope:** Allow a task to be assigned to multiple project members, each with a percentage share of the effort ("workload distribution"). PM-driven. This is its own sub-project; the Projects task-tools cycle (search/filter/bulk/pagination/click-to-open) is deferred to immediately after.

## Goal

Replace the single `Task.assignee` with a team of assignees, each carrying a `sharePct` of the task's estimated effort. PMs manage the team and shares from the project view; each member sees their own share (and proportional planned hours) in the PM task table, in My Tasks, and injected into their weekly timesheet.

## Context: current single-assignee wiring (blast radius)

`task.assignee` (a single `ObjectId`) is referenced across:

- **Model:** `auth-api/src/models/Task.js` (`assignee`)
- **`tasks.js`:** `GET /mine` (`Task.find({ assignee })`), `POST /:id/claim`, `PATCH /:id/progress` + `/estimate` + `/extension` (all via `canLogProgress`), `PATCH /:id` (set `assignee`, member check, `hasActiveTask` → auto-offer)
- **`projects.js`:** `POST /:id/tasks` (createTask: `assignee`, busy → auto-offer), `GET /:id` (populate `assignee`)
- **`timesheets.js`:** injects tasks where `assignee == userId` into the employee's week; `PUT` allows rows for `Task.find({ assignee })`
- **`authz.js`:** `canLogProgress` = `task.assignee === user`
- **`assignment.js`:** `hasActiveTask` = `Task.exists({ assignee, status≠done })`
- **`assignmentOffers.js`:** accept → set `task.assignee`
- **`claimRequests.js`:** approve → set `task.assignee` (409 if already assigned)
- **`marketplace.js`:** lists tasks with `assignee: null`
- **`admin.js`:** assignee handling on user lifecycle
- **Frontend:** `web/src/pm/pmApi.ts` (`Task`/`TaskDetail` types), `web/src/pm/Projects.tsx` (assignee select/display/createTask)

## Data model (`Task.js`)

Replace `assignee: { type: ObjectId, ref: 'User', default: null }` with:

```js
assignees: {
  type: [new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      sharePct: { type: Number, default: 0, min: 0, max: 100 },
    },
    { _id: false },
  )],
  default: [],
}
```

Invariant: across `assignees`, `sharePct` sums to 100 (enforced by normalizing on every write). An empty `assignees` array means unassigned.

### Migration

One-time script `auth-api/scripts/migrate-assignees.js`: for every task that still has a legacy `assignee`, set `assignees: [{ user: <assignee>, sharePct: 100 }]` and `$unset` the old field. Idempotent (skips tasks that already have `assignees`). Run manually once against the local DB; documented in the plan.

## Shares helper (pure, unit-tested)

`auth-api/src/services/workload.js` and a TS mirror `web/src/pm/workload.ts` (the UI share editor needs the same math). Both get `node:test` unit tests.

```
equalShares(n: number): number[]
  // n integer pcts summing to exactly 100. Remainder goes to the first entries.
  // equalShares(1)=[100]; equalShares(2)=[50,50]; equalShares(3)=[34,33,33]; equalShares(0)=[]

normalizeShares(shares: number[]): number[]
  // clamp each to [0,100], then rebalance so the total is exactly 100 (proportional;
  // if all zero, fall back to equalShares(length)). Empty -> [].

assigneeHours(estimatedHours: number, sharePct: number): number
  // estimatedHours * sharePct / 100, rounded to 1 decimal. Guards NaN/negatives -> 0.
```

## Single → multi adaptation rules

- **`authz.canLogProgress(user, task)`** → `Array.isArray(task.assignees) && task.assignees.some(a => String(a.user) === userId(user))`.
- **`assignment.hasActiveTask(userId)`** → `Task.exists({ 'assignees.user': userId, status: { $ne: 'done' } })`.
- **`timesheets.js` GET injection** → query `Task.find({ 'assignees.user': userId, status: { $ne: 'done' } })`; for the injected row, **Planned hours = `assigneeHours(task.estimatedHours, myShare)`** where `myShare` is this user's `sharePct` on the task. `PUT` allowed-task query → `Task.find({ 'assignees.user': userId })`. (This is where employees see their workload split.)
- **`marketplace.js`** → `assignees: { $size: 0 }` (was `assignee: null`).
- **`claimRequests.js` approve** → 409 if `task.assignees.length > 0`; else `task.assignees = [{ user: claim.userId, sharePct: 100 }]`.
- **`assignmentOffers.js` accept** → 409 if `task.assignees.length > 0` or `status==='done'`; else `task.assignees = [{ user: offer.userId, sharePct: 100 }]`.
- **`admin.js`** → any `assignee` filter/update switches to the `assignees` array shape.
- **`GET /tasks/mine` & `GET /projects/:id`** → populate `assignees.user` (`displayName email`); responses return `assignees: [{ user: {…}, sharePct }]`.

## PM assignment (new capability)

- **`createTask` (`POST /projects/:id/tasks`)**: accepts optional `assignees: [userId]`. Validates each is a project member; applies `equalShares`. (Back-compat: also accepts a single `assignee` id and treats it as `[assignee]`.)
- **New `PATCH /tasks/:id/assignees`** (guarded by `canEditProject`): body `{ assignees: [{ user, sharePct }] }` or `{ assignees: [userId] }`. Validates every `user` is a project member; if `sharePct` omitted/invalid, applies `equalShares`; otherwise `normalizeShares`. Sets `task.assignees` directly.

### Decision: assignment is direct (no auto-offer-on-busy)

PM team assignment is a deliberate action, so the new assignment path **does not** create `AssignmentOffer`s when a chosen member already has an active task — it assigns directly. The existing **auto-offer-on-busy branches are removed** from `createTask` and the task `PATCH`. The `AssignmentOffer` model and its accept route **remain** and still work for any self-service flow on unassigned tasks, but are no longer auto-created on PM assign (so the offer mechanism becomes effectively dormant unless reintroduced in a later cycle). The `ClaimRequest` flow is unchanged except for the new `assignees` shape. *(If preserving auto-offers is preferred, the alternative is to extend offers with a `sharePct` and add accepted users into the team — more code; not chosen here.)*

## Frontend

- **`Projects.tsx` → `ProjectDetail` task table:**
  - **Assignee column** renders member chips, each `Name · NN%`; unassigned shows "Unassigned".
  - **Add-task form**: multi-select of project members (replaces the single `<select>`); equal shares on create.
  - **Assignees editor** (small popover/inline panel per task): add/remove members (project members only), edit each `sharePct` with a live total and an "equal split" button (uses `workload.ts`); Save calls `setTaskAssignees`. Planned-hours per member shown as `assigneeHours(estimate, share)`.
- **`MyTasks.tsx`:** for each task show the user's **own** share and planned hours (e.g. "Your share 33% · 13h") alongside the existing estimate/actual columns.
- **`pmApi.ts`:** `Task`/`TaskDetail` gain `assignees: { user: Person | string; sharePct: number }[]`; add `setTaskAssignees(taskId, assignees)` → `PATCH /tasks/:id/assignees`. `createTask` accepts `assignees`.

## Testing

`workload.js` and `workload.ts` pure helpers get `node:test` unit tests (equalShares/normalizeShares/assigneeHours edge cases). All routes, model, migration, and UI verified via `node --check` / `npx tsc -b` / `npm run build` + manual E2E (project testing policy).

## Out of scope (next cycle)

The Projects task-tools cycle — search, multi-select filters (Assignee/Status/Due), checkbox bulk-select + bulk actions (CSV + Excel export, close, change-status/reassign/delete), client-side pagination (10/page), click-to-open project cards, project-list deadline colors. (Already brainstormed; spec to follow after this lands. Note: its **bulk reassign** will use the `assignees` model from this cycle.)

## Self-review notes

- **Placeholders:** none — every touchpoint and helper signature is concrete.
- **Consistency:** the `assignees: [{ user, sharePct }]` shape and the `'assignees.user'` query form are used uniformly across model, routes, timesheet injection, and frontend types. `equalShares`/`normalizeShares`/`assigneeHours` are defined once per side and mirrored.
- **Scope:** single feature; large but cohesive. Self-service flows kept single-fill per the chosen "PM-only multi-assign" option. The one consequential decision (drop auto-offer-on-busy) is called out explicitly above.
- **Ambiguity:** share rounding fixed (integers summing to 100, remainder to first entries); unassigned = empty array; claim/offer act only on empty-assignee tasks.
