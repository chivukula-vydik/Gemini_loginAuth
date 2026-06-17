# Timesheet Submit Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee submit a week's timesheet for review; the week locks after submit, and a PM approves or returns it from the existing in-app Requests queue.

**Architecture:** Add a `status` lifecycle (`draft → submitted → approved | returned`) to the `Timesheet` model. A pure helper decides submittability and lock state, shared by a JS copy (`timesheetRows.js`, enforced server-side) and a TS copy (`submit.ts`, used by the UI). New employee endpoint `POST /timesheets/:weekStart/submit` and role-guarded PM endpoints `GET /timesheets/review` + `PATCH /timesheets/review/:id`. The grant-based per-cell unlock (`EditRequest`) is unchanged and still punches through the submission lock.

**Tech Stack:** Node 22+/Express/Mongoose (`auth-api`), React 19 + Vite + TypeScript (`web`), `node:test` for the pure helpers.

## Global Constraints

- **Testing policy:** No automated tests for UI/API code — verified by `node --check` / `npx tsc -b` / `npm run build` + manual checks. Pure helpers get `node:test` unit tests only (matches `timesheetRows.test.js`, `cellLock.test.ts`).
- **Lock semantics:** `weekLocked(status)` is true iff `status ∈ {submitted, approved}`. Past-week date locking stays in the route's `readOnly` expression — do **not** fold it into `weekLocked`.
- **Submittable rule:** `canSubmit(status, weekStart, currentMondayISO)` is true iff `status ∈ {draft, returned}` AND `weekStart <= currentMondayISO`.
- **Status enum (verbatim, used everywhere):** `'draft' | 'submitted' | 'approved' | 'returned'`.
- **PM review queue is not PM-scoped** — every `pm`/`admin` sees all submitted timesheets, mirroring `editRequests.js`.
- **Commits:** end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and use `git -c commit.gpgsign=false commit`.

---

## Task 1: Backend submission-state helpers (`timesheetRows.js`)

**Files:**
- Modify: `auth-api/src/services/timesheetRows.js`
- Test: `auth-api/test/timesheetRows.test.js`

**Interfaces:**
- Produces: `canSubmit(status: string, weekStart: string, currentMondayISO: string): boolean`; `weekLocked(status: string): boolean` — exported from `timesheetRows.js`.

- [ ] **Step 1: Add failing tests** — append to the END of `auth-api/test/timesheetRows.test.js`:

```js
test('canSubmit: draft/returned for a started week are submittable', () => {
  assert.equal(canSubmit('draft', '2026-06-08', '2026-06-15'), true);
  assert.equal(canSubmit('returned', '2026-06-15', '2026-06-15'), true);
});

test('canSubmit: future weeks and submitted/approved are not submittable', () => {
  assert.equal(canSubmit('draft', '2026-06-22', '2026-06-15'), false);
  assert.equal(canSubmit('submitted', '2026-06-15', '2026-06-15'), false);
  assert.equal(canSubmit('approved', '2026-06-08', '2026-06-15'), false);
});

test('weekLocked: only submitted and approved are locked', () => {
  assert.equal(weekLocked('submitted'), true);
  assert.equal(weekLocked('approved'), true);
  assert.equal(weekLocked('draft'), false);
  assert.equal(weekLocked('returned'), false);
});
```

Also update the import line at the top of the same file to add the two new names:

```js
import { mergeWeekRows, sanitizeRows, currentMonday, todayDayFor, computeRowLock, canSubmit, weekLocked } from '../src/services/timesheetRows.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `auth-api/`): `node --test`
Expected: FAIL — `canSubmit`/`weekLocked` are `undefined` / not a function.

- [ ] **Step 3: Implement the helpers** — append to the END of `auth-api/src/services/timesheetRows.js`:

```js
// --- submission lifecycle helpers ---
// status ∈ 'draft' | 'submitted' | 'approved' | 'returned'

export function canSubmit(status, weekStart, currentMondayISO) {
  return (status === 'draft' || status === 'returned') && weekStart <= currentMondayISO;
}

export function weekLocked(status) {
  return status === 'submitted' || status === 'approved';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `auth-api/`): `node --test`
Expected: PASS — all timesheetRows tests green, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/timesheetRows.js auth-api/test/timesheetRows.test.js
git -c commit.gpgsign=false commit -m "feat: canSubmit/weekLocked timesheet submission helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Frontend submission-state helper mirror (`submit.ts`)

