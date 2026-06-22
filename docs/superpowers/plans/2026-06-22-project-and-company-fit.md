# Project fit (PM) + Company fit (Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline staffing picker with a full-screen PM "project fit" candidates page, and add an admin-only "company fit" reputation tab, relocating the re-estimation signal off the PM surface.

**Architecture:** Two independent, role-scoped verdicts computed by pure modules (`projectFit.ts`, `companyFit.ts` on the web; `reputation.js` on the API) with co-located unit tests. The web app keeps its existing state-based view switching (no router). The API extends the candidates endpoint and adds a reputation endpoint; the Task model gains a `completedAt` stamp.

**Tech Stack:** Node (ESM) + Express + Mongoose API tested with `node --test`; React + TypeScript + Vite web app tested with `node --test` over `*.test.ts`.

## Global Constraints

- No new dependencies; no routing library — reuse state-based view switching.
- Web tests run via `npm test` in `web/` (`node --test "src/timesheet/**/*.test.ts" "src/pm/**/*.test.ts"`).
- API tests run via `npm test` in `auth-api/` (`node --test`).
- Pure logic lives in modules with no React/Express imports; co-locate a `.test` file.
- Company-fit (reputation) data is **admin-only** (`requireRole('admin')`).
- `TASK_LIMIT = 5` (project-fit overload threshold), one named constant.
- Re-estimation must not appear on any PM-facing surface.
- People with no history get a neutral verdict, never a false-negative penalty.
- On-time / delay is forward-looking: only tasks with a `completedAt` count.

---

## SLICE 1 — PM Project-fit (end to end)

### Task 1: `completedAt` on the Task model + stamping

**Files:**
- Modify: `auth-api/src/models/Task.js:35` (add field near `dueDate`)
- Modify: `auth-api/src/routes/tasks.js:80-82` (stamp on status change)
- Test: `auth-api/test/routes.test.js` (extend existing progress test, or add one)

**Interfaces:**
- Produces: `Task.completedAt: Date | null`, set to `now` when status becomes `done`, cleared when status leaves `done`.

- [ ] **Step 1: Add the field**

In `auth-api/src/models/Task.js`, immediately after the `dueDate` line (`dueDate: { type: Date, default: null },`) add:

```js
  completedAt: { type: Date, default: null },
```

- [ ] **Step 2: Stamp it in the progress route**

In `auth-api/src/routes/tasks.js`, replace the status block (lines 80-82):

```js
    if ('status' in (req.body || {}) && ['todo', 'in_progress', 'blocked', 'done'].includes(req.body.status)) {
      task.status = req.body.status;
    }
```

with:

```js
    if ('status' in (req.body || {}) && ['todo', 'in_progress', 'blocked', 'done'].includes(req.body.status)) {
      task.status = req.body.status;
      if (task.status === 'done') {
        if (!task.completedAt) task.completedAt = new Date();
      } else {
        task.completedAt = null;
      }
    }
```

- [ ] **Step 3: Add a test asserting the stamp**

Open `auth-api/test/routes.test.js`, find the existing progress test (search for `/progress`). Add an assertion in a new test that after PATCHing `{ status: 'done' }` the returned task has a truthy `completedAt`, and after PATCHing back to `{ status: 'in_progress' }` it is `null`. Mirror the auth/setup style already used in that file for an assignee/PM PATCH to `/api/tasks/:id/progress`.

- [ ] **Step 4: Run the API tests**

Run: `cd auth-api && npm test`
Expected: PASS (all suites, including the new assertion).

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/models/Task.js auth-api/src/routes/tasks.js auth-api/test/routes.test.js
git commit -m "feat: stamp Task.completedAt when a task is marked done"
```

---

### Task 2: candidates endpoint — add `activeTaskCount`, drop `pastRecord`

**Files:**
- Modify: `auth-api/src/routes/projects.js:128-142` (candidate mapping)
- Modify: `auth-api/src/routes/projects.js:17` (remove unused `summarize` import)
- Test: `auth-api/test/routes.test.js` (candidates response shape)

**Interfaces:**
- Produces: each candidate now has `activeTaskCount: number` and **no** `pastRecord`.

- [ ] **Step 1: Update the candidate mapping**

In `auth-api/src/routes/projects.js`, replace the body of `candidates = users.map((u) => { ... })` (lines 128-142) with:

```js
    const candidates = users.map((u) => {
      const uid = String(u._id);
      const entries = entriesByUser.get(uid) || [];
      const avail = classifyAvailability(committedHours(entries));
      const userSkillSet = new Set((u.skills || []).map(String));
      const matchedSkills = requiredSkills.filter((s) => userSkillSet.has(s._id)).map((s) => s.name);
      const missingSkills = requiredSkills.filter((s) => !userSkillSet.has(s._id)).map((s) => s.name);
      return {
        _id: uid, displayName: u.displayName, email: u.email, role: u.role,
        ...avail,
        skillsOk: skillsMatch(requiredIds, [...userSkillSet]),
        matchedSkills, missingSkills,
        activeTaskCount: entries.length, // open (non-done) assignments
        isMember: memberSet.has(uid),
      };
    });
