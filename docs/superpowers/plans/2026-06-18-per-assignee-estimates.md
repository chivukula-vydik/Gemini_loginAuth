# Per-Assignee Hour Estimates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each assignee submit their own hour estimate for their share of a task; the task's total estimate is the sum once everyone has submitted, and each assignee's deadline is derived from their own hours.

**Architecture:** Keep the PM's `sharePct` split. Add a per-assignee `estimatedHours` (null until submitted). Pure helper modules compute the rollup (all-in? total?) and per-assignee deadlines; routes call them. The task's `estimatedHours` and auto `dueDate` are recomputed whenever an assignee submits. Old task-level estimate-proposal endpoints are blocked for tasks that have assignees.

**Tech Stack:** Node + Express + Mongoose (auth-api), React + TypeScript + Vite (web). Tests are `node --test` (no framework). Backend tests live in `auth-api/test/*.test.js`; web unit tests live beside source as `*.test.ts` and run via `node --test "src/pm/**/*.test.ts"`.

## Global Constraints

- Web unit-test modules must stay **import-light**: only `import type` from sibling modules (value imports of extensionless `./x` break `node --test`). Mirror `web/src/timesheet/cellLock.ts`.
- Hours conversion uses the existing `toHours(value, unit)` and `endDateFrom(startISO, hours)` from `auth-api/src/services/estimate.js` (8h/day, skips weekends).
- `estimatedHours` on an assignee: `null` = not submitted; a number (including `0`) = submitted.
- Conventional commit messages (`feat:` / `test:` / `refactor:`), each ending with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Run backend tests from `auth-api/`, web tests from `web/`.

---

### Task 1: Rollup helpers (backend pure functions)

**Files:**
- Create: `auth-api/src/services/assigneeEstimates.js`
- Test: `auth-api/test/assigneeEstimates.test.js`

**Interfaces:**
- Produces:
  - `allEstimatesIn(assignees) -> boolean` — true when `assignees.length > 0` and every assignee has a non-null `estimatedHours`.
  - `sumEstimatedHours(assignees) -> number` — sum of submitted `estimatedHours` (treats null as 0).
  - `submittedCount(assignees) -> number` — count of assignees with non-null `estimatedHours`.

- [ ] **Step 1: Write the failing test**

```js
// auth-api/test/assigneeEstimates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allEstimatesIn, sumEstimatedHours, submittedCount } from '../src/services/assigneeEstimates.js';

test('allEstimatesIn: false when empty, false with a null, true when all submitted', () => {
  assert.equal(allEstimatesIn([]), false);
  assert.equal(allEstimatesIn([{ estimatedHours: 4 }, { estimatedHours: null }]), false);
  assert.equal(allEstimatesIn([{ estimatedHours: 4 }, { estimatedHours: 0 }]), true);
});

test('sumEstimatedHours: adds submitted, treats null as 0', () => {
  assert.equal(sumEstimatedHours([{ estimatedHours: 4 }, { estimatedHours: null }, { estimatedHours: 6 }]), 10);
});

test('submittedCount: counts non-null estimates', () => {
  assert.equal(submittedCount([{ estimatedHours: 0 }, { estimatedHours: null }, { estimatedHours: 6 }]), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assigneeEstimates.test.js`
Expected: FAIL — `Cannot find module '../src/services/assigneeEstimates.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// auth-api/src/services/assigneeEstimates.js
export function submittedCount(assignees) {
  return (assignees || []).filter((a) => a && a.estimatedHours != null).length;
}

export function allEstimatesIn(assignees) {
  const list = assignees || [];
  return list.length > 0 && list.every((a) => a && a.estimatedHours != null);
}

export function sumEstimatedHours(assignees) {
  return (assignees || []).reduce((sum, a) => sum + (a && a.estimatedHours != null ? Number(a.estimatedHours) : 0), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assigneeEstimates.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/assigneeEstimates.js auth-api/test/assigneeEstimates.test.js
git commit -m "feat: assignee estimate rollup helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Per-assignee deadline helpers (estimate.js)

**Files:**
- Modify: `auth-api/src/services/estimate.js` (add exports after `endDateFrom`, ~line 60)
- Test: `auth-api/test/estimate.test.js` (append tests)

**Interfaces:**
- Consumes: `endDateFrom(startISO, hours)`, `toISODate` (already in `estimate.js` — `toISODate` is currently module-private; export it).
- Produces:
  - `assigneeDueDate(task, assignee) -> string|null` — `endDateFrom(toISODate(task.startDate), assignee.estimatedHours)`; null if no `startDate` or `estimatedHours == null`.
  - `maxAssigneeDueDate(task) -> string|null` — the latest `assigneeDueDate` across `task.assignees`; null if none computable.

- [ ] **Step 1: Write the failing test**

```js
// append to auth-api/test/estimate.test.js
import { assigneeDueDate, maxAssigneeDueDate } from '../src/services/estimate.js';

