# Task Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let estimates be entered in hours/days/weeks, draw a per-week timeline bar for each scheduled task in the timesheet, and enforce one active task per employee (a PM assignment to a busy employee becomes an offer they Accept/Decline).

**Architecture:** Extend `auth-api` with a pure `estimate` helper, three new `Task` estimate/schedule fields, an `AssignmentOffer` model + router, and a busy-employee assignment guard. Extend the React SPA: unit-aware propose/approve UI, a `startDate` field on the task form, a status-tinted bar in the timesheet grid, and a "Task offers" section in My Tasks.

**Tech Stack:** Node 20 ESM, Express 4, Mongoose 8, `node:test` + `mongodb-memory-server` + `supertest`; React 18 + TS + Vite.

**Reference spec:** `docs/superpowers/specs/2026-06-17-task-scheduling-design.md`

**Conventions:** Backend from `auth-api/`; frontend from `web/`. `req.user = { sub, email, name, role }`. ObjectIds compared as strings. Week is Mon–Fri; **1 day = 8h, 1 week = 40h**. Backend tests: `cd auth-api && npm test`. Frontend timesheet tests: `cd web && node --test --experimental-strip-types "src/timesheet/**/*.test.ts"`.

**Reconciliation note:** The codebase deliberately removed PM's direct estimate input — estimates are **employee-proposed → PM-approved**. So estimate *units* live on the propose/approve flow; the PM sets only `startDate` (a planning field, like `dueDate`). This differs slightly from the spec's "PM create/edit estimate" wording and is the intended behavior.

---

## File Structure

**Backend**
- Create `src/services/estimate.js` — `toHours`, `estimateWorkingDays`, `endDateFrom`
- Create `test/estimate.test.js`
- Modify `src/models/Task.js` — `estimateValue`, `estimateUnit`, `startDate`, `proposedValue`, `proposedUnit`
- Modify `src/routes/tasks.js` — unit-aware propose + approve; `startDate` on edit; busy-assign guard
- Modify `src/routes/projects.js` — `startDate` on create; busy-assign guard
- Create `src/models/AssignmentOffer.js`
- Create `src/services/assignment.js` — `hasActiveTask`
- Create `src/routes/assignmentOffers.js` — `GET /mine`, `PATCH /:id`
- Modify `src/app.js` — mount offers router
- Modify `src/routes/timesheets.js` — select `startDate`; pass ISO start into merge
- Modify `src/services/timesheetRows.js` — inject `startDate`/`endDate`
- Modify `test/routes.test.js`, `test/timesheetRows.test.js`

**Frontend**
- Modify `src/pm/pmApi.ts` — types + endpoints
- Modify `src/pm/MyTasks.tsx` — unit propose + offers section
- Modify `src/pm/Projects.tsx` — `startDate` field; unit display
- Modify `src/timesheet/timesheetApi.ts` — `startDate`/`endDate` on `Task`
- Create `src/timesheet/bar.ts` + `src/timesheet/bar.test.ts` — `weekBarSegment`
- Modify `src/timesheet/TimesheetGrid.tsx` — compute segment, pass to row
- Modify `src/timesheet/TaskRow.tsx` — render bar
- Modify `src/index.css` — bar styles

---

# SLICE A — Estimate Units

## Task A1: estimate helper (TDD)

**Files:** Create `auth-api/src/services/estimate.js`, `auth-api/test/estimate.test.js`

- [ ] **Step 1: Write the failing test**

Create `auth-api/test/estimate.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHours, estimateWorkingDays, endDateFrom } from '../src/services/estimate.js';

test('toHours: converts each unit', () => {
  assert.equal(toHours(2, 'hours'), 2);
  assert.equal(toHours(2, 'days'), 16);
  assert.equal(toHours(2, 'weeks'), 80);
});

test('toHours: unknown unit or bad value is 0', () => {
  assert.equal(toHours(2, 'months'), 0);
  assert.equal(toHours(-3, 'hours'), 0);
  assert.equal(toHours('x', 'days'), 0);
});

test('estimateWorkingDays: ceil over 8h/day', () => {
  assert.equal(estimateWorkingDays(8), 1);
  assert.equal(estimateWorkingDays(20), 3);
  assert.equal(estimateWorkingDays(24), 3);
  assert.equal(estimateWorkingDays(30), 4);
  assert.equal(estimateWorkingDays(0), 0);
});

test('endDateFrom: spans working days, skipping weekends', () => {
  // 2026-06-16 is Tue. 40h = 1 week = 5 working days -> Tue,Wed,Thu,Fri,Mon
  assert.equal(endDateFrom('2026-06-16', 40), '2026-06-22');
  // 8h = 1 day -> same day
  assert.equal(endDateFrom('2026-06-16', 8), '2026-06-16');
  // 2026-06-18 is Thu. 24h = 3 days -> Thu,Fri,Mon
  assert.equal(endDateFrom('2026-06-18', 24), '2026-06-22');
});

test('endDateFrom: null start or zero hours', () => {
  assert.equal(endDateFrom(null, 40), null);
  assert.equal(endDateFrom('2026-06-16', 0), '2026-06-16');
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd auth-api && node --test test/estimate.test.js`
Expected: FAIL — module `../src/services/estimate.js` not found.

- [ ] **Step 3: Implement**

