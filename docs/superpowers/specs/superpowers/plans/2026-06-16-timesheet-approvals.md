# Timesheet Approval Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock all timesheet days except today (past days editable only after a PM-approved edit request, enforced server-side), and make task estimates employee-proposed with PM approval.

**Architecture:** Extend `auth-api` (Express/Mongoose ESM) and the React SPA. The day-lock and editable-day rules are pure, unit-tested helpers in `services/timesheetRows.js`; a new `EditRequest` model + router carries the request/approve flow; `Task` gains `proposedHours`/`estimateStatus`. The backend is authoritative — `PUT /timesheets` preserves locked-day values regardless of payload.

**Tech Stack:** Node 20 ESM, Express 4, Mongoose 8, `node:test` + `mongodb-memory-server` + `supertest`; React 18 + TS + Vite.

**Reference spec:** `docs/superpowers/specs/2026-06-16-timesheet-approvals-design.md`

**Conventions:** Backend from `auth-api/`; frontend from `web/`. Weekday keys `mon,tue,wed,thu,fri`. `req.user` = `{ sub, email, name, role }`. Dates compared as ISO `YYYY-MM-DD` strings (lexicographic = chronological).

---

## File Structure

**Backend**
- Create `src/models/EditRequest.js`
- Modify `src/models/Task.js` — `proposedHours`, `estimateStatus`
- Modify `src/services/timesheetRows.js` — `editableDaysFor`, `applyDayLock`, `todayISO`
- Modify `src/routes/timesheets.js` — return `editableDays`/`readOnly`; enforce day-lock on PUT; POST edit-request
- Create `src/routes/editRequests.js` — list + decide
- Modify `src/routes/tasks.js` — estimate propose + decision
- Modify `src/routes/projects.js` — drop PM estimate input on task create
- Modify `src/app.js` — mount edit-requests router
- Modify `test/timesheetRows.test.js`, `test/routes.test.js`

**Frontend**
- Modify `src/pm/nav.ts` + `src/pm/nav.test.ts` — `requests` nav for pm/admin
- Modify `src/AppShell.tsx` — route `requests` view
- Modify `src/timesheet/timesheetApi.ts` — `WeekData` (tasks + editableDays + readOnly); `createEditRequest`
- Modify `src/pm/pmApi.ts` — edit-request + estimate endpoints/types
- Modify `src/timesheet/TimesheetPage.tsx`, `TimesheetGrid.tsx` — editable-day driven locking + request affordance
- Create `src/pm/Requests.tsx` — PM approval view
- Modify `src/pm/MyTasks.tsx` — propose estimate
- Modify `src/pm/Projects.tsx` — approve/reject estimate; drop Est. hrs input

---

## Task 1: EditRequest model + Task estimate fields

**Files:** Create `auth-api/src/models/EditRequest.js`; Modify `auth-api/src/models/Task.js`

- [ ] **Step 1: Create EditRequest model**

```js
import mongoose from 'mongoose';

const editRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true },
  day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  reason: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

editRequestSchema.index({ userId: 1, weekStart: 1, day: 1 });

export const EditRequest = mongoose.model('EditRequest', editRequestSchema);
```

- [ ] **Step 2: Add estimate fields to Task**

In `auth-api/src/models/Task.js`, add right after the `percentComplete` field:
```js
  proposedHours: { type: Number, default: 0 },
  estimateStatus: { type: String, enum: ['none', 'proposed', 'approved', 'rejected'], default: 'none' },
```

- [ ] **Step 3: Verify imports**

Run: `cd auth-api && node -e "Promise.all([import('./src/models/EditRequest.js'),import('./src/models/Task.js')]).then(([a,b])=>console.log(typeof a.EditRequest, b.Task.schema.path('estimateStatus').defaultValue))"`
Expected: prints `function none`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/models/EditRequest.js auth-api/src/models/Task.js
git commit -m "feat(pm): EditRequest model + task estimate proposal fields"
```

---

## Task 2: editableDaysFor + applyDayLock helpers (TDD)

**Files:** Modify `auth-api/src/services/timesheetRows.js`, `auth-api/test/timesheetRows.test.js`

- [ ] **Step 1: Add failing tests**

Append to `auth-api/test/timesheetRows.test.js` (add the new names to the existing import from `../src/services/timesheetRows.js`):
```js
test('editableDaysFor: only today is editable with no approvals', () => {
  // week of Mon 2026-06-15; today Wed 2026-06-17
  const days = editableDaysFor('2026-06-15', '2026-06-17', []);
  assert.deepEqual(days, ['wed']);
});

