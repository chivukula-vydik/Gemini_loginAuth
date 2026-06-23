# Timesheet Feature Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining Keka timesheet gaps: status badges, rejection reasons, comment summary, weekly hour target, daily submission with per-day status, inline task creation, and file attachments.

**Architecture:** Features are ordered by dependency — simple additions first (#17, #11, #13, #16), then the large daily-submission refactor (#5 backend, #5 frontend), then inline task creation (#2) and file attachments (#14). Each task is independently testable and committable.

**Tech Stack:** React + TypeScript (frontend), Express + Mongoose (backend), Node built-in test runner, GridFS for file storage.

## Global Constraints

- Test runner: `node --test` (Node built-in test runner, not Jest/Vitest)
- DAYS constant: `['mon', 'tue', 'wed', 'thu', 'fri']`
- Day type: `'mon' | 'tue' | 'wed' | 'thu' | 'fri'`
- SubmitStatus: `'draft' | 'submitted' | 'approved' | 'returned'`
- Notes max 500 chars, rejection reasons max 1000 chars
- All new Mongoose schemas use `{ _id: false }` for embedded docs
- Frontend uses `popoverPosition` from `web/src/pm/popoverPosition.ts` for popovers
- Config file: `auth.config.json`, loaded by `auth-api/src/config/configLoader.js`
- Org-wide weekly target default: 2400 minutes (40 hours)

---

### Task 1: Status Badge on Task Rows (#17)

**Files:**
- Modify: `web/src/timesheet/TaskRow.tsx`

**Interfaces:**
- Consumes: `StatusBadge` from `web/src/pm/StatusBadge.tsx` (already exists, takes `{ status: string }`). `task.status` already available on PM-linked rows.
- Produces: Visual status badge next to the PM badge on linked task rows.

- [ ] **Step 1: Import StatusBadge and render it in TaskRow**

In `web/src/timesheet/TaskRow.tsx`, add import at top:

```tsx
import { StatusBadge } from '../pm/StatusBadge';
```

In the PM-linked task branch (the `isPm` block), add `<StatusBadge>` after the PM badge:

```tsx
{isPm ? (
  <div>
    <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
    <span className="ts-pm-badge">PM</span>
    {task.status && <StatusBadge status={task.status} />}
    {showDue && task.endDate && (
      <span className={`due-pill ${urgency}`}>{dueLabel(task.endDate, today)}</span>
    )}
    {task.description && <div className="ts-sub">{task.description}</div>}
    <div className="ts-pm-meta">
      Planned {task.estimatedHours ?? 0}h · Actual {((task.actualMinutes ?? 0) / 60).toFixed(1)}h
    </div>
  </div>
) : /* ... rest unchanged */}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TaskRow.tsx
git commit -m "feat(web): show status badge on PM-linked task rows (#17)"
```

---

### Task 2: Rejection Reasons (#11)

**Files:**
- Modify: `auth-api/src/models/Timesheet.js`
- Modify: `auth-api/src/routes/timesheets.js`
- Modify: `auth-api/test/timesheetRows.test.js` (or a new route-level test)
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/TimesheetPage.tsx`

**Interfaces:**
- Consumes: Existing `PATCH /review/:id` endpoint, `Timesheet` model.
- Produces: `rejectionReason: string` on Timesheet schema. GET response includes `rejectionReason`. PATCH `/review/:id` accepts `reason` on return.

- [ ] **Step 1: Add rejectionReason to Timesheet schema**

In `auth-api/src/models/Timesheet.js`, add field to `timesheetSchema`:

```js
rejectionReason: { type: String, default: '' },
```

Place it after `reviewedBy`.

- [ ] **Step 2: Update PATCH /review/:id to accept and store reason**

In `auth-api/src/routes/timesheets.js`, update the `router.patch('/review/:id', ...)` handler:

```js
router.patch('/review/:id', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
  const decision = req.body?.decision;
  if (!['approve', 'return'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
  const doc = await Timesheet.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  if (doc.status !== 'submitted') return res.status(400).json({ error: 'timesheet is not awaiting review' });
  doc.status = decision === 'approve' ? 'approved' : 'returned';
  doc.reviewedBy = req.user.sub;
  doc.reviewedAt = new Date();
  doc.rejectionReason = decision === 'return'
    ? String(req.body?.reason || '').trim().slice(0, 1000)
    : '';
  await doc.save();
  res.json({ ok: true, status: doc.status });
}));
```

- [ ] **Step 3: Include rejectionReason in GET response**

In the GET `/:weekStart` handler, add `rejectionReason` to the response:

```js
res.json({
  weekStart, tasks, assignable, todayDay, grants, pending, readOnly,
  status,
  submittedAt: doc?.submittedAt || null,
  reviewedAt: doc?.reviewedAt || null,
  rejectionReason: doc?.rejectionReason || '',
});
```

- [ ] **Step 4: Update frontend types and API**

In `web/src/timesheet/timesheetApi.ts`, add `rejectionReason` to `WeekData`:

```ts
export type WeekData = {
  weekStart: string; tasks: Task[]; assignable: Assignable[]; todayDay: Day | null; grants: Grant[]; pending: Grant[];
  readOnly: boolean; status: SubmitStatus; submittedAt: string | null; reviewedAt: string | null;
  rejectionReason: string;
};
```

In `getWeek`, add to the return:

```ts
rejectionReason: String(data.rejectionReason ?? ''),
```

- [ ] **Step 5: Show rejection reason in TimesheetPage banner**

In `web/src/timesheet/TimesheetPage.tsx`, add state:

```tsx
const [rejectionReason, setRejectionReason] = useState('');
```

In `load`, set it:

```tsx
setRejectionReason(loaded.rejectionReason);
```

Update the returned banner:

```tsx
{submitStatus === 'returned' && (
  <div className="ts-returned-banner">
    Your PM sent this back{rejectionReason ? `: ${rejectionReason}` : ''} — review and resubmit.
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript compiles and run existing tests**

Run: `cd web && npx tsc --noEmit`
Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All pass, no regressions

- [ ] **Step 7: Commit**

```bash
git add auth-api/src/models/Timesheet.js auth-api/src/routes/timesheets.js web/src/timesheet/timesheetApi.ts web/src/timesheet/TimesheetPage.tsx
git commit -m "feat: add rejection reasons to timesheet review cycle (#11)"
```

---

### Task 3: Comment Summary View (#13)

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`
- Create: `web/src/timesheet/CommentSummary.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: Timesheet model with `tasks[].notes`. `requireRole('pm', 'admin')` middleware.
- Produces: `GET /timesheets/review/:id/notes` endpoint. `CommentSummary` React component.

- [ ] **Step 1: Add notes endpoint to timesheets router**

In `auth-api/src/routes/timesheets.js`, add after the existing `router.patch('/review/:id', ...)` block:

```js
router.get('/review/:id/notes', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
  const doc = await Timesheet.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  const rows = [];
  for (const t of doc.tasks) {
    for (const d of DAYS) {
      const note = t.notes?.[d] || '';
      if (!note) continue;
      rows.push({
        taskName: t.name || 'Untitled',
        day: d,
        minutes: t.entries?.[d] || 0,
        note,
      });
    }
  }
  res.json(rows);
}));
```

- [ ] **Step 2: Create CommentSummary component**

Create `web/src/timesheet/CommentSummary.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { authHeaders } from './timesheetApi';
import { formatMinutes, DAY_LABELS } from './time';
import type { Day } from './time';

const API = 'http://localhost:4000';

type NoteRow = { taskName: string; day: Day; minutes: number; note: string };

export function CommentSummary({ timesheetId }: { timesheetId: string }) {
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/timesheets/review/${timesheetId}/notes`, { headers: authHeaders(), credentials: 'include' })
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [timesheetId]);

  if (loading) return <p className="ts-sub">Loading notes…</p>;
  if (rows.length === 0) return <p className="ts-sub">No notes this week.</p>;

  return (
    <table className="cs-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Day</th>
          <th>Hours</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.taskName}</td>
            <td>{DAY_LABELS[r.day]}</td>
            <td>{formatMinutes(r.minutes)}</td>
            <td className="cs-note">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Add CSS for CommentSummary**

Append to `web/src/styles.css`:

```css
/* --- Comment summary (#13) --- */
.cs-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.cs-table th, .cs-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
.cs-table thead th { background: var(--surface-2); color: var(--faint); font-weight: 600; font-size: 11px; text-transform: uppercase; }
.cs-note { white-space: pre-wrap; max-width: 300px; }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/timesheets.js web/src/timesheet/CommentSummary.tsx web/src/styles.css
git commit -m "feat: add comment summary view for PM review (#13)"
```

---

### Task 4: Weekly Hour Target + Progress Bar (#16)

**Files:**
- Modify: `auth-api/src/models/User.js`
- Modify: `auth-api/src/config/configLoader.js`
- Modify: `auth-api/src/routes/profile.js`
- Modify: `auth-api/src/routes/timesheets.js`
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/TimesheetPage.tsx`
- Modify: `web/src/timesheet/SummaryTiles.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `User` model, `configLoader`, existing profile/timesheet routes.
- Produces: `User.weeklyTargetMinutes` field. `GET /profile/target` → `{ targetMinutes }`. `PATCH /profile/target`. GET `/timesheets/:weekStart` response includes `targetMinutes`. `SummaryTiles` renders progress bar.

- [ ] **Step 1: Add weeklyTargetMinutes to User model**

In `auth-api/src/models/User.js`, add to `userSchema`:

```js
weeklyTargetMinutes: { type: Number, default: null },
```

Place it after `reestimationCount`.

- [ ] **Step 2: Add weeklyTargetMinutes to config**

In `auth-api/src/config/configLoader.js`, add to the defaults section at the top:

```js
const TIMESHEET_DEFAULTS = {
  weeklyTargetMinutes: 2400,
};
```

In `loadConfig`, add to the return object:

```js
return {
  enabled,
  featureFlags: loadFeatureFlags(raw.features),
  shift: loadShiftConfig(raw.shift),
  weeklyTargetMinutes: Number(raw.weeklyTargetMinutes) || TIMESHEET_DEFAULTS.weeklyTargetMinutes,
};
```

- [ ] **Step 3: Add profile target endpoints**

In `auth-api/src/routes/profile.js`, add two new routes. The config is passed via `req.app.locals.config` (set during app init):

```js
router.get('/target', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub).select('weeklyTargetMinutes');
  const orgDefault = req.app.locals.config?.weeklyTargetMinutes ?? 2400;
  const targetMinutes = user?.weeklyTargetMinutes ?? orgDefault;
  res.json({ targetMinutes });
}));

router.patch('/target', requireAuth, asyncHandler(async (req, res) => {
  const value = req.body?.weeklyTargetMinutes;
  const weeklyTargetMinutes = value === null ? null : (Number(value) || null);
  await User.updateOne({ _id: req.user.sub }, { $set: { weeklyTargetMinutes } });
  const orgDefault = req.app.locals.config?.weeklyTargetMinutes ?? 2400;
  res.json({ targetMinutes: weeklyTargetMinutes ?? orgDefault });
}));
```

Also check that `req.app.locals.config` is set. In `auth-api/src/app.js`, after loading config, add:

```js
app.locals.config = config;
```

(Read `auth-api/src/app.js` to verify the exact placement.)

- [ ] **Step 4: Include targetMinutes in GET /timesheets/:weekStart**

In the GET handler in `auth-api/src/routes/timesheets.js`, resolve the target and include it:

```js
// After determining the userId...
const user = await User.findById(userId).select('weeklyTargetMinutes');
const orgDefault = req.app.locals.config?.weeklyTargetMinutes ?? 2400;
const targetMinutes = user?.weeklyTargetMinutes ?? orgDefault;
```

Add `User` import at the top:

```js
import { User } from '../models/User.js';
```

Add `targetMinutes` to the response JSON.

- [ ] **Step 5: Update frontend types**

In `web/src/timesheet/timesheetApi.ts`, add `targetMinutes` to `WeekData`:

```ts
targetMinutes: number;
```

In `getWeek`, add:

```ts
targetMinutes: Number(data.targetMinutes ?? 2400),
```

- [ ] **Step 6: Thread targetMinutes through TimesheetPage to SummaryTiles**

In `web/src/timesheet/TimesheetPage.tsx`, add state:

```tsx
const [targetMinutes, setTargetMinutes] = useState(2400);
```

In `load`:

```tsx
setTargetMinutes(loaded.targetMinutes);
```

Pass to SummaryTiles:

```tsx
<SummaryTiles
  weekTotal={weekTotal}
  targetMinutes={targetMinutes}
  busiestLabel={DAY_LABELS[busiest.day]}
  busiestMinutes={busiest.total}
  activeTasks={tasks.length}
/>
```

- [ ] **Step 7: Add progress bar to SummaryTiles**

Replace `web/src/timesheet/SummaryTiles.tsx`:

```tsx
import { formatMinutes } from './time';

type Props = {
  weekTotal: number;
  targetMinutes: number;
  busiestLabel: string;
  busiestMinutes: number;
  activeTasks: number;
};

export function SummaryTiles({ weekTotal, targetMinutes, busiestLabel, busiestMinutes, activeTasks }: Props) {
  const dailyAverage = Math.round(weekTotal / 5);
  const pct = targetMinutes > 0 ? Math.min(Math.round((weekTotal / targetMinutes) * 100), 100) : 0;
  const barColor = pct >= 100 ? 'var(--danger, #ef4444)' : pct >= 90 ? 'var(--warning, #f59e0b)' : 'var(--success, #22c55e)';
  return (
    <div className="ts-tiles">
      <div className="ts-tile ts-tile-accent">
        <span className="ts-tile-label">This week</span>
        <span className="ts-tile-value">
          {formatMinutes(weekTotal)}{targetMinutes > 0 ? ` / ${formatMinutes(targetMinutes)}` : ''}
        </span>
        {targetMinutes > 0 && (
          <div className="ts-progress-bar">
            <div className="ts-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        )}
        <span className="ts-tile-foot">across {activeTasks} {activeTasks === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div className="ts-tile">
        <span className="ts-tile-label">Daily average</span>
        <span className="ts-tile-value">{formatMinutes(dailyAverage)}</span>
        <span className="ts-tile-foot">over 5 weekdays</span>
      </div>
      <div className="ts-tile">
        <span className="ts-tile-label">Busiest day</span>
        <span className="ts-tile-value">{busiestMinutes > 0 ? busiestLabel : '—'}</span>
        <span className="ts-tile-foot">{busiestMinutes > 0 ? formatMinutes(busiestMinutes) : 'No hours yet'}</span>
      </div>
      <div className="ts-tile">
        <span className="ts-tile-label">Active tasks</span>
        <span className="ts-tile-value">{activeTasks}</span>
        <span className="ts-tile-foot">this week</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add progress bar CSS**

Append to `web/src/styles.css`:

```css
/* --- Weekly target progress bar (#16) --- */
.ts-progress-bar { width: 100%; height: 6px; background: var(--border); border-radius: 3px; margin: 6px 0 4px; overflow: hidden; }
.ts-progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
```

- [ ] **Step 9: Verify TypeScript and run tests**

Run: `cd web && npx tsc --noEmit`
Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add auth-api/src/models/User.js auth-api/src/config/configLoader.js auth-api/src/routes/profile.js auth-api/src/routes/timesheets.js web/src/timesheet/timesheetApi.ts web/src/timesheet/TimesheetPage.tsx web/src/timesheet/SummaryTiles.tsx web/src/styles.css
git commit -m "feat: add weekly hour target with progress bar (#16)"
```

---

### Task 5: Daily Submission — Backend (#9/#18)

**Files:**
- Modify: `auth-api/src/models/Timesheet.js`
- Modify: `auth-api/src/services/timesheetRows.js`
- Modify: `auth-api/src/routes/timesheets.js`
- Modify: `auth-api/test/timesheetRows.test.js`

**Interfaces:**
- Consumes: Existing Timesheet schema, `canSubmit`, `weekLocked`, `computeRowLock`.
- Produces: `dayStatus` map on Timesheet (`{ mon: { status, submittedAt, reviewedAt, reviewedBy, rejectionReason }, ... }`). `derivedStatus(dayStatus, tasks)` pure function. Updated `canSubmitDays(dayStatus, weekStart, currentMonday)`. Updated `isDayLocked(dayStatus, day)`. Submit endpoint accepts `{ days: ['mon', ...] }`. Review endpoint accepts `{ days: [...], decision, reason }`.

- [ ] **Step 1: Write failing test for derivedStatus**

In `auth-api/test/timesheetRows.test.js`, add:

```js
test('derivedStatus: all approved → approved', () => {
  const ds = { mon: { status: 'approved' }, tue: { status: 'approved' }, wed: { status: 'approved' }, thu: { status: 'approved' }, fri: { status: 'approved' } };
  const tasks = [{ entries: { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60 } }];
  assert.equal(derivedStatus(ds, tasks), 'approved');
});

test('derivedStatus: any returned → returned', () => {
  const ds = { mon: { status: 'approved' }, tue: { status: 'returned' }, wed: { status: 'draft' }, thu: { status: 'draft' }, fri: { status: 'draft' } };
  const tasks = [{ entries: { mon: 60, tue: 60, wed: 0, thu: 0, fri: 0 } }];
  assert.equal(derivedStatus(ds, tasks), 'returned');
});

test('derivedStatus: all non-empty submitted → submitted', () => {
  const ds = { mon: { status: 'submitted' }, tue: { status: 'submitted' }, wed: { status: 'draft' }, thu: { status: 'draft' }, fri: { status: 'draft' } };
  const tasks = [{ entries: { mon: 60, tue: 60, wed: 0, thu: 0, fri: 0 } }];
  assert.equal(derivedStatus(ds, tasks), 'submitted');
});

test('derivedStatus: mixed draft/submitted on non-empty days → draft', () => {
  const ds = { mon: { status: 'submitted' }, tue: { status: 'draft' }, wed: { status: 'draft' }, thu: { status: 'draft' }, fri: { status: 'draft' } };
  const tasks = [{ entries: { mon: 60, tue: 60, wed: 0, thu: 0, fri: 0 } }];
  assert.equal(derivedStatus(ds, tasks), 'draft');
});

test('derivedStatus: no entries at all → draft', () => {
  const ds = { mon: { status: 'draft' }, tue: { status: 'draft' }, wed: { status: 'draft' }, thu: { status: 'draft' }, fri: { status: 'draft' } };
  const tasks = [];
  assert.equal(derivedStatus(ds, tasks), 'draft');
});
```

Add `derivedStatus` to the import from `timesheetRows.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: FAIL — `derivedStatus` is not exported

- [ ] **Step 3: Implement derivedStatus**

In `auth-api/src/services/timesheetRows.js`, add:

```js
export function derivedStatus(dayStatus, tasks) {
  const dayTotals = {};
  for (const d of DAYS) dayTotals[d] = 0;
  for (const t of (tasks || [])) {
    for (const d of DAYS) dayTotals[d] += cleanMinutes(t.entries?.[d]);
  }
  const nonEmpty = DAYS.filter((d) => dayTotals[d] > 0);
  if (nonEmpty.length === 0) return 'draft';
  const statuses = nonEmpty.map((d) => (dayStatus?.[d]?.status || 'draft'));
  if (statuses.some((s) => s === 'returned')) return 'returned';
  if (statuses.every((s) => s === 'approved')) return 'approved';
  if (statuses.every((s) => s === 'submitted' || s === 'approved')) return 'submitted';
  return 'draft';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All PASS

- [ ] **Step 5: Write failing test for isDayLocked**

```js
test('isDayLocked: submitted day is locked', () => {
  const ds = { mon: { status: 'submitted' } };
  assert.equal(isDayLocked(ds, 'mon'), true);
});

test('isDayLocked: approved day is locked', () => {
  const ds = { mon: { status: 'approved' } };
  assert.equal(isDayLocked(ds, 'mon'), true);
});

test('isDayLocked: draft day is not locked', () => {
  const ds = { mon: { status: 'draft' } };
  assert.equal(isDayLocked(ds, 'mon'), false);
});

test('isDayLocked: returned day is not locked', () => {
  const ds = { mon: { status: 'returned' } };
  assert.equal(isDayLocked(ds, 'mon'), false);
});

test('isDayLocked: missing dayStatus defaults to draft (not locked)', () => {
  assert.equal(isDayLocked({}, 'mon'), false);
  assert.equal(isDayLocked(null, 'mon'), false);
});
```

Add `isDayLocked` to the import.

- [ ] **Step 6: Implement isDayLocked**

```js
export function isDayLocked(dayStatus, day) {
  const s = dayStatus?.[day]?.status || 'draft';
  return s === 'submitted' || s === 'approved';
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All PASS

- [ ] **Step 8: Add dayStatusSchema to Timesheet model**

In `auth-api/src/models/Timesheet.js`, add before `timesheetSchema`:

```js
const dayStatusEntrySchema = new mongoose.Schema({
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'returned'], default: 'draft' },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
}, { _id: false });
```

Add to `timesheetSchema`:

```js
dayStatus: {
  mon: { type: dayStatusEntrySchema, default: () => ({}) },
  tue: { type: dayStatusEntrySchema, default: () => ({}) },
  wed: { type: dayStatusEntrySchema, default: () => ({}) },
  thu: { type: dayStatusEntrySchema, default: () => ({}) },
  fri: { type: dayStatusEntrySchema, default: () => ({}) },
},
```

- [ ] **Step 9: Update submit endpoint for per-day submission**

In `auth-api/src/routes/timesheets.js`, replace the `POST /:weekStart/submit` handler:

```js
router.post('/:weekStart/submit', asyncHandler(async (req, res) => {
  const { weekStart } = req.params;
  if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
  if (weekStart > currentMonday()) return res.status(409).json({ error: 'cannot submit a future week' });
  const userId = req.user.sub;
  const doc = await Timesheet.findOne({ userId, weekStart });
  if (!doc) return res.status(404).json({ error: 'no timesheet found' });

  const requestedDays = Array.isArray(req.body?.days) ? req.body.days.filter((d) => DAYS.includes(d)) : [];
  const ds = doc.dayStatus || {};
  const now = new Date();

  // If no days specified, submit all draft/returned non-empty days
  const dayTotals = {};
  for (const d of DAYS) {
    dayTotals[d] = doc.tasks.reduce((sum, t) => sum + (t.entries?.[d] || 0), 0);
  }
  const toSubmit = requestedDays.length > 0
    ? requestedDays
    : DAYS.filter((d) => dayTotals[d] > 0 && ['draft', 'returned'].includes(ds[d]?.status || 'draft'));

  if (toSubmit.length === 0) return res.status(409).json({ error: 'no submittable days' });

  const update = {};
  for (const d of toSubmit) {
    const dayS = ds[d]?.status || 'draft';
    if (dayS !== 'draft' && dayS !== 'returned') continue;
    update[`dayStatus.${d}.status`] = 'submitted';
    update[`dayStatus.${d}.submittedAt`] = now;
    update[`dayStatus.${d}.reviewedAt`] = null;
    update[`dayStatus.${d}.reviewedBy`] = null;
    update[`dayStatus.${d}.rejectionReason`] = '';
  }

  if (Object.keys(update).length === 0) return res.status(409).json({ error: 'no submittable days' });

  // Derive week-level status after update
  const newDs = { ...ds };
  for (const d of DAYS) {
    if (update[`dayStatus.${d}.status`]) {
      newDs[d] = { ...(newDs[d] || {}), status: update[`dayStatus.${d}.status`] };
    }
  }
  const derivedStatusImport = derivedStatus(newDs, doc.tasks);
  update.status = derivedStatusImport;
  if (derivedStatusImport === 'submitted') update.submittedAt = now;

  await Timesheet.updateOne({ userId, weekStart }, { $set: update });
  res.json({ ok: true, status: derivedStatusImport, dayStatus: newDs });
}));
```

Add `derivedStatus` and `isDayLocked` to the import from `timesheetRows.js`.

- [ ] **Step 10: Update review endpoint for per-day decisions**

Replace the `PATCH /review/:id` handler:

```js
router.patch('/review/:id', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
  const decision = req.body?.decision;
  if (!['approve', 'return'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
  const doc = await Timesheet.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });

  const requestedDays = Array.isArray(req.body?.days) ? req.body.days.filter((d) => DAYS.includes(d)) : [];
  const ds = doc.dayStatus || {};
  const toReview = requestedDays.length > 0
    ? requestedDays.filter((d) => (ds[d]?.status || 'draft') === 'submitted')
    : DAYS.filter((d) => (ds[d]?.status || 'draft') === 'submitted');

  if (toReview.length === 0) return res.status(400).json({ error: 'no submitted days to review' });

  const now = new Date();
  const reason = decision === 'return' ? String(req.body?.reason || '').trim().slice(0, 1000) : '';
  const update = {};
  for (const d of toReview) {
    update[`dayStatus.${d}.status`] = decision === 'approve' ? 'approved' : 'returned';
    update[`dayStatus.${d}.reviewedAt`] = now;
    update[`dayStatus.${d}.reviewedBy`] = req.user.sub;
    update[`dayStatus.${d}.rejectionReason`] = reason;
  }

  const newDs = {};
  for (const d of DAYS) {
    newDs[d] = update[`dayStatus.${d}.status`]
      ? { ...(ds[d] || {}), status: update[`dayStatus.${d}.status`] }
      : (ds[d] || { status: 'draft' });
  }
  update.status = derivedStatus(newDs, doc.tasks);
  update.reviewedBy = req.user.sub;
  update.reviewedAt = now;
  update.rejectionReason = reason;

  await Timesheet.updateOne({ _id: doc._id }, { $set: update });
  res.json({ ok: true, status: update.status, dayStatus: newDs });
}));
```

- [ ] **Step 11: Update GET handler to include dayStatus and use isDayLocked**

In the GET `/:weekStart` handler, include `dayStatus` in the response and update the `readOnly` and `todayDay` logic to be day-aware:

```js
const ds = doc?.dayStatus || {};
const dayStatusOut = {};
for (const d of DAYS) {
  dayStatusOut[d] = {
    status: ds[d]?.status || 'draft',
    submittedAt: ds[d]?.submittedAt || null,
    reviewedAt: ds[d]?.reviewedAt || null,
    rejectionReason: ds[d]?.rejectionReason || '',
  };
}
```

Add `dayStatus: dayStatusOut` to the JSON response.

Update `readOnly` logic: a week is fully read-only only if every non-empty day is submitted/approved AND it's a past week with no grants. The existing `weekLocked(status)` still works since `status` is derived.

- [ ] **Step 12: Update computeRowLock to respect per-day submission status**

In `auth-api/src/services/timesheetRows.js`, update `computeRowLock` to accept `dayStatus` and check it:

Add `dayStatus = {}` to the parameter destructuring. In `editableFor`, add a check:

```js
const editableFor = (projectId, day, startDate) => {
  if (isDayLocked(dayStatus, day)) return false;
  if (startDate) {
    const cd = dayDate(day);
    if (cd && cd < startDate) return false;
  }
  if (todayDay) return DAYS.indexOf(day) <= DAYS.indexOf(todayDay);
  return !!projectId && grantSet.has(`${day}:${projectId}`);
};
```

- [ ] **Step 13: Write test for computeRowLock with dayStatus**

```js
test('computeRowLock: a submitted day is locked even in the current week', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 99, tue: 0, wed: 60, thu: 0, fri: 0 }, notes: { mon: '', tue: '', wed: '', thu: '', fri: '' } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1', entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 }, notes: { mon: '', tue: '', wed: '', thu: '', fri: '' } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const dayStatus = { mon: { status: 'submitted' }, tue: { status: 'draft' }, wed: { status: 'draft' }, thu: { status: 'draft' }, fri: { status: 'draft' } };
  const { rows } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants: [], dayStatus });
  assert.equal(rows[0].entries.mon, 30); // submitted day → locked, keeps saved value
  assert.equal(rows[0].entries.wed, 60); // draft day → editable
});
```

- [ ] **Step 14: Run all tests**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All PASS

- [ ] **Step 15: Update PUT handler to pass dayStatus to computeRowLock**

In the PUT `/:weekStart` handler, load dayStatus from the doc and pass it:

```js
const ds = doc?.dayStatus || {};
const { rows, consumed } = computeRowLock({ submittedRows: sanitized, savedRows, taskProjectById, taskStartById, weekStart, todayDay, grants, dayStatus: ds });
```

- [ ] **Step 16: Run full backend test suite**

Run: `cd auth-api && node --test`
Expected: All pass, no regressions

- [ ] **Step 17: Commit**

```bash
git add auth-api/src/models/Timesheet.js auth-api/src/services/timesheetRows.js auth-api/src/routes/timesheets.js auth-api/test/timesheetRows.test.js
git commit -m "feat(api): add per-day submission status tracking (#9/#18)"
```

---

### Task 6: Daily Submission — Frontend (#9/#18)

**Files:**
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/submit.ts`
- Modify: `web/src/timesheet/submit.test.ts`
- Modify: `web/src/timesheet/cellLock.ts`
- Modify: `web/src/timesheet/cellLock.test.ts`
- Modify: `web/src/timesheet/TimesheetPage.tsx`
- Modify: `web/src/timesheet/TimesheetGrid.tsx`
- Modify: `web/src/timesheet/WeekNav.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: Backend now returns `dayStatus` map in GET. Submit endpoint accepts `{ days: [...] }`.
- Produces: `DayStatus` type. `submitDays(weekStart, days)` API function. Day checkboxes in grid headers. Dynamic "Submit for N day(s)" button. Day status dots.

- [ ] **Step 1: Add DayStatus type and update API**

In `web/src/timesheet/timesheetApi.ts`:

```ts
export type DayStatusEntry = {
  status: SubmitStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string;
};
export type DayStatusMap = Record<Day, DayStatusEntry>;
```

Add to `WeekData`:

```ts
dayStatus: DayStatusMap;
```

In `getWeek`, parse `dayStatus`:

```ts
dayStatus: (data.dayStatus ?? {}) as DayStatusMap,
```

Add `submitDays` function:

```ts
export async function submitDays(weekStart: string, days: Day[]): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ days }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `submit failed (${r.status})`);
  }
}
```

- [ ] **Step 2: Update cellLock to check per-day status**

In `web/src/timesheet/cellLock.ts`, update `isCellEditable` to accept `dayStatus`:

```ts
import type { DayStatusEntry } from './timesheetApi';