Create `auth-api/src/services/estimate.js`:
```js
export const UNIT_HOURS = { hours: 1, days: 8, weeks: 40 };

export function toHours(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return 0;
  const factor = UNIT_HOURS[unit];
  return factor ? v * factor : 0;
}

export function estimateWorkingDays(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.ceil(h / 8);
}

function isWeekend(d) {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

export function endDateFrom(startISO, hours) {
  if (!startISO) return null;
  const days = estimateWorkingDays(hours);
  const d = new Date(`${startISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (days <= 0) return startISO;
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  let counted = 1;
  while (counted < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) counted += 1;
  }
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `cd auth-api && node --test test/estimate.test.js`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**
```bash
git add auth-api/src/services/estimate.js auth-api/test/estimate.test.js
git commit -m "feat(pm): estimate unit + working-day helpers with tests"
```

---

## Task A2: Task schema fields

**Files:** Modify `auth-api/src/models/Task.js`

- [ ] **Step 1: Add fields**

In `auth-api/src/models/Task.js`, add these fields to `taskSchema` right after the `estimatedHours` line:
```js
  estimateValue: { type: Number, default: 0 },
  estimateUnit: { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
  startDate: { type: Date, default: null },
```
And right after the `proposedHours` line add:
```js
  proposedValue: { type: Number, default: 0 },
  proposedUnit: { type: String, enum: ['hours', 'days', 'weeks'], default: 'hours' },
```

- [ ] **Step 2: Verify import**

Run: `cd auth-api && node -e "import('./src/models/Task.js').then(m => console.log(typeof m.Task))"`
Expected: prints `function`

- [ ] **Step 3: Commit**
```bash
git add auth-api/src/models/Task.js
git commit -m "feat(pm): Task estimate-unit, proposed-unit, and startDate fields"
```

---

## Task A3: Unit-aware propose + approve; startDate on task edit/create

**Files:** Modify `auth-api/src/routes/tasks.js`, `auth-api/src/routes/projects.js`

- [ ] **Step 1: Import the helper in tasks.js**

In `auth-api/src/routes/tasks.js`, add to the imports (after the `match.js` import added by the marketplace work):
```js
import { toHours } from '../services/estimate.js';
```

- [ ] **Step 2: Make the propose route unit-aware**

In `auth-api/src/routes/tasks.js`, replace the body of the `PATCH /:id/estimate` handler:
```js
    task.proposedHours = Math.max(0, Math.round(Number(req.body?.proposedHours) || 0));
    task.estimateStatus = 'proposed';
```
with:
```js
    const unit = ['hours', 'days', 'weeks'].includes(req.body?.unit) ? req.body.unit : 'hours';
    const value = Math.max(0, Number(req.body?.value) || 0);
    task.proposedValue = value;
    task.proposedUnit = unit;
    task.proposedHours = Math.round(toHours(value, unit));
    task.estimateStatus = 'proposed';
```

- [ ] **Step 3: Copy unit on approve**

In the `PATCH /:id/estimate/decision` handler, replace:
```js
    if (decision === 'approve') {
      task.estimatedHours = task.proposedHours;
      task.estimateStatus = 'approved';
    } else {
```
with:
```js
    if (decision === 'approve') {
      task.estimateValue = task.proposedValue;
      task.estimateUnit = task.proposedUnit;
      task.estimatedHours = task.proposedHours;
      task.estimateStatus = 'approved';
    } else {
```

- [ ] **Step 4: Allow startDate on task edit**

In the `PATCH /:id` handler, replace:
```js
    for (const f of ['title', 'description', 'assignee', 'status', 'dueDate']) {
```
with:
```js
    for (const f of ['title', 'description', 'assignee', 'status', 'dueDate', 'startDate']) {
```

- [ ] **Step 5: Allow startDate on task create**

In `auth-api/src/routes/projects.js`, in the `POST /:id/tasks` handler, replace:
```js
    const { title, description, requiredSkills, assignee, dueDate, dependsOn } = req.body || {};
```
with:
```js
    const { title, description, requiredSkills, assignee, dueDate, startDate, dependsOn } = req.body || {};
```
and in the `Task.create({ ... })` call, add after the `dueDate: dueDate || null,` line:
```js
      startDate: startDate || null,
```

- [ ] **Step 6: Verify imports + suite**

Run: `cd auth-api && node -e "import('./src/routes/tasks.js').then(m => console.log(typeof m.createTasksRouter))" && npm test`
Expected: prints `function`; all existing tests still pass.

- [ ] **Step 7: Commit**
```bash
git add auth-api/src/routes/tasks.js auth-api/src/routes/projects.js
git commit -m "feat(pm): unit-aware estimate propose/approve; startDate on tasks"
```

---

## Task A4: Backend tests for units + startDate

**Files:** Modify `auth-api/test/routes.test.js`

- [ ] **Step 1: Add tests**

Append to the end of `auth-api/test/routes.test.js`:
```js
test('estimate propose/approve carries unit and derives hours', async () => {
  const pm = await User.create({ email: 'u-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'u-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignee: emp._id, createdBy: pm._id });

  const propose = await request(app).patch(`/tasks/${task._id}/estimate`)
    .set('Authorization', bearer(emp)).send({ value: 2, unit: 'days' });
  assert.equal(propose.status, 200);
  assert.equal(propose.body.proposedValue, 2);
  assert.equal(propose.body.proposedUnit, 'days');
  assert.equal(propose.body.proposedHours, 16);

  const approve = await request(app).patch(`/tasks/${task._id}/estimate/decision`)
    .set('Authorization', bearer(pm)).send({ decision: 'approve' });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.estimateValue, 2);
  assert.equal(approve.body.estimateUnit, 'days');
  assert.equal(approve.body.estimatedHours, 16);
});

test('task create + edit accept a startDate', async () => {
  const pm = await User.create({ email: 'sd-pm@x.com', displayName: 'PM', role: 'pm' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [] });
  const created = await request(app).post(`/projects/${project._id}/tasks`)
    .set('Authorization', bearer(pm)).send({ title: 'T', startDate: '2026-06-16' });
  assert.equal(created.status, 201);
  assert.equal(String(created.body.startDate).slice(0, 10), '2026-06-16');

  const edited = await request(app).patch(`/tasks/${created.body._id}`)
    .set('Authorization', bearer(pm)).send({ startDate: '2026-06-18' });
  assert.equal(edited.status, 200);
  assert.equal(String(edited.body.startDate).slice(0, 10), '2026-06-18');
});
```

