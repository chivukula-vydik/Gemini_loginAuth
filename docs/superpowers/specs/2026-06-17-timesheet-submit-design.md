# Timesheet Submit Workflow — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Scope:** Employee Timesheet "Submit" workflow only. This is the first sub-project decomposed out of a larger feature request (see "Out of scope" below).

## Goal

Let an employee submit a week's timesheet for PM review. After submission the week becomes read-only; a PM reviews submitted timesheets in the existing in-app **Requests** queue and either **approves** (final) or **returns** (reopens for editing). Submission is allowed at any time once the week has started — there is no Friday hard-gate.

## Context: what already exists

- A `Timesheet` is one Mongoose doc per `(userId, weekStart)` with task rows (`id`, `name`, `entries`, `taskId`) and `updatedAt`. It has **no status field today**.
- Locking is currently **date-based** (`auth-api/src/services/timesheetRows.js`, `web/src/timesheet/cellLock.ts`):
  - Past weeks (`weekStart < currentMonday`) are read-only unless an approved `EditRequest` grant exists.
  - In the current week, "today" is editable and future days are locked.
- `EditRequest` (`auth-api/src/models/EditRequest.js`) is a per-`(userId, weekStart, day, projectId)` grant: `pending → approved → used | denied`. PMs/admins approve them in the **Requests** page (`auth-api/src/routes/editRequests.js` → `web/src/pm/Requests.tsx`). The list is **not** PM-scoped — every PM/admin sees all requests.
- A timesheet's rows can map to tasks across **multiple projects** (each with its own `ownerPm`), so a submitted timesheet cannot belong to a single PM. It uses the same shared-review-queue model as edit requests.
- `GET /timesheets/:weekStart` currently returns `{ weekStart, tasks, todayDay, grants, pending, readOnly }`.

## Data model

Add to `timesheetSchema` (`auth-api/src/models/Timesheet.js`):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | `String` enum `['draft','submitted','approved','returned']` | `'draft'` | lifecycle state |
| `submittedAt` | `Date` | `null` | set on submit |
| `reviewedAt` | `Date` | `null` | set on PM approve/return |
| `reviewedBy` | `ObjectId → User` | `null` | PM/admin who reviewed |

`returned` behaves like `draft` for editing purposes but carries a "sent back by PM" message for the employee.

## Lifecycle

```
draft ──submit──▶ submitted ──PM approve──▶ approved
  ▲                    │
  └──── PM return ─────┘   (status → returned; editable again)
```

- **Editable** when `status ∈ {draft, returned}`. **Locked** when `status ∈ {submitted, approved}`.
- The existing per-`(day, projectId)` `EditRequest` grant still punches through the lock even on a submitted/approved week — the "ask PM to reopen one day" flow keeps working unchanged. This is the grant-based unlock path.
- Submit is allowed only when the week has started (`weekStart ≤ currentMonday`) **and** `status ∈ {draft, returned}`.

## Pure helpers + unit tests

Per project testing policy (no automated UI/API tests; pure helpers get `node:test` unit tests — see existing `cellLock.test.ts`, `due.test.ts`, `bar.test.ts`).

New `web/src/timesheet/submit.ts`:

```ts
export type SubmitStatus = 'draft' | 'submitted' | 'approved' | 'returned';

// Can the employee submit this week right now?
export function canSubmit(status: SubmitStatus, weekStart: string, currentMonday: string): boolean;

// Is the whole week locked? Grants are ignored here — grant-based per-cell
// unlock is layered on top by the existing cellLock/computeRowLock logic.
export function weekLocked(status: SubmitStatus, weekStart: string, currentMonday: string): boolean;
```

- `canSubmit`: true when `status ∈ {draft, returned}` and `weekStart <= currentMonday`.
- `weekLocked`: true when `status ∈ {submitted, approved}`. (Date-based read-only for past weeks stays where it is today; this only adds submission-driven locking.)

New `web/src/timesheet/submit.test.ts` covering: submittable draft/returned for started weeks; not submittable for future weeks or submitted/approved status; `weekLocked` true only for submitted/approved.

The backend reuses the same rules. Extract a small JS mirror in `auth-api/src/services/timesheetRows.js` (e.g. `weekLocked(status, weekStart, currentMonday)` / `canSubmit(...)`) so the `PUT` and `submit` routes share one source of truth. Keep the TS and JS copies behavior-identical (the codebase already mirrors logic between `time.ts`/`timesheetRows.js`).