```

(`entriesByUser` already holds only non-done tasks, so `entries.length` is the open-task count.)

- [ ] **Step 2: Remove the now-unused import**

In `auth-api/src/routes/projects.js`, delete line 17:

```js
import { summarize } from '../services/reestimations.js';
```

Also drop `reestimations` from the candidate `User.find(...).select(...)` if present (line ~127): change `.select('displayName email role skills reestimations')` to `.select('displayName email role skills')`.

- [ ] **Step 3: Update the candidates test**

In `auth-api/test/routes.test.js`, find the candidates test (search for `/candidates`). Assert each returned candidate has a numeric `activeTaskCount` and does **not** have a `pastRecord` property (`assert.equal('pastRecord' in cand, false)`).

- [ ] **Step 4: Run the API tests**

Run: `cd auth-api && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/projects.js auth-api/test/routes.test.js
git commit -m "feat: candidates expose activeTaskCount, drop re-estimation past record"
```

---

### Task 3: `projectFit` pure module (web)

**Files:**
- Create: `web/src/pm/projectFit.ts`
- Test: `web/src/pm/projectFit.test.ts`

**Interfaces:**
- Produces:
  - `TASK_LIMIT: number` (= 5)
  - `type FitVerdict = 'good' | 'ok' | 'poor'`
  - `projectFit(input: { skillsOk: boolean; status: 'available'|'standby'|'busy'; activeTaskCount: number }): FitVerdict`
  - `FIT_LABEL: Record<FitVerdict, string>`
  - `roleNote(role: string | undefined): string | null`

- [ ] **Step 1: Write the failing test**

Create `web/src/pm/projectFit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectFit, TASK_LIMIT, FIT_LABEL, roleNote } from './projectFit.ts';

test('good: all skills, not busy, under task limit', () => {
  assert.equal(projectFit({ skillsOk: true, status: 'available', activeTaskCount: 2 }), 'good');
  assert.equal(projectFit({ skillsOk: true, status: 'standby', activeTaskCount: TASK_LIMIT - 1 }), 'good');
});

test('poor: missing skills AND overloaded', () => {
  assert.equal(projectFit({ skillsOk: false, status: 'busy', activeTaskCount: 1 }), 'poor');
  assert.equal(projectFit({ skillsOk: false, status: 'available', activeTaskCount: TASK_LIMIT }), 'poor');
});

test('ok: a single gap', () => {
  assert.equal(projectFit({ skillsOk: true, status: 'busy', activeTaskCount: 1 }), 'ok');
  assert.equal(projectFit({ skillsOk: false, status: 'available', activeTaskCount: 1 }), 'ok');
  assert.equal(projectFit({ skillsOk: true, status: 'available', activeTaskCount: TASK_LIMIT }), 'ok');
});

test('FIT_LABEL covers every verdict', () => {
  assert.equal(FIT_LABEL.good, 'Good fit');
  assert.equal(FIT_LABEL.ok, 'OK');
  assert.equal(FIT_LABEL.poor, 'Poor');
});