- [ ] **Step 2: Run the suite**

Run: `cd auth-api && npm test`
Expected: PASS — prior tests plus these 2.

- [ ] **Step 3: Commit**
```bash
git add auth-api/test/routes.test.js
git commit -m "test(pm): estimate units + startDate route tests"
```

---

## Task A5: Frontend API client (units + startDate)

**Files:** Modify `web/src/pm/pmApi.ts`

- [ ] **Step 1: Extend the Task and TaskDetail types**

In `web/src/pm/pmApi.ts`, in the `Task` type add these fields after `estimateStatus?: string;`:
```ts
  estimateValue?: number;
  estimateUnit?: 'hours' | 'days' | 'weeks';
  startDate?: string | null;
  proposedValue?: number;
  proposedUnit?: 'hours' | 'days' | 'weeks';
```
In the `TaskDetail` type add the same five fields after its `estimateStatus?: string;` line:
```ts
  estimateValue?: number;
  estimateUnit?: 'hours' | 'days' | 'weeks';
  startDate?: string | null;
  proposedValue?: number;
  proposedUnit?: 'hours' | 'days' | 'weeks';
```

- [ ] **Step 2: Change proposeEstimate to take value + unit**

Replace:
```ts
export const proposeEstimate = (id: string, proposedHours: number) =>
  authed(`/tasks/${id}/estimate`, 'PATCH', { proposedHours });
```
with:
```ts
export type EstimateUnit = 'hours' | 'days' | 'weeks';
export const proposeEstimate = (id: string, value: number, unit: EstimateUnit) =>
  authed(`/tasks/${id}/estimate`, 'PATCH', { value, unit });
```

- [ ] **Step 3: Typecheck (expect MyTasks error — fixed in A6)**

Run: `cd web && npx tsc --noEmit`
Expected: error only in `src/pm/MyTasks.tsx` (old `propose` call). That is fixed in Task A6; do not commit yet.

- [ ] **Step 4: Note**

No commit on its own — committed together with A6.

---

## Task A6: My Tasks unit propose UI

**Files:** Modify `web/src/pm/MyTasks.tsx`

- [ ] **Step 1: Replace the file's propose handling and estimate cell**

Replace the entire contents of `web/src/pm/MyTasks.tsx` with:
```tsx
import { useEffect, useState } from 'react';
import { myTasks, proposeEstimate, EstimateUnit, Task } from './pmApi';

const UNITS: EstimateUnit[] = ['hours', 'days', 'weeks'];

function ProposeEstimate({ task, onPropose }: { task: Task; onPropose: (value: number, unit: EstimateUnit) => void }) {
  const [value, setValue] = useState<number>(task.proposedValue ?? 0);
  const [unit, setUnit] = useState<EstimateUnit>(task.proposedUnit ?? 'hours');
  return (
    <span className="ts-nav-left">
      <input className="ts-pct" type="number" min={0} value={value}
        onChange={(e) => setValue(Number(e.target.value))} />
      <select className="input ts-status" value={unit} onChange={(e) => setUnit(e.target.value as EstimateUnit)}>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <button className="link-btn" onClick={() => onPropose(value, unit)}>propose</button>
      <span className="ts-sub">{task.estimateStatus === 'proposed' ? 'proposed' : task.estimateStatus === 'rejected' ? 'rejected' : ''}</span>
    </span>
  );
}

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  function reload() { myTasks().then(setTasks).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function propose(id: string, value: number, unit: EstimateUnit) {
    setError('');
    try { await proposeEstimate(id, value, unit); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Tasks</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
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
                    ? `${t.estimateValue ?? t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <ProposeEstimate task={t} onPropose={(v, u) => propose(t._id, v, u)} />}
                </td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td>{t.status}</td>
                <td>{t.dueDate ? t.dueDate.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/pmApi.ts web/src/pm/MyTasks.tsx
git commit -m "feat(pm): propose estimates in hours/days/weeks"
```

---

## Task A7: Project task form — startDate + unit display

**Files:** Modify `web/src/pm/Projects.tsx`

- [ ] **Step 1: Add startDate state**

In `web/src/pm/Projects.tsx`, in `ProjectDetail`, after the line:
```ts
  const [assignee, setAssignee] = useState('');
```
add:
```ts
  const [startDate, setStartDate] = useState('');
```

- [ ] **Step 2: Send startDate on create and reset it**

In the `add` function, replace:
```ts
      await createTask(id, {
        title: title.trim(),
        assignee: assignee || null,
        requiredSkills: [...reqSkills],
      });
      setTitle(''); setAssignee(''); setReqSkills(new Set());
```
with:
```ts
      await createTask(id, {
        title: title.trim(),
        assignee: assignee || null,
        startDate: startDate || null,
        requiredSkills: [...reqSkills],
      });
      setTitle(''); setAssignee(''); setStartDate(''); setReqSkills(new Set());
```

- [ ] **Step 3: Add the startDate input to the form**

In the task-form `div.ts-nav-left`, after the assignee `<select>...</select>` block and before `<button className="btn btn-primary" onClick={add}>Add task</button>`, insert:
```tsx
          <input className="input" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} title="Start date" />