**Files:**
- Create: `web/src/timesheet/submit.ts`
- Test: `web/src/timesheet/submit.test.ts`

**Interfaces:**
- Produces: `type SubmitStatus = 'draft' | 'submitted' | 'approved' | 'returned'`; `canSubmit(status, weekStart, currentMondayISO): boolean`; `weekLocked(status): boolean`.

- [ ] **Step 1: Write the failing test** — create `web/src/timesheet/submit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, weekLocked } from './submit.ts';

test('canSubmit: draft/returned for a started week', () => {
  assert.equal(canSubmit('draft', '2026-06-08', '2026-06-15'), true);
  assert.equal(canSubmit('returned', '2026-06-15', '2026-06-15'), true);
});

test('canSubmit: future week or non-editable status is false', () => {
  assert.equal(canSubmit('draft', '2026-06-22', '2026-06-15'), false);
  assert.equal(canSubmit('submitted', '2026-06-15', '2026-06-15'), false);
  assert.equal(canSubmit('approved', '2026-06-08', '2026-06-15'), false);
});

test('weekLocked: only submitted/approved are locked', () => {
  assert.equal(weekLocked('submitted'), true);
  assert.equal(weekLocked('approved'), true);
  assert.equal(weekLocked('draft'), false);
  assert.equal(weekLocked('returned'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npm test`
Expected: FAIL — cannot find module `./submit.ts`.

- [ ] **Step 3: Write minimal implementation** — create `web/src/timesheet/submit.ts`:

```ts
export type SubmitStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export function canSubmit(status: SubmitStatus, weekStart: string, currentMondayISO: string): boolean {
  return (status === 'draft' || status === 'returned') && weekStart <= currentMondayISO;
}

export function weekLocked(status: SubmitStatus): boolean {
  return status === 'submitted' || status === 'approved';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npm test`
Expected: PASS — all `src/timesheet/**/*.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add web/src/timesheet/submit.ts web/src/timesheet/submit.test.ts
git -c commit.gpgsign=false commit -m "feat: submit.ts pure helpers for timesheet submission state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Timesheet model status fields

**Files:**
- Modify: `auth-api/src/models/Timesheet.js`

**Interfaces:**
- Produces: `Timesheet` docs gain `status`, `submittedAt`, `reviewedAt`, `reviewedBy`.

- [ ] **Step 1: Add the fields** — in `auth-api/src/models/Timesheet.js`, replace the `timesheetSchema` definition (the block starting `const timesheetSchema = new mongoose.Schema({`) with:

```js
const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true },
  tasks: { type: [taskSchema], default: [] },
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'returned'], default: 'draft' },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },
});
```

- [ ] **Step 2: Verify**

Run (from `auth-api/`): `node --check src/models/Timesheet.js && node -e "import('./src/models/Timesheet.js').then(m=>console.log(typeof m.Timesheet))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Timesheet.js
git -c commit.gpgsign=false commit -m "feat: timesheet status/submittedAt/reviewedAt/reviewedBy fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Submit endpoint + GET/PUT lock integration (`timesheets.js`)

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`

**Interfaces:**
- Consumes: `canSubmit`, `weekLocked`, `currentMonday` from `timesheetRows.js`.
- Produces: `POST /timesheets/:weekStart/submit`; `GET /timesheets/:weekStart` now returns `status`, `submittedAt`, `reviewedAt`; locked weeks reject non-granted edits on PUT.

- [ ] **Step 1: Extend the helper import** — in `auth-api/src/routes/timesheets.js`, replace the import block:

```js
import {
  mergeWeekRows, sanitizeRows, computeRowLock, currentMonday, todayDayFor, todayISO, DAYS,
} from '../services/timesheetRows.js';
```

with:

```js
import {
  mergeWeekRows, sanitizeRows, computeRowLock, currentMonday, todayDayFor, todayISO, DAYS,
  canSubmit, weekLocked,
} from '../services/timesheetRows.js';
```

- [ ] **Step 2: Return status + fold into `readOnly` in GET** — in the `GET '/:weekStart'` handler, replace these closing lines:

```js
    const grants = await approvedGrantsFor(userId, weekStart);
    const pending = await pendingGrantsFor(userId, weekStart);
    const todayDay = todayDayFor(weekStart, todayISO());
    const readOnly = weekStart < currentMonday() && grants.length === 0;
    res.json({ weekStart, tasks, todayDay, grants, pending, readOnly });