test('editableDaysFor: an approved PAST day is also editable; future never', () => {
  const days = editableDaysFor('2026-06-15', '2026-06-17', ['mon', 'fri']);
  // mon is past + approved -> editable; fri is future + approved -> NOT editable; wed is today
  assert.deepEqual(days.sort(), ['mon', 'wed']);
});

test('editableDaysFor: past week with an approved day', () => {
  const days = editableDaysFor('2026-06-08', '2026-06-17', ['thu']);
  assert.deepEqual(days, ['thu']);
});

test('applyDayLock: editable-day minutes apply, locked-day minutes keep saved values', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: null, entries: { mon: 99, tue: 99, wed: 60, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', entries: { mon: 30, tue: 45, wed: 0, thu: 0, fri: 0 } }];
  const out = applyDayLock(submitted, saved, ['wed']);
  assert.equal(out[0].entries.wed, 60); // editable -> applied
  assert.equal(out[0].entries.mon, 30); // locked -> kept from saved
  assert.equal(out[0].entries.tue, 45); // locked -> kept from saved
});

test('applyDayLock: a new row cannot put minutes on a locked day', () => {
  const submitted = [{ id: 'new', name: 'X', taskId: null, entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const out = applyDayLock(submitted, [], ['wed']);
  assert.equal(out[0].entries.mon, 0);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd auth-api && npm test`
Expected: FAIL — `editableDaysFor`/`applyDayLock` not exported.

- [ ] **Step 3: Implement**

In `auth-api/src/services/timesheetRows.js`, add at the end of the file:
```js
function addDaysISO(weekStart, n) {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export function editableDaysFor(weekStart, today, approvedDays = []) {
  const approved = new Set(approvedDays);
  const out = [];
  DAYS.forEach((day, i) => {
    const date = addDaysISO(weekStart, i);
    if (date === today) out.push(day);
    else if (date < today && approved.has(day)) out.push(day);
  });
  return out;
}

export function applyDayLock(submittedRows, savedRows, editableDays) {
  const editable = new Set(editableDays);
  const savedById = new Map((savedRows || []).map((r) => [String(r.id), r]));
  return (submittedRows || []).map((r) => {
    const prev = savedById.get(String(r.id));
    const entries = {};
    for (const d of DAYS) {
      entries[d] = editable.has(d) ? cleanMinutes(r?.entries?.[d]) : cleanMinutes(prev?.entries?.[d]);
    }
    return { ...r, entries };
  });
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `cd auth-api && npm test`
Expected: PASS — new helper tests green.

- [ ] **Step 5: Commit**
```bash
git add auth-api/src/services/timesheetRows.js auth-api/test/timesheetRows.test.js
git commit -m "feat(pm): editable-day + day-lock helpers with tests"
```

---

## Task 3: Timesheets route — editableDays, day-lock, edit-request creation

**Files:** Modify `auth-api/src/routes/timesheets.js`

- [ ] **Step 1: Replace the file**

Replace `auth-api/src/routes/timesheets.js` entirely with:
```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { Task } from '../models/Task.js';
import { EditRequest } from '../models/EditRequest.js';
import {
  mergeWeekRows, sanitizeRows, applyDayLock, currentMonday, editableDaysFor, todayISO, DAYS,
} from '../services/timesheetRows.js';
import { actualMinutesByTask } from '../services/actuals.js';

function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1;
}

async function approvedDaysFor(userId, weekStart) {
  const reqs = await EditRequest.find({ userId, weekStart, status: 'approved' }).select('day');
  return reqs.map((r) => r.day);
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
    const injectable = weekStart >= currentMonday();

    let assignedTasks = [];
    if (injectable) {
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status');
    }

    const ids = new Set();
    for (const t of assignedTasks) ids.add(String(t._id));
    for (const r of savedRows) if (r.taskId) ids.add(r.taskId);
    const idList = [...ids];
    const actualMap = await actualMinutesByTask(idList);

    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title percentComplete estimatedHours status')
      : [];
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
    }]));
    const assignedForMerge = assignedTasks.map((t) => ({
      _id: String(t._id), title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
    }));

    const tasks = mergeWeekRows({ savedRows, assignedTasks: assignedForMerge, taskInfoById, editable: injectable });

    const approved = await approvedDaysFor(userId, weekStart);
    const editableDays = editableDaysFor(weekStart, todayISO(), approved);
    const readOnly = weekStart < currentMonday() && editableDays.length === 0;

    res.json({ weekStart, tasks, editableDays, readOnly });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const assigned = await Task.find({ assignee: userId }).select('_id');
    const allowed = assigned.map((t) => String(t._id));
    const sanitized = sanitizeRows(req.body?.tasks, allowed);

    const doc = await Timesheet.findOne({ userId, weekStart });
    const savedRows = doc ? doc.tasks : [];
    const approved = await approvedDaysFor(userId, weekStart);
    const editableDays = editableDaysFor(weekStart, todayISO(), approved);
    const tasks = applyDayLock(sanitized, savedRows, editableDays);

    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { tasks, updatedAt }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    res.json({ ok: true, updatedAt });
  }));

  router.post('/:weekStart/edit-requests', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const day = req.body?.day;
    if (!DAYS.includes(day)) return res.status(400).json({ error: 'invalid day' });
    const userId = req.user.sub;
    const editableDays = editableDaysFor(weekStart, todayISO(), []);
    if (editableDays.includes(day)) return res.status(400).json({ error: 'that day is already editable' });
    // must be a PAST day (its date strictly before today)
    const idx = DAYS.indexOf(day);
    const dayDate = new Date(`${weekStart}T00:00:00Z`);
    dayDate.setUTCDate(dayDate.getUTCDate() + idx);
    if (dayDate.toISOString().slice(0, 10) >= todayISO()) {
      return res.status(400).json({ error: 'can only request edits for a past day' });
    }
    const existing = await EditRequest.findOne({ userId, weekStart, day, status: { $in: ['pending', 'approved'] } });
    if (existing) return res.status(409).json({ error: 'a request for this day already exists' });
    const reqDoc = await EditRequest.create({ userId, weekStart, day, reason: String(req.body?.reason || '') });
    res.status(201).json(reqDoc);
  }));

  return router;
}
```

- [ ] **Step 2: Verify import + suite**

Run: `cd auth-api && node -e "import('./src/routes/timesheets.js').then(m => console.log(typeof m.createTimesheetRouter))" && npm test`
Expected: prints `function`; existing tests pass.

- [ ] **Step 3: Commit**
```bash
git add auth-api/src/routes/timesheets.js
git commit -m "feat(pm): timesheet day-lock enforcement, editableDays, edit-request creation"
```

---

## Task 4: Edit-requests router (list + decide) + mount

**Files:** Create `auth-api/src/routes/editRequests.js`; Modify `auth-api/src/app.js`

- [ ] **Step 1: Create the router**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { EditRequest } from '../models/EditRequest.js';

export function createEditRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('pm', 'admin'));

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status || 'pending';
    const reqs = await EditRequest.find({ status })
      .populate('userId', 'displayName email')
      .sort('-createdAt');
    res.json(reqs);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const reqDoc = await EditRequest.findByIdAndUpdate(
      req.params.id,
      { status: decision, decidedBy: req.user.sub, decidedAt: new Date() },
      { new: true },
    );
    if (!reqDoc) return res.status(404).json({ error: 'not found' });
    res.json(reqDoc);
  }));

  return router;
}
```

- [ ] **Step 2: Mount it in app.js**

In `auth-api/src/app.js`, add the import with the other route imports:
```js
import { createEditRequestsRouter } from './routes/editRequests.js';
```
And add the mount next to the others (before the error handler):
```js
  app.use('/edit-requests', createEditRequestsRouter());
```

- [ ] **Step 3: Verify app boots**

Run: `cd auth-api && node -e "import('./src/app.js').then(m => console.log(typeof m.createApp))"`
Expected: prints `function`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/editRequests.js auth-api/src/app.js
git commit -m "feat(pm): edit-requests list/decide router (PM/admin)"
```

---

## Task 5: Tasks route — estimate propose + decision; drop PM estimate on create

**Files:** Modify `auth-api/src/routes/tasks.js`, `auth-api/src/routes/projects.js`

- [ ] **Step 1: Add estimate endpoints to tasks.js**

In `auth-api/src/routes/tasks.js`, after the existing `router.patch('/:id/progress', ...)` handler and before `router.patch('/:id', ...)`, add:
```js
  router.patch('/:id/estimate', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (!canLogProgress(req.user, task)) return res.status(403).json({ error: 'forbidden' });
    task.proposedHours = Math.max(0, Math.round(Number(req.body?.proposedHours) || 0));
    task.estimateStatus = 'proposed';
    await task.save();
    res.json(task);
  }));

  router.patch('/:id/estimate/decision', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    if (decision === 'approve') {
      task.estimatedHours = task.proposedHours;
      task.estimateStatus = 'approved';
    } else {
      task.estimateStatus = 'rejected';
    }
    await task.save();
    res.json(task);
  }));
```
(The imports `canLogProgress`, `canEditProject`, `Project` are already present in this file.)

- [ ] **Step 2: Drop the PM-set estimate on task creation**

In `auth-api/src/routes/projects.js`, in the `router.post('/:id/tasks', ...)` handler, change the `Task.create({ ... })` call so `estimatedHours` is no longer taken from the request — remove the `estimatedHours: Number(estimatedHours) || 0,` line from the create object (leave the rest). Also remove `estimatedHours` from the destructured `req.body` line if present. The task will default `estimatedHours: 0`, `estimateStatus: 'none'`.

- [ ] **Step 3: Verify imports + suite**

Run: `cd auth-api && node -e "import('./src/routes/tasks.js').then(m=>console.log(typeof m.createTasksRouter))" && node -e "import('./src/routes/projects.js').then(m=>console.log(typeof m.createProjectsRouter))" && npm test`
Expected: prints `function` twice; existing tests pass.

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/tasks.js auth-api/src/routes/projects.js
git commit -m "feat(pm): employee proposes estimate, PM approves; drop PM estimate input"
```

---

## Task 6: Backend route tests for both workflows

**Files:** Modify `auth-api/test/routes.test.js`

- [ ] **Step 1: Add tests**

Ensure `EditRequest` is imported at the top of `auth-api/test/routes.test.js`:
```js
const { EditRequest } = await import('../src/models/EditRequest.js');
```
Append these tests at the end:
```js
test('edit-requests: GET is forbidden for employees', async () => {
  const emp = await User.create({ email: 'er-e@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/edit-requests').set('Authorization', bearer(emp));
  assert.equal(res.status, 403);
});

test('PUT /timesheets ignores a locked past day until it is approved', async () => {
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const emp = await User.create({ email: 'lock-e@x.com', displayName: 'E', role: 'employee' });
  const pm = await User.create({ email: 'lock-pm@x.com', displayName: 'PM', role: 'pm' });
  const wk = currentMonday();
  // try to write Monday (a past day in the current week, unless today is Monday)
  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({
    tasks: [{ id: 'r1', name: 'A', taskId: null, entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } }],
  });
  let saved = await Timesheet.findOne({ userId: emp._id, weekStart: wk });
  const monBefore = saved.tasks.find((t) => t.id === 'r1')?.entries.mon ?? 0;

  // approve a Monday edit request, then write again
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', status: 'approved' });
  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({
    tasks: [{ id: 'r1', name: 'A', taskId: null, entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } }],
  });
  saved = await Timesheet.findOne({ userId: emp._id, weekStart: wk });
  const monAfter = saved.tasks.find((t) => t.id === 'r1')?.entries.mon ?? 0;

  // If today is Monday the day was editable anyway; otherwise it was locked then unlocked.
  const todayDow = new Date().getUTCDay();
  if (todayDow !== 1) {
    assert.equal(monBefore, 0);
  }
  assert.equal(monAfter, 120);
});