```

- [ ] **Step 4: Show the unit in the Planned column**

In the tasks table, replace:
```tsx
                  {t.estimateStatus === 'proposed' ? (
                    <span className="ts-nav-left">
                      {t.proposedHours ?? 0}h?
                      <button className="link-btn" onClick={() => decide(t._id, 'approve')}>approve</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(t._id, 'reject')}>reject</button>
                    </span>
                  ) : t.estimateStatus === 'approved' ? `${t.estimatedHours}h`
                    : <span className="ts-sub">{t.estimateStatus === 'rejected' ? 'rejected' : 'no estimate'}</span>}
```
with:
```tsx
                  {t.estimateStatus === 'proposed' ? (
                    <span className="ts-nav-left">
                      {t.proposedValue ?? 0} {t.proposedUnit ?? 'hours'}?
                      <button className="link-btn" onClick={() => decide(t._id, 'approve')}>approve</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(t._id, 'reject')}>reject</button>
                    </span>
                  ) : t.estimateStatus === 'approved' ? `${t.estimateValue ?? t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <span className="ts-sub">{t.estimateStatus === 'rejected' ? 'rejected' : 'no estimate'}</span>}
```

- [ ] **Step 5: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 6: Commit**
```bash
git add web/src/pm/Projects.tsx
git commit -m "feat(pm): task start date field + estimate unit display"
```

---

# SLICE C — Timeline Bar

## Task C1: weekBarSegment helper (TDD)

**Files:** Create `web/src/timesheet/bar.ts`, `web/src/timesheet/bar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/timesheet/bar.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekBarSegment } from './bar.ts';

// week of Mon 2026-06-15 .. Fri 2026-06-19
test('fully inside the week', () => {
  assert.deepEqual(weekBarSegment('2026-06-15', '2026-06-16', '2026-06-18'),
    { startCol: 1, endCol: 3, continuesLeft: false, continuesRight: false });
});

test('continues into next week', () => {
  assert.deepEqual(weekBarSegment('2026-06-15', '2026-06-16', '2026-06-22'),
    { startCol: 1, endCol: 4, continuesLeft: false, continuesRight: true });
});

test('continues from a previous week', () => {
  assert.deepEqual(weekBarSegment('2026-06-15', '2026-06-08', '2026-06-17'),
    { startCol: 0, endCol: 2, continuesLeft: true, continuesRight: false });
});

test('not intersecting this week returns null', () => {
  assert.equal(weekBarSegment('2026-06-15', '2026-07-01', '2026-07-03'), null);
});

test('null dates return null', () => {
  assert.equal(weekBarSegment('2026-06-15', null, '2026-06-17'), null);
  assert.equal(weekBarSegment('2026-06-15', '2026-06-16', null), null);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd web && node --test --experimental-strip-types src/timesheet/bar.test.ts`
Expected: FAIL — module `./bar.ts` not found.

- [ ] **Step 3: Implement**

Create `web/src/timesheet/bar.ts`:
```ts
import { addDays } from './time';

export type BarSegment = {
  startCol: number;
  endCol: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

export function weekBarSegment(
  weekStart: string,
  startISO: string | null | undefined,
  endISO: string | null | undefined,
): BarSegment | null {
  if (!startISO || !endISO) return null;
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
  const monday = dates[0];
  const friday = dates[4];
  if (endISO < monday || startISO > friday) return null;

  let startCol = 0;
  for (let i = 0; i < 5; i++) { if (dates[i] >= startISO) { startCol = i; break; } }
  if (startISO <= monday) startCol = 0;

  let endCol = 4;
  for (let i = 4; i >= 0; i--) { if (dates[i] <= endISO) { endCol = i; break; } }
  if (endISO >= friday) endCol = 4;

  return {
    startCol,
    endCol,
    continuesLeft: startISO < monday,
    continuesRight: endISO > friday,
  };
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `cd web && node --test --experimental-strip-types src/timesheet/bar.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**
```bash
git add web/src/timesheet/bar.ts web/src/timesheet/bar.test.ts
git commit -m "feat(ts): weekBarSegment helper with tests"
```

---

## Task C2: Inject startDate/endDate into week rows

**Files:** Modify `auth-api/src/services/timesheetRows.js`, `auth-api/src/routes/timesheets.js`, `auth-api/test/timesheetRows.test.js`

- [ ] **Step 1: Import the estimate helper in timesheetRows.js**

At the top of `auth-api/src/services/timesheetRows.js`, add:
```js
import { endDateFrom } from './estimate.js';
```

- [ ] **Step 2: Add startDate/endDate to the injected assigned rows**

In `mergeWeekRows`, in the `if (editable)` loop's `out.push({ ... })`, add after the `status: task.status || 'todo',` line:
```js
        startDate: task.startDate || null,
        endDate: endDateFrom(task.startDate || null, task.estimatedHours || 0),
```

- [ ] **Step 3: Add startDate/endDate to the saved-task rows**

In the same function, in the `for (const r of savedRows)` loop's `if (r.taskId)` branch `out.push({ ... })`, add after the `status: info.status || 'todo',` line:
```js
        startDate: info.startDate || null,
        endDate: endDateFrom(info.startDate || null, info.estimatedHours || 0),
```

- [ ] **Step 4: Select and pass startDate (as ISO) in the route**

In `auth-api/src/routes/timesheets.js`:

Replace (the injectable query):
```js
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status');
```
with:
```js
      assignedTasks = await Task.find({ assignee: userId, status: { $ne: 'done' } })
        .select('title percentComplete estimatedHours status startDate');
```