export function isCellEditable(
  day: Day,
  projectId: string | null | undefined,
  todayDay: Day | null,
  grants: Grant[],
  columnDate?: string | null,
  startDate?: string | null,
  dayStatusEntry?: DayStatusEntry | null,
): boolean {
  if (dayStatusEntry && (dayStatusEntry.status === 'submitted' || dayStatusEntry.status === 'approved')) return false;
  if (startDate && columnDate && columnDate < startDate) return false;
  if (todayDay) return ORDER.indexOf(day) <= ORDER.indexOf(todayDay);
  if (!projectId) return false;
  return grants.some((g) => g.day === day && g.projectId === projectId);
}
```

- [ ] **Step 3: Update cellLock tests**

In `web/src/timesheet/cellLock.test.ts`, add:

```ts
test('a submitted day is locked even in the current week', () => {
  assert.equal(isCellEditable('mon', 'pA', 'wed', [], '2026-06-15', null, { status: 'submitted', submittedAt: null, reviewedAt: null, rejectionReason: '' }), false);
});

test('a returned day is editable', () => {
  assert.equal(isCellEditable('mon', 'pA', 'wed', [], '2026-06-15', null, { status: 'returned', submittedAt: null, reviewedAt: null, rejectionReason: '' }), true);
});
```

- [ ] **Step 4: Run cellLock tests**

Run: `cd web && node --test src/timesheet/cellLock.test.ts`
Expected: All PASS

- [ ] **Step 5: Add dayStatus state and day checkboxes to TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, add state:

```tsx
const [dayStatus, setDayStatus] = useState<DayStatusMap>({} as DayStatusMap);
const [checkedDays, setCheckedDays] = useState<Set<Day>>(new Set());
```

Import `DayStatusMap`, `submitDays` from `timesheetApi`. In `load`:

```tsx
setDayStatus(loaded.dayStatus);
setCheckedDays(new Set());
```

Add `onSubmitDays` handler:

```tsx
async function onSubmitDays() {
  const days = [...checkedDays];
  if (days.length === 0) return;
  if (!window.confirm(`Submit ${days.length} day(s) for review?`)) return;
  try {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (dirty.current) { await saveWeek(weekStart, tasks); dirty.current = false; }
    await submitDays(weekStart, days);
    await load(weekStart);
  } catch (e) {
    window.alert((e as Error).message);
  }
}
```

Pass `dayStatus`, `checkedDays`, `setCheckedDays`, and `onSubmitDays` to `TimesheetGrid` and `WeekNav`.

- [ ] **Step 6: Add day checkboxes and status dots to TimesheetGrid headers**

In `web/src/timesheet/TimesheetGrid.tsx`, accept new props:

```ts
dayStatus?: DayStatusMap;
checkedDays?: Set<Day>;
onToggleDay?: (day: Day) => void;
```

In the `<thead>` day columns, add a checkbox and status dot:

```tsx
{DAYS.map((d) => {
  const isFuture = dates[d] > today;
  const isToday = todayDay === d;
  const cls = `${isFuture ? 'ts-day-future' : ''}${isToday ? ' ts-day-today' : ''}`.trim() || undefined;
  const cell = attendance[d];
  const ds = dayStatus?.[d];
  const dayS = ds?.status || 'draft';
  const showCheck = !readOnly && (dayS === 'draft' || dayS === 'returned') && !isFuture;
  return (
    <th key={d} className={cls}>
      <div className="ts-day-header">
        {showCheck && onToggleDay && (
          <input
            type="checkbox"
            className="ts-day-check"
            checked={checkedDays?.has(d) || false}
            onChange={() => onToggleDay(d)}
          />
        )}
        {cols[d]}
        {dayS !== 'draft' && <span className={`ts-day-dot ts-day-dot-${dayS}`} title={dayS} />}
      </div>
      {cell && (
        <span
          className={`ts-th-icon ${attendanceIconColorClass(cell.status)}`}
          title={attendanceTooltip(cell.status, cell.effectiveMinutes, cell.needsRegularise, cell.note)}
        >
          {attendanceIcon(cell.status)}{cell.needsRegularise ? '⚠' : ''}
        </span>
      )}
    </th>
  );
})}
```

Pass `dayStatus` entry to each `TaskRow` → `TimeCell` via the `isCellEditable` call in TaskRow.

- [ ] **Step 7: Update WeekNav with dynamic submit button**

In `web/src/timesheet/WeekNav.tsx`, add props:

```ts
checkedCount?: number;
onSubmitDays?: () => void;
```

Add the dynamic button next to the existing submit button:

```tsx
{checkedCount !== undefined && checkedCount > 0 && onSubmitDays && (
  <button className="btn btn-primary ts-submit-btn" type="button" onClick={onSubmitDays}>
    Submit for {checkedCount} day{checkedCount > 1 ? 's' : ''}
  </button>
)}
```

- [ ] **Step 8: Update returned banner for per-day reasons**

In `TimesheetPage.tsx`, update the returned banner to show per-day rejection reasons:

```tsx
{submitStatus === 'returned' && (
  <div className="ts-returned-banner">
    {DAYS.filter((d) => dayStatus[d]?.status === 'returned').map((d) => {
      const reason = dayStatus[d]?.rejectionReason;
      return <div key={d}>{DAY_LABELS[d]} was returned{reason ? `: ${reason}` : ''}.</div>;
    })}
    Review and resubmit.
  </div>
)}
```

- [ ] **Step 9: Add CSS for day checkboxes and status dots**

Append to `web/src/styles.css`:

```css
/* --- Daily submission (#9/#18) --- */
.ts-day-header { display: flex; align-items: center; justify-content: center; gap: 4px; }
.ts-day-check { width: 14px; height: 14px; cursor: pointer; accent-color: var(--primary); }
.ts-day-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.ts-day-dot-submitted { background: var(--warning, #f59e0b); }
.ts-day-dot-approved { background: var(--success, #22c55e); }
.ts-day-dot-returned { background: var(--danger, #ef4444); }
```

- [ ] **Step 10: Verify TypeScript and run all frontend tests**

Run: `cd web && npx tsc --noEmit`
Run: `cd web && node --test "src/**/*.test.ts"`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add web/src/timesheet/timesheetApi.ts web/src/timesheet/submit.ts web/src/timesheet/submit.test.ts web/src/timesheet/cellLock.ts web/src/timesheet/cellLock.test.ts web/src/timesheet/TimesheetPage.tsx web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/WeekNav.tsx web/src/styles.css
git commit -m "feat(web): add daily submission UI with checkboxes and status dots (#9/#18)"
```

---

### Task 7: Inline Task Creation (#2)

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/TimesheetGrid.tsx`

**Interfaces:**
- Consumes: `Project` model, `Task` model. Employee's project memberships.
- Produces: `POST /timesheets/tasks` endpoint. `createTimesheetTask(title, projectId)` API function. "Create new task" section in add-task menu.

- [ ] **Step 1: Add inline task creation endpoint**

In `auth-api/src/routes/timesheets.js`, add after the edit-requests route (inside `createTimesheetRouter`):

```js
import { Project } from '../models/Project.js';
```

```js
router.post('/tasks', asyncHandler(async (req, res) => {
  const { title, projectId } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
  if (!projectId || !mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: 'invalid projectId' });
  const userId = req.user.sub;
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  if (!project.members.some((m) => String(m) === String(userId))) {
    return res.status(403).json({ error: 'not a member of this project' });
  }
  const task = await Task.create({
    project: project._id,
    title: String(title).trim(),
    assignees: [{ user: userId, sharePct: 100 }],
    status: 'todo',
    createdBy: userId,
  });
  res.status(201).json({
    taskId: String(task._id),
    title: task.title,
    projectId: String(project._id),
    projectName: project.name,
    status: task.status,
    estimatedHours: 0,
  });
}));
```

- [ ] **Step 2: Add projects list to GET /timesheets/:weekStart response**

In the GET handler, after fetching `assignedTasks`, also fetch the employee's projects:

```js
const userProjects = await Project.find({ members: userId, status: 'active' }).select('name');
```

Add to the response:

```js
projects: userProjects.map((p) => ({ _id: String(p._id), name: p.name })),
```

Add `Project` import at the top (if not already added in step 1).

- [ ] **Step 3: Update frontend types and API**

In `web/src/timesheet/timesheetApi.ts`:

```ts
export type ProjectRef = { _id: string; name: string };
```

Add to `WeekData`:

```ts
projects: ProjectRef[];
```

In `getWeek`:

```ts
projects: (data.projects ?? []) as ProjectRef[],
```

Add API function:

```ts
export async function createTimesheetTask(title: string, projectId: string): Promise<Assignable> {
  const r = await fetch(`${API}/timesheets/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ title, projectId }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `create failed (${r.status})`);
  }
  return r.json();
}
```

- [ ] **Step 4: Add "Create new task" section to add-task menu**

In `web/src/timesheet/TimesheetGrid.tsx`, accept new props:

```ts
projects?: ProjectRef[];
onTaskCreated?: (a: Assignable) => void;
```

Add state for the create form inside the component:

```tsx
const [createMode, setCreateMode] = useState(false);
const [newTitle, setNewTitle] = useState('');
const [newProjectId, setNewProjectId] = useState('');
const [creating, setCreating] = useState(false);
```

Import `createTimesheetTask, ProjectRef` from `timesheetApi`.

In the add-task menu portal, after the "No task assigned" group, add:

```tsx
<div className="ts-add-group">
  <div className="ts-add-group-label">Create new task</div>
  {!createMode ? (
    <button className="ts-add-item" type="button" role="menuitem" onClick={() => setCreateMode(true)}>
      <span className="ts-add-item-title">+ New task</span>
      <span className="ts-add-item-meta">Create a task under a project</span>
    </button>
  ) : (
    <div className="ts-create-form">
      <select className="input ts-create-select" value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
        <option value="">Select project…</option>
        {(projects || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
      </select>
      <input className="input ts-create-input" placeholder="Task name" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
      <button
        className="btn btn-primary ts-create-btn"
        type="button"
        disabled={!newTitle.trim() || !newProjectId || creating}
        onClick={async () => {
          setCreating(true);
          try {
            const result = await createTimesheetTask(newTitle.trim(), newProjectId);
            onTaskCreated?.(result);
            setPickerOpen(false);
            setCreateMode(false);
            setNewTitle('');
            setNewProjectId('');
          } catch (e) {
            window.alert((e as Error).message);
          } finally {
            setCreating(false);
          }
        }}
      >
        {creating ? 'Creating…' : 'Create & add'}
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 5: Thread projects and onTaskCreated from TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, add state:

```tsx
const [projects, setProjects] = useState<ProjectRef[]>([]);
```

In `load`:

```tsx
setProjects(loaded.projects);
```

Pass to `TimesheetGrid`:

```tsx
projects={projects}
onTaskCreated={(a) => onAddAssigned(a)}
```

- [ ] **Step 6: Add CSS for create form**

Append to `web/src/styles.css`:

```css
/* --- Inline task creation (#2) --- */
.ts-create-form { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.ts-create-select, .ts-create-input { width: 100%; font-size: 13px; padding: 6px 8px; }
.ts-create-btn { width: 100%; font-size: 13px; }
```

- [ ] **Step 7: Verify TypeScript and run tests**

Run: `cd web && npx tsc --noEmit`
Run: `cd auth-api && node --test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add auth-api/src/routes/timesheets.js web/src/timesheet/timesheetApi.ts web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/TimesheetPage.tsx web/src/styles.css
git commit -m "feat: add inline task creation from timesheet (#2)"
```

---

### Task 8: File Attachments (#14)

**Files:**
- Modify: `auth-api/src/models/Timesheet.js`
- Modify: `auth-api/src/routes/timesheets.js`
- Create: `web/src/timesheet/AttachmentBar.tsx`
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/TimesheetPage.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `mongoose.mongo.GridFSBucket` for file storage. Timesheet model.
- Produces: `POST /timesheets/:weekStart/attachments` (multipart upload). `GET /timesheets/attachments/:fileId` (download). `DELETE /timesheets/:weekStart/attachments/:fileId`. `AttachmentBar` React component.

- [ ] **Step 1: Add attachments schema to Timesheet**

In `auth-api/src/models/Timesheet.js`, add before `timesheetSchema`:

```js
const attachmentSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  filename: { type: String, required: true },
  contentType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });
```

Add to `timesheetSchema`:

```js
attachments: { type: [attachmentSchema], default: [] },
```

- [ ] **Step 2: Install multer for multipart parsing**

Run: `cd auth-api && npm install multer`

- [ ] **Step 3: Add upload endpoint**

In `auth-api/src/routes/timesheets.js`, add imports:

```js
import multer from 'multer';
import { Readable } from 'stream';
```

Create multer instance and GridFS bucket helper:

```js
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

function getBucket(db) {
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'timesheetFiles' });
}
```

Add upload endpoint (inside `createTimesheetRouter`, before the `return router`):

```js
router.post('/:weekStart/attachments', upload.single('file'), asyncHandler(async (req, res) => {
  const { weekStart } = req.params;
  if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday' });
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const userId = req.user.sub;
  const doc = await Timesheet.findOne({ userId, weekStart });
  if (!doc) return res.status(404).json({ error: 'no timesheet found' });
  if ((doc.attachments || []).length >= 5) return res.status(400).json({ error: 'max 5 attachments' });

  const bucket = getBucket(mongoose.connection.db);
  const stream = bucket.openUploadStream(req.file.originalname, {
    contentType: req.file.mimetype,
    metadata: { userId, weekStart },
  });
  const readable = new Readable();
  readable.push(req.file.buffer);
  readable.push(null);
  readable.pipe(stream);

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const attachment = {
    fileId: stream.id,
    filename: req.file.originalname,
    contentType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date(),
  };
  doc.attachments.push(attachment);
  await doc.save();
  res.status(201).json(attachment);
}));
```

- [ ] **Step 4: Add download endpoint**

```js
router.get('/attachments/:fileId', asyncHandler(async (req, res) => {
  const fileId = req.params.fileId;
  if (!mongoose.isValidObjectId(fileId)) return res.status(400).json({ error: 'invalid fileId' });
  const bucket = getBucket(mongoose.connection.db);
  const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
  if (files.length === 0) return res.status(404).json({ error: 'file not found' });
  const file = files[0];
  const meta = file.metadata || {};
  if (String(meta.userId) !== String(req.user.sub) && !['pm', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.set('Content-Type', file.contentType || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
  bucket.openDownloadStream(file._id).pipe(res);
}));
```

- [ ] **Step 5: Add delete endpoint**

```js
router.delete('/:weekStart/attachments/:fileId', asyncHandler(async (req, res) => {
  const { weekStart, fileId } = req.params;
  if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday' });
  if (!mongoose.isValidObjectId(fileId)) return res.status(400).json({ error: 'invalid fileId' });
  const userId = req.user.sub;
  const doc = await Timesheet.findOne({ userId, weekStart });
  if (!doc) return res.status(404).json({ error: 'no timesheet found' });
  const idx = doc.attachments.findIndex((a) => String(a.fileId) === fileId);
  if (idx === -1) return res.status(404).json({ error: 'attachment not found' });
  const bucket = getBucket(mongoose.connection.db);
  await bucket.delete(new mongoose.Types.ObjectId(fileId));
  doc.attachments.splice(idx, 1);
  await doc.save();
  res.json({ ok: true });
}));
```

- [ ] **Step 6: Include attachments in GET response**

In the GET `/:weekStart` handler, add to the response:

```js
attachments: (doc?.attachments || []).map((a) => ({
  fileId: String(a.fileId),
  filename: a.filename,
  contentType: a.contentType,
  size: a.size,
  uploadedAt: a.uploadedAt,
})),
```

- [ ] **Step 7: Add frontend types and API functions**

In `web/src/timesheet/timesheetApi.ts`:

```ts
export type Attachment = {
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};
```

Add to `WeekData`:

```ts
attachments: Attachment[];
```

In `getWeek`:

```ts
attachments: (data.attachments ?? []) as Attachment[],
```

Add API functions:

```ts
export async function uploadAttachment(weekStart: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${API}/timesheets/${weekStart}/attachments`, {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: form,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `upload failed (${r.status})`);
  }
  return r.json();
}

export async function deleteAttachment(weekStart: string, fileId: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/attachments/${fileId}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `delete failed (${r.status})`);
  }
}

export function attachmentUrl(fileId: string): string {
  return `${API}/timesheets/attachments/${fileId}`;
}
```

- [ ] **Step 8: Create AttachmentBar component**

Create `web/src/timesheet/AttachmentBar.tsx`:

```tsx
import { useRef, useState } from 'react';
import { uploadAttachment, deleteAttachment, attachmentUrl } from './timesheetApi';
import type { Attachment } from './timesheetApi';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  weekStart: string;
  attachments: Attachment[];
  readOnly: boolean;
  onUpdate: (attachments: Attachment[]) => void;
};

export function AttachmentBar({ weekStart, attachments, readOnly, onUpdate }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadAttachment(weekStart, file);
      onUpdate([...attachments, att]);
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(fileId: string) {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await deleteAttachment(weekStart, fileId);
      onUpdate(attachments.filter((a) => a.fileId !== fileId));
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <div className="att-bar">
      {!readOnly && (
        <>
          <button className="att-act att-act-sm" type="button" disabled={uploading || attachments.length >= 5} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Attach file'}
          </button>
          <input ref={fileRef} type="file" hidden onChange={handleUpload} />
        </>
      )}
      {attachments.length > 0 && (
        <ul className="att-list">
          {attachments.map((a) => (
            <li key={a.fileId} className="att-item">
              <a href={attachmentUrl(a.fileId)} target="_blank" rel="noopener noreferrer" className="att-link">{a.filename}</a>
              <span className="att-size">{formatSize(a.size)}</span>
              {!readOnly && <button className="att-del" type="button" onClick={() => handleDelete(a.fileId)}>×</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Wire AttachmentBar into TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, add state:

```tsx
const [attachments, setAttachments] = useState<Attachment[]>([]);
```

Import `Attachment` from `timesheetApi` and `AttachmentBar` from `./AttachmentBar`.

In `load`:

```tsx
setAttachments(loaded.attachments);
```

Render after the grid, before the leave modal:

```tsx
<AttachmentBar
  weekStart={weekStart}
  attachments={attachments}
  readOnly={readOnly}
  onUpdate={setAttachments}
/>
```

- [ ] **Step 10: Add CSS for AttachmentBar**

Append to `web/src/styles.css`:

```css
/* --- File attachments (#14) --- */
.att-bar { margin-top: 12px; }
.att-list { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
.att-item { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 10px; font-size: 13px; }
.att-link { color: var(--primary); text-decoration: none; }
.att-link:hover { text-decoration: underline; }
.att-size { color: var(--faint); font-size: 11px; }
.att-del { background: none; border: none; color: var(--faint); cursor: pointer; font-size: 14px; padding: 0 2px; }
.att-del:hover { color: var(--danger, #ef4444); }
```

- [ ] **Step 11: Verify TypeScript and run tests**

Run: `cd web && npx tsc --noEmit`
Run: `cd auth-api && node --test`
Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add auth-api/src/models/Timesheet.js auth-api/src/routes/timesheets.js auth-api/package.json auth-api/package-lock.json web/src/timesheet/timesheetApi.ts web/src/timesheet/AttachmentBar.tsx web/src/timesheet/TimesheetPage.tsx web/src/styles.css
git commit -m "feat: add file attachments to timesheets via GridFS (#14)"
```