```

with:

```js
    const grants = await approvedGrantsFor(userId, weekStart);
    const pending = await pendingGrantsFor(userId, weekStart);
    const todayDay = todayDayFor(weekStart, todayISO());
    const status = doc?.status || 'draft';
    const readOnly = (weekStart < currentMonday() && grants.length === 0) || weekLocked(status);
    res.json({
      weekStart, tasks, todayDay, grants, pending, readOnly,
      status,
      submittedAt: doc?.submittedAt || null,
      reviewedAt: doc?.reviewedAt || null,
    });
```

- [ ] **Step 3: Harden PUT so a locked week only accepts granted cells** — in the `PUT '/:weekStart'` handler, replace:

```js
    const grants = await approvedGrantsFor(userId, weekStart);
    const todayDay = todayDayFor(weekStart, todayISO());
    const { rows, consumed } = computeRowLock({ submittedRows: sanitized, savedRows, taskProjectById, todayDay, grants });
```

with:

```js
    const grants = await approvedGrantsFor(userId, weekStart);
    const status = doc?.status || 'draft';
    // Once submitted/approved, "today" is no longer auto-editable; only approved
    // grants punch through. Passing todayDay=null achieves exactly that.
    const todayDay = weekLocked(status) ? null : todayDayFor(weekStart, todayISO());
    const { rows, consumed } = computeRowLock({ submittedRows: sanitized, savedRows, taskProjectById, todayDay, grants });
```

- [ ] **Step 4: Add the submit route** — in `auth-api/src/routes/timesheets.js`, immediately AFTER the closing `}));` of the `PUT '/:weekStart'` handler and BEFORE the `POST '/:weekStart/edit-requests'` handler, add:

```js
  router.post('/:weekStart/submit', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const userId = req.user.sub;
    const doc = await Timesheet.findOne({ userId, weekStart });
    const status = doc?.status || 'draft';
    if (!canSubmit(status, weekStart, currentMonday())) {
      return res.status(409).json({ error: 'this week cannot be submitted' });
    }
    const submittedAt = new Date();
    await Timesheet.updateOne(
      { userId, weekStart },
      { $set: { status: 'submitted', submittedAt, reviewedAt: null, reviewedBy: null }, $setOnInsert: { userId, weekStart } },
      { upsert: true },
    );
    res.json({ ok: true, status: 'submitted', submittedAt });
  }));
```

- [ ] **Step 5: Verify (syntax + optional live round-trip)**

Run (from `auth-api/`): `node --check src/routes/timesheets.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

If a local MongoDB is reachable, optionally boot the server (`node --env-file=.env src/server.js`) and confirm: `GET /timesheets/2026-06-15` includes `"status":"draft"`; `POST /timesheets/2026-06-15/submit` returns `{"ok":true,"status":"submitted",...}`; a follow-up GET shows `"status":"submitted","readOnly":true`; a second submit returns `409`. If no DB, note it's deferred to manual E2E in Task 10.

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/routes/timesheets.js
git -c commit.gpgsign=false commit -m "feat: timesheet submit route + submission-aware readOnly/PUT locking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: PM review routes (`timesheets.js`)

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`

**Interfaces:**
- Produces: `GET /timesheets/review?status=submitted` → `[{ _id, user: { _id, displayName, email } | null, weekStart, submittedAt, totalMinutes }]`; `PATCH /timesheets/review/:id` with `{ decision: 'approve' | 'return' }`.

- [ ] **Step 1: Import the role guard** — in `auth-api/src/routes/timesheets.js`, add this import directly below the existing `import { requireAuth } from '../middleware/requireAuth.js';` line:

```js
import { requireRole } from '../middleware/requireRole.js';
```

- [ ] **Step 2: Register the review routes BEFORE `GET '/:weekStart'`** — in `createTimesheetRouter`, immediately AFTER `router.use(requireAuth);` and BEFORE the `router.get('/:weekStart', ...)` handler, add:

```js
  // PM/admin review queue. Registered before '/:weekStart' so 'review' is not
  // parsed as a weekStart. Not PM-scoped — every pm/admin sees all submissions.
  router.get('/review', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const status = req.query.status || 'submitted';
    const docs = await Timesheet.find({ status })
      .populate('userId', 'displayName email')
      .sort('-submittedAt');
    res.json(docs.map((d) => ({
      _id: String(d._id),
      user: d.userId
        ? { _id: String(d.userId._id), displayName: d.userId.displayName, email: d.userId.email }
        : null,
      weekStart: d.weekStart,
      submittedAt: d.submittedAt,
      totalMinutes: d.tasks.reduce(
        (sum, t) => sum + DAYS.reduce((a, day) => a + (t.entries?.[day] || 0), 0),
        0,
      ),
    })));
  }));

  router.patch('/review/:id', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approve', 'return'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const doc = await Timesheet.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.status !== 'submitted') return res.status(400).json({ error: 'timesheet is not awaiting review' });
    doc.status = decision === 'approve' ? 'approved' : 'returned';
    doc.reviewedBy = req.user.sub;
    doc.reviewedAt = new Date();
    await doc.save();
    res.json({ ok: true, status: doc.status });
  }));
