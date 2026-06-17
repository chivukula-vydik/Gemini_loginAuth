# Multiple Assignees + Workload Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace a task's single `assignee` with a team of `assignees`, each holding a `sharePct` of the effort, managed directly by the PM, with each member's share surfaced in My Tasks and their timesheet.

**Architecture:** New `assignees: [{ user, sharePct }]` subdoc on `Task` (shares sum to 100). A pure `workload` helper (mirrored backend JS + frontend TS) owns the share math and is unit-tested. Every `assignee` reference across ~10 backend files switches to the array shape; PM assignment becomes a direct `PATCH /tasks/:id/assignees` action (auto-offer-on-busy removed). A one-time migration converts existing tasks.

**Tech Stack:** Node 22+/Express/Mongoose (`auth-api`), React 19 + Vite + TypeScript (`web`), `node:test` for the pure helpers.

## Global Constraints

- **Testing policy:** No automated tests for UI/API code — verified by `node --check` / `npx tsc -b` / `npm run build` + manual checks. Pure helpers get `node:test` unit tests only.
- **Assignee shape (verbatim):** `assignees: [{ user: ObjectId→User, sharePct: Number }]`, default `[]`. Empty array = unassigned. `sharePct` integers summing to exactly 100.
- **Mongo query for "is assignee":** `{ 'assignees.user': userId }`.
- **Share math lives in `workload`** (`equalShares`, `normalizeShares`, `assigneeHours`) — never re-derive inline.
- **PM assignment is direct:** no `AssignmentOffer` is auto-created on assign; the `AssignmentOffer` accept route and `ClaimRequest` approve route remain but only act on empty-assignee tasks (single-fill, write `[{ user, sharePct: 100 }]`).
- **Timesheet Planned hours stay the full task estimate** (do not split per share there — that would shrink the deadline bar; per-share is shown in My Tasks / PM table instead). This refines the spec's timesheet line; see self-review.
- **Commits:** `git -c commit.gpgsign=false commit`, message ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Task 1: Backend share helper (`workload.js`)

**Files:**
- Create: `auth-api/src/services/workload.js`
- Test: `auth-api/test/workload.test.js`

**Interfaces:**
- Produces: `equalShares(n): number[]`, `normalizeShares(shares: number[]): number[]`, `assigneeHours(estimatedHours: number, sharePct: number): number`.

- [ ] **Step 1: Write the failing test** — create `auth-api/test/workload.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalShares, normalizeShares, assigneeHours } from '../src/services/workload.js';

test('equalShares sums to 100 with remainder on the first entries', () => {
  assert.deepEqual(equalShares(0), []);
  assert.deepEqual(equalShares(1), [100]);
  assert.deepEqual(equalShares(2), [50, 50]);
  assert.deepEqual(equalShares(3), [34, 33, 33]);
  assert.deepEqual(equalShares(4), [25, 25, 25, 25]);
});

test('normalizeShares scales/clamps to a total of 100', () => {
  assert.deepEqual(normalizeShares([]), []);
  assert.deepEqual(normalizeShares([50, 50]), [50, 50]);
  assert.deepEqual(normalizeShares([1, 1]), [50, 50]);
  assert.deepEqual(normalizeShares([0, 0]), [50, 50]); // all-zero -> equal
  assert.deepEqual(normalizeShares([3, 3, 3]), [34, 33, 33]);
  assert.deepEqual(normalizeShares([100]), [100]);
});

test('assigneeHours splits an estimate by share, rounded to 1 decimal', () => {
  assert.equal(assigneeHours(40, 50), 20);
  assert.equal(assigneeHours(40, 33), 13.2);
  assert.equal(assigneeHours(0, 50), 0);
  assert.equal(assigneeHours(40, 0), 0);
  assert.equal(assigneeHours(-5, 50), 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `auth-api/`): `node --test test/workload.test.js`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement** — create `auth-api/src/services/workload.js`:

```js
// Pure share math for multi-assignee workload distribution.

export function equalShares(n) {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  const base = Math.floor(100 / count);
  let rem = 100 - base * count;
  return Array.from({ length: count }, () => {
    if (rem > 0) { rem -= 1; return base + 1; }
    return base;
  });
}