## Backend

All under the existing auth-protected `/timesheets` router (`auth-api/src/routes/timesheets.js`) unless noted.

1. **`POST /timesheets/:weekStart/submit`** (employee, `req.user.sub`):
   - Validate `weekStart` is a valid Monday.
   - Load (or upsert) the doc; reject `409` if `!canSubmit(status, weekStart, currentMonday())`.
   - Set `status:'submitted'`, `submittedAt: new Date()`. Respond `{ ok: true, status, submittedAt }`.

2. **Extend `GET /timesheets/:weekStart`** response with `status`, `submittedAt`, `reviewedAt`. Fold submission into the existing `readOnly`:
   `readOnly = (weekStart < currentMonday() && grants.length === 0) || weekLocked(status, weekStart, currentMonday())`. Grants still keep individual cells editable via `computeRowLock`/`isCellEditable`.

3. **Harden `PUT /timesheets/:weekStart`**: when `weekLocked(status, ...)` is true, the save must not accept edits to non-granted cells. `computeRowLock` currently treats "today" as editable; once submitted, "today" is no longer auto-editable. Pass the submission state into the lock computation so a submitted/approved week only accepts edits to cells covered by approved grants.

4. **PM review surface** (role-guarded `requireRole('pm','admin')`, mirroring `editRequests`):
   - **`GET /timesheets/review?status=submitted`** → list submitted timesheets with `userId` populated (`displayName`, `email`), `weekStart`, `submittedAt`, and a computed **total minutes/hours** for the week. Returns the doc `_id` for action targeting.
   - **`PATCH /timesheets/review/:id`** with `{ decision: 'approve' | 'return' }` → `approve` sets `status:'approved'`; `return` sets `status:'returned'`. Both set `reviewedBy`, `reviewedAt`. Reject if the doc is not currently `submitted`.

   These review routes live in the `/timesheets` router behind the role guard (the employee routes scope to `req.user.sub`; review routes operate by doc `_id`).

## Employee UI

`web/src/timesheet/WeekNav.tsx` and `TimesheetPage.tsx`:

- **Status badge** next to the week label: `Draft` / `Submitted {date}` / `Approved` / `Returned`.
- **Submit week** button beside the grand total. Disabled (with reason via `title`) when `!canSubmit(...)`. Clicking shows a confirm dialog ("Submit this week for review?"); on confirm calls `POST …/submit`, then reloads.
- When `readOnly` due to submission → grid renders read-only using the existing read-only path. `Submitted` shows "Submitted on {date} — awaiting review"; `Approved` shows "Approved on {date}".
- `Returned` → editable, with a banner: "Your PM sent this back — review and resubmit."
- The existing per-day edit-request affordance is unchanged.

`web/src/timesheet/timesheetApi.ts`: add `submitWeek(weekStart)` and extend the `getWeek` return type with `status`/`submittedAt`/`reviewedAt`.

## PM UI

`web/src/pm/Requests.tsx`: add a **"Submitted timesheets"** section above "Timesheet edit requests", same table styling:

| Employee | Week | Total hours | Submitted | Actions |
|----------|------|-------------|-----------|---------|
| name | weekStart | `Hh` | submittedAt | **Approve** / **Return** |

`web/src/pm/pmApi.ts`: add `listSubmittedTimesheets()` and `decideTimesheet(id, 'approve' | 'return')` plus a `SubmittedTimesheet` type. Empty state: "No submitted timesheets."

## Out of scope (deferred to later sub-project cycles)

- Email notifications on submit (in-app review queue only for now).
- Friday hard-gate on submission.
- Effort-in-hours display consistency.
- Deadline color grading in the timesheet grid / project list.
- Click-to-open project cards; PM task search / multi-select filters / bulk actions / pagination.
- Multiple assignees per task + workload distribution.

## Self-review notes

- **Placeholders:** none — every section is concrete.
- **Consistency:** lock rule defined once (`weekLocked`) and reused by GET `readOnly`, PUT hardening, and employee UI. Status enum identical across model, helper, and API types. Review queue follows the existing non-PM-scoped `editRequests` pattern, consistent with timesheets spanning multiple PMs.
- **Scope:** single, focused sub-project; large/unrelated items explicitly deferred.
- **Ambiguity:** "submit anytime / locks after" and "in-app review queue" resolved per user decisions; `returned` distinguished from `draft` for messaging while sharing edit behavior.
