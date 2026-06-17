# Project-Scoped, Single-Use Past-Day Edit Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a past-day timesheet edit grant scoped to one project and single-use: an approval unlocks only that project's rows for that day, and the first save that actually changes that project's hours consumes the grant and re-locks it.

**Architecture:** Replace the per-day-column lock (`editableDays` + `applyDayLock`) with per-row evaluation. `EditRequest` gains `projectId` and a `'used'` status. A pure `computeRowLock` helper locks each cell by `(row's project, day)` and reports which grants a save consumed; the timesheets route flips those grants to `used`. The frontend computes each cell's lock from `todayDay` + `grants` + the row's `projectId`, and moves the "request edit" affordance onto the locked past-day cell of a task row.

**Tech Stack:** Node 20 + Express + Mongoose (auth-api), React + TypeScript + Vite (web). Tests: `node --test` in both packages; `supertest` + `mongodb-memory-server` for routes.

## Global Constraints

- Spec: `auth-api/superpowers/specs/2026-06-17-project-scoped-edit-access-design.md`. Every task implements part of it.
- An **active grant** = `EditRequest` with `status: 'approved'`. Consuming sets `status: 'used'`.
- API/row field name is `projectId` (string). The Mongoose `Task` field is `project` — derive `projectId` from `task.project`.
- Weekdays: `['mon','tue','wed','thu','fri']` (`DAYS` in `services/timesheetRows.js`). Dates are UTC.
- Ad-hoc rows (`taskId == null`, `projectId == null`) are editable only on today; their past days are always locked and never requestable.
- No migration: legacy `approved` requests without `projectId` are left in place and ignored.
- Backend tests run with `cd auth-api && npm test`; web tests with `cd web && npm test`.

---

### Task 1: `EditRequest` model — add `projectId` + `used` status

**Files:**
- Modify: `auth-api/src/models/EditRequest.js`

**Interfaces:**
- Produces: `EditRequest` schema with `projectId: ObjectId(ref Project, required)`, `status` enum `['pending','approved','used','denied']`, index `{ userId, weekStart, day, projectId }`.

- [ ] **Step 1: Update the schema**

Replace the file body with:

```js
import mongoose from 'mongoose';

const editRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true },
  day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri'], required: true },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  status: { type: String, enum: ['pending', 'approved', 'used', 'denied'], default: 'pending' },
  reason: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

editRequestSchema.index({ userId: 1, weekStart: 1, day: 1, projectId: 1 });

export const EditRequest = mongoose.model('EditRequest', editRequestSchema);
```

- [ ] **Step 2: Sanity-check the backend still boots its tests**

Run: `cd auth-api && npm test`
Expected: suite runs (the old per-day lock test on line ~250 of `test/routes.test.js` may now fail because it creates an `EditRequest` without `projectId` — that test is rewritten in Task 4). No syntax/import errors.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/EditRequest.js
git commit -m "feat(edit-access): add projectId + used status to EditRequest"
```

---

### Task 2: Pure helpers `todayDayFor` + `computeRowLock`

**Files:**
- Modify: `auth-api/src/services/timesheetRows.js`
- Test: `auth-api/test/timesheetRows.test.js`

**Interfaces:**
- Consumes: `DAYS`, `cleanMinutes`, `addDaysISO` (already in the file).
- Produces:
  - `todayDayFor(weekStart, today) -> Day | null`
  - `computeRowLock({ submittedRows, savedRows, taskProjectById, todayDay, grants }) -> { rows, consumed }`
    - `grants`: `Array<{ day: Day, projectId: string }>` (approved).
    - `taskProjectById`: `Map<string, string>` taskId → projectId.
    - `consumed`: subset of `grants` whose project had ≥1 row change value on that day.
- Removes: `editableDaysFor` and `applyDayLock` (replaced).

- [ ] **Step 1: Write the failing tests**

In `auth-api/test/timesheetRows.test.js`, change the import line to:

```js
import { mergeWeekRows, sanitizeRows, currentMonday, todayDayFor, computeRowLock } from '../src/services/timesheetRows.js';
```

Delete the four existing tests named `editableDaysFor: ...` and `applyDayLock: ...`. Add:

```js
test('todayDayFor: returns the weekday matching today, else null', () => {
  assert.equal(todayDayFor('2026-06-15', '2026-06-17'), 'wed');
  assert.equal(todayDayFor('2026-06-08', '2026-06-17'), null); // past week
});