test('PATCH /tasks/:id/estimate: assignee proposes, non-assignee 403; PM approves', async () => {
  const pm = await User.create({ email: 'est-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'est-e@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'est-o@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignee: emp._id, createdBy: pm._id });

  const forbidden = await request(app).patch(`/tasks/${task._id}/estimate`)
    .set('Authorization', bearer(other)).send({ proposedHours: 5 });
  assert.equal(forbidden.status, 403);

  const propose = await request(app).patch(`/tasks/${task._id}/estimate`)
    .set('Authorization', bearer(emp)).send({ proposedHours: 8 });
  assert.equal(propose.status, 200);
  assert.equal(propose.body.estimateStatus, 'proposed');
  assert.equal(propose.body.proposedHours, 8);

  const approve = await request(app).patch(`/tasks/${task._id}/estimate/decision`)
    .set('Authorization', bearer(pm)).send({ decision: 'approve' });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.estimateStatus, 'approved');
  assert.equal(approve.body.estimatedHours, 8);
});
```

- [ ] **Step 2: Run the suite**

Run: `cd auth-api && npm test`
Expected: PASS — all prior plus the new tests.

- [ ] **Step 3: Commit**
```bash
git add auth-api/test/routes.test.js
git commit -m "test(pm): edit-request lock + estimate approval route tests"
```

---

## Task 7: Frontend nav + Requests view wiring

**Files:** Modify `web/src/pm/nav.ts`, `web/src/pm/nav.test.ts`, `web/src/AppShell.tsx`

- [ ] **Step 1: Add `requests` to NavKey and pm/admin nav**

In `web/src/pm/nav.ts`:
- Add `'requests'` to the `NavKey` union.
- Admin nav becomes `users, skills, projects, requests, timesheet`.
- PM nav becomes `projects, requests, timesheet`.

Replace the function body so:
```ts
  if (role === 'admin') {
    return [
      { key: 'users', label: 'Users' },
      { key: 'skills', label: 'Skills' },
      { key: 'projects', label: 'Projects' },
      { key: 'requests', label: 'Requests' },
      timesheet,
    ];
  }
  if (role === 'pm') {
    return [{ key: 'projects', label: 'Projects' }, { key: 'requests', label: 'Requests' }, timesheet];
  }
```
And update `NavKey`:
```ts
export type NavKey = 'users' | 'skills' | 'projects' | 'requests' | 'my-tasks' | 'my-skills' | 'timesheet';
```

- [ ] **Step 2: Update nav tests**

In `web/src/pm/nav.test.ts`:
```ts
  assert.deepEqual(navForRole('admin').map((n) => n.key), ['users', 'skills', 'projects', 'requests', 'timesheet']);
```
and
```ts
  assert.deepEqual(navForRole('pm').map((n) => n.key), ['projects', 'requests', 'timesheet']);
```

- [ ] **Step 3: Route the view in AppShell**

In `web/src/AppShell.tsx`, add the import:
```tsx
import { Requests } from './pm/Requests';
```
And add a case to `viewFor`:
```tsx
    case 'requests': return <Requests />;
```

- [ ] **Step 4: Run nav test**

Run: `cd web && node --test --experimental-strip-types src/pm/nav.test.ts`
Expected: 3 tests pass.

(`tsc` will fail until Task 9 creates `Requests.tsx`; that's expected — commit after Task 9. For now just confirm the nav test passes.)

- [ ] **Step 5: Commit**
```bash
git add web/src/pm/nav.ts web/src/pm/nav.test.ts web/src/AppShell.tsx
git commit -m "feat(pm): requests nav + view routing"
```

---

## Task 8: Frontend API client — week data, edit-requests, estimates

**Files:** Modify `web/src/timesheet/timesheetApi.ts`, `web/src/pm/pmApi.ts`

- [ ] **Step 1: timesheetApi — return week data + create edit request**

In `web/src/timesheet/timesheetApi.ts`:
- Add a `Day` import is already present. Add a `WeekData` type and change `getWeek` to return it:
```ts
export type WeekData = { weekStart: string; tasks: Task[]; editableDays: Day[]; readOnly: boolean };
```
- Replace `getWeek` so it returns the full payload:
```ts
export async function getWeek(weekStart: string): Promise<WeekData> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, { headers: authHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data = await r.json();
  return { weekStart: data.weekStart, tasks: data.tasks as Task[], editableDays: data.editableDays as Day[], readOnly: !!data.readOnly };
}
```
- Add an edit-request creator:
```ts
export async function createEditRequest(weekStart: string, day: Day, reason: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/edit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ day, reason }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `request failed (${r.status})`);
  }
}
```

- [ ] **Step 2: pmApi — edit-request approval + estimate endpoints/types**

In `web/src/pm/pmApi.ts`:
- Add types:
```ts
export type EditReq = {
  _id: string; userId: Person; weekStart: string; day: string; reason: string; status: string; createdAt: string;
};
```
- Add `proposedHours` and `estimateStatus` to the `TaskDetail` type and the `Task` type:
```ts
  proposedHours?: number;
  estimateStatus?: string;