Replace (the info query):
```js
    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title percentComplete estimatedHours status')
      : [];
```
with:
```js
    const infoTasks = idList.length
      ? await Task.find({ _id: { $in: idList } }).select('title percentComplete estimatedHours status startDate')
      : [];
```

Replace (taskInfoById mapping):
```js
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
    }]));
```
with:
```js
    const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
      title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    }]));
```

Replace (assignedForMerge mapping):
```js
    const assignedForMerge = assignedTasks.map((t) => ({
      _id: String(t._id), title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
    }));
```
with:
```js
    const assignedForMerge = assignedTasks.map((t) => ({
      _id: String(t._id), title: t.title, percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
      status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
      startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    }));
```

- [ ] **Step 5: Add a merge test**

Append to `auth-api/test/timesheetRows.test.js`:
```js
test('mergeWeekRows: injects startDate and computed endDate', () => {
  const assigned = [{ _id: 't1', title: 'Build', percentComplete: 0, estimatedHours: 40, actualMinutes: 0, status: 'todo', startDate: '2026-06-16' }];
  const rows = mergeWeekRows({ savedRows: [], assignedTasks: assigned, taskInfoById: new Map(), editable: true });
  assert.equal(rows[0].startDate, '2026-06-16');
  assert.equal(rows[0].endDate, '2026-06-22'); // 40h = 5 working days from Tue
});
```

- [ ] **Step 6: Run the suite**

Run: `cd auth-api && npm test`
Expected: PASS — all prior tests plus the new merge test.

- [ ] **Step 7: Commit**
```bash
git add auth-api/src/services/timesheetRows.js auth-api/src/routes/timesheets.js auth-api/test/timesheetRows.test.js
git commit -m "feat(ts): week rows carry startDate + computed endDate"
```

---

## Task C3: Frontend Task type — startDate/endDate

**Files:** Modify `web/src/timesheet/timesheetApi.ts`

- [ ] **Step 1: Add fields**

In `web/src/timesheet/timesheetApi.ts`, in the `Task` type, add after `status?: string;`:
```ts
  startDate?: string | null;
  endDate?: string | null;
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/timesheet/timesheetApi.ts
git commit -m "feat(ts): Task type carries startDate/endDate"
```

---

## Task C4: Render the bar in the grid

**Files:** Modify `web/src/timesheet/TimesheetGrid.tsx`, `web/src/timesheet/TaskRow.tsx`, `web/src/index.css`

- [ ] **Step 1: Compute the segment in the grid and pass it to the row**

In `web/src/timesheet/TimesheetGrid.tsx`, add to the imports:
```tsx
import { weekBarSegment } from './bar';
```
Then replace the `tasks.map((t) => ( ... ))` block that renders `<TaskRow ... />` with:
```tsx
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              readOnly={readOnly}
              lockedDays={lockedDays}
              bar={weekBarSegment(weekStart, t.startDate, t.endDate)}
              onRename={(name) => onRename(t.id, name)}
              onCellChange={(day, m) => onCellChange(t.id, day, m)}
              onDelete={() => onDelete(t.id)}
              onProgress={(patch) => onProgress(t.id, patch)}
            />
          ))}
```

- [ ] **Step 2: Render the bar overlay in the row's day cells**

In `web/src/timesheet/TaskRow.tsx`, add to the imports:
```tsx
import type { BarSegment } from './bar';
```
Add `bar` to the `Props` type (after `lockedDays?: ...`):
```tsx
  bar?: BarSegment | null;
```
Update the function signature to destructure it:
```tsx
export function TaskRow({ task, readOnly = false, lockedDays = {}, bar = null, onRename, onCellChange, onDelete, onProgress }: Props) {
```
Replace the day-cell map:
```tsx
      {DAYS.map((d) => (
        <td key={d}>
          <TimeCell
            minutes={task.entries[d] || 0}
            readOnly={readOnly || !!lockedDays[d]}
            onChange={(m) => onCellChange(d, m)}
          />
        </td>
      ))}
```
with:
```tsx
      {DAYS.map((d, i) => {
        const inBar = bar && i >= bar.startCol && i <= bar.endCol;
        const capL = inBar && i === bar!.startCol && !bar!.continuesLeft;
        const capR = inBar && i === bar!.endCol && !bar!.continuesRight;
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
              readOnly={readOnly || !!lockedDays[d]}
              onChange={(m) => onCellChange(d, m)}
            />
          </td>
        );
      })}
```

- [ ] **Step 3: Add bar styles**

Append to `web/src/index.css`:
```css
.ts-cell { position: relative; }
.ts-bar {
  position: absolute;
  left: 0; right: 0; top: 2px;
  height: 4px;
  background: var(--accent, #6b7280);
  opacity: 0.8;
  pointer-events: none;
}
.ts-bar-l { left: 4px; border-top-left-radius: 3px; border-bottom-left-radius: 3px; }
.ts-bar-r { right: 4px; border-top-right-radius: 3px; border-bottom-right-radius: 3px; }
.ts-bar-todo { background: #9ca3af; }
.ts-bar-in_progress { background: #3b82f6; }
.ts-bar-blocked { background: #ef4444; }
.ts-bar-done { background: #10b981; }
```

- [ ] **Step 4: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 5: Commit**
```bash
git add web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/TaskRow.tsx web/src/index.css
git commit -m "feat(ts): status-tinted timeline bar across timesheet day cells"
```

---

# SLICE B — One Active Task (Offers)

## Task B1: AssignmentOffer model

**Files:** Create `auth-api/src/models/AssignmentOffer.js`