test('computeRowLock: today applies, a non-granted past day keeps saved value', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 99, tue: 0, wed: 60, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants: [] });
  assert.equal(rows[0].entries.wed, 60); // today applied
  assert.equal(rows[0].entries.mon, 30); // locked past day kept
  assert.deepEqual(consumed, []);
});

test('computeRowLock: a granted project past day applies and is consumed on change', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const grants = [{ day: 'mon', projectId: 'pA' }];
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants });
  assert.equal(rows[0].entries.mon, 120); // granted day applied
  assert.deepEqual(consumed, [{ day: 'mon', projectId: 'pA' }]); // consumed
});

test('computeRowLock: an unrelated project change does not apply or consume another project grant', () => {
  const submitted = [{ id: 'r2', name: 'B', taskId: 't2', entries: { mon: 90, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'r2', name: 'B', taskId: 't2', entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const taskProjectById = new Map([['t2', 'pB']]);
  const grants = [{ day: 'mon', projectId: 'pA' }]; // grant is for pA, row is pB
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants });
  assert.equal(rows[0].entries.mon, 0); // pB mon locked
  assert.deepEqual(consumed, []); // pA grant untouched
});

test('computeRowLock: an ad-hoc past-day cell is always locked and never consumed', () => {
  const submitted = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const grants = [{ day: 'mon', projectId: 'pA' }];
  const { rows, consumed } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById: new Map(), todayDay: 'wed', grants });
  assert.equal(rows[0].entries.mon, 0); // ad-hoc past day locked
  assert.deepEqual(consumed, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: FAIL — `todayDayFor`/`computeRowLock` are not exported.

- [ ] **Step 3: Implement the helpers**

In `auth-api/src/services/timesheetRows.js`, delete `editableDaysFor` and `applyDayLock`, and add (keep `addDaysISO`, `todayISO`, `cleanMinutes` as they are):

```js
export function todayDayFor(weekStart, today) {
  for (let i = 0; i < DAYS.length; i += 1) {
    if (addDaysISO(weekStart, i) === today) return DAYS[i];
  }
  return null;
}

export function computeRowLock({
  submittedRows = [], savedRows = [], taskProjectById = new Map(), todayDay = null, grants = [],
}) {
  const grantSet = new Set(grants.map((g) => `${g.day}:${g.projectId}`));
  const savedById = new Map((savedRows || []).map((r) => [String(r.id), r]));
  const projectOf = (row) => {
    if (!row || !row.taskId) return null;
    const p = taskProjectById.get(String(row.taskId));
    return p ? String(p) : null;
  };
  const editableFor = (projectId, day) =>
    day === todayDay || (!!projectId && grantSet.has(`${day}:${projectId}`));

  const rows = (submittedRows || []).map((r) => {
    const prev = savedById.get(String(r.id));
    const projectId = projectOf(r);
    const entries = {};
    for (const d of DAYS) {
      entries[d] = editableFor(projectId, d)
        ? cleanMinutes(r?.entries?.[d])
        : cleanMinutes(prev?.entries?.[d]);
    }
    return { ...r, entries };
  });

  const consumed = (grants || []).filter((g) => (submittedRows || []).some((r) => {
    if (projectOf(r) !== String(g.projectId)) return false;
    const prev = savedById.get(String(r.id));
    return cleanMinutes(r?.entries?.[g.day]) !== cleanMinutes(prev?.entries?.[g.day]);
  }));

  return { rows, consumed };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: PASS (the route test file may still fail until Task 4 — that is expected).

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/timesheetRows.js auth-api/test/timesheetRows.test.js
git commit -m "feat(edit-access): per-row computeRowLock + todayDayFor helpers"
```

---

### Task 3: `mergeWeekRows` carries `projectId`

**Files:**
- Modify: `auth-api/src/services/timesheetRows.js`
- Test: `auth-api/test/timesheetRows.test.js`

**Interfaces:**
- Consumes: assigned-task objects now include `projectId`; `taskInfoById` map values include `projectId`.
- Produces: each row from `mergeWeekRows` has `projectId: string | null`.

- [ ] **Step 1: Write the failing test**

Add to `auth-api/test/timesheetRows.test.js`:

```js
test('mergeWeekRows: rows carry projectId (null for ad-hoc)', () => {
  const assigned = [{ _id: 't1', title: 'Build', percentComplete: 0, estimatedHours: 8, actualMinutes: 0, status: 'todo', projectId: 'pA' }];
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 } }];
  const rows = mergeWeekRows({ savedRows: saved, assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  const taskRow = rows.find((r) => r.taskId === 't1');
  const adhoc = rows.find((r) => r.taskId === null);
  assert.equal(taskRow.projectId, 'pA');
  assert.equal(adhoc.projectId, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: FAIL — `taskRow.projectId` is `undefined`.

- [ ] **Step 3: Add `projectId` to every `mergeWeekRows` output row**

In `mergeWeekRows`, add `projectId` to the three `out.push({...})` blocks:

- Injected assigned task row — add `projectId: task.projectId || null,`
- Saved task row (the `if (r.taskId)` branch) — add `projectId: info.projectId || null,`
- Ad-hoc row (the `else` branch) — add `projectId: null,` e.g.:

```js
out.push({ id: r.id, taskId: null, name: r.name || '', locked: false, projectId: null, entries: entriesOf(r) });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: PASS (all timesheetRows unit tests green).

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/timesheetRows.js auth-api/test/timesheetRows.test.js
git commit -m "feat(edit-access): mergeWeekRows carries projectId"
```

---

### Task 4: Timesheets route — grants, consume, project-scoped requests

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`
- Test: `auth-api/test/routes.test.js`

**Interfaces:**
- Consumes: `todayDayFor`, `computeRowLock`, `mergeWeekRows` (with `projectId`), `EditRequest` (with `projectId`/`used`).
- Produces:
  - `GET /timesheets/:weekStart` → `{ weekStart, tasks, todayDay, grants, readOnly }`, rows carry `projectId`.
  - `PUT /timesheets/:weekStart` → consumes changed grants to `status: 'used'`.
  - `POST /timesheets/:weekStart/edit-requests` body `{ day, projectId, reason? }`.

- [ ] **Step 1: Write/rewrite the failing route tests**

First, **fix the existing test** `'PUT /timesheets strips a taskId not assigned to the caller; /tasks/mine reports actualMinutes'` (≈ line 124): its `EditRequest.create(...)` call (≈ line 134) lacks the now-required `projectId`. Add it so the grant unlocks that project's Monday for row `r1` (which has `taskId: String(mine._id)`):

```js
await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: project._id, status: 'approved' });
```

Then **replace** the test `'PUT /timesheets ignores a locked past day until it is approved'` (≈ lines 250–272) with the two project-scoped tests below, and add the POST validation test:

```js
test('PUT /timesheets: project-scoped grant unlocks only that project and is consumed on change', async () => {
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const pm = await User.create({ email: 'ps-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'ps-e@x.com', displayName: 'E', role: 'employee' });
  const projA = await Project.create({ name: 'A', ownerPm: pm._id, members: [emp._id] });
  const projB = await Project.create({ name: 'B', ownerPm: pm._id, members: [emp._id] });
  const taskA = await Task.create({ project: projA._id, title: 'TA', assignee: emp._id, createdBy: pm._id });
  const taskB = await Task.create({ project: projB._id, title: 'TB', assignee: emp._id, createdBy: pm._id });
  const wk = currentMonday();

  // seed saved rows with zero minutes on Monday
  await Timesheet.create({ userId: emp._id, weekStart: wk, tasks: [
    { id: String(taskA._id), name: 'TA', taskId: taskA._id, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } },
    { id: String(taskB._id), name: 'TB', taskId: taskB._id, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });

  // approve a Monday grant for project A only
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id, status: 'approved' });

  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({ tasks: [
    { id: String(taskA._id), name: 'TA', taskId: String(taskA._id), entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } },
    { id: String(taskB._id), name: 'TB', taskId: String(taskB._id), entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });

  const saved = await Timesheet.findOne({ userId: emp._id, weekStart: wk });
  const monA = saved.tasks.find((t) => t.id === String(taskA._id)).entries.mon;
  const monB = saved.tasks.find((t) => t.id === String(taskB._id)).entries.mon;
  const todayDow = new Date().getUTCDay();
  if (todayDow !== 1) {
    assert.equal(monA, 120); // project A unlocked by grant
    assert.equal(monB, 0);   // project B stays locked
    const grant = await EditRequest.findOne({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id });
    assert.equal(grant.status, 'used'); // grant consumed by the change
  }
});

test('PUT /timesheets: a no-op save leaves an approved grant approved', async () => {
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const pm = await User.create({ email: 'noop-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'noop-e@x.com', displayName: 'E', role: 'employee' });
  const projA = await Project.create({ name: 'A', ownerPm: pm._id, members: [emp._id] });
  const taskA = await Task.create({ project: projA._id, title: 'TA', assignee: emp._id, createdBy: pm._id });
  const wk = currentMonday();
  await Timesheet.create({ userId: emp._id, weekStart: wk, tasks: [
    { id: String(taskA._id), name: 'TA', taskId: taskA._id, entries: { mon: 45, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id, status: 'approved' });

  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({ tasks: [
    { id: String(taskA._id), name: 'TA', taskId: String(taskA._id), entries: { mon: 45, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });

  const grant = await EditRequest.findOne({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id });
  assert.equal(grant.status, 'approved'); // unchanged → not consumed
});

test('POST edit-request requires a projectId the caller has a task on, and dedupes', async () => {
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const pm = await User.create({ email: 'req-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'req-e@x.com', displayName: 'E', role: 'employee' });
  const projA = await Project.create({ name: 'A', ownerPm: pm._id, members: [emp._id] });
  const projOther = await Project.create({ name: 'O', ownerPm: pm._id, members: [] });
  await Task.create({ project: projA._id, title: 'TA', assignee: emp._id, createdBy: pm._id });
  const wk = currentMonday();
  // a guaranteed past day: previous week's Monday
  const prevMon = new Date(`${wk}T00:00:00Z`); prevMon.setUTCDate(prevMon.getUTCDate() - 7);
  const pastWeek = prevMon.toISOString().slice(0, 10);

  const noTask = await request(app).post(`/timesheets/${pastWeek}/edit-requests`)
    .set('Authorization', bearer(emp)).send({ day: 'mon', projectId: String(projOther._id) });
  assert.equal(noTask.status, 400); // no task on that project

  const ok = await request(app).post(`/timesheets/${pastWeek}/edit-requests`)
    .set('Authorization', bearer(emp)).send({ day: 'mon', projectId: String(projA._id) });
  assert.equal(ok.status, 201);

  const dup = await request(app).post(`/timesheets/${pastWeek}/edit-requests`)
    .set('Authorization', bearer(emp)).send({ day: 'mon', projectId: String(projA._id) });
  assert.equal(dup.status, 409); // pending duplicate
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd auth-api && node --test test/routes.test.js`
Expected: FAIL — route still uses old per-day model / `POST` ignores `projectId`.

- [ ] **Step 3: Update the route**

In `auth-api/src/routes/timesheets.js`:

Add the mongoose import at the top and swap the helper import line:

```js
import mongoose from 'mongoose';
```
```js
import {
  mergeWeekRows, sanitizeRows, computeRowLock, currentMonday, todayDayFor, todayISO, DAYS,
} from '../services/timesheetRows.js';
```

Replace `approvedDaysFor` with:

```js
async function approvedGrantsFor(userId, weekStart) {
  const reqs = await EditRequest.find({ userId, weekStart, status: 'approved' }).select('day projectId');
  return reqs.map((r) => ({ day: r.day, projectId: String(r.projectId) }));
}
```

In `GET`, add `project` to both `Task.find(...).select(...)` calls, and thread `projectId` into the maps:

```js
const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
  title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
  status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
  startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
  projectId: t.project ? String(t.project) : null,
}]));
const assignedForMerge = assignedTasks.map((t) => ({
  _id: String(t._id), title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
  status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
  startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
  projectId: t.project ? String(t.project) : null,
}));
```

Replace the GET tail (the `approved`/`editableDays`/`readOnly`/`res.json` lines) with:

```js
const grants = await approvedGrantsFor(userId, weekStart);
const todayDay = todayDayFor(weekStart, todayISO());
const readOnly = weekStart < currentMonday() && grants.length === 0;
res.json({ weekStart, tasks, todayDay, grants, readOnly });
```

Replace the `PUT` body (from the `Task.find` line through `res.json`) with:

```js
const assigned = await Task.find({ assignee: userId }).select('_id project');
const allowed = assigned.map((t) => String(t._id));
const taskProjectById = new Map(assigned.map((t) => [String(t._id), String(t.project)]));
const sanitized = sanitizeRows(req.body?.tasks, allowed);

const doc = await Timesheet.findOne({ userId, weekStart });
const savedRows = doc ? doc.tasks : [];
const grants = await approvedGrantsFor(userId, weekStart);
const todayDay = todayDayFor(weekStart, todayISO());
const { rows, consumed } = computeRowLock({ submittedRows: sanitized, savedRows, taskProjectById, todayDay, grants });

const updatedAt = new Date();
await Timesheet.updateOne(
  { userId, weekStart },
  { $set: { tasks: rows, updatedAt }, $setOnInsert: { userId, weekStart } },
  { upsert: true },
);
for (const g of consumed) {
  await EditRequest.updateOne(
    { userId, weekStart, day: g.day, projectId: g.projectId, status: 'approved' },
    { $set: { status: 'used' } },
  );
}
res.json({ ok: true, updatedAt });
```

Replace the `POST /:weekStart/edit-requests` handler body with:

```js
const day = req.body?.day;
if (!DAYS.includes(day)) return res.status(400).json({ error: 'invalid day' });
const projectId = req.body?.projectId;
if (!projectId || !mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: 'invalid projectId' });
const userId = req.user.sub;
if (todayDayFor(weekStart, todayISO()) === day) return res.status(400).json({ error: 'that day is already editable' });
const idx = DAYS.indexOf(day);
const dayDate = new Date(`${weekStart}T00:00:00Z`);
dayDate.setUTCDate(dayDate.getUTCDate() + idx);
if (dayDate.toISOString().slice(0, 10) >= todayISO()) {
  return res.status(400).json({ error: 'can only request edits for a past day' });
}
const hasTask = await Task.exists({ assignee: userId, project: projectId });
if (!hasTask) return res.status(400).json({ error: 'no task on that project' });
const existing = await EditRequest.findOne({ userId, weekStart, day, projectId, status: { $in: ['pending', 'approved'] } });
if (existing) return res.status(409).json({ error: 'a request for this day already exists' });
const reqDoc = await EditRequest.create({ userId, weekStart, day, projectId, reason: String(req.body?.reason || '') });
res.status(201).json(reqDoc);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd auth-api && npm test`
Expected: PASS — full backend suite green (route + unit).

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/timesheets.js auth-api/test/routes.test.js
git commit -m "feat(edit-access): project-scoped grants + single-use consume in timesheets route"
```

---

### Task 5: `/edit-requests` list shows project name

**Files:**
- Modify: `auth-api/src/routes/editRequests.js`

**Interfaces:**
- Produces: `GET /edit-requests` rows include populated `projectId: { _id, name }`.

- [ ] **Step 1: Add the populate**

In the `GET '/'` handler, add a `.populate` for the project:

```js
const reqs = await EditRequest.find({ status })
  .populate('userId', 'displayName email')
  .populate('projectId', 'name')
  .sort('-createdAt');
```

- [ ] **Step 2: Verify the suite stays green**

Run: `cd auth-api && npm test`
Expected: PASS (existing `edit-requests` employee-403 test still passes; populate is additive).

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/editRequests.js
git commit -m "feat(edit-access): include project name in edit-requests list"
```

---

### Task 6: Frontend API — `todayDay`, `grants`, `projectId`, request body

**Files:**
- Modify: `web/src/timesheet/timesheetApi.ts`

**Interfaces:**
- Produces:
  - `type Grant = { day: Day; projectId: string }`
  - `Task` gains `projectId?: string | null`
  - `WeekData = { weekStart; tasks; todayDay: Day | null; grants: Grant[]; readOnly }`
  - `createEditRequest(weekStart, day, projectId, reason)`

- [ ] **Step 1: Update types and functions**

In `web/src/timesheet/timesheetApi.ts`:

Add `projectId?: string | null;` to the `Task` type. Then replace `WeekData`, `getWeek`, and `createEditRequest`:

```ts
export type Grant = { day: Day; projectId: string };

export type WeekData = { weekStart: string; tasks: Task[]; todayDay: Day | null; grants: Grant[]; readOnly: boolean };

export async function getWeek(weekStart: string): Promise<WeekData> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, { headers: authHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data = await r.json();
  return {
    weekStart: data.weekStart,
    tasks: data.tasks as Task[],
    todayDay: (data.todayDay ?? null) as Day | null,
    grants: (data.grants ?? []) as Grant[],
    readOnly: !!data.readOnly,
  };
}

export async function createEditRequest(weekStart: string, day: Day, projectId: string, reason: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/edit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ day, projectId, reason }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `request failed (${r.status})`);
  }
}
```

- [ ] **Step 2: Commit (type-checked in Task 9 build)**

```bash
git add web/src/timesheet/timesheetApi.ts
git commit -m "feat(edit-access): web API types for grants/projectId"
```

---

### Task 7: Pure cell-lock helper + test

**Files:**
- Create: `web/src/timesheet/cellLock.ts`
- Test: `web/src/timesheet/cellLock.test.ts`

**Interfaces:**
- Produces: `isCellEditable(day, projectId, todayDay, grants) -> boolean`. Mirrors backend `computeRowLock` editability.

- [ ] **Step 1: Write the failing test**

Create `web/src/timesheet/cellLock.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCellEditable } from './cellLock.ts';

const grants = [{ day: 'mon', projectId: 'pA' }] as const;

test('today is always editable', () => {
  assert.equal(isCellEditable('wed', 'pA', 'wed', []), true);
});

test('a granted past day for the row project is editable', () => {
  assert.equal(isCellEditable('mon', 'pA', 'wed', grants as never), true);
});

test('a granted day for a different project is not editable', () => {
  assert.equal(isCellEditable('mon', 'pB', 'wed', grants as never), false);
});

test('ad-hoc (no project) past day is not editable', () => {
  assert.equal(isCellEditable('mon', null, 'wed', grants as never), false);
});

test('a non-today, non-granted day is locked', () => {
  assert.equal(isCellEditable('tue', 'pA', 'wed', grants as never), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && node --test src/timesheet/cellLock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `web/src/timesheet/cellLock.ts`:

```ts
import type { Day } from './time';
import type { Grant } from './timesheetApi';

export function isCellEditable(
  day: Day,
  projectId: string | null | undefined,
  todayDay: Day | null,
  grants: Grant[],
): boolean {
  if (day === todayDay) return true;
  if (!projectId) return false;
  return grants.some((g) => g.day === day && g.projectId === projectId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && node --test src/timesheet/cellLock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/timesheet/cellLock.ts web/src/timesheet/cellLock.test.ts
git commit -m "feat(edit-access): isCellEditable pure helper"
```

---

### Task 8: Grid + row — per-cell lock and per-project request affordance

**Files:**
- Modify: `web/src/timesheet/TimesheetGrid.tsx`
- Modify: `web/src/timesheet/TaskRow.tsx`

**Interfaces:**
- Consumes: `isCellEditable`, `Grant`, `Task.projectId`.
- Produces: `TimesheetGrid` props `{ todayDay, grants, pendingKeys, onRequestEdit(day, projectId) }` (replaces `editableDays`, `pendingDays`, old `onRequestEdit(day)`). `TaskRow` renders the request affordance on its own locked past task-row cells.

- [ ] **Step 1: Update `TaskRow.tsx`**

Replace the `Props` type and the day-cell `map` so each cell computes its own lock. New `Props`:

```tsx
import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant } from './timesheetApi';
import type { BarSegment } from './bar';
import { isCellEditable } from './cellLock';

type Props = {
  task: Task;
  readOnly?: boolean;
  todayDay: Day | null;
  grants: Grant[];
  dates: Record<Day, string>;
  today: string;
  pendingKeys: Set<string>;
  bar?: BarSegment | null;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onDelete: () => void;
  onRequestEdit: (day: Day, projectId: string) => void;
  onProgress: (patch: { percentComplete?: number; status?: string }) => void;
};
```

Update the destructure to `{ task, readOnly = false, todayDay, grants, dates, today, pendingKeys, bar = null, onRename, onCellChange, onDelete, onRequestEdit, onProgress }` and replace the `DAYS.map` cell block with:

```tsx
{DAYS.map((d, i) => {
  const inBar = bar && i >= bar.startCol && i <= bar.endCol;
  const capL = inBar && i === bar!.startCol && !bar!.continuesLeft;
  const capR = inBar && i === bar!.endCol && !bar!.continuesRight;
  const editable = isCellEditable(d, task.projectId, todayDay, grants);
  const isPast = dates[d] < today;
  const canRequest = !editable && isPast && !!task.taskId && !!task.projectId;
  const pending = canRequest && pendingKeys.has(`${d}:${task.projectId}`);
  return (
    <td key={d} className="ts-cell">
      {inBar && (
        <div
          className={`ts-bar ts-bar-${task.status ?? 'todo'}${capL ? ' ts-bar-l' : ''}${capR ? ' ts-bar-r' : ''}`}
          title={`${task.startDate ?? ''} → ${task.endDate ?? ''}`}
        />
      )}
      <TimeCell
        minutes={task.entries[d] || 0}
        readOnly={readOnly || !editable}
        onChange={(m) => onCellChange(d, m)}
      />
      {canRequest && (
        pending
          ? <span className="ts-req ts-pending">pending</span>
          : <button className="link-btn ts-req" type="button" onClick={() => onRequestEdit(d, task.projectId as string)}>request</button>
      )}
    </td>
  );
})}
```

- [ ] **Step 2: Update `TimesheetGrid.tsx`**

Replace the imports/props/body so the grid passes the new props down and drops `lockedDays` + the header request button. New `Props` and header:

```tsx
import { TaskRow } from './TaskRow';
import { weekBarSegment } from './bar';
import { DAYS, formatMinutes, columnDates, dayDates, todayISO } from './time';
import type { Day } from './time';
import type { Task, Entries, Grant } from './timesheetApi';

type Props = {
  weekStart: string;
  tasks: Task[];
  readOnly?: boolean;
  todayDay: Day | null;
  grants: Grant[];
  pendingKeys: Set<string>;
  onRequestEdit: (day: Day, projectId: string) => void;
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onDelete: (taskId: string) => void;
  onAddTask: () => void;
  onProgress: (taskId: string, patch: { percentComplete?: number; status?: string }) => void;
};

export function TimesheetGrid({
  weekStart, tasks, readOnly = false, todayDay, grants, pendingKeys, onRequestEdit,
  onRename, onCellChange, onDelete, onAddTask, onProgress,
}: Props) {
  const cols = columnDates(weekStart);
  const dates = dayDates(weekStart);
  const today = todayISO();

  const dayTotal = (day: keyof Entries) =>
    tasks.reduce((sum, t) => sum + (t.entries[day] || 0), 0);
```

Replace the `<thead>` day headers with a plain header (lock/request now live in the cells):

```tsx
{DAYS.map((d) => {
  const isFuture = dates[d] > today;
  return <th key={d} className={isFuture ? 'ts-day-future' : undefined}>{cols[d]}</th>;
})}
```

Replace the `<TaskRow ... />` usage with:

```tsx
{tasks.map((t) => (
  <TaskRow
    key={t.id}
    task={t}
    readOnly={readOnly}
    todayDay={todayDay}
    grants={grants}
    dates={dates}
    today={today}
    pendingKeys={pendingKeys}
    bar={weekBarSegment(weekStart, t.startDate, t.endDate)}
    onRename={(name) => onRename(t.id, name)}
    onCellChange={(day, m) => onCellChange(t.id, day, m)}
    onDelete={() => onDelete(t.id)}
    onRequestEdit={onRequestEdit}
    onProgress={(patch) => onProgress(t.id, patch)}
  />
))}
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc -b`
Expected: errors only in `TimesheetPage.tsx` (still passing old props) — fixed in Task 9. `TimesheetGrid.tsx` and `TaskRow.tsx` themselves compile clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/TaskRow.tsx
git commit -m "feat(edit-access): per-cell lock + per-project request affordance"
```

---

### Task 9: `TimesheetPage` — wire grants, todayDay, per-project requests

**Files:**
- Modify: `web/src/timesheet/TimesheetPage.tsx`

**Interfaces:**
- Consumes: `WeekData` (`todayDay`, `grants`), `createEditRequest(weekStart, day, projectId, reason)`, grid's new props.
- Produces: pending tracked as `Set<string>` of `${day}:${projectId}`.

- [ ] **Step 1: Replace state + handlers + render**

In `web/src/timesheet/TimesheetPage.tsx`:

Update the import to include the `Day`/`Grant` types and drop nothing else:

```tsx
import { getWeek, saveWeek, createEditRequest, Task, Entries, Grant } from './timesheetApi';
import type { Day } from './time';
```

Replace the `editableDays`/`pendingDays` state with:

```tsx
const [todayDay, setTodayDay] = useState<Day | null>(null);
const [grants, setGrants] = useState<Grant[]>([]);
const [readOnly, setReadOnly] = useState(false);
const [pendingKeys, setPendingKeys] = useState<string[]>([]);
```

In `load`, replace `setEditableDays(loaded.editableDays)` with:

```tsx
setTodayDay(loaded.todayDay);
setGrants(loaded.grants);
```

In the week-change `useEffect`, replace `setPendingDays([])` with `setPendingKeys([])`.

Replace `onRequestEdit` with:

```tsx
async function onRequestEdit(day: Day, projectId: string) {
  const reason = window.prompt('Reason for editing this past day?') ?? '';
  try {
    await createEditRequest(weekStart, day, projectId, reason);
    const key = `${day}:${projectId}`;
    setPendingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  } catch (e) {
    window.alert((e as Error).message);
  }
}
```

Replace the `<TimesheetGrid .../>` props `editableDays`/`pendingDays` with the new ones:

```tsx
<TimesheetGrid
  weekStart={weekStart}
  tasks={tasks}
  readOnly={readOnly}
  todayDay={todayDay}
  grants={grants}
  pendingKeys={new Set(pendingKeys)}
  onRequestEdit={onRequestEdit}
  onRename={onRename}
  onCellChange={onCellChange}
  onDelete={onDelete}
  onAddTask={onAddTask}
  onProgress={onProgress}
/>
```

- [ ] **Step 2: Type-check + web unit tests**

Run: `cd web && npx tsc -b && npm test`
Expected: PASS — no type errors; `cellLock`/`bar`/`time`/`nav` tests green.

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TimesheetPage.tsx
git commit -m "feat(edit-access): wire grants/per-project edit requests in TimesheetPage"
```

---

### Task 10: Requests view shows the project

**Files:**
- Modify: `web/src/pm/pmApi.ts`
- Modify: `web/src/pm/Requests.tsx`

**Interfaces:**
- Consumes: `GET /edit-requests` now returns `projectId: { name }`.
- Produces: `EditReq` type gains `projectId`; Requests table shows a Project column.

- [ ] **Step 1: Extend `EditReq`**

In `web/src/pm/pmApi.ts`, add `projectId` to the `EditReq` type (around line 22):

```ts
  _id: string; userId: Person; weekStart: string; day: string; reason: string; status: string; createdAt: string;
  projectId?: { _id: string; name: string } | null;
```

- [ ] **Step 2: Add the Project column**

In `web/src/pm/Requests.tsx`, update the edit-requests table header and rows:

Header (add a Project column before Reason):

```tsx
<thead><tr><th className="ts-task">Employee</th><th>Week</th><th>Day</th><th>Project</th><th>Reason</th><th></th></tr></thead>
```

Empty-state colSpan becomes 6:

```tsx
{reqs.length === 0 && <tr><td colSpan={6} className="ts-empty">No pending edit requests.</td></tr>}
```

Add the project cell in the row (after the Day cell):

```tsx
<td>{DAY_LABEL[r.day] || r.day}</td>
<td>{r.projectId?.name || '—'}</td>
<td>{r.reason || '—'}</td>
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc -b`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/pmApi.ts web/src/pm/Requests.tsx
git commit -m "feat(edit-access): show project in PM Requests view"
```

---

## Final verification

- [ ] `cd auth-api && npm test` → all green.
- [ ] `cd web && npx tsc -b && npm test` → no type errors, all green.
- [ ] Manual smoke (optional): as an employee, open a past week, click **request** on a locked past-day cell of a project task row → PM sees the row with the project name → approve → employee reloads, only that project's cell unlocks → change it and let it save → reload shows it re-locked.