```
- Add endpoints:
```ts
export const listEditRequests = () => authed('/edit-requests?status=pending') as Promise<EditReq[]>;
export const decideEditRequest = (id: string, decision: 'approved' | 'denied') =>
  authed(`/edit-requests/${id}`, 'PATCH', { decision });
export const proposeEstimate = (id: string, proposedHours: number) =>
  authed(`/tasks/${id}/estimate`, 'PATCH', { proposedHours });
export const decideEstimate = (id: string, decision: 'approve' | 'reject') =>
  authed(`/tasks/${id}/estimate/decision`, 'PATCH', { decision });
```

- [ ] **Step 3: Typecheck deferred**

(`tsc` still red until the components consume these; verified at Task 11.) Commit now:
```bash
git add web/src/timesheet/timesheetApi.ts web/src/pm/pmApi.ts
git commit -m "feat(pm): client week data, edit-request and estimate endpoints"
```

---

## Task 9: Requests view (PM/Admin)

**Files:** Create `web/src/pm/Requests.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react';
import { listEditRequests, decideEditRequest, EditReq } from './pmApi';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

export function Requests() {
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [error, setError] = useState('');

  function reload() { listEditRequests().then(setReqs).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function decide(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideEditRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Edit Requests</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Week</th><th>Day</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={5} className="ts-empty">No pending requests.</td></tr>}
            {reqs.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{r.userId?.displayName || r.userId?.email || '—'}</td>
                <td>{r.weekStart}</td>
                <td>{DAY_LABEL[r.day] || r.day}</td>
                <td>{r.reason || '—'}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decide(r._id, 'approved')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(r._id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add web/src/pm/Requests.tsx
git commit -m "feat(pm): PM/Admin edit-request approval view"
```

---

## Task 10: Timesheet UI — editable-day locking + request affordance

**Files:** Modify `web/src/timesheet/TimesheetPage.tsx`, `web/src/timesheet/TimesheetGrid.tsx`

- [ ] **Step 1: TimesheetPage consumes editableDays/readOnly from the server**

In `web/src/timesheet/TimesheetPage.tsx`:
- Add state: `const [editableDays, setEditableDays] = useState<string[]>([]);` and `const [readOnly, setReadOnly] = useState(false);`
- In `load`, after `const loaded = await getWeek(week);`, set them and use `loaded.tasks`:
```tsx
      if (weekStartRef.current !== week) return;
      setTasks(loaded.tasks);
      setEditableDays(loaded.editableDays);
      setReadOnly(loaded.readOnly);
```
  (Update the destructure: `loaded` is now a `WeekData`; replace the previous `setTasks(loaded)` and remove any `isPastWeek` usage for readOnly.)
- Remove the old `const readOnly = isPastWeek(weekStart);` line and the `isPastWeek` import if now unused.
- Pass `readOnly={readOnly}` and a new `editableDays={editableDays}` to `<TimesheetGrid />` and `<WeekNav />` where `readOnly` was used. Keep existing `onCopyLastWeek`/nav wiring.
- Add an edit-request handler:
```tsx
  async function onRequestEdit(day: string) {
    const reason = window.prompt('Reason for editing this past day?') ?? '';
    try { await createEditRequest(weekStart, day as never, reason); window.alert('Request sent to your PM.'); }
    catch (e) { window.alert((e as Error).message); }
  }
```
  and import `createEditRequest` from `./timesheetApi`. Pass `onRequestEdit={onRequestEdit}` to `<TimesheetGrid />`.

- [ ] **Step 2: TimesheetGrid locks cells by editableDays and shows a request link**

In `web/src/timesheet/TimesheetGrid.tsx`:
- Replace the `lockedDays`/`isFutureDate` logic. Add to `Props`:
```ts
  editableDays: string[];
  onRequestEdit: (day: string) => void;
```
- Remove the `dayDates`/`isFutureDate`/`lockedDays` computation; instead compute per-day lock from `editableDays`:
```tsx
  const editable = new Set(props.editableDays);
```
  (adjust to your destructure; if destructured, `const editable = new Set(editableDays);`).
- In the header row, for each day `d`, render a header that, when the day is NOT editable AND it is a past day, offers a Request link. Since the grid already has `cols[d]` labels, replace the header cell with:
```tsx
            {DAYS.map((d) => (
              <th key={d} className={editable.has(d) ? undefined : 'ts-day-future'}>
                {cols[d]}
                {!editable.has(d) && (
                  <button className="link-btn ts-req" type="button" onClick={() => onRequestEdit(d)}>request</button>
                )}
              </th>
            ))}
```
- Pass per-day lock into each row. The `TaskRow` `lockedDays` prop currently is `Partial<Record<Day, boolean>>`. Build it from `editable`:
```tsx
  const lockedDays = {} as Record<Day, boolean>;
  DAYS.forEach((d) => { lockedDays[d] = !editable.has(d); });
```
  and keep passing `lockedDays={lockedDays}` to `TaskRow` (existing prop). Remove the old future-based `lockedDays`.
- `Day` import stays; you can drop the now-unused `dayDates`/`isFutureDate` imports from `./time`.

- [ ] **Step 3: Styles for the request link**

Append to `web/src/styles.css`:
```css
.ts-req { font-size: 10px; margin-left: 6px; font-weight: 600; }
```

- [ ] **Step 4: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds. (Fix any leftover references to the removed `isPastWeek`/`isFutureDate` in these two files.)

- [ ] **Step 5: Commit**
```bash
git add web/src/timesheet/TimesheetPage.tsx web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat(pm): timesheet locks all but today; request-edit on past days"
```

---

## Task 11: My Tasks — propose estimate

**Files:** Modify `web/src/pm/MyTasks.tsx`

- [ ] **Step 1: Add a propose-estimate control per task**

In `web/src/pm/MyTasks.tsx`, import `proposeEstimate` from `./pmApi`. Add a small per-row input + button in a new column. Replace the table block with:
```tsx
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Task</th><th>Project</th><th>Estimate</th>
              <th>Actual</th><th>%</th><th>Status</th><th>Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={7} className="ts-empty">No tasks assigned to you yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{typeof t.project === 'object' ? t.project.name : '—'}</td>
                <td>
                  {t.estimateStatus === 'approved'
                    ? `${t.estimatedHours}h`
                    : (
                      <span className="ts-nav-left">
                        <input className="ts-pct" type="number" min={0} defaultValue={t.proposedHours ?? 0}
                          onBlur={(e) => propose(t._id, Number(e.target.value))} />
                        <span className="ts-sub">{t.estimateStatus === 'proposed' ? 'proposed' : t.estimateStatus === 'rejected' ? 'rejected' : 'propose hrs'}</span>
                      </span>
                    )}
                </td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td>{t.status}</td>
                <td>{t.dueDate ? t.dueDate.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
```
Add the handler inside the component:
```tsx
  async function propose(id: string, hours: number) {
    setError('');
    try { await proposeEstimate(id, hours); myTasks().then(setTasks); }
    catch (e) { setError((e as Error).message); }
  }
```
(`myTasks` and `setTasks`/`setError` already exist; the `Task` type now has `proposedHours`/`estimateStatus`/`estimatedHours` optional — `estimatedHours` is already on the type.)

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/MyTasks.tsx
git commit -m "feat(pm): employees propose task estimates from My Tasks"
```

---

## Task 12: Project detail — approve/reject estimate; drop Est. hrs input

**Files:** Modify `web/src/pm/Projects.tsx`

- [ ] **Step 1: Remove the create-task Est. hrs input**

In `web/src/pm/Projects.tsx` `ProjectDetail`, delete the estimate `<input ... placeholder="Est. hrs" ... />` from the create-task row and the `estimate`/`setEstimate` state and its use in `createTask` (pass no `estimatedHours`). Leave title/assignee/skills.

- [ ] **Step 2: Show estimate status + Approve/Reject in the task table**

Import `decideEstimate` from `./pmApi`. Replace the "Planned" cell rendering in the task table so it reflects the estimate workflow. Change the Planned `<td>` to:
```tsx
                <td>
                  {t.estimateStatus === 'proposed' ? (
                    <span className="ts-nav-left">
                      {t.proposedHours ?? 0}h?
                      <button className="link-btn" onClick={() => decide(t._id, 'approve')}>approve</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(t._id, 'reject')}>reject</button>
                    </span>
                  ) : t.estimateStatus === 'approved' ? `${t.estimatedHours}h`
                    : <span className="ts-sub">{t.estimateStatus === 'rejected' ? 'rejected' : 'no estimate'}</span>}
                </td>
```
Add the handler in `ProjectDetail`:
```tsx
  async function decide(taskId: string, decision: 'approve' | 'reject') {
    setError('');
    try { await decideEstimate(taskId, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }
```
Ensure the `TaskDetail` type has `proposedHours`/`estimateStatus`/`estimatedHours` (estimatedHours already there; the other two added in Task 8). If `estimatedHours` is missing from `TaskDetail`, add it.

- [ ] **Step 3: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 4: Commit**
```bash
git add web/src/pm/Projects.tsx
git commit -m "feat(pm): PM approves/rejects proposed estimates; remove PM estimate input"
```

---

## Task 13: Full verification

- [ ] **Step 1: Backend**

Run: `cd auth-api && npm test`
Expected: all tests pass.

- [ ] **Step 2: Frontend**

Run: `cd web && node --test --experimental-strip-types "src/**/*.test.ts" && npx tsc --noEmit && npm run build`
Expected: tests pass; tsc 0; build OK.

- [ ] **Step 3: Manual smoke (Mongo + ADMIN_EMAIL)**

As an employee, open the current week → only today's cells are editable; an earlier day shows "request". Click it, give a reason. As a PM, open **Requests** → Approve. Back as the employee, reload the week → that day is now editable. On **My Tasks**, propose an estimate; as the PM on **Project detail**, approve it → the task's Planned shows the approved hours and the timesheet PM-row Planned matches.

- [ ] **Step 4: Final commit (if fixes needed)**
```bash
git add -A && git commit -m "chore(pm): approval workflows verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** only-today editability + approved past days (Tasks 2,3,10); server-enforced day-lock on PUT (2,3,6); edit-request create/list/decide (3,4,9,10); estimate proposed→approved with PM (1,5,6,11,12); PM no longer sets estimate (5,12); Requests nav/view (7,9); migration-free defaults (1).
- **Type consistency:** `editableDays: Day[]` + `readOnly` flow GET → `WeekData` → `TimesheetPage` → `TimesheetGrid` (per-day `lockedDays`); `proposedHours`/`estimateStatus` on `Task`/`TaskDetail` consumed by My Tasks + Project detail; `EditReq.userId` is a populated `Person`.
- **Deferred:** approval auto-expiry, dashboards, marketplace, dependency alerts.