- [ ] **Step 1: Create the model**
```js
import mongoose from 'mongoose';

const assignmentOfferSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  offeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

assignmentOfferSchema.index({ userId: 1, status: 1 });
assignmentOfferSchema.index({ taskId: 1, status: 1 });

export const AssignmentOffer = mongoose.model('AssignmentOffer', assignmentOfferSchema);
```

- [ ] **Step 2: Verify import**

Run: `cd auth-api && node -e "import('./src/models/AssignmentOffer.js').then(m => console.log(typeof m.AssignmentOffer))"`
Expected: prints `function`

- [ ] **Step 3: Commit**
```bash
git add auth-api/src/models/AssignmentOffer.js
git commit -m "feat(pm): AssignmentOffer model"
```

---

## Task B2: hasActiveTask helper

**Files:** Create `auth-api/src/services/assignment.js`

- [ ] **Step 1: Create the helper**
```js
import { Task } from '../models/Task.js';

export async function hasActiveTask(userId) {
  const existing = await Task.exists({ assignee: userId, status: { $ne: 'done' } });
  return !!existing;
}
```

- [ ] **Step 2: Verify import**

Run: `cd auth-api && node -e "import('./src/services/assignment.js').then(m => console.log(typeof m.hasActiveTask))"`
Expected: prints `function`

- [ ] **Step 3: Commit**
```bash
git add auth-api/src/services/assignment.js
git commit -m "feat(pm): hasActiveTask helper"
```

---

## Task B3: Busy-assign guard (create + edit → offer)

**Files:** Modify `auth-api/src/routes/projects.js`, `auth-api/src/routes/tasks.js`

- [ ] **Step 1: Import offer model + helper in projects.js**

In `auth-api/src/routes/projects.js`, add to the imports:
```js
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { hasActiveTask } from '../services/assignment.js';
```

- [ ] **Step 2: Make task-create offer instead of assigning a busy employee**

In the `POST /:id/tasks` handler, replace:
```js
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      description: String(description || ''),
      requiredSkills: validSkills.map((s) => s._id),
      assignee: assignee || null,
      dueDate: dueDate || null,
      startDate: startDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      createdBy: req.user.sub,
    });
    res.status(201).json(task);
```
with:
```js
    const busy = assignee ? await hasActiveTask(assignee) : false;
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      description: String(description || ''),
      requiredSkills: validSkills.map((s) => s._id),
      assignee: assignee && !busy ? assignee : null,
      dueDate: dueDate || null,
      startDate: startDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      createdBy: req.user.sub,
    });
    if (assignee && busy) {
      await AssignmentOffer.create({ taskId: task._id, userId: assignee, offeredBy: req.user.sub });
      return res.status(201).json({ ...task.toObject(), offered: true });
    }
    res.status(201).json(task);
```

- [ ] **Step 3: Import offer model + helper in tasks.js**

In `auth-api/src/routes/tasks.js`, add to the imports:
```js
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { hasActiveTask } from '../services/assignment.js';
```

- [ ] **Step 4: Guard assignee in task edit**

In the `PATCH /:id` handler, the membership check block currently reads:
```js
    if ('assignee' in (req.body || {}) && req.body.assignee) {
      if (!project.members.some((m) => String(m) === String(req.body.assignee))) {
        return res.status(400).json({ error: 'assignee must be a project member' });
      }
    }
    for (const f of ['title', 'description', 'assignee', 'status', 'dueDate', 'startDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
```
Replace that whole span with:
```js
    let offered = false;
    if ('assignee' in (req.body || {}) && req.body.assignee) {
      if (!project.members.some((m) => String(m) === String(req.body.assignee))) {
        return res.status(400).json({ error: 'assignee must be a project member' });
      }
      const sameAssignee = task.assignee && String(task.assignee) === String(req.body.assignee);
      if (!sameAssignee && (await hasActiveTask(req.body.assignee))) {
        await AssignmentOffer.create({ taskId: task._id, userId: req.body.assignee, offeredBy: req.user.sub });
        offered = true;
      }
    }
    for (const f of ['title', 'description', 'status', 'dueDate', 'startDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
    if ('assignee' in (req.body || {}) && !offered) task.assignee = req.body.assignee;
```

- [ ] **Step 5: Return offered flag from edit**

In the same `PATCH /:id` handler, replace its ending (anchored on the `dependsOn` line, which is unique to this handler):
```js
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(task);
```
with:
```js
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(offered ? { ...task.toObject(), offered: true } : task);
```

- [ ] **Step 6: Verify imports + suite**

Run: `cd auth-api && node -e "import('./src/routes/projects.js').then(m => console.log(typeof m.createProjectsRouter))" && npm test`
Expected: prints `function`; existing tests still pass (the existing "rejects an assignee who is not a project member" test uses an outsider with no active task, so it still 400s on membership).

- [ ] **Step 7: Commit**
```bash
git add auth-api/src/routes/projects.js auth-api/src/routes/tasks.js
git commit -m "feat(pm): assigning a busy employee creates an offer instead"
```

---

## Task B4: AssignmentOffer router (mine + decide) + mount

**Files:** Create `auth-api/src/routes/assignmentOffers.js`; Modify `auth-api/src/app.js`