export function normalizeShares(shares) {
  if (!Array.isArray(shares) || shares.length === 0) return [];
  const clamped = shares.map((s) => Math.min(100, Math.max(0, Number(s) || 0)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return equalShares(clamped.length);
  const scaled = clamped.map((s) => Math.round((s / sum) * 100));
  const drift = 100 - scaled.reduce((a, b) => a + b, 0);
  scaled[0] += drift; // park rounding drift on the first entry
  return scaled;
}

export function assigneeHours(estimatedHours, sharePct) {
  const est = Number(estimatedHours);
  const pct = Number(sharePct);
  if (!Number.isFinite(est) || est < 0 || !Number.isFinite(pct) || pct < 0) return 0;
  return Math.round((est * pct) / 10) / 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `auth-api/`): `node --test test/workload.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/workload.js auth-api/test/workload.test.js
git -c commit.gpgsign=false commit -m "feat: workload share helpers (equalShares/normalizeShares/assigneeHours)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Frontend share helper mirror (`workload.ts`)

**Files:**
- Create: `web/src/pm/workload.ts`
- Test: `web/src/pm/workload.test.ts`

**Interfaces:**
- Produces: `equalShares(n: number): number[]`, `normalizeShares(shares: number[]): number[]`, `assigneeHours(estimatedHours: number, sharePct: number): number`.

> Note: the web `test` script is `node --test "src/timesheet/**/*.test.ts"`, which would not pick up a file under `src/pm/`. This task adds a second glob so PM helper tests run too.

- [ ] **Step 1: Extend the web test script** — in `web/package.json`, change the `test` script:

```json
    "test": "node --test \"src/timesheet/**/*.test.ts\""
```

to:

```json
    "test": "node --test \"src/timesheet/**/*.test.ts\" \"src/pm/**/*.test.ts\""
```

- [ ] **Step 2: Write the failing test** — create `web/src/pm/workload.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalShares, normalizeShares, assigneeHours } from './workload.ts';

test('equalShares sums to 100, remainder first', () => {
  assert.deepEqual(equalShares(0), []);
  assert.deepEqual(equalShares(1), [100]);
  assert.deepEqual(equalShares(3), [34, 33, 33]);
});

test('normalizeShares clamps/scales to 100', () => {
  assert.deepEqual(normalizeShares([1, 1]), [50, 50]);
  assert.deepEqual(normalizeShares([0, 0]), [50, 50]);
  assert.deepEqual(normalizeShares([3, 3, 3]), [34, 33, 33]);
});

test('assigneeHours splits estimate by share', () => {
  assert.equal(assigneeHours(40, 50), 20);
  assert.equal(assigneeHours(40, 33), 13.2);
  assert.equal(assigneeHours(40, 0), 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — cannot find module `./workload.ts`.

- [ ] **Step 4: Implement** — create `web/src/pm/workload.ts` (identical logic to the JS helper, typed):

```ts
export function equalShares(n: number): number[] {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  const base = Math.floor(100 / count);
  let rem = 100 - base * count;
  return Array.from({ length: count }, () => {
    if (rem > 0) { rem -= 1; return base + 1; }
    return base;
  });
}

export function normalizeShares(shares: number[]): number[] {
  if (!Array.isArray(shares) || shares.length === 0) return [];
  const clamped = shares.map((s) => Math.min(100, Math.max(0, Number(s) || 0)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return equalShares(clamped.length);
  const scaled = clamped.map((s) => Math.round((s / sum) * 100));
  const drift = 100 - scaled.reduce((a, b) => a + b, 0);
  scaled[0] += drift;
  return scaled;
}

export function assigneeHours(estimatedHours: number, sharePct: number): number {
  const est = Number(estimatedHours);
  const pct = Number(sharePct);
  if (!Number.isFinite(est) || est < 0 || !Number.isFinite(pct) || pct < 0) return 0;
  return Math.round((est * pct) / 10) / 10;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all timesheet + pm helper tests green.

- [ ] **Step 6: Commit**

```bash
git add web/src/pm/workload.ts web/src/pm/workload.test.ts web/package.json
git -c commit.gpgsign=false commit -m "feat: frontend workload share helpers + pm test glob

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Task model `assignees` + migration script

**Files:**
- Modify: `auth-api/src/models/Task.js`
- Create: `auth-api/scripts/migrate-assignees.js`

**Interfaces:**
- Produces: `Task.assignees` array of `{ user, sharePct }`; `assignee` removed. Migration script copies legacy `assignee` → `assignees: [{ user, sharePct: 100 }]`.

- [ ] **Step 1: Replace the `assignee` field** — in `auth-api/src/models/Task.js`, replace this line:

```js
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
```

with:

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
  },
```

- [ ] **Step 2: Create the migration** — create `auth-api/scripts/migrate-assignees.js`:

```js
import '../src/env.js';
import mongoose from 'mongoose';
import { connectDb } from '../src/db/connect.js';
import { Task } from '../src/models/Task.js';

async function main() {
  await connectDb(process.env.MONGO_URL);
  // Legacy tasks still carry a top-level `assignee`. Move each to the new shape.
  const legacy = await Task.collection.find({ assignee: { $ne: null } }).toArray();
  let migrated = 0;
  for (const doc of legacy) {
    if (Array.isArray(doc.assignees) && doc.assignees.length > 0) continue; // idempotent
    await Task.collection.updateOne(
      { _id: doc._id },
      { $set: { assignees: [{ user: doc.assignee, sharePct: 100 }] }, $unset: { assignee: '' } },
    );
    migrated += 1;
  }
  // Drop any leftover null `assignee` fields too.
  await Task.collection.updateMany({ assignee: null }, { $unset: { assignee: '' } });
  console.log(`[migrate-assignees] migrated ${migrated} task(s)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify (syntax + model export)**

Run (from `auth-api/`): `node --check src/models/Task.js && node --check scripts/migrate-assignees.js && node -e "import('./src/models/Task.js').then(m=>console.log(typeof m.Task))"`
Expected: prints `function`. (The migration is *run* in Task 13 against the live DB.)

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/models/Task.js auth-api/scripts/migrate-assignees.js
git -c commit.gpgsign=false commit -m "feat: Task.assignees subdoc + one-time migration from assignee

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: authz, hasActiveTask, admin cleanup

**Files:**
- Modify: `auth-api/src/services/authz.js`
- Modify: `auth-api/src/services/assignment.js`
- Modify: `auth-api/src/routes/admin.js`
- Test: `auth-api/test/authz.test.js`

**Interfaces:**
- Consumes: `Task.assignees` (Task 3).
- Produces: `canLogProgress(user, task)` true when the user is in `task.assignees`.

- [ ] **Step 1: Update the failing test** — `auth-api/test/authz.test.js` references `task.assignee`. Open it and replace any `{ assignee: <id> }` task fixtures used with `canLogProgress` so they use `{ assignees: [{ user: <id>, sharePct: 100 }] }`. Add this test at the end of the file:

```js
test('canLogProgress: true when user is among assignees, false otherwise', () => {
  const task = { assignees: [{ user: 'u1', sharePct: 50 }, { user: 'u2', sharePct: 50 }] };
  assert.equal(canLogProgress({ sub: 'u2' }, task), true);
  assert.equal(canLogProgress({ sub: 'u3' }, task), false);
  assert.equal(canLogProgress({ sub: 'u1' }, { assignees: [] }), false);
});
```

(If `canLogProgress` or `assert`/`test` are not already imported at the top of the file, add the imports to match the file's existing style: `import { canLogProgress } from '../src/services/authz.js';`.)

- [ ] **Step 2: Run the test to verify it fails**

Run (from `auth-api/`): `node --test test/authz.test.js`
Expected: FAIL — `canLogProgress` still reads `task.assignee`.

- [ ] **Step 3: Implement** — in `auth-api/src/services/authz.js`, replace:

```js
export function canLogProgress(user, task) {
  return task.assignee != null && String(task.assignee) === userId(user);
}
```

with:

```js
export function canLogProgress(user, task) {
  const uid = userId(user);
  return Array.isArray(task.assignees) && task.assignees.some((a) => String(a.user) === uid);
}
```

In `auth-api/src/services/assignment.js`, replace:

```js
export async function hasActiveTask(userId) {
  const existing = await Task.exists({ assignee: userId, status: { $ne: 'done' } });
  return !!existing;
}
```

with:

```js
// Retained helper (its prior callers — auto-offer-on-busy — are removed this cycle).
export async function hasActiveTask(userId) {
  const existing = await Task.exists({ 'assignees.user': userId, status: { $ne: 'done' } });
  return !!existing;
}
```

In `auth-api/src/routes/admin.js`, replace this line in the user-delete handler:

```js
    await Task.updateMany({ assignee: target._id }, { $set: { assignee: null } });
```

with:

```js
    await Task.updateMany({ 'assignees.user': target._id }, { $pull: { assignees: { user: target._id } } });
```

- [ ] **Step 4: Run tests**

Run (from `auth-api/`): `node --test test/authz.test.js && node --check src/services/assignment.js && node --check src/routes/admin.js`
Expected: authz tests PASS; syntax OK for the other two.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/authz.js auth-api/src/services/assignment.js auth-api/src/routes/admin.js auth-api/test/authz.test.js
git -c commit.gpgsign=false commit -m "feat: assignees-aware canLogProgress/hasActiveTask + admin cleanup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `tasks.js` — mine/claim/decisions, drop auto-offer, add assignees endpoint

**Files:**
- Modify: `auth-api/src/routes/tasks.js`

**Interfaces:**
- Consumes: `assigneeHours` (Task 1), `Task.assignees` (Task 3), `canLogProgress` (Task 4).
- Produces: `GET /tasks/mine` returns `assignees` (populated) + `mySharePct` + `myPlannedHours`; `PATCH /tasks/:id/assignees` sets the team directly. `PATCH /tasks/:id` no longer manages assignee.

- [ ] **Step 1: Update imports** — at the top of `auth-api/src/routes/tasks.js`, replace:

```js
import { toHours, effectiveDueDate, proposedDueDate, endDateFrom } from '../services/estimate.js';
import { actualMinutesByTask } from '../services/actuals.js';
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { hasActiveTask } from '../services/assignment.js';
```

with:

```js
import { toHours, effectiveDueDate, proposedDueDate, endDateFrom } from '../services/estimate.js';
import { actualMinutesByTask } from '../services/actuals.js';
import { assigneeHours } from '../services/workload.js';
```

- [ ] **Step 2: Update `GET /mine`** — replace the handler body's query + mapping:

```js
  router.get('/mine', asyncHandler(async (req, res) => {
    const tasks = await Task.find({ assignee: req.user.sub })
      .populate('project', 'name')
      .sort('dueDate');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    res.json(tasks.map((t) => {
      const obj = t.toObject();
      const due = effectiveDueDate(obj);
      return {
        ...obj,
        actualMinutes: map.get(String(t._id)) || 0,
        effectiveDueDate: due.date,
        dueDateAuto: due.auto,
        dueProposalDate: proposedDueDate(obj),
      };
    }));
  }));
```

with:

```js
  router.get('/mine', asyncHandler(async (req, res) => {
    const uid = String(req.user.sub);
    const tasks = await Task.find({ 'assignees.user': req.user.sub })
      .populate('project', 'name')
      .populate('assignees.user', 'displayName email')
      .sort('dueDate');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    res.json(tasks.map((t) => {
      const obj = t.toObject();
      const due = effectiveDueDate(obj);
      const mine = (obj.assignees || []).find((a) => String(a.user?._id || a.user) === uid);
      const mySharePct = mine ? mine.sharePct : 0;
      return {
        ...obj,
        actualMinutes: map.get(String(t._id)) || 0,
        effectiveDueDate: due.date,
        dueDateAuto: due.auto,
        dueProposalDate: proposedDueDate(obj),
        mySharePct,
        myPlannedHours: assigneeHours(obj.estimatedHours, mySharePct),
      };
    }));
  }));
```

- [ ] **Step 3: Update the claim guard** — in `POST /:id/claim`, replace:

```js
    if (task.assignee || task.status === 'done') return res.status(400).json({ error: 'task is not claimable' });
```

with:

```js
    if (task.assignees.length > 0 || task.status === 'done') return res.status(400).json({ error: 'task is not claimable' });
```

- [ ] **Step 4: Update the two "proposer cannot approve own" guards** — in `PATCH /:id/estimate/decision`, replace:

```js
    if (task.assignee && String(task.assignee) === String(req.user.sub)) {
      return res.status(403).json({ error: 'the proposer cannot approve their own estimate' });
    }
```

with:

```js
    if (task.assignees.some((a) => String(a.user) === String(req.user.sub))) {
      return res.status(403).json({ error: 'the proposer cannot approve their own estimate' });
    }
```

and in `PATCH /:id/extension/decision`, replace:

```js
    if (task.assignee && String(task.assignee) === String(req.user.sub)) {
      return res.status(403).json({ error: 'the proposer cannot approve their own extension' });
    }
```

with:

```js
    if (task.assignees.some((a) => String(a.user) === String(req.user.sub))) {
      return res.status(403).json({ error: 'the proposer cannot approve their own extension' });
    }
```

- [ ] **Step 5: Replace `PATCH /:id`** — replace the entire `PATCH /:id` handler (the one beginning `router.patch('/:id', asyncHandler` near the end, NOT the `/decision` ones) with this assignee-free version:

```js
  router.patch('/:id', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['title', 'description', 'status', 'dueDate', 'startDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
    if (Array.isArray(req.body?.requiredSkills)) {
      const validSkills = await Skill.find({ _id: { $in: req.body.requiredSkills }, active: true }).select('_id');
      task.requiredSkills = validSkills.map((s) => s._id);
    }
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(task);
  }));
```

- [ ] **Step 6: Add the assignees endpoint** — directly AFTER the `PATCH /:id` handler you just replaced (before `return router;`), add:

```js
  // PM sets the full assignee team + shares directly (no offers).
  router.patch('/:id/assignees', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const input = Array.isArray(req.body?.assignees) ? req.body.assignees : [];
    // Accept [userId, ...] or [{ user, sharePct }, ...].
    const userIds = input.map((a) => String(typeof a === 'object' && a ? a.user : a));
    const memberSet = new Set(project.members.map((m) => String(m)));
    if (!userIds.every((id) => memberSet.has(id))) {
      return res.status(400).json({ error: 'every assignee must be a project member' });
    }
    const givenShares = input.map((a) => (typeof a === 'object' && a ? Number(a.sharePct) : NaN));
    const hasShares = givenShares.length > 0 && givenShares.every((s) => Number.isFinite(s));
    const shares = hasShares ? normalizeShares(givenShares) : equalShares(userIds.length);
    task.assignees = userIds.map((user, i) => ({ user, sharePct: shares[i] }));
    await task.save();
    res.json(task);
  }));
```

Also extend the workload import at the top (from Step 1) to include the share builders:

```js
import { assigneeHours, equalShares, normalizeShares } from '../services/workload.js';
```

- [ ] **Step 7: Verify**

Run (from `auth-api/`): `node --check src/routes/tasks.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

- [ ] **Step 8: Commit**

```bash
git add auth-api/src/routes/tasks.js
git -c commit.gpgsign=false commit -m "feat: assignees in tasks routes; drop auto-offer; add PATCH /:id/assignees

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `projects.js` — createTask assignees + populate, drop auto-offer

**Files:**
- Modify: `auth-api/src/routes/projects.js`

**Interfaces:**
- Consumes: `equalShares` (Task 1), `Task.assignees` (Task 3).
- Produces: `POST /projects/:id/tasks` accepts `assignees: [userId]`; `GET /projects/:id` returns tasks with populated `assignees.user`.

- [ ] **Step 1: Update imports** — at the top of `auth-api/src/routes/projects.js`, remove the two offer-related imports and add the share helper. Replace:

```js
import { effectiveDueDate, proposedDueDate } from '../services/estimate.js';
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { hasActiveTask } from '../services/assignment.js';
```

with:

```js
import { effectiveDueDate, proposedDueDate } from '../services/estimate.js';
import { equalShares } from '../services/workload.js';
```

- [ ] **Step 2: Populate assignees in `GET /:id`** — replace:

```js
    const tasks = await Task.find({ project: project._id })
      .populate('assignee', 'displayName email')
      .sort('createdAt');
```

with:

```js
    const tasks = await Task.find({ project: project._id })
      .populate('assignees.user', 'displayName email')
      .sort('createdAt');
```

- [ ] **Step 3: Replace the createTask handler body** — replace the entire `POST /:id/tasks` handler with:

```js
  router.post('/:id/tasks', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canCreateTask(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { title, description, requiredSkills, assignees, assignee, dueDate, startDate, dependsOn } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });

    // Accept `assignees: [userId]` (preferred) or legacy single `assignee`.
    const requested = Array.isArray(assignees) ? assignees.map(String) : (assignee ? [String(assignee)] : []);
    const memberSet = new Set(project.members.map((m) => String(m)));
    if (!requested.every((uid) => memberSet.has(uid))) {
      return res.status(400).json({ error: 'every assignee must be a project member' });
    }
    const shares = equalShares(requested.length);
    const assigneeDocs = requested.map((user, i) => ({ user, sharePct: shares[i] }));

    const skillIds = Array.isArray(requiredSkills) ? requiredSkills : [];
    const validSkills = await Skill.find({ _id: { $in: skillIds }, active: true }).select('_id');
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      description: String(description || ''),
      requiredSkills: validSkills.map((s) => s._id),
      assignees: assigneeDocs,
      dueDate: dueDate || null,
      startDate: startDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      createdBy: req.user.sub,
    });
    res.status(201).json(task);
  }));