test('roleNote flags non-employees, null for employees', () => {
  assert.equal(roleNote('employee'), null);
  assert.equal(roleNote(undefined), null);
  assert.equal(roleNote('pm'), 'Adding a pm as a member');
  assert.equal(roleNote('admin'), 'Adding an admin as a member');
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd web && npx node --test src/pm/projectFit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

Create `web/src/pm/projectFit.ts`:

```ts
// Project fit: is this person right for THIS project, right now? Pure verdict
// over the candidate signals the API already computes — no React, no fetch.

export const TASK_LIMIT = 5; // open assignments at/above which a person is "stretched"

export type FitVerdict = 'good' | 'ok' | 'poor';

type FitInput = {
  skillsOk: boolean;
  status: 'available' | 'standby' | 'busy';
  activeTaskCount: number;
};

export function projectFit({ skillsOk, status, activeTaskCount }: FitInput): FitVerdict {
  const overloaded = status === 'busy' || activeTaskCount >= TASK_LIMIT;
  if (skillsOk && !overloaded) return 'good';
  if (!skillsOk && overloaded) return 'poor';
  return 'ok';
}

export const FIT_LABEL: Record<FitVerdict, string> = {
  good: 'Good fit',
  ok: 'OK',
  poor: 'Poor',
};

// A displayed caution (not part of the score): staffing a PM/admin as a member.
export function roleNote(role: string | undefined): string | null {
  if (!role || role === 'employee') return null;
  const article = role === 'admin' ? 'an' : 'a';
  return `Adding ${article} ${role} as a member`;
}
```

- [ ] **Step 4: Run the test to confirm pass**

Run: `cd web && npx node --test src/pm/projectFit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/projectFit.ts web/src/pm/projectFit.test.ts
git commit -m "feat: projectFit verdict module"
```

---

### Task 4: web API types — candidate field swap

**Files:**
- Modify: `web/src/pm/pmApi.ts:32-37` (Candidate type)
- Modify: `web/src/pm/pmApi.ts:31` (remove `PastRecord` if unused after Task 5)

**Interfaces:**
- Produces: `Candidate` with `activeTaskCount: number` and no `pastRecord`.

- [ ] **Step 1: Edit the Candidate type**

In `web/src/pm/pmApi.ts`, replace the `Candidate` type (lines 32-37) with:

```ts
export type Candidate = {
  _id: string; displayName: string; email: string; role: Role;
  status: Availability; loadPct: number; hours: number; capacity: number;
  skillsOk: boolean; matchedSkills: string[]; missingSkills: string[];
  activeTaskCount: number; isMember: boolean;
};
```

Leave `PastRecord` (line 31) in place for now; it is removed in Task 6 once its last consumer is gone.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc -b`
Expected: errors only in files still referencing `pastRecord` (CandidatePicker.tsx) — those are removed in the next tasks. Note them; do not fix here.

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/pmApi.ts
git commit -m "feat: Candidate type gains activeTaskCount, drops pastRecord"
```

---

### Task 5: `StaffMembers` full-screen candidates page (web)

**Files:**
- Create: `web/src/pm/StaffMembers.tsx`
- Modify: `web/src/styles.css` (append fit-card styles)

**Interfaces:**
- Consumes: `listCandidates` (pmApi), `projectFit`, `FIT_LABEL`, `roleNote` (Task 3), `initials`/`personName` (personName.ts).
- Produces: `StaffMembers({ projectId, projectName, onAdd, onBack }: { projectId: string; projectName: string; onAdd: (userId: string) => Promise<void>; onBack: () => void })`.

- [ ] **Step 1: Create the component**

Create `web/src/pm/StaffMembers.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { listCandidates, type Candidate, type CandidatesResponse } from './pmApi';
import { projectFit, FIT_LABEL, roleNote } from './projectFit';
import { initials, personName } from './personName';

const STATUS_LABEL: Record<Candidate['status'], string> = {
  available: 'Available',
  standby: 'Standby',
  busy: 'Busy',
};

function FitCard({ c, busy, onAdd }: { c: Candidate; busy: boolean; onAdd: () => void }) {
  const verdict = projectFit(c);
  const note = roleNote(c.role);
  return (
    <div className={`fit-card fit-${verdict}`}>
      <div className="fit-card-head">
        <span className="person-avatar cand-avatar">{initials({ displayName: c.displayName, email: c.email })}</span>
        <div className="fit-id">
          <span className="cand-name">{personName(c)}</span>
          <span className="fit-role">{c.role}</span>
        </div>
        <span className={`fit-badge fit-${verdict}`}>{FIT_LABEL[verdict]}</span>
      </div>
      <div className="cand-line">
        <span className={`cand-badge cand-${c.status}`}>{STATUS_LABEL[c.status]} · {c.hours}h / {c.capacity}h</span>
        <span className="fit-tasks">{c.activeTaskCount} open {c.activeTaskCount === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div className="cand-bar"><div className={`cand-bar-fill cand-${c.status}`} style={{ width: `${c.loadPct}%` }} /></div>
      {(c.matchedSkills.length > 0 || c.missingSkills.length > 0) && (
        <div className="cand-skills">
          {c.matchedSkills.map((s) => <span key={`m${s}`} className="cand-skill ok">✓ {s}</span>)}
          {c.missingSkills.map((s) => <span key={`x${s}`} className="cand-skill missing">⚠ {s}</span>)}
        </div>
      )}
      {note && <div className="fit-note">{note}</div>}
      <button className="btn btn-auto btn-primary fit-add" type="button" disabled={busy} onClick={onAdd}>Add to project</button>
    </div>
  );
}

export function StaffMembers({ projectId, projectName, onAdd, onBack }: {
  projectId: string; projectName: string;
  onAdd: (userId: string) => Promise<void>; onBack: () => void;
}) {
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listCandidates(projectId).then(setData).catch((e) => setError((e as Error).message));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function handleAdd(userId: string) {
    setBusyId(userId);
    setError('');
    try { await onAdd(userId); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  }

  const candidates = (data?.candidates ?? []).filter((c) => !c.isMember);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <button className="link-btn" onClick={onBack}>← {projectName}</button>
          <h1 className="ts-h1">Staff members</h1>
          <p className="ts-sub">Sorted by skill fit &amp; availability</p>
        </div>
      </header>
      {error && <p className="ts-error">{error}</p>}
      {!data && <span className="ts-sub">Loading candidates…</span>}
      {data && candidates.length === 0 && <span className="ts-sub">Everyone available is already on this project.</span>}
      <div className="fit-grid">
        {candidates.map((c) => (
          <FitCard key={c._id} c={c} busy={busyId === c._id} onAdd={() => handleAdd(c._id)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append styles**

Append to `web/src/styles.css`:

```css
/* Project-fit staffing page */
.fit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.fit-card { border: 1px solid var(--border, #e2e8f0); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--card, #fff); }
.fit-card.fit-good { border-left: 4px solid #16a34a; }
.fit-card.fit-ok { border-left: 4px solid #d97706; }
.fit-card.fit-poor { border-left: 4px solid #dc2626; }
.fit-card-head { display: flex; align-items: center; gap: 10px; }
.fit-id { display: flex; flex-direction: column; min-width: 0; }
.fit-role { font-size: 12px; color: var(--muted, #64748b); text-transform: capitalize; }
.fit-badge { margin-left: auto; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.fit-badge.fit-good { background: #dcfce7; color: #166534; }
.fit-badge.fit-ok { background: #fef3c7; color: #92400e; }
.fit-badge.fit-poor { background: #fee2e2; color: #991b1b; }
.fit-tasks { font-size: 12px; color: var(--muted, #64748b); margin-left: auto; }
.fit-note { font-size: 12px; color: #92400e; }
.fit-add { align-self: flex-start; }
```

- [ ] **Step 3: Typecheck the component**

Run: `cd web && npx tsc -b`
Expected: StaffMembers.tsx compiles (errors remain only in CandidatePicker.tsx until Task 6).

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/StaffMembers.tsx web/src/styles.css
git commit -m "feat: full-screen Staff members page with project-fit cards"
```

---

### Task 6: wire StaffMembers into ProjectDetail; remove inline picker

**Files:**
- Modify: `web/src/pm/Projects.tsx` (import, state, button, view branch)
- Delete: `web/src/pm/CandidatePicker.tsx`
- Delete: `web/src/pm/pastRecord.ts`
- Modify: `web/src/pm/pmApi.ts:31` (remove now-unused `PastRecord` type)

**Interfaces:**
- Consumes: `StaffMembers` (Task 5).

- [ ] **Step 1: Swap the import**

In `web/src/pm/Projects.tsx`, replace line 8:

```tsx
import { CandidatePicker } from './CandidatePicker';
```

with:

```tsx
import { StaffMembers } from './StaffMembers';
```

- [ ] **Step 2: Add staffing state**

In `ProjectDetail`, add to the state block (near line 144):

```tsx
  const [staffing, setStaffing] = useState(false);
```

- [ ] **Step 3: Render the full-screen staffing view**

In `ProjectDetail`, immediately after the `if (!project) return (...)` skeleton block (after line 255, before `const ownerCandidates`), add:

```tsx
  if (staffing) return (
    <StaffMembers
      projectId={id}
      projectName={project.name}
      onAdd={async (uid) => { await addMemberById(uid); setStaffing(false); }}
      onBack={() => setStaffing(false)}
    />
  );
```

- [ ] **Step 4: Replace the inline picker with a button**

In `web/src/pm/Projects.tsx`, replace these two lines (348-349):

```tsx
          <span className="field-hint">Add member — sorted by availability &amp; skill fit</span>
          <CandidatePicker projectId={id} onAdd={addMemberById} />
```

with:

```tsx
          <button className="btn btn-auto btn-primary" type="button" onClick={() => setStaffing(true)}>
            Staff members
          </button>
```

- [ ] **Step 5: Delete dead files**

```bash
git rm web/src/pm/CandidatePicker.tsx web/src/pm/pastRecord.ts
```

- [ ] **Step 6: Remove the unused PastRecord type**

In `web/src/pm/pmApi.ts`, delete line 31:

```ts
export type PastRecord = { total: number; approved: number; rejected: number; pending: number };
```

- [ ] **Step 7: Typecheck the whole web app**

Run: `cd web && npx tsc -b`
Expected: PASS (zero errors).

- [ ] **Step 8: Run web tests**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/pm/Projects.tsx web/src/pm/pmApi.ts
git commit -m "feat: open Staff members page from project detail; remove inline picker"
```

---

## SLICE 2 — Admin Company-fit (end to end)

### Task 7: `reputation` pure helpers (API)

**Files:**
- Create: `auth-api/src/services/reputation.js`
- Test: `auth-api/test/reputation.test.js`

**Interfaces:**
- Produces:
  - `directionCounts(history) -> { under, over, same }`
  - `completionStats(tasks) -> { done, assigned, rate }` (rate 0..1)
  - `onTimeStats(tasks) -> { measured, onTime, rate, avgDelayDays }` (rate/avgDelayDays null when `measured === 0`)
  - where `tasks` items are `{ status, dueDate, completedAt }` and `history` items are `{ fromHours, toHours }`.

- [ ] **Step 1: Write the failing test**

Create `auth-api/test/reputation.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionCounts, completionStats, onTimeStats } from '../src/services/reputation.js';

test('directionCounts splits under/over/same by from->to hours', () => {
  const h = [
    { fromHours: 4, toHours: 8 },  // under-scoped
    { fromHours: 10, toHours: 6 }, // over-scoped
    { fromHours: 5, toHours: 5 },  // same
  ];
  assert.deepEqual(directionCounts(h), { under: 1, over: 1, same: 1 });
  assert.deepEqual(directionCounts([]), { under: 0, over: 0, same: 0 });
});

test('completionStats counts done over assigned', () => {
  const tasks = [{ status: 'done' }, { status: 'in_progress' }, { status: 'done' }, { status: 'todo' }];
  assert.deepEqual(completionStats(tasks), { done: 2, assigned: 4, rate: 0.5 });
  assert.deepEqual(completionStats([]), { done: 0, assigned: 0, rate: 0 });
});

test('onTimeStats only measures done tasks with completedAt and dueDate', () => {
  const day = (n) => new Date(2026, 0, n).toISOString();
  const tasks = [
    { status: 'done', dueDate: day(10), completedAt: day(9) },   // 1 day early -> on time
    { status: 'done', dueDate: day(10), completedAt: day(13) },  // 3 days late
    { status: 'done', dueDate: day(10), completedAt: null },     // unmeasured
    { status: 'in_progress', dueDate: day(10), completedAt: null },
  ];
  const s = onTimeStats(tasks);
  assert.equal(s.measured, 2);
  assert.equal(s.onTime, 1);
  assert.equal(s.rate, 0.5);
  assert.equal(s.avgDelayDays, 1.5); // (0 + 3) / 2
});

test('onTimeStats with nothing measured returns null rate/avgDelay', () => {
  assert.deepEqual(onTimeStats([]), { measured: 0, onTime: 0, rate: null, avgDelayDays: null });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd auth-api && node --test test/reputation.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `auth-api/src/services/reputation.js`:

```js
// Company-fit (reputation) rollups: persistent, person-level signals derived
// from a user's re-estimation history and their task outcomes. Pure transforms
// over plain arrays — the route assembles inputs and serializes the result.

const MS_PER_DAY = 86400000;

// Did re-estimations push the original estimate up (under-scoped) or down
// (over-scoped)?
export function directionCounts(history) {
  let under = 0, over = 0, same = 0;
  for (const h of history || []) {
    if (h.toHours > h.fromHours) under += 1;
    else if (h.toHours < h.fromHours) over += 1;
    else same += 1;
  }
  return { under, over, same };
}

// Share of a person's assignments that reached "done".
export function completionStats(tasks) {
  const list = tasks || [];
  const assigned = list.length;
  const done = list.filter((t) => t.status === 'done').length;
  return { done, assigned, rate: assigned ? done / assigned : 0 };
}

// On-time delivery, measured only over done tasks that have both a due date and
// a completion timestamp. avgDelayDays averages the lateness (0 for on-time)
// across measured tasks. Null when nothing is measurable yet.
export function onTimeStats(tasks) {
  const measured = (tasks || []).filter((t) => t.status === 'done' && t.completedAt && t.dueDate);
  let onTime = 0;
  let delaySum = 0;
  for (const t of measured) {
    const delayDays = (new Date(t.completedAt) - new Date(t.dueDate)) / MS_PER_DAY;
    if (delayDays <= 0) onTime += 1;
    else delaySum += delayDays;
  }
  const n = measured.length;
  return {
    measured: n,
    onTime,
    rate: n ? onTime / n : null,
    avgDelayDays: n ? Number((delaySum / n).toFixed(1)) : null,
  };
}
```

- [ ] **Step 4: Run the test to confirm pass**

Run: `cd auth-api && node --test test/reputation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/reputation.js auth-api/test/reputation.test.js
git commit -m "feat: reputation rollup helpers (direction, completion, on-time)"
```

---

### Task 8: `GET /users/reputation` endpoint (admin only)

**Files:**
- Modify: `auth-api/src/routes/users.js` (import models/helpers, add route)
- Test: `auth-api/test/routes.test.js` (admin-only + shape)

**Interfaces:**
- Produces: `GET /api/users/reputation` → `{ people: Array<{ _id, displayName, email, role, reestimations: {total,approved,rejected,pending}, direction: {under,over,same}, completion: {done,assigned,rate}, onTime: {measured,onTime,rate,avgDelayDays} }> }`. Admin only.

- [ ] **Step 1: Add imports**

In `auth-api/src/routes/users.js`, after the existing imports add:

```js
import { Task } from '../models/Task.js';
import { directionCounts, completionStats, onTimeStats } from '../services/reputation.js';
```

- [ ] **Step 2: Add the route (before `/:id/reestimations`)**

In `auth-api/src/routes/users.js`, insert this route immediately after the `/reestimations/summary` route (before the `/:id/reestimations` route, so the bare path is matched first):

```js
  // Per-person reputation (company fit). Admin only.
  router.get('/reputation', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const users = await User.find({ active: { $ne: false } })
      .select('displayName email role reestimations').sort('displayName');
    const tasks = await Task.find({}).select('status dueDate completedAt assignees');

    const byUser = new Map();
    for (const t of tasks) {
      for (const a of t.assignees || []) {
        const uid = String(a.user);
        const arr = byUser.get(uid) || [];
        arr.push({ status: t.status, dueDate: t.dueDate, completedAt: t.completedAt });
        byUser.set(uid, arr);
      }
    }

    const people = users.map((u) => {
      const ut = byUser.get(String(u._id)) || [];
      return {
        _id: String(u._id), displayName: u.displayName, email: u.email, role: u.role,
        reestimations: summarize(u.reestimations),
        direction: directionCounts(u.reestimations),
        completion: completionStats(ut),
        onTime: onTimeStats(ut),
      };
    });
    res.json({ people });
  }));
```

- [ ] **Step 3: Add the route test**

In `auth-api/test/routes.test.js`, add a test that:
- a non-admin (employee/PM) token GET `/api/users/reputation` returns 403 (mirror the role-guard assertions already used in that file), and
- an admin token returns 200 with `body.people` an array whose first element has `reestimations`, `direction`, `completion`, and `onTime` objects.

- [ ] **Step 4: Run the API tests**

Run: `cd auth-api && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/users.js auth-api/test/routes.test.js
git commit -m "feat: admin-only GET /users/reputation endpoint"
```

---

### Task 9: `companyFit` pure module (web)

**Files:**
- Create: `web/src/pm/companyFit.ts`
- Test: `web/src/pm/companyFit.test.ts`

**Interfaces:**
- Consumes: reputation item shape (defined here as `Reputation`).
- Produces:
  - `type ReliabilityVerdict = 'reliable' | 'mixed' | 'unreliable'`
  - `companyFit(r: Reputation): ReliabilityVerdict`
  - `RELIABILITY_LABEL: Record<ReliabilityVerdict, string>`
  - `type Reputation` (the per-person object from `/users/reputation`)

- [ ] **Step 1: Write the failing test**

Create `web/src/pm/companyFit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyFit, RELIABILITY_LABEL, type Reputation } from './companyFit.ts';

function rep(over: Partial<Reputation> = {}): Reputation {
  return {
    _id: 'u', displayName: 'U', email: 'u@x.io', role: 'employee',
    reestimations: { total: 0, approved: 0, rejected: 0, pending: 0 },
    direction: { under: 0, over: 0, same: 0 },
    completion: { done: 0, assigned: 0, rate: 0 },
    onTime: { measured: 0, onTime: 0, rate: null, avgDelayDays: null },
    ...over,
  };
}

test('no signal is neutral reliable', () => {
  assert.equal(companyFit(rep()), 'reliable');
});

test('clean record is reliable', () => {
  assert.equal(companyFit(rep({
    reestimations: { total: 1, approved: 1, rejected: 0, pending: 0 },
    completion: { done: 8, assigned: 10, rate: 0.8 },
    onTime: { measured: 6, onTime: 5, rate: 0.83, avgDelayDays: 0.2 },
  })), 'reliable');
});

test('one strike is mixed', () => {
  assert.equal(companyFit(rep({
    reestimations: { total: 4, approved: 2, rejected: 2, pending: 0 }, // frequent re-estimator
    completion: { done: 8, assigned: 10, rate: 0.8 },
    onTime: { measured: 6, onTime: 5, rate: 0.83, avgDelayDays: 0.2 },
  })), 'mixed');
});

test('two or more strikes is unreliable', () => {
  assert.equal(companyFit(rep({
    reestimations: { total: 5, approved: 1, rejected: 4, pending: 0 }, // strike
    completion: { done: 1, assigned: 5, rate: 0.2 },                    // strike
    onTime: { measured: 4, onTime: 1, rate: 0.25, avgDelayDays: 3 },    // strike
  })), 'unreliable');
});

test('labels exist for every verdict', () => {
  assert.equal(RELIABILITY_LABEL.reliable, 'Reliable');
  assert.equal(RELIABILITY_LABEL.mixed, 'Mixed');
  assert.equal(RELIABILITY_LABEL.unreliable, 'Unreliable');
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd web && npx node --test src/pm/companyFit.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

Create `web/src/pm/companyFit.ts`:

```ts
// Company fit: persistent, person-level reliability. Pure verdict over the
// reputation rollup the API returns. No React, no fetch. People with no history
// stay neutral (reliable) rather than being penalized for absence of data.

export type Reputation = {
  _id: string; displayName: string; email: string; role: string;
  reestimations: { total: number; approved: number; rejected: number; pending: number };
  direction: { under: number; over: number; same: number };
  completion: { done: number; assigned: number; rate: number };
  onTime: { measured: number; onTime: number; rate: number | null; avgDelayDays: number | null };
};

export type ReliabilityVerdict = 'reliable' | 'mixed' | 'unreliable';

const REEST_STRIKE = 3;        // total re-estimations at/above which it's a strike
const COMPLETION_MIN_TASKS = 3; // need this many assignments before completion counts
const COMPLETION_FLOOR = 0.5;   // completion rate below this is a strike
const ONTIME_FLOOR = 0.5;       // on-time rate below this is a strike

export function companyFit(r: Reputation): ReliabilityVerdict {
  let strikes = 0;
  if (r.reestimations.total >= REEST_STRIKE) strikes += 1;
  if (r.completion.assigned >= COMPLETION_MIN_TASKS && r.completion.rate < COMPLETION_FLOOR) strikes += 1;
  if (r.onTime.rate != null && r.onTime.rate < ONTIME_FLOOR) strikes += 1;
  if (strikes >= 2) return 'unreliable';
  if (strikes === 1) return 'mixed';
  return 'reliable';
}

export const RELIABILITY_LABEL: Record<ReliabilityVerdict, string> = {
  reliable: 'Reliable',
  mixed: 'Mixed',
  unreliable: 'Unreliable',
};
```

- [ ] **Step 4: Run the test to confirm pass**

Run: `cd web && npx node --test src/pm/companyFit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/companyFit.ts web/src/pm/companyFit.test.ts
git commit -m "feat: companyFit reliability verdict module"
```

---

### Task 10: `listReputation` API client (web)

**Files:**
- Modify: `web/src/pm/pmApi.ts` (add fetch function + import type)

**Interfaces:**
- Consumes: `Reputation` (Task 9), existing `authed` helper.
- Produces: `listReputation(): Promise<{ people: Reputation[] }>`.

- [ ] **Step 1: Add the client function**

In `web/src/pm/pmApi.ts`, add near the other endpoint helpers (e.g. after `listCandidates`, line ~153):

```ts
import type { Reputation } from './companyFit';

export const listReputation = () =>
  authed('/users/reputation') as Promise<{ people: Reputation[] }>;
```

(If `import type` at the bottom is awkward, place the import with the other top-of-file imports; either is valid TS.)

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/pmApi.ts
git commit -m "feat: listReputation API client"
```

---

### Task 11: `CompanyFit` admin view (web)

**Files:**
- Create: `web/src/pm/CompanyFit.tsx`
- Modify: `web/src/styles.css` (append reputation styles)

**Interfaces:**
- Consumes: `listReputation` (Task 10), `companyFit`/`RELIABILITY_LABEL`/`Reputation` (Task 9), `personName`/`initials`.
- Produces: `CompanyFit()` default-styled page component.

- [ ] **Step 1: Create the component**

Create `web/src/pm/CompanyFit.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { listReputation } from './pmApi';
import { companyFit, RELIABILITY_LABEL, type Reputation } from './companyFit';
import { initials, personName } from './personName';

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

function Row({ r }: { r: Reputation }) {
  const verdict = companyFit(r);
  return (
    <tr>
      <td className="ts-task">
        <span className="person-pill">
          <span className="person-avatar">{initials(r)}</span>
          {personName(r)}
        </span>
      </td>
      <td className="col-left"><span className={`fit-badge fit-${verdict === 'reliable' ? 'good' : verdict === 'mixed' ? 'ok' : 'poor'}`}>{RELIABILITY_LABEL[verdict]}</span></td>
      <td className="col-left ts-sub">{r.reestimations.total} (↑{r.direction.under} ↓{r.direction.over})</td>
      <td className="col-left ts-sub">{r.completion.done}/{r.completion.assigned} · {pct(r.completion.assigned ? r.completion.rate : null)}</td>
      <td className="col-left ts-sub">{pct(r.onTime.rate)}{r.onTime.avgDelayDays != null ? ` · ${r.onTime.avgDelayDays}d late` : ''}</td>
    </tr>
  );
}

export function CompanyFit() {
  const [people, setPeople] = useState<Reputation[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listReputation().then((d) => setPeople(d.people)).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Company fit</h1>
          <p className="ts-sub">Per-person reliability across all projects</p>
        </div>
      </header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        {!people && <span className="ts-sub">Loading…</span>}
        {people && (
          <table className="ts-table">
            <thead><tr>
              <th className="ts-task">Person</th>
              <th className="col-left">Reliability</th>
              <th className="col-left">Re-estimations</th>
              <th className="col-left">Completion</th>
              <th className="col-left">On-time</th>
            </tr></thead>
            <tbody>{people.map((r) => <Row key={r._id} r={r} />)}</tbody>
          </table>
        )}
      </div>
      <span className="field-hint">On-time and delay only count tasks completed after this feature shipped.</span>
    </div>
  );
}
```

- [ ] **Step 2: Append styles (reuses `.fit-badge` from Task 5)**

No new CSS required — `.fit-badge.fit-good/ok/poor` from Task 5 already styles the reliability badge. Skip if Task 5's styles are present; otherwise ensure they were added.

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/CompanyFit.tsx
git commit -m "feat: admin Company fit reputation view"
```

---

### Task 12: add the "Company fit" admin nav tab

**Files:**
- Modify: `web/src/pm/nav.ts` (NavKey + admin items)
- Modify: `web/src/AppShell.tsx` (import, viewFor, NAV_ICONS)

**Interfaces:**
- Consumes: `CompanyFit` (Task 11).

- [ ] **Step 1: Extend NavKey and the admin nav**

In `web/src/pm/nav.ts`, add `'company-fit'` to the `NavKey` union (line 2):

```ts
export type NavKey = 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet';
```

In `navForRole`, add the item to the admin list (after the `skills` entry):

```ts
      { key: 'skills', label: 'Skills' },
      { key: 'company-fit', label: 'Company fit' },
```

- [ ] **Step 2: Wire the view**

In `web/src/AppShell.tsx`, add the import (after the `AdminSkills` import, line 6):

```tsx
import { CompanyFit } from './pm/CompanyFit';
```

Add a case to `viewFor` (after the `skills` case, line 18):

```tsx
    case 'company-fit': return <CompanyFit />;
```

- [ ] **Step 3: Add the nav icon**

In `web/src/AppShell.tsx`, add an entry to `NAV_ICONS` (after the `skills` entry, line 30):

```tsx
  'company-fit': <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3M9 11l3 3L22 4" />,
```

(A check-in-circle glyph; any of the existing simple paths is acceptable if this renders oddly.)

- [ ] **Step 4: Typecheck — the NavKey switch must stay exhaustive**

Run: `cd web && npx tsc -b`
Expected: PASS (the `viewFor` switch over `NavKey` compiles with the new case).

- [ ] **Step 5: Build the web app**

Run: `cd web && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/pm/nav.ts web/src/AppShell.tsx
git commit -m "feat: add admin Company fit nav tab"
```

---

### Task 13: full verification pass

**Files:** none (verification only)

- [ ] **Step 1: API tests**

Run: `cd auth-api && npm test`
Expected: PASS (all suites).

- [ ] **Step 2: Web tests**

Run: `cd web && npm test`
Expected: PASS (all suites).

- [ ] **Step 3: Web typecheck + build**

Run: `cd web && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke (PM axis)**

Start the app (`docker-compose up` or the project's usual run path). As a PM/admin: open a project → click **Staff members** → confirm the full-screen page lists non-members with Good/OK/Poor badges, load bars, skill chips, open-task counts, and no re-estimation text. Add someone → confirm you return to the project with them added.

- [ ] **Step 5: Manual smoke (Admin axis)**

As an admin: open **Company fit** → confirm the table lists people with Reliability badges, re-estimation counts, completion, and on-time columns. Mark a task done and confirm on-time data begins to populate.

- [ ] **Step 6: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test: verification fixes for project/company fit"
```