- [ ] **Step 1: Create the router**
```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AssignmentOffer } from '../models/AssignmentOffer.js';
import { Task } from '../models/Task.js';

export function createAssignmentOffersRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(async (req, res) => {
    const offers = await AssignmentOffer.find({ userId: req.user.sub, status: 'pending' })
      .populate({ path: 'taskId', select: 'title project', populate: { path: 'project', select: 'name' } })
      .sort('-createdAt');
    res.json(offers
      .filter((o) => o.taskId)
      .map((o) => ({
        _id: o._id,
        task: { _id: o.taskId._id, title: o.taskId.title },
        project: { name: o.taskId.project ? o.taskId.project.name : '' },
        createdAt: o.createdAt,
      })));
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['accept', 'decline'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const offer = await AssignmentOffer.findById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'not found' });
    if (String(offer.userId) !== String(req.user.sub)) return res.status(403).json({ error: 'forbidden' });
    if (offer.status !== 'pending') return res.status(409).json({ error: 'offer already resolved' });

    if (decision === 'accept') {
      const task = await Task.findById(offer.taskId);
      if (!task) return res.status(404).json({ error: 'task not found' });
      if (task.assignee || task.status === 'done') return res.status(409).json({ error: 'task no longer available' });
      task.assignee = offer.userId;
      await task.save();
    }
    offer.status = decision === 'accept' ? 'accepted' : 'declined';
    offer.decidedAt = new Date();
    await offer.save();
    res.json(offer);
  }));

  return router;
}
```

- [ ] **Step 2: Mount in app.js**

In `auth-api/src/app.js`, add the import:
```js
import { createAssignmentOffersRouter } from './routes/assignmentOffers.js';
```
And add the mount next to the others:
```js
  app.use('/assignment-offers', createAssignmentOffersRouter());
```

- [ ] **Step 3: Verify app boots**