```

- [ ] **Step 3: Verify**

Run (from `auth-api/`): `node --check src/routes/timesheets.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`. (HTTP behavior verified in Task 10 manual E2E.)

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/timesheets.js
git -c commit.gpgsign=false commit -m "feat: PM timesheet review routes (list submitted, approve/return)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Timesheet API client additions (`timesheetApi.ts`)

**Files:**
- Modify: `web/src/timesheet/timesheetApi.ts`

**Interfaces:**
- Consumes: `SubmitStatus` from `./submit`.
- Produces: `WeekData` gains `status: SubmitStatus`, `submittedAt: string | null`, `reviewedAt: string | null`; `submitWeek(weekStart: string): Promise<void>`.

- [ ] **Step 1: Import `SubmitStatus`** — at the top of `web/src/timesheet/timesheetApi.ts`, directly below `import type { Day } from './time';`, add:

```ts
import type { SubmitStatus } from './submit';
```

- [ ] **Step 2: Extend `WeekData`** — replace the `WeekData` type line:

```ts
export type WeekData = { weekStart: string; tasks: Task[]; todayDay: Day | null; grants: Grant[]; pending: Grant[]; readOnly: boolean };
```

with:

```ts
export type WeekData = {
  weekStart: string; tasks: Task[]; todayDay: Day | null; grants: Grant[]; pending: Grant[];
  readOnly: boolean; status: SubmitStatus; submittedAt: string | null; reviewedAt: string | null;
};
```

- [ ] **Step 3: Map the new fields in `getWeek`** — replace the `return { ... };` block inside `getWeek`:

```ts
  return {
    weekStart: data.weekStart,
    tasks: data.tasks as Task[],
    todayDay: (data.todayDay ?? null) as Day | null,
    grants: (data.grants ?? []) as Grant[],
    pending: (data.pending ?? []) as Grant[],
    readOnly: !!data.readOnly,
  };
```

with:

```ts
  return {
    weekStart: data.weekStart,
    tasks: data.tasks as Task[],
    todayDay: (data.todayDay ?? null) as Day | null,
    grants: (data.grants ?? []) as Grant[],
    pending: (data.pending ?? []) as Grant[],
    readOnly: !!data.readOnly,
    status: (data.status ?? 'draft') as SubmitStatus,
    submittedAt: (data.submittedAt ?? null) as string | null,
    reviewedAt: (data.reviewedAt ?? null) as string | null,
  };
```

- [ ] **Step 4: Add `submitWeek`** — append to the END of `web/src/timesheet/timesheetApi.ts`:

```ts
export async function submitWeek(weekStart: string): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || `submit failed (${r.status})`);
  }
}
```

- [ ] **Step 5: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/timesheet/timesheetApi.ts
git -c commit.gpgsign=false commit -m "feat: timesheet api client submit + status fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: WeekNav status badge + Submit button (`WeekNav.tsx`)

**Files:**
- Modify: `web/src/timesheet/WeekNav.tsx`

**Interfaces:**
- Consumes: `SubmitStatus` from `./submit`.
- Produces: `WeekNav` accepts `submitStatus?`, `submittedAt?`, `submittable?`, `onSubmit?`.

- [ ] **Step 1: Replace the whole file** — overwrite `web/src/timesheet/WeekNav.tsx` with:

```tsx
import { weekRangeLabel } from './time';
import type { SubmitStatus } from './submit';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  weekStart: string;
  status: SaveStatus;
  readOnly?: boolean;
  submitStatus?: SubmitStatus;
  submittedAt?: string | null;
  submittable?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCopyLastWeek: () => void;
  onSubmit?: () => void;
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed — retry',
};

