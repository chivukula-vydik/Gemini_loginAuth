# Timesheet ↔ PM Integration (Slice B core) + Slice A Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface an employee's assigned PM tasks as rows in their weekly timesheet, let them log time + set % complete/status there, roll up actual hours by aggregation, show Planned-vs-Actual to PMs, and complete the Slice A member-management/name-display polish.

**Architecture:** Extend the existing `auth-api` Express/Mongoose monolith and React SPA. Actual hours are computed on demand from the `Timesheet` collection (no denormalization). The trickiest logic — merging assigned tasks into a week and validating saved rows — lives in pure, unit-tested helpers (`services/timesheetRows.js`). `percentComplete` is stored on `Task`.

**Tech Stack:** Node 20 ESM, Express 4, Mongoose 8, `node:test` + `mongodb-memory-server` + `supertest`; React 18 + TS + Vite.

**Reference spec:** `docs/superpowers/specs/2026-06-16-timesheet-pm-integration-design.md`

**Conventions:** Backend commands run from `auth-api/`; frontend from `web/`. `req.user` = `{ sub, email, name, role }`. ObjectIds compared as strings. The 5 weekday keys are `mon,tue,wed,thu,fri`.

---

## File Structure

**Backend (`auth-api/`)**
- Modify `src/models/Task.js` — add `percentComplete`
- Modify `src/models/Timesheet.js` — add `taskId` to the embedded task row
- Modify `src/services/authz.js` — add `canLogProgress`
- Create `src/services/timesheetRows.js` — pure `mergeWeekRows`, `sanitizeRows`, `cleanMinutes`, `DAYS`, `currentMonday`
- Create `src/services/actuals.js` — `actualMinutesByTask` aggregation
- Modify `src/routes/timesheets.js` — GET merges assigned tasks; PUT preserves validated `taskId`
- Modify `src/routes/tasks.js` — `PATCH /:id/progress`; enrich `/mine` with `actualMinutes`
- Modify `src/routes/projects.js` — enrich `GET /:id` tasks with `actualMinutes`; populate assignee/members
- Create `src/routes/users.js` — `GET /users` directory
- Modify `src/app.js` — mount users router
- Modify `test/authz.test.js` — `canLogProgress` tests
- Create `test/timesheetRows.test.js` — merge/sanitize unit tests
- Modify `test/routes.test.js` — progress, injection, directory, actuals route tests

**Frontend (`web/`)**
- Modify `src/timesheet/timesheetApi.ts` — extend `Task` type with link fields
- Modify `src/pm/pmApi.ts` — `setTaskProgress`, `listDirectory`, `Person`/`TaskDetail` types, enriched `Task`
- Modify `src/timesheet/TaskRow.tsx` — PM-task row (locked name, % complete, status, planned/actual)
- Modify `src/timesheet/TimesheetGrid.tsx` — pass progress handler
- Modify `src/timesheet/TimesheetPage.tsx` — handle new fields, progress updates, preserve taskId
- Modify `src/pm/Projects.tsx` — member management + names + actual/%/status columns
- Modify `src/pm/MyTasks.tsx` — actual hours, % complete, status columns

---

## Task 1: Model fields (percentComplete + taskId)

**Files:** Modify `auth-api/src/models/Task.js`, `auth-api/src/models/Timesheet.js`

- [ ] **Step 1: Add `percentComplete` to Task**

In `auth-api/src/models/Task.js`, add this field to the schema right after the `status` field:
```js
  percentComplete: { type: Number, default: 0, min: 0, max: 100 },
```

- [ ] **Step 2: Add `taskId` to the Timesheet row**

In `auth-api/src/models/Timesheet.js`, add this field to `taskSchema` (the embedded per-row schema, alongside `id`, `name`, `entries`):
```js
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
```

- [ ] **Step 3: Verify both import**