```

- [ ] **Step 4: Verify**

Run (from `auth-api/`): `node --check src/routes/projects.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/projects.js
git -c commit.gpgsign=false commit -m "feat: createTask accepts assignees[]; populate assignees; drop auto-offer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `timesheets.js` — assignee queries to array shape

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`

**Interfaces:**
- Consumes: `Task.assignees` (Task 3).
- Produces: timesheet injection + PUT allow-list query each member's tasks via `'assignees.user'`.

- [ ] **Step 1: Update the GET injection query** — in the `GET '/:weekStart'` handler, replace:

```js
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status startDate project');
```

with:

```js
      assignedTasks = await Task.find({ 'assignees.user': userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status startDate project');
```

- [ ] **Step 2: Update the PUT allow-list query** — in the `PUT '/:weekStart'` handler, replace:

```js
    const assigned = await Task.find({ assignee: userId }).select('_id project');
```

with:

```js
    const assigned = await Task.find({ 'assignees.user': userId }).select('_id project');
```

- [ ] **Step 3: Verify**

Run (from `auth-api/`): `node --check src/routes/timesheets.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/timesheets.js
git -c commit.gpgsign=false commit -m "feat: timesheet injection/allow-list use assignees.user

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: marketplace / claim / offer single-fill adaptation

**Files:**
- Modify: `auth-api/src/routes/marketplace.js`
- Modify: `auth-api/src/routes/claimRequests.js`
- Modify: `auth-api/src/routes/assignmentOffers.js`

**Interfaces:**
- Consumes: `Task.assignees` (Task 3).
- Produces: marketplace lists empty-assignee tasks; claim-approve and offer-accept fill a single 100% assignee.

- [ ] **Step 1: marketplace** — in `auth-api/src/routes/marketplace.js`, replace:

```js
    const tasks = await Task.find({
      project: { $in: projects.map((p) => p._id) },
      assignee: null,
      status: { $ne: 'done' },
    }).populate('requiredSkills', 'name').sort('-createdAt');
```

with:

```js
    const tasks = await Task.find({
      project: { $in: projects.map((p) => p._id) },
      assignees: { $size: 0 },
      status: { $ne: 'done' },
    }).populate('requiredSkills', 'name').sort('-createdAt');
```

- [ ] **Step 2: claim approve** — in `auth-api/src/routes/claimRequests.js`, replace:

```js
      if (task.assignee) return res.status(409).json({ error: 'task already assigned' });
      task.assignee = claim.userId;
      await task.save();
```

with:

```js
      if (task.assignees.length > 0) return res.status(409).json({ error: 'task already assigned' });
      task.assignees = [{ user: claim.userId, sharePct: 100 }];
      await task.save();
```

- [ ] **Step 3: offer accept** — in `auth-api/src/routes/assignmentOffers.js`, replace:

```js
      if (task.assignee || task.status === 'done') return res.status(409).json({ error: 'task no longer available' });
      task.assignee = offer.userId;
      await task.save();
```

with:

```js
      if (task.assignees.length > 0 || task.status === 'done') return res.status(409).json({ error: 'task no longer available' });
      task.assignees = [{ user: offer.userId, sharePct: 100 }];
      await task.save();
```

- [ ] **Step 4: Verify**

Run (from `auth-api/`): `node --check src/routes/marketplace.js && node --check src/routes/claimRequests.js && node --check src/routes/assignmentOffers.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/marketplace.js auth-api/src/routes/claimRequests.js auth-api/src/routes/assignmentOffers.js
git -c commit.gpgsign=false commit -m "feat: marketplace/claim/offer use assignees array (single-fill)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Frontend API client (`pmApi.ts`)

**Files:**
- Modify: `web/src/pm/pmApi.ts`

**Interfaces:**
- Produces: `Assignee` type; `Task`/`TaskDetail` carry `assignees`; `Task` carries `mySharePct`/`myPlannedHours`; `setTaskAssignees(taskId, assignees)`; `createTask` accepts `assignees`.

- [ ] **Step 1: Add the `Assignee` type and update `Task`/`TaskDetail`** — in `web/src/pm/pmApi.ts`, add this type just above the `Task` type:

```ts
export type Assignee = { user: Person | string; sharePct: number };
```

In the `Task` type, replace the line:

```ts
  assignee: string | null; status: string; dueDate: string | null;
```

with:

```ts
  assignees: Assignee[]; status: string; dueDate: string | null;
  mySharePct?: number;
  myPlannedHours?: number;
```

In the `TaskDetail` type, replace the line:

```ts
  assignee: Person | null; status: string; percentComplete: number; actualMinutes: number;
```

with:

```ts
  assignees: { user: Person; sharePct: number }[]; status: string; percentComplete: number; actualMinutes: number;
```

- [ ] **Step 2: Add `setTaskAssignees` and update `createTask`** — replace:

```ts
export const createTask = (projectId: string, body: Partial<Task> & { requiredSkills?: string[] }) =>
  authed(`/projects/${projectId}/tasks`, 'POST', body) as Promise<Task & { offered?: boolean }>;
```

with:

```ts
export const createTask = (projectId: string, body: Partial<Task> & { requiredSkills?: string[]; assignees?: string[] }) =>
  authed(`/projects/${projectId}/tasks`, 'POST', body) as Promise<Task>;

export const setTaskAssignees = (taskId: string, assignees: { user: string; sharePct: number }[]) =>
  authed(`/tasks/${taskId}/assignees`, 'PATCH', { assignees }) as Promise<Task>;
```

- [ ] **Step 3: Verify**

Run (from `web/`): `npx tsc -b`
Expected: type errors ONLY in `Projects.tsx`/`MyTasks.tsx` where `assignee` is still referenced (fixed in Tasks 10–12). If you see errors elsewhere, fix the type usage here. It is acceptable for this task to leave `Projects.tsx`/`MyTasks.tsx` type errors that the next tasks resolve; note them in your report.

> Note to implementer: because `tsc -b` checks the whole project, this task will not be green in isolation. Confirm the only errors are in `Projects.tsx` and `MyTasks.tsx` referencing the old `assignee` field, then commit.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/pmApi.ts
git -c commit.gpgsign=false commit -m "feat: pmApi assignees types + setTaskAssignees + createTask assignees

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `AssigneesEditor` component

**Files:**
- Create: `web/src/pm/AssigneesEditor.tsx`

**Interfaces:**
- Consumes: `equalShares`, `normalizeShares` (Task 2); `Person` (pmApi).
- Produces: `<AssigneesEditor members value onSave onClose />` where `value: { userId: string; sharePct: number }[]`, `onSave(next: { user: string; sharePct: number }[])`.

- [ ] **Step 1: Create the component** — create `web/src/pm/AssigneesEditor.tsx`:

```tsx
import { useState } from 'react';
import type { Person } from './pmApi';
import { equalShares, normalizeShares } from './workload';

type Row = { userId: string; sharePct: number };
type Props = {
  members: Person[];
  value: Row[];
  onSave: (next: { user: string; sharePct: number }[]) => void;
  onClose: () => void;
};

export function AssigneesEditor({ members, value, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(value);

  const selected = new Set(rows.map((r) => r.userId));
  const total = rows.reduce((s, r) => s + r.sharePct, 0);

  function toggle(userId: string) {
    setRows((prev) => {
      const exists = prev.some((r) => r.userId === userId);
      const nextIds = exists
        ? prev.filter((r) => r.userId !== userId).map((r) => r.userId)
        : [...prev.map((r) => r.userId), userId];
      const shares = equalShares(nextIds.length);
      return nextIds.map((id, i) => ({ userId: id, sharePct: shares[i] }));
    });
  }

  function setShare(userId: string, pct: number) {
    setRows((prev) => prev.map((r) => (r.userId === userId ? { ...r, sharePct: pct } : r)));
  }

  function equalize() {
    setRows((prev) => {
      const shares = equalShares(prev.length);
      return prev.map((r, i) => ({ ...r, sharePct: shares[i] }));
    });
  }

  function save() {
    const normalized = normalizeShares(rows.map((r) => r.sharePct));
    onSave(rows.map((r, i) => ({ user: r.userId, sharePct: normalized[i] })));
  }

  return (
    <div className="assignees-editor">
      <div className="assignees-list">
        {members.length === 0 && <span className="ts-sub">No project members yet.</span>}
        {members.map((m) => {
          const row = rows.find((r) => r.userId === m._id);
          return (
            <div key={m._id} className="assignees-row">
              <label className="assignees-pick">
                <input type="checkbox" checked={selected.has(m._id)} onChange={() => toggle(m._id)} />
                {m.displayName || m.email}
              </label>
              {row && (
                <span className="assignees-share">
                  <input
                    className="ts-pct" type="number" min={0} max={100} value={row.sharePct}
                    onChange={(e) => setShare(m._id, Number(e.target.value))}
                  />%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="assignees-foot">
        <span className={`assignees-total${total === 100 ? '' : ' off'}`}>Total {total}%</span>
        <button className="link-btn" type="button" onClick={equalize} disabled={rows.length === 0}>Equal split</button>
        <button className="btn btn-primary" type="button" onClick={save}>Save</button>
        <button className="link-btn" type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: same as Task 9 — only `Projects.tsx`/`MyTasks.tsx` errors remain (this new file itself should type-check). Note them and proceed.

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/AssigneesEditor.tsx
git -c commit.gpgsign=false commit -m "feat: AssigneesEditor component (member pick + share split)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `Projects.tsx` — assignee chips, multi-select add, editor wiring

**Files:**
- Modify: `web/src/pm/Projects.tsx`

**Interfaces:**
- Consumes: `setTaskAssignees`, `Assignee` (Task 9); `AssigneesEditor` (Task 10); `assigneeHours` (Task 2).

- [ ] **Step 1: Update imports** — at the top of `web/src/pm/Projects.tsx`, add to the `./pmApi` import list `setTaskAssignees` and `Assignee`, and add two new imports:

```tsx
import { AssigneesEditor } from './AssigneesEditor';
import { assigneeHours } from './workload';
```

(Concretely: the existing `import { listProjects, createProject, getProject, createTask, ... } from './pmApi';` block gains `setTaskAssignees, Assignee` in its list.)

- [ ] **Step 2: Replace the add-task assignee `<select>` with a multi-select** — in `ProjectDetail`, the add-task form currently has a single assignee `<select>` bound to `assignee`/`setAssignee`. Replace the `assignee` state and that `<select>` with a set of selected member ids.

Replace the state declaration line:

```tsx
  const [assignee, setAssignee] = useState('');
```

with:

```tsx
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
```

Replace the `<select ...>Unassigned...</select>` element in the add-task form with:

```tsx
          <div className="chips" style={{ justifyContent: 'flex-start' }}>
            {project.members.length === 0 && <span className="ts-sub">Add members to assign</span>}
            {project.members.map((m) => (
              <button key={m._id} type="button" className="chip"
                style={{ cursor: 'pointer', opacity: assignees.has(m._id) ? 1 : 0.4 }}
                onClick={() => setAssignees((prev) => {
                  const next = new Set(prev);
                  if (next.has(m._id)) next.delete(m._id); else next.add(m._id);
                  return next;
                })}>{m.displayName || m.email}</button>
            ))}
          </div>
```

In the `add()` function, replace `assignee: assignee || null,` in the `createTask` body with `assignees: [...assignees],` and replace `setAssignee('');` in the reset with `setAssignees(new Set());`. Also remove the now-unused `created.offered` notice (the backend no longer returns `offered`): replace:

```tsx
      setNotice(created.offered
        ? 'That employee already has an active task — sent them an offer to accept.'
        : '');
```

with:

```tsx
      setNotice('');
```

- [ ] **Step 3: Add assignee-editing state + save handler** — inside `ProjectDetail`, add near the other `useState`s:

```tsx
  const [editingAssignees, setEditingAssignees] = useState<string | null>(null);
```

and add this handler near the other async handlers:

```tsx
  async function saveAssignees(taskId: string, next: { user: string; sharePct: number }[]) {
    setError('');
    try { await setTaskAssignees(taskId, next); setEditingAssignees(null); reload(); }
    catch (e) { setError((e as Error).message); }
  }
```

- [ ] **Step 4: Render assignee chips + editor in the task table** — in the task table body, replace the existing assignee cell:

```tsx
                <td>{t.assignee ? (t.assignee.displayName || t.assignee.email) : 'Unassigned'}</td>
```

with:

```tsx
                <td>
                  {editingAssignees === t._id ? (
                    <AssigneesEditor
                      members={project.members}
                      value={t.assignees.map((a) => ({ userId: a.user._id, sharePct: a.sharePct }))}
                      onSave={(next) => saveAssignees(t._id, next)}
                      onClose={() => setEditingAssignees(null)}
                    />
                  ) : (
                    <button className="assignees-cell" type="button" onClick={() => setEditingAssignees(t._id)}>
                      {t.assignees.length === 0
                        ? <span className="ts-sub">Unassigned</span>
                        : t.assignees.map((a) => (
                            <span key={a.user._id} className="chip assignee-chip">
                              {a.user.displayName || a.user.email} · {a.sharePct}%
                            </span>
                          ))}
                    </button>
                  )}
                </td>
```

(`TaskDetail.assignees` is `{ user: Person; sharePct }[]`, so `a.user._id`/`a.user.displayName` are typed.)

- [ ] **Step 5: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no errors in `Projects.tsx` now (only `MyTasks.tsx` may remain, fixed in Task 12).

- [ ] **Step 6: Commit**

```bash
git add web/src/pm/Projects.tsx
git -c commit.gpgsign=false commit -m "feat: Projects task table assignee chips + multi-select add + shares editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `MyTasks.tsx` — show the user's own share

**Files:**
- Modify: `web/src/pm/MyTasks.tsx`

**Interfaces:**
- Consumes: `Task.mySharePct`/`Task.myPlannedHours` (Tasks 5, 9).

- [ ] **Step 1: Show share in the estimate cell** — in `web/src/pm/MyTasks.tsx`, replace the estimate `<td>` in the task row:

```tsx
                <td>
                  {t.estimateStatus === 'approved'
                    ? `${t.estimateValue || t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <ProposeEstimate task={t} onPropose={(v, u) => propose(t._id, v, u)} />}
                </td>
```

with:

```tsx
                <td>
                  {t.estimateStatus === 'approved'
                    ? `${t.estimateValue || t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <ProposeEstimate task={t} onPropose={(v, u) => propose(t._id, v, u)} />}
                  {(t.mySharePct ?? 0) > 0 && (t.assignees?.length ?? 0) > 1 && (
                    <div className="ts-sub">Your share {t.mySharePct}% · {t.myPlannedHours}h</div>
                  )}
                </td>
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors anywhere now.

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/MyTasks.tsx
git -c commit.gpgsign=false commit -m "feat: My Tasks shows the user's own share + planned hours

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Styles + migration run + full build + manual E2E

**Files:**
- Modify: `web/src/styles.css`

- [ ] **Step 1: Append styles** — add to the END of `web/src/styles.css`:

```css
/* ---- Multi-assignee ---- */
.assignee-chip { font-size: 12px; }
.assignees-cell { display: flex; flex-wrap: wrap; gap: 4px; background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
.assignees-editor { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; background: #fff; min-width: 220px; }
.assignees-list { display: grid; gap: 6px; margin-bottom: 8px; }
.assignees-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.assignees-pick { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.assignees-share .ts-pct { width: 56px; }
.assignees-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.assignees-total { font-size: 12px; color: var(--muted); }
.assignees-total.off { color: var(--danger); font-weight: 600; }
```

- [ ] **Step 2: Run the migration against the local DB** (requires local MongoDB + `.env`)

Run (from `auth-api/`): `node scripts/migrate-assignees.js`
Expected: prints `[migrate-assignees] migrated N task(s)` and exits 0. If no local DB, note it as deferred — the migration must be run before the feature is used in any environment with existing tasks.

- [ ] **Step 3: Full build**

Run (from `web/`): `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 4: Manual E2E** (servers + local MongoDB running):

  1. As a PM, open a project, add a task and select **two** members → both appear as chips with 50% each.
  2. Click the assignee cell → editor opens; add a third member → equalizes to 34/33/33; Save → chips show three shares.
  3. Edit shares to e.g. 60/40 on two members, Save → persists; reopen shows 60/40.
  4. As each assigned employee: the task appears in **My Tasks** with "Your share NN% · Hh"; and in their **Timesheet** the task row is injected (Planned = full task estimate).
  5. Marketplace: a task with assignees no longer appears; an unassigned task still does; claiming it (PM approves) makes the claimer the sole 100% assignee.
  6. Estimate/extension propose still works for any assignee; a PM who is not an assignee can approve.

- [ ] **Step 5: Commit**

```bash
git add web/src/styles.css
git -c commit.gpgsign=false commit -m "feat: styles for assignee chips + shares editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** model + migration (T3); workload helpers backend/frontend (T1/T2); canLogProgress/hasActiveTask/admin (T4); tasks routes incl. GET /mine share + PATCH /:id/assignees + drop auto-offer (T5); createTask assignees + populate (T6); timesheet queries (T7); marketplace/claim/offer single-fill (T8); pmApi types + setTaskAssignees (T9); AssigneesEditor (T10); Projects chips/multi-select/editor (T11); My Tasks share (T12); styles + migration run + build + E2E (T13).
- **Refinement vs spec:** the spec said the timesheet's Planned hours show the per-member share. To avoid changing the timesheet deadline-bar (which is derived from `estimatedHours` in `mergeWeekRows`), Planned stays the full estimate; the per-member split is shown in My Tasks (T12) and the PM task table (T11). Flagged here for the spec-review/whole-branch review.
- **Type consistency:** `assignees: [{ user, sharePct }]` shape and the `'assignees.user'` query are used identically across model, all routes, and timesheet injection. `Assignee` (pmApi) = `{ user: Person|string; sharePct }`; `TaskDetail.assignees.user` is the populated `Person`, matching `Projects.tsx` usage (`a.user._id`). `equalShares`/`normalizeShares`/`assigneeHours` signatures match between `workload.js` and `workload.ts`. `setTaskAssignees` sends `{ assignees: [{ user, sharePct }] }`, which `PATCH /tasks/:id/assignees` accepts.
- **Dead-code note:** `hasActiveTask` loses its callers when auto-offer-on-busy is removed; intentionally retained (updated to the new shape) per the spec — not an accident.
- **Placeholder scan:** none — every code step is complete.
- **Out of scope:** Projects task-tools cycle (search/filter/bulk/pagination/click-to-open) — next.
```