const SUBMIT_LABEL: Record<SubmitStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', approved: 'Approved', returned: 'Returned',
};

export function WeekNav({
  weekStart, status, readOnly = false, submitStatus, submittedAt, submittable = false,
  onPrev, onNext, onToday, onCopyLastWeek, onSubmit,
}: Props) {
  return (
    <div className="ts-nav">
      <div className="ts-nav-left">
        <button className="ts-arrow" type="button" aria-label="Previous week" onClick={onPrev}>‹</button>
        <span className="ts-week-label">{weekRangeLabel(weekStart)}</span>
        <button className="ts-arrow" type="button" aria-label="Next week" onClick={onNext}>›</button>
        <button className="ts-today" type="button" onClick={onToday}>Today</button>
        {readOnly ? (
          <span className="ts-badge">Read only</span>
        ) : (
          <button className="ts-copy" type="button" onClick={onCopyLastWeek}>Copy last week</button>
        )}
      </div>
      <div className="ts-nav-right">
        <span className={`ts-status ts-status-${status}`}>{STATUS_TEXT[status]}</span>
        {submitStatus && (
          <span className={`ts-submit-badge ts-submit-${submitStatus}`}>
            {SUBMIT_LABEL[submitStatus]}
            {submitStatus === 'submitted' && submittedAt ? ` · ${submittedAt.slice(0, 10)}` : ''}
          </span>
        )}
        {submittable && onSubmit && (
          <button className="btn btn-primary ts-submit-btn" type="button" onClick={onSubmit}>Submit week</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/WeekNav.tsx
git -c commit.gpgsign=false commit -m "feat: WeekNav submission badge + submit button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Wire submit state + action into `TimesheetPage.tsx`

**Files:**
- Modify: `web/src/timesheet/TimesheetPage.tsx`

**Interfaces:**
- Consumes: `submitWeek` from `./timesheetApi`; `canSubmit`, `SubmitStatus` from `./submit`; `WeekNav` new props.

- [ ] **Step 1: Update imports** — replace these two import lines at the top of `web/src/timesheet/TimesheetPage.tsx`:

```tsx
import { getWeek, saveWeek, createEditRequest, Task, Entries, Grant } from './timesheetApi';
import type { Day } from './time';
```

with:

```tsx
import { getWeek, saveWeek, submitWeek, createEditRequest, Task, Entries, Grant } from './timesheetApi';
import { canSubmit, SubmitStatus } from './submit';
import type { Day } from './time';
```

- [ ] **Step 2: Add submission state** — directly below the existing `const [pendingKeys, setPendingKeys] = useState<string[]>([]);` line, add:

```tsx
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('draft');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
```

- [ ] **Step 3: Populate it on load** — inside `load`, replace:

```tsx
      setPendingKeys(loaded.pending.map((g) => `${g.day}:${g.projectId}`));
      setReadOnly(loaded.readOnly);
```

with:

```tsx
      setPendingKeys(loaded.pending.map((g) => `${g.day}:${g.projectId}`));
      setReadOnly(loaded.readOnly);
      setSubmitStatus(loaded.status);
      setSubmittedAt(loaded.submittedAt);
      setReviewedAt(loaded.reviewedAt);
```

- [ ] **Step 4: Add the submit handler** — directly below the `onCopyLastWeek` function (after its closing `}`), add:

```tsx
  const submittable = canSubmit(submitStatus, weekStart, mondayOf());

  async function onSubmit() {
    if (!submittable) return;
    if (!window.confirm('Submit this week for review? You won’t be able to edit it after.')) return;
    try {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (dirty.current) { await saveWeek(weekStart, tasks); dirty.current = false; }
      await submitWeek(weekStart);
      await load(weekStart);
    } catch (e) {
      window.alert((e as Error).message);
    }
  }
```

- [ ] **Step 5: Pass props to `WeekNav`** — replace the `<WeekNav ... />` element with:

```tsx
      <WeekNav
        weekStart={weekStart}
        status={status}
        readOnly={readOnly}
        submitStatus={submitStatus}
        submittedAt={submittedAt}
        submittable={submittable}
        onPrev={() => goToWeek(prevWeek(weekStart))}
        onNext={() => goToWeek(nextWeek(weekStart))}
        onToday={() => goToWeek(mondayOf())}
        onCopyLastWeek={onCopyLastWeek}
        onSubmit={onSubmit}
      />
```

- [ ] **Step 6: Replace the read-only banner with status-aware messaging** — replace this block:

```tsx
      {readOnly && (
        <div className="ts-readonly-banner">
          Viewing a past week — read only. Use <strong>Today</strong> to return to the current week and make changes.
        </div>
      )}
```

with:

```tsx
      {readOnly && (
        <div className="ts-readonly-banner">
          {submitStatus === 'submitted'
            ? <>Submitted{submittedAt ? ` on ${submittedAt.slice(0, 10)}` : ''} — awaiting PM review.</>
            : submitStatus === 'approved'
              ? <>Approved{reviewedAt ? ` on ${reviewedAt.slice(0, 10)}` : ''}.</>
              : <>Viewing a past week — read only. Use <strong>Today</strong> to return to the current week and make changes.</>}
        </div>
      )}
      {submitStatus === 'returned' && (
        <div className="ts-returned-banner">Your PM sent this back — review and resubmit.</div>
      )}
```

- [ ] **Step 7: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/timesheet/TimesheetPage.tsx
git -c commit.gpgsign=false commit -m "feat: wire submit action + status banners into TimesheetPage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: PM "Submitted timesheets" section (`pmApi.ts` + `Requests.tsx`)

**Files:**
- Modify: `web/src/pm/pmApi.ts`
- Modify: `web/src/pm/Requests.tsx`

**Interfaces:**
- Consumes: `Person` (already in `pmApi.ts`).
- Produces: `SubmittedTimesheet` type; `listSubmittedTimesheets()`; `decideTimesheet(id, 'approve' | 'return')`.

- [ ] **Step 1: Add API bindings** — append to the END of `web/src/pm/pmApi.ts`:

```ts
export type SubmittedTimesheet = {
  _id: string; user: Person | null; weekStart: string; submittedAt: string | null; totalMinutes: number;
};
export const listSubmittedTimesheets = () =>
  authed('/timesheets/review?status=submitted') as Promise<SubmittedTimesheet[]>;
export const decideTimesheet = (id: string, decision: 'approve' | 'return') =>
  authed(`/timesheets/review/${id}`, 'PATCH', { decision });
```

- [ ] **Step 2: Extend the Requests imports** — in `web/src/pm/Requests.tsx`, replace the import block:

```tsx
import {
  listEditRequests, decideEditRequest, EditReq,
  listClaimRequests, decideClaimRequest, ClaimReq,
} from './pmApi';
```

with:

```tsx
import {
  listEditRequests, decideEditRequest, EditReq,
  listClaimRequests, decideClaimRequest, ClaimReq,
  listSubmittedTimesheets, decideTimesheet, SubmittedTimesheet,
} from './pmApi';
```

- [ ] **Step 3: Add state + handlers + reload** — in `Requests()`, replace:

```tsx
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [claims, setClaims] = useState<ClaimReq[]>([]);
  const [error, setError] = useState('');

  function reload() {
    listEditRequests().then(setReqs).catch((e) => setError(e.message));
    listClaimRequests().then(setClaims).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);
```

with:

```tsx
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [claims, setClaims] = useState<ClaimReq[]>([]);
  const [sheets, setSheets] = useState<SubmittedTimesheet[]>([]);
  const [error, setError] = useState('');

  function reload() {
    listEditRequests().then(setReqs).catch((e) => setError(e.message));
    listClaimRequests().then(setClaims).catch((e) => setError(e.message));
    listSubmittedTimesheets().then(setSheets).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function decideSheet(id: string, decision: 'approve' | 'return') {
    setError('');
    try { await decideTimesheet(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }
```

- [ ] **Step 4: Render the section** — in `Requests.tsx`, directly AFTER the `{error && <p className="ts-error">{error}</p>}` line and BEFORE the `<h2 ...>Timesheet edit requests</h2>` line, add:

```tsx
      <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '8px 0' }}>Submitted timesheets</h2>
      <div className="ts-card" style={{ marginBottom: 22 }}>
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Week</th><th>Total hours</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            {sheets.length === 0 && <tr><td colSpan={5} className="ts-empty">No submitted timesheets.</td></tr>}
            {sheets.map((s) => (
              <tr key={s._id}>
                <td className="ts-task">{s.user?.displayName || s.user?.email || '—'}</td>
                <td>{s.weekStart}</td>
                <td>{(s.totalMinutes / 60).toFixed(1)}h</td>
                <td>{s.submittedAt ? s.submittedAt.slice(0, 10) : '—'}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decideSheet(s._id, 'approve')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decideSheet(s._id, 'return')}>Return</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 5: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pm/pmApi.ts web/src/pm/Requests.tsx
git -c commit.gpgsign=false commit -m "feat: PM submitted-timesheets review section in Requests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Styles + full-app build + manual E2E

**Files:**
- Modify: `web/src/styles.css`

- [ ] **Step 1: Append styles** — add to the END of `web/src/styles.css`:

```css
/* ---- Timesheet submission ---- */
.ts-submit-badge {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted);
}
.ts-submit-draft { color: var(--muted); }
.ts-submit-submitted { color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }
.ts-submit-approved { color: #16a34a; border-color: #16a34a; background: #f0fdf4; }
.ts-submit-returned { color: var(--danger); border-color: var(--danger); background: #fef2f2; }
.ts-submit-btn { width: auto; padding: 7px 14px; font-size: 13px; }
.ts-returned-banner {
  background: #fef2f2; border: 1px solid var(--danger); color: var(--danger);
  border-radius: var(--radius); padding: 10px 14px; margin-bottom: 14px; font-size: 13px; font-weight: 500;
}
```

- [ ] **Step 2: Full build**

Run (from `web/`): `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 3: Manual E2E** (servers running per run instructions; needs local MongoDB):

  1. Sign in as an employee. On the **current** week the badge reads **Draft** and a **Submit week** button shows; a **future** week shows no Submit button (`canSubmit` false).
  2. Enter some hours, click **Submit week**, confirm the dialog. Badge → **Submitted · {date}**, grid becomes read-only, banner reads "Submitted on … — awaiting PM review", Submit button disappears.
  3. Sign in as a PM/admin → **Requests**. The submitted week appears under **Submitted timesheets** with the employee, week, total hours, and submitted date.
  4. Click **Return**. Back as the employee, reload the week: badge → **Returned**, the "Your PM sent this back" banner shows, and the grid is editable again.
  5. Re-submit, then as PM click **Approve**. As the employee, the week shows **Approved** and is read-only.
  6. Confirm the existing per-day **request edit access** flow still works on a returned/draft past week (grant-based unlock unaffected).

- [ ] **Step 4: Commit**

```bash
git add web/src/styles.css
git -c commit.gpgsign=false commit -m "feat: styles for timesheet submission badges + returned banner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** model fields (T3); lifecycle + lock semantics via pure helpers (T1 backend, T2 frontend); submit endpoint + readOnly/PUT integration (T4); PM review endpoints (T5); API client (T6); employee badge/submit button (T7) + state/banners (T8); PM review section (T9); styles + manual E2E (T10). Grant-based unlock left untouched and re-verified in T10 step 3.6.
- **Type consistency:** `SubmitStatus` enum identical in `submit.ts` (T2) and reused by `timesheetApi.ts` (T6), `WeekNav.tsx` (T7), `TimesheetPage.tsx` (T8). `canSubmit`/`weekLocked` signatures match between JS (T1) and TS (T2). `decideTimesheet`/`PATCH /review/:id` both use `'approve' | 'return'`. `SubmittedTimesheet` shape (T9) matches the `GET /review` response (T5): `_id`, `user`, `weekStart`, `submittedAt`, `totalMinutes`.
- **Route ordering:** `GET /review` registered before `GET /:weekStart` (T5 step 2) so `review` is not parsed as a weekStart.
- **Placeholder scan:** none — every code step contains complete code.
- **Out of scope (unchanged from spec):** email notifications, Friday hard-gate, hours-display consistency, deadline colors, click-to-open cards, task power tools, multi-assignee.
```