Run: `cd auth-api && node -e "Promise.all([import('./src/models/Task.js'),import('./src/models/Timesheet.js')]).then(([a,b])=>console.log(a.Task.schema.path('percentComplete').defaultValue, typeof b.Timesheet))"`
Expected: prints `0 function`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/models/Task.js auth-api/src/models/Timesheet.js
git commit -m "feat(pm): percentComplete on Task, taskId link on timesheet rows"
```

---

## Task 2: canLogProgress authz helper (TDD)

**Files:** Modify `auth-api/src/services/authz.js`, `auth-api/test/authz.test.js`

- [ ] **Step 1: Add the failing test**

Append to `auth-api/test/authz.test.js` (and add `canLogProgress` to the existing import line from `../src/services/authz.js`):
```js
test('canLogProgress: only the assignee may log progress', () => {
  const task = { assignee: 'emp1' };
  assert.equal(canLogProgress({ sub: 'emp1' }, task), true);
  assert.equal(canLogProgress({ sub: 'emp2' }, task), false);
  assert.equal(canLogProgress({ sub: 'emp1' }, { assignee: null }), false);
});
```

- [ ] **Step 2: Run, verify it FAILS**

Run: `cd auth-api && npm test`
Expected: FAIL — `canLogProgress` is not exported.

- [ ] **Step 3: Implement**

In `auth-api/src/services/authz.js`, add at the end:
```js
export function canLogProgress(user, task) {
  return task.assignee != null && String(task.assignee) === userId(user);
}
```
(`userId` is the existing private helper at the top of the file.)

- [ ] **Step 4: Run, verify it PASSES**

Run: `cd auth-api && npm test`
Expected: PASS — all authz tests green.

- [ ] **Step 5: Commit**
```bash
git add auth-api/src/services/authz.js auth-api/test/authz.test.js
git commit -m "feat(pm): canLogProgress authz helper with tests"
```

---

## Task 3: timesheetRows service (TDD, pure)

**Files:** Create `auth-api/src/services/timesheetRows.js`, `auth-api/test/timesheetRows.test.js`

- [ ] **Step 1: Write the failing test**

Create `auth-api/test/timesheetRows.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWeekRows, sanitizeRows, currentMonday } from '../src/services/timesheetRows.js';

const z = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };

test('mergeWeekRows: editable week injects assigned tasks as locked rows', () => {
  const assigned = [{ _id: 't1', title: 'Build API', percentComplete: 25, estimatedHours: 8, actualMinutes: 120 }];
  const rows = mergeWeekRows({ savedRows: [], assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, 't1');
  assert.equal(rows[0].name, 'Build API');
  assert.equal(rows[0].locked, true);
  assert.equal(rows[0].percentComplete, 25);
  assert.equal(rows[0].actualMinutes, 120);
  assert.deepEqual(rows[0].entries, z);
});

test('mergeWeekRows: merges saved minutes into the assigned row', () => {
  const saved = [{ id: 't1', name: 'old', taskId: 't1', entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const assigned = [{ _id: 't1', title: 'Build API', percentComplete: 0, estimatedHours: 8, actualMinutes: 60 }];
  const rows = mergeWeekRows({ savedRows: saved, assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entries.mon, 60);
  assert.equal(rows[0].name, 'Build API');
});

test('mergeWeekRows: keeps ad-hoc rows and does not inject when not editable', () => {
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const rows = mergeWeekRows({ savedRows: saved, assignedTasks: [], taskInfoById: new Map(), editable: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, null);
  assert.equal(rows[0].locked, false);
  assert.equal(rows[0].entries.mon, 30);
});

test('sanitizeRows: keeps taskId only when assigned, cleans minutes', () => {
  const rows = sanitizeRows(
    [
      { id: 'x', name: 'A', taskId: 't1', entries: { mon: '60', tue: -5, wed: 0, thu: 0, fri: 0 } },
      { id: 'y', name: 'B', taskId: 'tHACK', entries: {} },
      { id: 'z', name: 'C', entries: { mon: 15 } },
    ],
    ['t1'],
  );
  assert.equal(rows[0].taskId, 't1');
  assert.equal(rows[0].entries.mon, 60);
  assert.equal(rows[0].entries.tue, 0);
  assert.equal(rows[1].taskId, null);
  assert.equal(rows[2].taskId, null);
  assert.equal(rows[2].entries.mon, 15);
});

test('currentMonday returns a Monday ISO date', () => {
  const m = currentMonday();
  assert.match(m, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${m}T00:00:00Z`).getUTCDay(), 1);
});
```

- [ ] **Step 2: Run, verify it FAILS**

Run: `cd auth-api && npm test`
Expected: FAIL — module `../src/services/timesheetRows.js` not found.

- [ ] **Step 3: Implement**

Create `auth-api/src/services/timesheetRows.js`:
```js
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function cleanMinutes(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function entriesOf(row) {
  const e = (row && row.entries) || {};
  const out = {};
  for (const d of DAYS) out[d] = cleanMinutes(e[d]);
  return out;
}

function zeroEntries() {
  return { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
}

export function currentMonday() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

export function mergeWeekRows({ savedRows = [], assignedTasks = [], taskInfoById = new Map(), editable }) {
  const out = [];
  const used = new Set();
  const savedByTaskId = new Map(
    savedRows.filter((r) => r.taskId).map((r) => [String(r.taskId), r]),
  );

  if (editable) {
    for (const task of assignedTasks) {
      const tid = String(task._id);
      const sr = savedByTaskId.get(tid);
      out.push({
        id: sr ? sr.id : tid,
        taskId: tid,
        name: task.title,
        locked: true,
        percentComplete: task.percentComplete || 0,
        estimatedHours: task.estimatedHours || 0,
        actualMinutes: task.actualMinutes || 0,
        entries: sr ? entriesOf(sr) : zeroEntries(),
      });
      used.add(tid);
    }
  }

  for (const r of savedRows) {
    if (r.taskId) {
      const tid = String(r.taskId);
      if (used.has(tid)) continue;
      const info = taskInfoById.get(tid) || {};
      out.push({
        id: r.id || tid,
        taskId: tid,
        name: info.title || r.name || '',
        locked: true,
        percentComplete: info.percentComplete || 0,
        estimatedHours: info.estimatedHours || 0,
        actualMinutes: info.actualMinutes || 0,
        entries: entriesOf(r),
      });
      used.add(tid);
    } else {
      out.push({ id: r.id, taskId: null, name: r.name || '', locked: false, entries: entriesOf(r) });
    }
  }
  return out;
}

export function sanitizeRows(rows, allowedTaskIds) {
  if (!Array.isArray(rows)) return [];
  const allowed = new Set((allowedTaskIds || []).map(String));
  return rows.map((t) => {
    const entries = {};
    for (const day of DAYS) entries[day] = cleanMinutes(t?.entries?.[day]);
    const taskId = t?.taskId && allowed.has(String(t.taskId)) ? String(t.taskId) : null;
    return { id: String(t?.id ?? ''), name: String(t?.name ?? ''), entries, taskId };
  });
}
```

- [ ] **Step 4: Run, verify it PASSES**

Run: `cd auth-api && npm test`
Expected: PASS — the 5 new timesheetRows tests plus existing tests green.

- [ ] **Step 5: Commit**
```bash
git add auth-api/src/services/timesheetRows.js auth-api/test/timesheetRows.test.js
git commit -m "feat(pm): pure timesheet row merge/sanitize helpers with tests"
```

---

## Task 4: actuals aggregation service

**Files:** Create `auth-api/src/services/actuals.js`

- [ ] **Step 1: Implement**

Create `auth-api/src/services/actuals.js`:
```js
import mongoose from 'mongoose';
import { Timesheet } from '../models/Timesheet.js';

export async function actualMinutesByTask(taskIds) {
  const map = new Map();
  const ids = (taskIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  if (ids.length === 0) return map;
  const rows = await Timesheet.aggregate([
    { $unwind: '$tasks' },
    { $match: { 'tasks.taskId': { $in: ids } } },
    {
      $group: {
        _id: '$tasks.taskId',
        minutes: {
          $sum: {
            $add: [
              '$tasks.entries.mon', '$tasks.entries.tue', '$tasks.entries.wed',
              '$tasks.entries.thu', '$tasks.entries.fri',
            ],
          },
        },
      },
    },
  ]);
  for (const r of rows) map.set(String(r._id), r.minutes || 0);
  return map;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/services/actuals.js').then(m => console.log(typeof m.actualMinutesByTask))"`
Expected: prints `function`

- [ ] **Step 3: Commit**
```bash
git add auth-api/src/services/actuals.js
git commit -m "feat(pm): actualMinutesByTask aggregation service"
```

---

## Task 5: Timesheets route — merge assigned tasks + preserve taskId

**Files:** Modify `auth-api/src/routes/timesheets.js`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `auth-api/src/routes/timesheets.js` with:
```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { mergeWeekRows, sanitizeRows, currentMonday } from '../services/timesheetRows.js';
import { actualMinutesByTask } from '../services/actuals.js';

function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1;
}

export function createTimesheetRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    const savedRows = doc
      ? doc.tasks.map((t) => ({ id: t.id, name: t.name, entries: t.entries, taskId: t.taskId ? String(t.taskId) : null }))
      : [];
    const editable = weekStart >= currentMonday();

    let assignedTasks = [];
    if (editable) {
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours');
    }

    const ids = new Set();
    for (const t of assignedTasks) ids.add(String(t._id));
    for (const r of savedRows) if (r.taskId) ids.add(r.taskId);
    const idList = [...ids];
    const actualMap = await actualMinutesByTask(idList);

    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title percentComplete estimatedHours')
      : [];
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title,
      percentComplete: t.percentComplete,
      estimatedHours: t.estimatedHours,
      actualMinutes: actualMap.get(String(t._id)) || 0,
    }]));

    const assignedForMerge = assignedTasks.map((t) => ({
      _id: String(t._id),
      title: t.title,
      percentComplete: t.percentComplete,
      estimatedHours: t.estimatedHours,
      actualMinutes: actualMap.get(String(t._id)) || 0,
    }));

    const tasks = mergeWeekRows({ savedRows, assignedTasks: assignedForMerge, taskInfoById, editable });
    res.json({ weekStart, tasks });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const assigned = await Task.find({ assignee: userId }).select('_id');
    const allowed = assigned.map((t) => String(t._id));
    const tasks = sanitizeRows(req.body?.tasks, allowed);
    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { tasks, updatedAt }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    res.json({ ok: true, updatedAt });
  }));

  return router;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/routes/timesheets.js').then(m => console.log(typeof m.createTimesheetRouter))"`
Expected: prints `function`

- [ ] **Step 3: Run the suite (existing tests must stay green)**

Run: `cd auth-api && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/timesheets.js
git commit -m "feat(pm): timesheet GET merges assigned tasks, PUT preserves taskId"
```

---

## Task 6: Tasks route — progress endpoint + actuals on /mine

**Files:** Modify `auth-api/src/routes/tasks.js`

- [ ] **Step 1: Add imports**

In `auth-api/src/routes/tasks.js`, update the authz import and add the actuals import:
```js
import { canEditProject, canLogProgress } from '../services/authz.js';
import { actualMinutesByTask } from '../services/actuals.js';
```

- [ ] **Step 2: Enrich `/mine` with actualMinutes**

Replace the existing `router.get('/mine', ...)` handler body with:
```js
  router.get('/mine', asyncHandler(async (req, res) => {
    const tasks = await Task.find({ assignee: req.user.sub })
      .populate('project', 'name')
      .sort('dueDate');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    res.json(tasks.map((t) => ({ ...t.toObject(), actualMinutes: map.get(String(t._id)) || 0 })));
  }));
```

- [ ] **Step 3: Add the progress route**

Immediately after the `/mine` handler (and before `router.patch('/:id', ...)`), add:
```js
  router.patch('/:id/progress', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!canLogProgress(req.user, task)) return res.status(403).json({ error: 'forbidden' });
    if ('percentComplete' in (req.body || {})) {
      const p = Math.round(Number(req.body.percentComplete) || 0);
      task.percentComplete = Math.max(0, Math.min(100, p));
    }
    if ('status' in (req.body || {}) && ['todo', 'in_progress', 'blocked', 'done'].includes(req.body.status)) {
      task.status = req.body.status;
    }
    await task.save();
    res.json(task);
  }));
```

- [ ] **Step 4: Verify import + suite**

Run: `cd auth-api && node -e "import('./src/routes/tasks.js').then(m => console.log(typeof m.createTasksRouter))" && npm test`
Expected: prints `function`; all tests pass.

- [ ] **Step 5: Commit**
```bash
git add auth-api/src/routes/tasks.js
git commit -m "feat(pm): assignee progress endpoint + actual hours on /tasks/mine"
```

---

## Task 7: Projects route — actuals + populated names on detail

**Files:** Modify `auth-api/src/routes/projects.js`

- [ ] **Step 1: Add actuals import**

In `auth-api/src/routes/projects.js`, add after the authz import:
```js
import { actualMinutesByTask } from '../services/actuals.js';
```

- [ ] **Step 2: Replace the `GET /:id` handler**

Replace the existing `router.get('/:id', ...)` handler with (authorization runs BEFORE populate so the membership check still sees ObjectIds):
```js
  router.get('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    await project.populate('members', 'displayName email');
    const tasks = await Task.find({ project: project._id })
      .populate('assignee', 'displayName email')
      .sort('createdAt');
    const map = await actualMinutesByTask(tasks.map((t) => t._id));
    const tasksOut = tasks.map((t) => ({ ...t.toObject(), actualMinutes: map.get(String(t._id)) || 0 }));
    res.json({ project, tasks: tasksOut });
  }));
```

- [ ] **Step 3: Verify import + suite**

Run: `cd auth-api && node -e "import('./src/routes/projects.js').then(m => console.log(typeof m.createProjectsRouter))" && npm test`
Expected: prints `function`; all tests pass.

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/projects.js
git commit -m "feat(pm): project detail shows actual hours and populated names"
```

---

## Task 8: Users directory route + mount

**Files:** Create `auth-api/src/routes/users.js`, Modify `auth-api/src/app.js`

- [ ] **Step 1: Create the router**

Create `auth-api/src/routes/users.js`:
```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';

export function createUsersRouter() {
  const router = express.Router();

  router.get('/', requireAuth, requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const users = await User.find().select('displayName email').sort('displayName');
    res.json(users);
  }));

  return router;
}
```

- [ ] **Step 2: Mount it in app.js**

In `auth-api/src/app.js`, add the import next to the other route imports:
```js
import { createUsersRouter } from './routes/users.js';
```
And add this mount next to the other `app.use(...)` mounts (before the error handler):
```js
  app.use('/users', createUsersRouter());
```

- [ ] **Step 3: Verify app boots**

Run: `cd auth-api && node -e "import('./src/app.js').then(m => console.log(typeof m.createApp))"`
Expected: prints `function`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/users.js auth-api/src/app.js
git commit -m "feat(pm): users directory route for member/assignee pickers"
```

---

## Task 9: Backend route tests for the new behavior

**Files:** Modify `auth-api/test/routes.test.js`

- [ ] **Step 1: Add tests**

In `auth-api/test/routes.test.js`, ensure the `Task` and `Timesheet` models are imported at the top alongside the others:
```js
const { Task } = await import('../src/models/Task.js');
const { Timesheet } = await import('../src/models/Timesheet.js');
```
Then append these tests at the end of the file:
```js
test('GET /users is forbidden for employees, allowed for PM', async () => {
  const emp = await User.create({ email: 'dir-e@x.com', displayName: 'E', role: 'employee' });
  const pm = await User.create({ email: 'dir-pm@x.com', displayName: 'PM', role: 'pm' });
  const r1 = await request(app).get('/users').set('Authorization', bearer(emp));
  assert.equal(r1.status, 403);
  const r2 = await request(app).get('/users').set('Authorization', bearer(pm));
  assert.equal(r2.status, 200);
  assert.ok(Array.isArray(r2.body));
});

test('PATCH /tasks/:id/progress: assignee can set, non-assignee gets 403, value clamps', async () => {
  const pm = await User.create({ email: 'pp@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'ee@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'oo@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignee: emp._id, createdBy: pm._id });
  const forbidden = await request(app).patch(`/tasks/${task._id}/progress`)
    .set('Authorization', bearer(other)).send({ percentComplete: 50 });
  assert.equal(forbidden.status, 403);
  const ok = await request(app).patch(`/tasks/${task._id}/progress`)
    .set('Authorization', bearer(emp)).send({ percentComplete: 250, status: 'in_progress' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.percentComplete, 100);
  assert.equal(ok.body.status, 'in_progress');
});

test('GET /timesheets injects assigned tasks for current week but not a past week', async () => {
  const pm = await User.create({ email: 'tpm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'temp@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  await Task.create({ project: project._id, title: 'Assigned work', assignee: emp._id, createdBy: pm._id });

  // current week Monday (UTC)
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const thisMon = currentMonday();
  const cur = await request(app).get(`/timesheets/${thisMon}`).set('Authorization', bearer(emp));
  assert.equal(cur.status, 200);
  assert.equal(cur.body.tasks.some((t) => t.name === 'Assigned work' && t.locked === true), true);

  // a Monday far in the past
  const past = await request(app).get('/timesheets/2020-01-06').set('Authorization', bearer(emp));
  assert.equal(past.status, 200);
  assert.equal(past.body.tasks.length, 0);
});

test('PUT /timesheets strips a taskId not assigned to the caller; /tasks/mine reports actualMinutes', async () => {
  const pm = await User.create({ email: 'apm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'aemp@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const mine = await Task.create({ project: project._id, title: 'Mine', assignee: emp._id, createdBy: pm._id });
  const notMine = await Task.create({ project: project._id, title: 'NotMine', assignee: pm._id, createdBy: pm._id });

  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const wk = currentMonday();
  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({
    tasks: [
      { id: 'r1', name: 'Mine', taskId: String(mine._id), entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } },
      { id: 'r2', name: 'Hack', taskId: String(notMine._id), entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } },
    ],
  });

  const saved = await Timesheet.findOne({ userId: emp._id, weekStart: wk });
  const hackRow = saved.tasks.find((t) => t.id === 'r2');
  assert.equal(hackRow.taskId, null);

  const res = await request(app).get('/tasks/mine').set('Authorization', bearer(emp));
  const mineRow = res.body.find((t) => t.title === 'Mine');
  assert.equal(mineRow.actualMinutes, 120);
});
```

- [ ] **Step 2: Run the suite**

Run: `cd auth-api && npm test`
Expected: PASS — all prior tests plus the 4 new ones.

- [ ] **Step 3: Commit**
```bash
git add auth-api/test/routes.test.js
git commit -m "test(pm): route tests for progress, timesheet injection, directory, actuals"
```

---

## Task 10: Frontend API client updates

**Files:** Modify `web/src/timesheet/timesheetApi.ts`, `web/src/pm/pmApi.ts`

- [ ] **Step 1: Extend the timesheet Task type**

In `web/src/timesheet/timesheetApi.ts`, replace the `Task` type with:
```ts
export type Task = {
  id: string;
  name: string;
  entries: Entries;
  taskId?: string | null;
  locked?: boolean;
  percentComplete?: number;
  estimatedHours?: number;
  actualMinutes?: number;
};
```

- [ ] **Step 2: Add directory + progress + types to pmApi**

In `web/src/pm/pmApi.ts`, add these exported types and functions (place the types near the other type exports, the functions near the other endpoint exports):
```ts
export type Person = { _id: string; displayName: string; email: string };
export type TaskDetail = {
  _id: string; title: string; description: string; estimatedHours: number;
  assignee: Person | null; status: string; percentComplete: number; actualMinutes: number;
};

export const listDirectory = () => authed('/users') as Promise<Person[]>;
export const setTaskProgress = (id: string, patch: { percentComplete?: number; status?: string }) =>
  authed(`/tasks/${id}/progress`, 'PATCH', patch);
```
Also extend the existing `Task` type in `pmApi.ts` by adding these two optional fields to it:
```ts
  percentComplete?: number;
  actualMinutes?: number;
```
And change the `getProject` return type to use the populated shapes:
```ts
export const getProject = (id: string) =>
  authed(`/projects/${id}`) as Promise<{ project: Omit<Project, 'members'> & { members: Person[] }; tasks: TaskDetail[] }>;
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**
```bash
git add web/src/timesheet/timesheetApi.ts web/src/pm/pmApi.ts
git commit -m "feat(pm): client types for timesheet links, directory, task progress"
```

---

## Task 11: Timesheet UI — PM-task rows with progress

**Files:** Modify `web/src/timesheet/TaskRow.tsx`, `web/src/timesheet/TimesheetGrid.tsx`, `web/src/timesheet/TimesheetPage.tsx`

- [ ] **Step 1: Update TaskRow to render PM-task rows**

Replace the contents of `web/src/timesheet/TaskRow.tsx` with:
```tsx
import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Day } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  task: Task;
  readOnly?: boolean;
  lockedDays?: Partial<Record<Day, boolean>>;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onDelete: () => void;
  onProgress: (patch: { percentComplete?: number; status?: string }) => void;
};

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export function TaskRow({ task, readOnly = false, lockedDays = {}, onRename, onCellChange, onDelete, onProgress }: Props) {
  const rowTotal = DAYS.reduce((sum, d) => sum + (task.entries[d] || 0), 0);
  const isPm = !!task.taskId;
  return (
    <tr>
      <td className="ts-task">
        {isPm ? (
          <div>
            <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
            <span className="ts-pm-badge">PM</span>
            <div className="ts-pm-meta">
              Planned {task.estimatedHours ?? 0}h · Actual {((task.actualMinutes ?? 0) / 60).toFixed(1)}h
            </div>
          </div>
        ) : readOnly ? (
          <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
        ) : (
          <input
            className="ts-name"
            placeholder="Task name"
            value={task.name}
            onChange={(e) => onRename(e.target.value)}
          />
        )}
      </td>
      {DAYS.map((d) => (
        <td key={d}>
          <TimeCell
            minutes={task.entries[d] || 0}
            readOnly={readOnly || !!lockedDays[d]}
            onChange={(m) => onCellChange(d, m)}
          />
        </td>
      ))}
      <td className="ts-rowtotal">{formatMinutes(rowTotal)}</td>
      <td className="ts-actions">
        {isPm ? (
          <div className="ts-progress">
            <input
              className="ts-pct"
              type="number"
              min={0}
              max={100}
              value={task.percentComplete ?? 0}
              disabled={readOnly}
              onChange={(e) => onProgress({ percentComplete: Number(e.target.value) })}
            />
            <span>%</span>
            <select
              className="input ts-status"
              value={task.status ?? 'todo'}
              disabled={readOnly}
              onChange={(e) => onProgress({ status: e.target.value })}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ) : (
          !readOnly && <button className="ts-del" type="button" aria-label="Delete task" onClick={onDelete}>×</button>
        )}
      </td>
    </tr>
  );
}
```
Note: the timesheet `Task` type has no `status` field; add `status?: string` to it. Open `web/src/timesheet/timesheetApi.ts` and add `status?: string;` to the `Task` type (the backend GET does not currently send status — that is fine, the dropdown falls back to `'todo'` and PATCH still works; the value will reflect after a reload once you also include status in the GET row. To keep it correct, ALSO update the backend: in `auth-api/src/services/timesheetRows.js` add `status: task.status || 'todo'` to BOTH pushed PM-row objects, and in `auth-api/src/routes/timesheets.js` add `status` to the `.select(...)` calls and to the `taskInfoById`/`assignedForMerge` objects). Make these backend additions now so the status displays correctly.

- [ ] **Step 2: Pass onProgress through TimesheetGrid**

In `web/src/timesheet/TimesheetGrid.tsx`, add `onProgress` to the component's `Props` type:
```ts
  onProgress: (taskId: string, patch: { percentComplete?: number; status?: string }) => void;
```
Add `onProgress` to the destructured params, and pass it to each `TaskRow`:
```tsx
            <TaskRow
              key={t.id}
              task={t}
              readOnly={readOnly}
              lockedDays={lockedDays}
              onRename={(name) => onRename(t.id, name)}
              onCellChange={(day, m) => onCellChange(t.id, day, m)}
              onDelete={() => onDelete(t.id)}
              onProgress={(patch) => onProgress(t.id, patch)}
            />
```

- [ ] **Step 3: Wire progress in TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`:
- Add the import: `import { setTaskProgress } from '../pm/pmApi';`
- Add this handler inside the component (after `onAddTask`):
```tsx
  function onProgress(id: string, patch: { percentComplete?: number; status?: string }) {
    const row = tasks.find((t) => t.id === id);
    if (!row?.taskId) return;
    setTaskProgress(row.taskId, patch).catch(() => {});
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
```
(Note: this updates local state without setting `dirty.current`, so it does NOT trigger the minutes autosave — progress is saved via its own endpoint.)
- Pass `onProgress={onProgress}` as a prop to `<TimesheetGrid ... />`.

- [ ] **Step 4: Add styles**

In `web/src/styles.css`, append:
```css
.ts-pm-badge { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 700; color: var(--primary); background: var(--primary-soft); padding: 1px 6px; border-radius: 999px; vertical-align: middle; }
.ts-pm-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
.ts-progress { display: flex; align-items: center; gap: 4px; }
.ts-pct { width: 52px; text-align: center; border: 1px solid var(--border); border-radius: 8px; padding: 5px 4px; font-size: 12px; }
.ts-status { padding: 5px 6px; font-size: 12px; width: auto; }
```

- [ ] **Step 5: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 6: Commit**
```bash
git add web/src/timesheet/TaskRow.tsx web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/TimesheetPage.tsx web/src/timesheet/timesheetApi.ts web/src/styles.css auth-api/src/services/timesheetRows.js auth-api/src/routes/timesheets.js
git commit -m "feat(pm): timesheet shows assigned tasks with % complete and status"
```

---

## Task 12: PM Project detail — members, names, actuals

**Files:** Modify `web/src/pm/Projects.tsx`

- [ ] **Step 1: Update ProjectDetail and the create-task form**

In `web/src/pm/Projects.tsx`, update the imports from `./pmApi` to include the new functions/types:
```ts
import {
  listProjects, createProject, getProject, createTask,
  listSkills, listDirectory, Project, Skill, Person, TaskDetail,
} from './pmApi';
```
Then rewrite the `ProjectDetail` component to load the directory, manage members, render names, and show actual/%/status. Replace the existing `ProjectDetail` function with:
```tsx
function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = useState<(Omit<Project, 'members'> & { members: Person[] }) | null>(null);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [directory, setDirectory] = useState<Person[]>([]);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reqSkills, setReqSkills] = useState<Set<string>>(new Set());
  const [newMember, setNewMember] = useState('');
  const [error, setError] = useState('');

  function reload() {
    getProject(id).then(({ project, tasks }) => { setProject(project); setTasks(tasks); })
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    reload();
    listSkills().then(setSkills).catch(() => {});
    listDirectory().then(setDirectory).catch(() => {});
  }, [id]);

  async function addMember() {
    if (!newMember || !project) return;
    setError('');
    try {
      const ids = [...project.members.map((m) => m._id), newMember];
      await (await import('./pmApi')).updateProjectMembers(id, ids);
      setNewMember('');
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeMember(mid: string) {
    if (!project) return;
    try {
      const ids = project.members.map((m) => m._id).filter((x) => x !== mid);
      await (await import('./pmApi')).updateProjectMembers(id, ids);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function add() {
    if (!title.trim()) return;
    setError('');
    try {
      await createTask(id, {
        title: title.trim(),
        estimatedHours: Number(estimate) || 0,
        assignee: assignee || null,
        requiredSkills: [...reqSkills],
      });
      setTitle(''); setEstimate(''); setAssignee(''); setReqSkills(new Set());
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  function toggleSkill(sid: string) {
    setReqSkills((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  }

  if (!project) return <div className="ts-page"><p className="center-loading">Loading…</p></div>;

  const nonMembers = directory.filter((d) => !project.members.some((m) => m._id === d._id));

  return (
    <div className="ts-page">
      <header className="ts-header">
        <button className="link-btn" onClick={onBack}>← Projects</button>
        <h1 className="ts-h1">{project.name}</h1>
      </header>
      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <strong>Members</strong>
        <div className="chips" style={{ justifyContent: 'flex-start', margin: '8px 0' }}>
          {project.members.length === 0 && <span className="ts-sub">No members yet.</span>}
          {project.members.map((m) => (
            <span key={m._id} className="chip">
              {m.displayName || m.email}
              <button className="link-btn" style={{ marginLeft: 6 }} onClick={() => removeMember(m._id)}>×</button>
            </span>
          ))}
        </div>
        <div className="ts-nav-left">
          <select className="input" value={newMember} onChange={(e) => setNewMember(e.target.value)}>
            <option value="">Add member…</option>
            {nonMembers.map((d) => <option key={d._id} value={d._id}>{d.displayName || d.email}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addMember}>Add</button>
        </div>
      </div>

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" style={{ width: 110 }} placeholder="Est. hrs" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {project.members.map((m) => <option key={m._id} value={m._id}>{m.displayName || m.email}</option>)}
          </select>
          <button className="btn btn-primary" onClick={add}>Add task</button>
        </div>
        <div className="chips" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          {skills.map((s) => (
            <button key={s._id} type="button" className="chip"
              style={{ cursor: 'pointer', opacity: reqSkills.has(s._id) ? 1 : 0.4 }}
              onClick={() => toggleSkill(s._id)}>{s.name}</button>
          ))}
        </div>
      </div>

      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Task</th><th>Assignee</th><th>Planned</th><th>Actual</th><th>%</th><th>Status</th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} className="ts-empty">No tasks yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{t.assignee ? (t.assignee.displayName || t.assignee.email) : 'Unassigned'}</td>
                <td>{t.estimatedHours}h</td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `updateProjectMembers` to pmApi**

In `web/src/pm/pmApi.ts`, add:
```ts
export const updateProjectMembers = (id: string, members: string[]) =>
  authed(`/projects/${id}`, 'PATCH', { members });
```
(Then you may simplify the dynamic `await import('./pmApi')` calls in Step 1 to use the imported `updateProjectMembers` directly — update the import line in `Projects.tsx` to include `updateProjectMembers` and call it directly instead of the dynamic import.)

- [ ] **Step 3: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 4: Commit**
```bash
git add web/src/pm/Projects.tsx web/src/pm/pmApi.ts
git commit -m "feat(pm): project detail member management, names, planned-vs-actual"
```

---

## Task 13: Employee My Tasks — actuals, %, status

**Files:** Modify `web/src/pm/MyTasks.tsx`

- [ ] **Step 1: Update the table**

In `web/src/pm/MyTasks.tsx`, replace the `<thead>`/`<tbody>` table markup so each row shows actual hours, percent complete, and status. Replace the existing `<table className="ts-table"> ... </table>` block with:
```tsx
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Task</th><th>Project</th><th>Est. hrs</th>
              <th>Actual</th><th>%</th><th>Status</th><th>Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={7} className="ts-empty">No tasks assigned to you yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{typeof t.project === 'object' ? t.project.name : '—'}</td>
                <td>{t.estimatedHours}</td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td>{t.status}</td>
                <td>{t.dueDate ? t.dueDate.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
```

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/MyTasks.tsx
git commit -m "feat(pm): My Tasks shows actual hours, percent complete, status"
```

---

## Task 14: Full verification

- [ ] **Step 1: Backend suite**

Run: `cd auth-api && npm test`
Expected: all tests pass (authz + timesheetRows + routes).

- [ ] **Step 2: Frontend tests + typecheck + build**

Run: `cd web && node --test --experimental-strip-types "src/**/*.test.ts" && npx tsc --noEmit && npm run build`
Expected: tests pass; tsc exit 0; build succeeds.

- [ ] **Step 3: Manual smoke (requires Mongo + ADMIN_EMAIL)**

Log in as a PM, open a project, add a member (employee), create a task assigned to them. Log in as that employee → open the **current** week of the Timesheet → confirm the assigned task appears as a locked row with a % field and status dropdown. Log time, set % to 50. Re-open as the PM → project detail shows Actual hours > 0 and 50%.

- [ ] **Step 4: Final commit (if manual fixes were needed)**
```bash
git add -A && git commit -m "chore(pm): timesheet-PM integration verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** assigned tasks injected into editable weeks (Task 3, 5); actual hours computed (Task 4) and surfaced on `/tasks/mine` (6), project detail (7), and timesheet rows (5/11); `% complete` + status via assignee-only `PATCH /tasks/:id/progress` (2, 6); taskId validation on save (3, 5, 9); `GET /users` directory PM/Admin-only (8, 9); member management UI + name display (12); My Tasks actuals (13); past weeks frozen (3, 5, 9). Migration-free (Task 1 defaults).
- **Deferred correctly:** no marketplace, dashboards, or dependency alerts.
- **Type consistency:** `actualMinutes`/`percentComplete`/`status` flow consistently from backend (`actuals.js`, route enrichment, `timesheetRows.mergeWeekRows`) through `pmApi`/`timesheetApi` types to the components; `Person`/`TaskDetail` populated shapes match the populated `GET /projects/:id` response; `onProgress(taskId, patch)` signature consistent across `TimesheetPage` → `TimesheetGrid` → `TaskRow`.