test('assigneeDueDate: start date + own hours (skips weekends)', () => {
  // Mon 2026-06-15, 16h = 2 working days -> Tue 2026-06-16
  assert.equal(assigneeDueDate({ startDate: '2026-06-15' }, { estimatedHours: 16 }), '2026-06-16');
});

test('assigneeDueDate: null when no start date or no estimate', () => {
  assert.equal(assigneeDueDate({ startDate: null }, { estimatedHours: 16 }), null);
  assert.equal(assigneeDueDate({ startDate: '2026-06-15' }, { estimatedHours: null }), null);
});

test('maxAssigneeDueDate: latest deadline across assignees', () => {
  const task = { startDate: '2026-06-15', assignees: [{ estimatedHours: 8 }, { estimatedHours: 40 }] };
  // 8h -> Mon 06-15; 40h (5 days) -> Fri 06-19; max = 06-19
  assert.equal(maxAssigneeDueDate(task), '2026-06-19');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/estimate.test.js`
Expected: FAIL — `assigneeDueDate is not a function` (or import error)

- [ ] **Step 3: Write minimal implementation**

In `auth-api/src/services/estimate.js`, change `function toISODate` to `export function toISODate`, then append:

```js
export function assigneeDueDate(task, assignee) {
  const startISO = toISODate(task && task.startDate);
  if (!startISO || !assignee || assignee.estimatedHours == null) return null;
  return endDateFrom(startISO, Number(assignee.estimatedHours));
}

export function maxAssigneeDueDate(task) {
  const dates = ((task && task.assignees) || [])
    .map((a) => assigneeDueDate(task, a))
    .filter(Boolean);
  return dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/estimate.test.js`
Expected: PASS (existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/estimate.js auth-api/test/estimate.test.js
git commit -m "feat: per-assignee and max-assignee due date helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Assignee merge helper (preserve submitted hours)

**Files:**
- Modify: `auth-api/src/services/assigneeEstimates.js`
- Test: `auth-api/test/assigneeEstimates.test.js` (append)

**Interfaces:**
- Produces: `mergeAssignees(prevAssignees, userIds, shares) -> [{ user, sharePct, estimatedHours }]`
  — builds the new assignee list from `userIds`+`shares`, carrying over `estimatedHours` from `prevAssignees` matched by `user` id; new users get `estimatedHours: null`.

- [ ] **Step 1: Write the failing test**

```js
// append to auth-api/test/assigneeEstimates.test.js
import { mergeAssignees } from '../src/services/assigneeEstimates.js';

test('mergeAssignees: keeps existing hours by user id, new users get null', () => {
  const prev = [{ user: 'u1', sharePct: 50, estimatedHours: 12 }, { user: 'u2', sharePct: 50, estimatedHours: 8 }];
  const next = mergeAssignees(prev, ['u1', 'u3'], [60, 40]);
  assert.deepEqual(next, [
    { user: 'u1', sharePct: 60, estimatedHours: 12 },
    { user: 'u3', sharePct: 40, estimatedHours: null },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assigneeEstimates.test.js`
Expected: FAIL — `mergeAssignees is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `auth-api/src/services/assigneeEstimates.js`:

```js
export function mergeAssignees(prevAssignees, userIds, shares) {
  const prevByUser = new Map((prevAssignees || []).map((a) => [String(a.user), a]));
  return userIds.map((user, i) => {
    const prev = prevByUser.get(String(user));
    return { user, sharePct: shares[i], estimatedHours: prev ? prev.estimatedHours ?? null : null };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/assigneeEstimates.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/assigneeEstimates.js auth-api/test/assigneeEstimates.test.js
git commit -m "feat: mergeAssignees preserves submitted hours by user

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Add `estimatedHours` to the assignee schema

**Files:**
- Modify: `auth-api/src/models/Task.js:12-21` (assignee subdocument)

**Interfaces:**
- Produces: persisted `assignees[].estimatedHours` (Number, default null).

No standalone unit test (schema change is exercised by Tasks 5–7 route tests).

- [ ] **Step 1: Edit the schema**

In `auth-api/src/models/Task.js`, change the assignee subdocument to:

```js
  assignees: {
    type: [new mongoose.Schema(
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        sharePct: { type: Number, default: 0, min: 0, max: 100 },
        estimatedHours: { type: Number, default: null },
      },
      { _id: false },
    )],
    default: [],
  },
```

- [ ] **Step 2: Verify the app still boots / tests still pass**

Run: `node --test`
Expected: PASS (full existing suite, no regressions)

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Task.js
git commit -m "feat: add per-assignee estimatedHours to Task schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire `mergeAssignees` into the `/assignees` route

**Files:**
- Modify: `auth-api/src/routes/tasks.js:13` (import), `:169-187` (assignees handler)
- Test: `auth-api/test/routes.test.js` (append a case)

**Interfaces:**
- Consumes: `mergeAssignees` (Task 3).
- Produces: `PATCH /tasks/:id/assignees` preserves an existing assignee's `estimatedHours` when shares are re-saved.

- [ ] **Step 1: Write the failing test**

Add to `auth-api/test/routes.test.js` (follow the existing supertest/login pattern in that file — reuse its helper to create a project, a task, and a PM token). The assertion:

```js
test('re-saving assignees preserves an already-submitted estimate', async () => {
  // ...create project with members u1,u2; create task; PM sets assignees [u1:50,u2:50]
  // u1 submits 12h via PATCH /tasks/:id/my-estimate
  // PM re-saves assignees [u1:60,u2:40]
  const after = await getTask(taskId); // GET helper used elsewhere in this file
  const u1 = after.assignees.find((a) => String(a.user) === u1Id);
  assert.equal(u1.estimatedHours, 12);
});
```

(Use the same construction helpers already present in `routes.test.js`; if `/my-estimate` is not yet wired, set the hours directly via the model in the test setup.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/routes.test.js`
Expected: FAIL — `u1.estimatedHours` is `null` (shares re-save dropped it)

- [ ] **Step 3: Implement**

In `auth-api/src/routes/tasks.js` line 13, add `mergeAssignees` to the workload-services import is wrong module — import from the new service instead:

```js
import { mergeAssignees, allEstimatesIn, sumEstimatedHours } from '../services/assigneeEstimates.js';
```

Replace line 184 (`task.assignees = userIds.map(...)`) with:

```js
    task.assignees = mergeAssignees(task.assignees, userIds, shares);
    if (allEstimatesIn(task.assignees)) task.estimatedHours = sumEstimatedHours(task.assignees);
    else task.estimatedHours = 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/routes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/tasks.js auth-api/test/routes.test.js
git commit -m "feat: preserve submitted estimates when PM re-saves assignees

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `PATCH /tasks/:id/my-estimate` endpoint

**Files:**
- Modify: `auth-api/src/routes/tasks.js` (add handler near the estimate handlers, after `:88`)
- Test: `auth-api/test/routes.test.js` (append)

**Interfaces:**
- Consumes: `toHours`, `maxAssigneeDueDate` (estimate.js); `allEstimatesIn`, `sumEstimatedHours` (assigneeEstimates.js).
- Produces: `PATCH /tasks/:id/my-estimate` body `{ value, unit }`. Requester must be an assignee (else 403). Sets their `estimatedHours`; when all submitted, sets `task.estimatedHours = sum` and (if no manual `dueDate`) `task.dueDate = maxAssigneeDueDate(task)`.

- [ ] **Step 1: Write the failing test**

```js
test('my-estimate: assignee submits hours; total + deadline finalize when all in', async () => {
  // task with startDate 2026-06-15, assignees u1 & u2 (no estimates yet)
  // u1 submits { value: 8, unit: 'hours' } -> task.estimatedHours still pending (0)
  // u2 submits { value: 40, unit: 'hours' } -> task.estimatedHours == 48, dueDate == 2026-06-19
  // a non-assignee submitting -> 403
});
```

(Wire the supertest calls using the file's existing helpers/tokens.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/routes.test.js`
Expected: FAIL — 404/route not found for `/my-estimate`

- [ ] **Step 3: Implement**

In `auth-api/src/routes/tasks.js`, add after the `/estimate` handler (line 88). Ensure `maxAssigneeDueDate` is imported from `estimate.js` (extend the line 11 import):

```js
  router.patch('/:id/my-estimate', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const mine = task.assignees.find((a) => String(a.user) === String(req.user.sub));
    if (!mine) return res.status(403).json({ error: 'not an assignee of this task' });
    const unit = ['hours', 'days', 'weeks'].includes(req.body?.unit) ? req.body.unit : 'hours';
    const value = Math.max(0, Number(req.body?.value) || 0);
    mine.estimatedHours = Math.round(toHours(value, unit));
    if (allEstimatesIn(task.assignees)) {
      task.estimatedHours = sumEstimatedHours(task.assignees);
      if (!task.dueDate) task.dueDate = maxAssigneeDueDate(task);
    } else {
      task.estimatedHours = 0;
    }
    await task.save();
    res.json(task);
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/routes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/tasks.js auth-api/test/routes.test.js
git commit -m "feat: per-assignee estimate submission endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Block old `/estimate` path for assigned tasks; update My Tasks payload

**Files:**
- Modify: `auth-api/src/routes/tasks.js:76-88` (`/estimate` guard), `:19-41` (`/mine` payload)
- Test: `auth-api/test/routes.test.js` (append)

**Interfaces:**
- Consumes: `assigneeDueDate` (estimate.js); `allEstimatesIn`, `submittedCount` (assigneeEstimates.js).
- Produces: `/tasks/:id/estimate` returns 409 when the task has assignees. `/tasks/mine` rows add: `myEstimatedHours` (number|null), `myDue` (string|null), `estimatesPending` (boolean), `submittedCount` (number), `assigneeCount` (number). `myPlannedHours` is removed.

- [ ] **Step 1: Write the failing test**

```js
test('estimate proposal is blocked for tasks that have assignees', async () => {
  // task with at least one assignee -> PATCH /tasks/:id/estimate -> 409
});

test('my-tasks row exposes my estimate, my deadline, and pending state', async () => {
  // task startDate 2026-06-15; u1 assignee submitted 8h, u2 not yet
  // GET /tasks/mine as u1 -> row.myEstimatedHours == 8, row.myDue == '2026-06-15',
  //   row.estimatesPending == true, row.submittedCount == 1, row.assigneeCount == 2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/routes.test.js`
Expected: FAIL — estimate returns 200; `myDue` undefined

- [ ] **Step 3: Implement**

Add the import (line 11 region): `assigneeDueDate` from `estimate.js`; `submittedCount` from `assigneeEstimates.js`.

In `/estimate` (after line 79's auth check), add:

```js
    if (task.assignees.length > 0) return res.status(409).json({ error: 'use per-assignee estimates for assigned tasks' });
```

Replace the `/mine` row builder (lines 29-39) with:

```js
      const mine = (obj.assignees || []).find((a) => String(a.user?._id || a.user) === uid);
      return {
        ...obj,
        actualMinutes: map.get(String(t._id)) || 0,
        effectiveDueDate: due.date,
        dueDateAuto: due.auto,
        dueProposalDate: proposedDueDate(obj),
        mySharePct: mine ? mine.sharePct : 0,
        myEstimatedHours: mine ? mine.estimatedHours ?? null : null,
        myDue: mine ? assigneeDueDate(obj, mine) : null,
        estimatesPending: !allEstimatesIn(obj.assignees),
        submittedCount: submittedCount(obj.assignees),
        assigneeCount: (obj.assignees || []).length,
      };
```

Remove the now-unused `assigneeHours` import on line 13 (keep `equalShares, normalizeShares`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/routes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/tasks.js auth-api/test/routes.test.js
git commit -m "feat: block estimate proposal for assigned tasks; expose per-assignee fields in My Tasks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Web estimate-summary helper

**Files:**
- Create: `web/src/pm/assigneeEstimate.ts`
- Test: `web/src/pm/assigneeEstimate.test.ts`

**Interfaces:**
- Produces: `estimateSummary(assignees) -> { submitted: number; total: number; count: number; allIn: boolean }`
  where `assignees: { estimatedHours?: number | null }[]`.

Keep this module **import-light** (type-only imports) so `node --test` can run it.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/pm/assigneeEstimate.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSummary } from './assigneeEstimate.ts';

test('estimateSummary: counts submitted, sums hours, allIn only when complete', () => {
  assert.deepEqual(
    estimateSummary([{ estimatedHours: 8 }, { estimatedHours: null }]),
    { submitted: 1, total: 8, count: 2, allIn: false },
  );
  assert.deepEqual(
    estimateSummary([{ estimatedHours: 8 }, { estimatedHours: 0 }]),
    { submitted: 2, total: 8, count: 2, allIn: true },
  );
  assert.deepEqual(estimateSummary([]), { submitted: 0, total: 0, count: 0, allIn: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `node --test src/pm/assigneeEstimate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/pm/assigneeEstimate.ts
type A = { estimatedHours?: number | null };

export function estimateSummary(assignees: A[]) {
  const list = assignees || [];
  const submitted = list.filter((a) => a && a.estimatedHours != null).length;
  const total = list.reduce((s, a) => s + (a && a.estimatedHours != null ? Number(a.estimatedHours) : 0), 0);
  return { submitted, total, count: list.length, allIn: list.length > 0 && submitted === list.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/pm/assigneeEstimate.test.ts`
Expected: PASS (1 test, 3 assertions)

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/assigneeEstimate.ts web/src/pm/assigneeEstimate.test.ts
git commit -m "feat: web estimate-summary helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: pmApi types + `setMyEstimate`

**Files:**
- Modify: `web/src/pm/pmApi.ts:30` (Assignee type), `:31-52` (Task type), add `setMyEstimate` near line 102.

**Interfaces:**
- Consumes: `authed`, `EstimateUnit` (already in pmApi.ts).
- Produces:
  - `Assignee` gains `estimatedHours?: number | null`.
  - `Task` gains `myEstimatedHours?: number | null; myDue?: string | null; estimatesPending?: boolean; submittedCount?: number; assigneeCount?: number;` and drops `myPlannedHours`.
  - `setMyEstimate(taskId, value, unit) -> Promise<Task>`.

- [ ] **Step 1: Edit types**

In `web/src/pm/pmApi.ts`:
- Line 30: `export type Assignee = { user: Person | string; sharePct: number; estimatedHours?: number | null };`
- In `Task` (lines 31-52): remove `myPlannedHours?: number;` and add:
  ```ts
  myEstimatedHours?: number | null;
  myDue?: string | null;
  estimatesPending?: boolean;
  submittedCount?: number;
  assigneeCount?: number;
  ```

- [ ] **Step 2: Add the API call**

After line 100 (`updateTask`), add:

```ts
export const setMyEstimate = (id: string, value: number, unit: EstimateUnit) =>
  authed(`/tasks/${id}/my-estimate`, 'PATCH', { value, unit }) as Promise<Task>;
```

- [ ] **Step 3: Verify it type-checks**

Run (from `web/`): `npx tsc -b`
Expected: errors ONLY in files that referenced `myPlannedHours` (fixed in Task 10). If `MyTasks.tsx` still references it, that's expected until Task 10 — note it and proceed.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/pmApi.ts
git commit -m "feat: pmApi per-assignee estimate types and setMyEstimate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: My Tasks UI — submit your estimate, show your deadline + pending

**Files:**
- Modify: `web/src/pm/MyTasks.tsx`

**Interfaces:**
- Consumes: `setMyEstimate` (Task 9), `myEstimatedHours`/`myDue`/`estimatesPending`/`submittedCount`/`assigneeCount` on each task row, `EstimateUnit`.

- [ ] **Step 1: Read the current file**

Read `web/src/pm/MyTasks.tsx` fully. Identify where `myPlannedHours` is used and where each task row renders.

- [ ] **Step 2: Replace planned-hours with the estimate control**

For each task row:
- Add a value input + unit `<select>` (hours/days/weeks) plus a "Submit"/"Update" button calling `setMyEstimate(task._id, value, unit)` then reloading the list (reuse the existing reload pattern in the file).
- Pre-fill the input from `task.myEstimatedHours` when not null.
- When `task.myEstimatedHours != null`, show "Your deadline: {task.myDue ?? '—'}".
- When `task.estimatesPending`, show "Waiting on {assigneeCount - submittedCount} of {assigneeCount} teammates" and render the task total as "—"; otherwise show `task.estimatedHours` h.
- Remove every reference to `myPlannedHours`.

- [ ] **Step 3: Type-check + run dev to verify**

Run (from `web/`): `npx tsc -b`
Expected: PASS (no remaining `myPlannedHours` references).
Manually: `npm run dev`, open My Tasks, submit an estimate, confirm the deadline appears and pending text updates.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/MyTasks.tsx
git commit -m "feat: My Tasks estimate submission, personal deadline, pending state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Projects task table — show hours / pending on chips + total

**Files:**
- Modify: `web/src/pm/Projects.tsx` and/or `web/src/pm/ProjectTasks.tsx` (whichever renders the task rows + assignee chips), `web/src/pm/AssigneesEditor.tsx` (optional read-only hours next to %).

**Interfaces:**
- Consumes: `estimateSummary` (Task 8); `Assignee.estimatedHours`.

- [ ] **Step 1: Locate the task table + chip rendering**

Grep for the assignee chip render and the estimate/total column in `Projects.tsx` / `ProjectTasks.tsx`.

- [ ] **Step 2: Show per-assignee hours and the rollup**

- Each assignee chip: append the person's `estimatedHours` (e.g. "Alice · 12h") or "pending" when null.
- Task total estimate cell: use `estimateSummary(task.assignees)` — show `total`h when `allIn`, else `{submitted} of {count} submitted`.
- In `AssigneesEditor.tsx` (optional): next to each `sharePct` input, show the assignee's submitted hours as read-only context ("12h" / "pending"). Do not make it editable here.

- [ ] **Step 3: Type-check + verify**

Run (from `web/`): `npx tsc -b`
Expected: PASS.
Manually: open a project with a multi-assignee task; confirm chips show hours/pending and the total shows the sum or "X of N submitted".

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/Projects.tsx web/src/pm/ProjectTasks.tsx web/src/pm/AssigneesEditor.tsx
git commit -m "feat: show per-assignee hours and rollup state in project task table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run (from `auth-api/`): `node --test`
Expected: PASS (all tests, including new Tasks 1–7).

- [ ] **Step 2: Web unit suite**

Run (from `web/`): `npm test`
Expected: new helper tests PASS. (Pre-existing `taskExport.test.ts` failure from an unrelated extensionless import may remain — confirm it is the ONLY failure and is unchanged by this work.)

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc -b`
Expected: PASS, no `myPlannedHours` references remain.

- [ ] **Step 4: Commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "test: regression pass for per-assignee estimates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Model (`estimatedHours` per assignee, null=unsubmitted) → Task 4.
- Rollup / all-in / sum / "X of N" → Tasks 1, 8.
- Submission endpoint (assignee-only, recompute total + deadline) → Task 6.
- Per-assignee deadline = start + own hours; task auto due = max → Task 2 (used in 6, 7).
- Preserve submitted hours when shares re-saved → Tasks 3, 5.
- Retire `/estimate` for assigned tasks → Task 7.
- My Tasks payload + UI (estimate input, your deadline, pending) → Tasks 7, 9, 10.
- Projects chips + total → Task 11.
- Edge cases (add/remove assignee re-pending, 0 vs null, no startDate) → covered by `allEstimatesIn`/`mergeAssignees`/`assigneeDueDate` logic in Tasks 1–3 and exercised in 5–7.

**Placeholder scan:** Task 5/6/7 route tests say "use the file's existing helpers" rather than reproducing the whole supertest harness — this is intentional (the harness already exists in `routes.test.js`); the assertions themselves are concrete. All implementation code blocks are complete.

**Type consistency:** `estimatedHours` (number|null), `allEstimatesIn`/`sumEstimatedHours`/`submittedCount`/`mergeAssignees` (assigneeEstimates.js), `assigneeDueDate`/`maxAssigneeDueDate` (estimate.js), `estimateSummary` (web), `setMyEstimate` (pmApi) — names are consistent across producing/consuming tasks. `myPlannedHours` is removed in Task 7 (server) and Tasks 9–10 (web) together.