Run: `cd auth-api && node -e "import('./src/app.js').then(m => console.log(typeof m.createApp))"`
Expected: prints `function`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/assignmentOffers.js auth-api/src/app.js
git commit -m "feat(pm): assignment-offers list/decide router"
```

---

## Task B5: Backend offer tests

**Files:** Modify `auth-api/test/routes.test.js`

- [ ] **Step 1: Import the model**

Near the other imports at the top of `auth-api/test/routes.test.js`, add:
```js
const { AssignmentOffer } = await import('../src/models/AssignmentOffer.js');
```

- [ ] **Step 2: Add tests**

Append to the end of `auth-api/test/routes.test.js`:
```js
test('assigning a busy employee creates an offer, not an assignment', async () => {
  const pm = await User.create({ email: 'of-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'of-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  await Task.create({ project: project._id, title: 'Busy', assignee: emp._id, status: 'in_progress', createdBy: pm._id });
  const second = await Task.create({ project: project._id, title: 'Second', createdBy: pm._id });

  const res = await request(app).patch(`/tasks/${second._id}`)
    .set('Authorization', bearer(pm)).send({ assignee: String(emp._id) });
  assert.equal(res.status, 200);
  assert.equal(res.body.offered, true);
  const saved = await Task.findById(second._id);
  assert.equal(saved.assignee, null);
  const offer = await AssignmentOffer.findOne({ taskId: second._id, userId: emp._id, status: 'pending' });
  assert.ok(offer);
});

test('a free employee is assigned directly (no offer)', async () => {
  const pm = await User.create({ email: 'fr-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'fr-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const res = await request(app).patch(`/tasks/${task._id}`)
    .set('Authorization', bearer(pm)).send({ assignee: String(emp._id) });
  assert.equal(res.status, 200);
  assert.equal(res.body.offered, undefined);
  const saved = await Task.findById(task._id);
  assert.equal(String(saved.assignee), String(emp._id));
});

test('employee accepts an offer -> task assigned; another employee cannot decide it', async () => {
  const pm = await User.create({ email: 'ac-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'ac-e@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'ac-o@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const offer = await AssignmentOffer.create({ taskId: task._id, userId: emp._id, offeredBy: pm._id });

  const mine = await request(app).get('/assignment-offers/mine').set('Authorization', bearer(emp));
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].task.title, 'T');

  const forbidden = await request(app).patch(`/assignment-offers/${offer._id}`)
    .set('Authorization', bearer(other)).send({ decision: 'accept' });
  assert.equal(forbidden.status, 403);

  const ok = await request(app).patch(`/assignment-offers/${offer._id}`)
    .set('Authorization', bearer(emp)).send({ decision: 'accept' });
  assert.equal(ok.status, 200);
  const saved = await Task.findById(task._id);
  assert.equal(String(saved.assignee), String(emp._id));
});

test('declining an offer leaves the task unassigned', async () => {
  const pm = await User.create({ email: 'dc-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'dc-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const offer = await AssignmentOffer.create({ taskId: task._id, userId: emp._id, offeredBy: pm._id });

  const res = await request(app).patch(`/assignment-offers/${offer._id}`)
    .set('Authorization', bearer(emp)).send({ decision: 'decline' });
  assert.equal(res.status, 200);
  const saved = await Task.findById(task._id);
  assert.equal(saved.assignee, null);
  const updated = await AssignmentOffer.findById(offer._id);
  assert.equal(updated.status, 'declined');
});
```

- [ ] **Step 3: Run the suite**

Run: `cd auth-api && npm test`
Expected: PASS — prior tests plus these 4.

- [ ] **Step 4: Commit**
```bash
git add auth-api/test/routes.test.js
git commit -m "test(pm): assignment-offer creation, accept, decline, authz"
```

---

## Task B6: Frontend offers API

**Files:** Modify `web/src/pm/pmApi.ts`

- [ ] **Step 1: Add type + endpoints**

In `web/src/pm/pmApi.ts`, add near the `ClaimReq` type:
```ts
export type AssignmentOffer = {
  _id: string; task: { _id: string; title: string }; project: { name: string }; createdAt: string;
};
```
And near the other endpoint exports:
```ts
export const listMyOffers = () => authed('/assignment-offers/mine') as Promise<AssignmentOffer[]>;
export const decideOffer = (id: string, decision: 'accept' | 'decline') =>
  authed(`/assignment-offers/${id}`, 'PATCH', { decision });
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/pmApi.ts
git commit -m "feat(pm): assignment-offer client endpoints"
```

---

## Task B7: Offers section in My Tasks

**Files:** Modify `web/src/pm/MyTasks.tsx`

- [ ] **Step 1: Wire in offers**

In `web/src/pm/MyTasks.tsx`, change the import line:
```tsx
import { myTasks, proposeEstimate, EstimateUnit, Task } from './pmApi';
```
to:
```tsx
import { myTasks, proposeEstimate, EstimateUnit, Task, listMyOffers, decideOffer, AssignmentOffer } from './pmApi';
```
After the `tasks` state declaration, add:
```tsx
  const [offers, setOffers] = useState<AssignmentOffer[]>([]);
```
Replace the `reload` function:
```tsx
  function reload() { myTasks().then(setTasks).catch((e) => setError(e.message)); }
```
with:
```tsx
  function reload() {
    myTasks().then(setTasks).catch((e) => setError(e.message));
    listMyOffers().then(setOffers).catch(() => {});
  }

  async function decide(id: string, decision: 'accept' | 'decline') {
    setError('');
    try { await decideOffer(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }
```
Then, directly after the `{error && <p className="ts-error">{error}</p>}` line, insert the offers card:
```tsx
      {offers.length > 0 && (
        <div className="ts-card" style={{ marginBottom: 16 }}>
          <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '4px 0 10px' }}>Task offers</h2>
          <table className="ts-table">
            <thead><tr><th className="ts-task">Task</th><th>Project</th><th></th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o._id}>
                  <td className="ts-task">{o.task.title}</td>
                  <td>{o.project.name}</td>
                  <td>
                    <div className="ts-nav-left">
                      <button className="link-btn" onClick={() => decide(o._id, 'accept')}>Accept</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(o._id, 'decline')}>Decline</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/MyTasks.tsx
git commit -m "feat(pm): Task offers Accept/Decline in My Tasks"
```

---

## Task B8: PM "offer sent" notice

**Files:** Modify `web/src/pm/Projects.tsx`

- [ ] **Step 1: Surface the offered flag on create**

In `web/src/pm/Projects.tsx`, the `createTask` return value includes `offered?: true` when the assignee was busy. Add a `notice` state in `ProjectDetail` after the `error` state:
```ts
  const [notice, setNotice] = useState('');
```
Replace the `add` function body's try block:
```ts
      await createTask(id, {
        title: title.trim(),
        assignee: assignee || null,
        startDate: startDate || null,
        requiredSkills: [...reqSkills],
      });
      setTitle(''); setAssignee(''); setStartDate(''); setReqSkills(new Set());
      reload();
```
with:
```ts
      const created = await createTask(id, {
        title: title.trim(),
        assignee: assignee || null,
        startDate: startDate || null,
        requiredSkills: [...reqSkills],
      });
      setNotice((created as { offered?: boolean }).offered
        ? 'That employee already has an active task — sent them an offer to accept.'
        : '');
      setTitle(''); setAssignee(''); setStartDate(''); setReqSkills(new Set());
      reload();
```
Then, right after the `{error && <p className="ts-error">{error}</p>}` line in `ProjectDetail`'s return, add:
```tsx
      {notice && <p className="ts-sub">{notice}</p>}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/Projects.tsx
git commit -m "feat(pm): notify PM when an assignment becomes an offer"
```

---

## Task B9: Full verification

- [ ] **Step 1: Backend**

Run: `cd auth-api && npm test`
Expected: all tests pass (estimate, timesheetRows incl. new merge test, routes incl. units/startDate/offers).

- [ ] **Step 2: Frontend**

Run: `cd web && node --test --experimental-strip-types "src/timesheet/**/*.test.ts" && npx tsc --noEmit && npm run build`
Expected: timesheet tests pass (incl. `bar.test.ts`); tsc 0; build OK.

- [ ] **Step 3: Manual smoke (Mongo + ADMIN_EMAIL)**

As an employee with an assigned task, open **My Tasks** → propose an estimate of **1 week** → as the PM, approve it. As the employee, set the task `startDate` (PM, on the task form) to a Monday and confirm the **timesheet** shows a 5-day bar continuing into next week. Then as the PM, try to assign a **second** task to that same (now busy) employee → confirm the "offer" notice, and that the employee sees **Accept/Decline** under Task offers; Accept assigns it.

- [ ] **Step 4: Final commit (if fixes needed)**
```bash
git add -A && git commit -m "chore(pm): task-scheduling verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** estimate units (A1 helper, A2 fields, A3 routes, A6/A7 UI); derived `estimatedHours` preserved (A3 approve copies, readers untouched); timeline bar (C1 segment, C2 start/end injection, C3 type, C4 render, status-tinted); single-active-task (B1 model, B2 `hasActiveTask`, B3 guard on create+edit, B4 offer endpoints, B7/B8 UI); marketplace claim path untouched (claiming = opt-in, per spec).
- **Type consistency:** `EstimateUnit = 'hours'|'days'|'weeks'` shared across `proposeEstimate`, Task/TaskDetail; `weekBarSegment` returns `{startCol,endCol,continuesLeft,continuesRight}` used identically in `TaskRow`; offer `decision` is `'accept'|'decline'` on both client and `assignmentOffers.js`; `offered` flag returned by create (projects.js) and edit (tasks.js) and read in `Projects.tsx`.
- **Deferred (out of scope):** project-level rollup estimates; bar fill-by-percent; PM notification for declines; configurable hours/day.
```
