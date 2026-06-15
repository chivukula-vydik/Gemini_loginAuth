# Weekly Timesheet Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user weekly timesheet (task rows × Mon–Fri columns) to the existing authenticated web app, with live row/column/grand totals, smart time inputs, week switching, "Copy last week", and autosaved MongoDB persistence.

**Architecture:** A new auth-protected `/timesheets` Express API backed by a `Timesheet` Mongoose model (one doc per user per week, time stored as integer minutes). The React app gains a post-login `AppShell` (sidebar + content) hosting a `TimesheetPage` composed of small focused components (`WeekNav`, `TimesheetGrid`, `TaskRow`, `TimeCell`). All time math lives in a pure `time.ts` module that is unit-tested.

**Tech Stack:** Node 22 + Express + Mongoose (existing `auth-api`), React 19 + Vite + TypeScript (existing `web`), Node's built-in `node:test` runner for the pure-helper unit tests.

> **Testing policy:** No automated tests for UI/API code (project decision) — those are verified manually. The single exception is `web/src/timesheet/time.ts`, whose pure functions get `node:test` unit tests (Task 5). Backend runtime checks use syntax checks + the live local MongoDB where available.

---

## File Structure

```
auth-api/src/
├─ models/Timesheet.js            # Mongoose model, (userId, weekStart) unique
├─ routes/timesheets.js           # GET/PUT /timesheets/:weekStart (requireAuth)
└─ app.js                         # MODIFY: mount the timesheets router

web/src/
├─ AppShell.tsx                   # sidebar + content; rendered after login
├─ App.tsx                        # MODIFY: render AppShell when signed in
├─ styles.css                     # MODIFY: append shell + timesheet styles
└─ timesheet/
   ├─ time.ts                     # parseTimeInput, formatMinutes, week/date helpers
   ├─ time.test.ts                # node:test unit tests for time.ts
   ├─ timesheetApi.ts             # getWeek, saveWeek
   ├─ TimeCell.tsx                # smart input
   ├─ TaskRow.tsx                 # name + 5 cells + row total + delete
   ├─ TimesheetGrid.tsx           # headers + rows + daily totals + add task
   ├─ WeekNav.tsx                 # prev/next + label + grand total + save status
   └─ TimesheetPage.tsx           # week state, load, autosave, copy last week
```

---

## Task 1: Timesheet Mongoose model

**Files:**
- Create: `auth-api/src/models/Timesheet.js`

- [ ] **Step 1: Create `auth-api/src/models/Timesheet.js`**

```js
import mongoose from 'mongoose';

const entriesSchema = new mongoose.Schema(
  {
    mon: { type: Number, default: 0 },
    tue: { type: Number, default: 0 },
    wed: { type: Number, default: 0 },
    thu: { type: Number, default: 0 },
    fri: { type: Number, default: 0 },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    entries: { type: entriesSchema, default: () => ({}) },
  },
  { _id: false }
);

const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart: { type: String, required: true }, // 'YYYY-MM-DD', a Monday
  tasks: { type: [taskSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

timesheetSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const Timesheet = mongoose.model('Timesheet', timesheetSchema);
```

- [ ] **Step 2: Verify**

Run (from `auth-api/`): `node --check src/models/Timesheet.js && node -e "import('./src/models/Timesheet.js').then(m=>console.log(typeof m.Timesheet))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Timesheet.js
git -c commit.gpgsign=false commit -m "feat: timesheet mongoose model keyed by user and week

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Timesheet API routes

**Files:**
- Create: `auth-api/src/routes/timesheets.js`

- [ ] **Step 1: Create `auth-api/src/routes/timesheets.js`**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// 'YYYY-MM-DD' that is a real date AND a Monday (UTC).
function isValidMonday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1; // Monday
}

function cleanMinutes(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Coerce incoming tasks into the stored shape, dropping anything unexpected.
function sanitizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((t) => {
    const entries = {};
    for (const day of DAYS) entries[day] = cleanMinutes(t?.entries?.[day]);
    return { id: String(t?.id ?? ''), name: String(t?.name ?? ''), entries };
  });
}

export function createTimesheetRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const doc = await Timesheet.findOne({ userId: req.user.sub, weekStart });
    res.json({ weekStart, tasks: doc ? doc.tasks : [] });
  }));

  router.put('/:weekStart', asyncHandler(async (req, res) => {
    const { weekStart } = req.params;
    if (!isValidMonday(weekStart)) return res.status(400).json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
    const tasks = sanitizeTasks(req.body?.tasks);
    const updatedAt = new Date();
    await Timesheet.updateOne(
      { userId: req.user.sub, weekStart },
      { $set: { tasks, updatedAt }, $setOnInsert: { userId: req.user.sub, weekStart } },
      { upsert: true }
    );
    res.json({ ok: true, updatedAt });
  }));

  return router;
}
```

- [ ] **Step 2: Verify**

Run (from `auth-api/`): `node --check src/routes/timesheets.js && echo SYNTAX_OK`
Expected: `SYNTAX_OK`. (Full HTTP behavior verified in Task 3 after mounting.)

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/timesheets.js
git -c commit.gpgsign=false commit -m "feat: auth-protected timesheet GET/PUT routes with weekStart validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Mount the timesheets router

**Files:**
- Modify: `auth-api/src/app.js`

- [ ] **Step 1: Add the import** near the other route imports at the top of `auth-api/src/app.js` (after the `mountProviders` import line):

```js
import { createTimesheetRouter } from './routes/timesheets.js';
```

- [ ] **Step 2: Mount the router** — in `createApp`, immediately AFTER the `app.use('/auth', authRouter);` line and BEFORE the error-handling middleware, add:

```js
  app.use('/timesheets', createTimesheetRouter());
```

- [ ] **Step 3: Verify (no DB needed for boot wiring)**

Run (from `auth-api/`): `node --check src/app.js && echo SYNTAX_OK`
Then, if a local MongoDB is reachable at `mongodb://localhost:27017`, do a live round-trip:
```bash
# from repo root, server must load env + config
node --env-file=.env auth-api/src/server.js &
SRV=$!; sleep 1
# register a throwaway user to get an access token
TOK=$(curl -s -X POST localhost:4000/auth/local/register -H 'Content-Type: application/json' -d '{"email":"ts@example.com","password":"secret123"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).accessToken)}catch{console.log('')}})")
# if already registered, log in instead
if [ -z "$TOK" ]; then TOK=$(curl -s -X POST localhost:4000/auth/local/login -H 'Content-Type: application/json' -d '{"email":"ts@example.com","password":"secret123"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).accessToken))"); fi
echo "GET empty week:"; curl -s localhost:4000/timesheets/2026-06-15 -H "Authorization: Bearer $TOK"
echo ""; echo "PUT a task:"; curl -s -X PUT localhost:4000/timesheets/2026-06-15 -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"tasks":[{"id":"a","name":"Design","entries":{"mon":150,"tue":0,"wed":0,"thu":0,"fri":0}}]}'
echo ""; echo "GET back:"; curl -s localhost:4000/timesheets/2026-06-15 -H "Authorization: Bearer $TOK"
echo ""; echo "bad weekStart (expect 400):"; curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/timesheets/2026-06-16 -H "Authorization: Bearer $TOK"
echo "no auth (expect 401):"; curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/timesheets/2026-06-15
kill $SRV
```
Expected: `SYNTAX_OK`; GET empty → `{"weekStart":"2026-06-15","tasks":[]}`; PUT → `{"ok":true,...}`; GET back shows the Design task with `mon:150`; bad weekStart → `400`; no auth → `401`. If no local MongoDB, run only the `node --check` and note DB checks are deferred.

> Note: `2026-06-15` is a Monday. `2026-06-16` is a Tuesday (used for the 400 check).

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/app.js
git -c commit.gpgsign=false commit -m "feat: mount /timesheets router in the app

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Time + week helpers (`time.ts`)

**Files:**
- Create: `web/src/timesheet/time.ts`

- [ ] **Step 1: Create `web/src/timesheet/time.ts`**

```ts
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DAY_LABELS: Record<Day, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
};

// Parse flexible time text into whole minutes. Unparseable/empty -> 0.
// Accepts: "2h 30m", "2h", "30m", "90m", "2:30", "1.5h", "1.5", "2".
export function parseTimeInput(raw: string): number {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === '') return 0;

  // H:MM colon format
  const colon = s.match(/^(\d+):([0-5]?\d)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  // unit-based: any combination of "<num>h" and "<num>m"
  if (/[hm]/.test(s)) {
    let minutes = 0;
    let matched = false;
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
    if (h) { minutes += Math.round(Number(h[1]) * 60); matched = true; }
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/);
    if (m) { minutes += Math.round(Number(m[1])); matched = true; }
    return matched ? minutes : 0;
  }

  // bare number -> hours (decimal allowed)
  const num = Number(s);
  if (Number.isFinite(num) && num >= 0) return Math.round(num * 60);
  return 0;
}

// Whole minutes -> "Hh MMm" with zero-padded minutes.
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// --- week helpers (all UTC to avoid TZ drift) ---

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Monday (YYYY-MM-DD) of the week containing `date` (defaults to today).
export function mondayOf(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow === 0 ? -6 : 1 - dow); // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return toISODate(d);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export const prevWeek = (weekStart: string) => addDays(weekStart, -7);
export const nextWeek = (weekStart: string) => addDays(weekStart, 7);

// Per-column label like "Mon 16" for a given weekStart Monday.
export function columnDates(weekStart: string): Record<Day, string> {
  const out = {} as Record<Day, string>;
  DAYS.forEach((day, i) => {
    const d = new Date(`${addDays(weekStart, i)}T00:00:00Z`);
    out[day] = `${DAY_LABELS[day]} ${d.getUTCDate()}`;
  });
  return out;
}

// Human label for the whole week, e.g. "Jun 15 – 19, 2026".
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${addDays(weekStart, 4)}T00:00:00Z`);
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const left = `${mon[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const right = sameMonth
    ? `${end.getUTCDate()}`
    : `${mon[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${left} – ${right}, ${end.getUTCFullYear()}`;
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc --noEmit src/timesheet/time.ts 2>&1 | head -5 || true` then `node --check` is not applicable to TS; rely on the unit tests in Task 5. For now confirm the file has no obvious type errors by running the project type-check: `npx tsc -b` (expected: no errors, though nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/time.ts
git -c commit.gpgsign=false commit -m "feat: pure time parsing/formatting and week-date helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Unit tests for `time.ts`

**Files:**
- Create: `web/src/timesheet/time.test.ts`
- Modify: `web/package.json` (add a `test` script)

- [ ] **Step 1: Add a test script** to `web/package.json` `scripts` (add this line alongside the existing scripts):

```json
    "test": "node --test --experimental-strip-types src/timesheet/"
```

(Node 22+ runs TypeScript test files via `--experimental-strip-types`; the local Node is 24, which supports it.)

- [ ] **Step 2: Create `web/src/timesheet/time.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeInput,
  formatMinutes,
  mondayOf,
  addDays,
  columnDates,
} from './time.ts';

test('parseTimeInput: hours and minutes', () => {
  assert.equal(parseTimeInput('2h 30m'), 150);
  assert.equal(parseTimeInput('2h'), 120);
  assert.equal(parseTimeInput('30m'), 30);
  assert.equal(parseTimeInput('90m'), 90);
});

test('parseTimeInput: colon format', () => {
  assert.equal(parseTimeInput('2:30'), 150);
  assert.equal(parseTimeInput('0:45'), 45);
});

test('parseTimeInput: decimals and bare numbers', () => {
  assert.equal(parseTimeInput('1.5h'), 90);
  assert.equal(parseTimeInput('1.5'), 90);
  assert.equal(parseTimeInput('2'), 120);
});

test('parseTimeInput: empty and junk -> 0', () => {
  assert.equal(parseTimeInput(''), 0);
  assert.equal(parseTimeInput('   '), 0);
  assert.equal(parseTimeInput('abc'), 0);
});

test('formatMinutes: normalizes and pads', () => {
  assert.equal(formatMinutes(150), '2h 30m');
  assert.equal(formatMinutes(90), '1h 30m');
  assert.equal(formatMinutes(0), '0h 00m');
  assert.equal(formatMinutes(60), '1h 00m');
});

test('mondayOf and addDays', () => {
  // 2026-06-17 is a Wednesday; its Monday is 2026-06-15
  assert.equal(mondayOf(new Date('2026-06-17T12:00:00Z')), '2026-06-15');
  assert.equal(addDays('2026-06-15', 7), '2026-06-22');
  assert.equal(addDays('2026-06-15', -7), '2026-06-08');
});

test('columnDates labels', () => {
  const cols = columnDates('2026-06-15');
  assert.equal(cols.mon, 'Mon 15');
  assert.equal(cols.fri, 'Fri 19');
});
```

- [ ] **Step 3: Run the tests**

Run (from `web/`): `npm test`
Expected: all tests pass (7 test blocks, 0 failures).

- [ ] **Step 4: Commit**

```bash
git add web/src/timesheet/time.test.ts web/package.json
git -c commit.gpgsign=false commit -m "test: unit tests for time parsing, formatting, and week helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Timesheet API client

**Files:**
- Create: `web/src/timesheet/timesheetApi.ts`

- [ ] **Step 1: Create `web/src/timesheet/timesheetApi.ts`**

```ts
import { getAccessToken } from '../api';
import type { Day } from './time';

const API = 'http://localhost:4000';

export type Entries = Record<Day, number>;
export type Task = { id: string; name: string; entries: Entries };

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getWeek(weekStart: string): Promise<Task[]> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data = await r.json();
  return data.tasks as Task[];
}

export async function saveWeek(weekStart: string, tasks: Task[]): Promise<void> {
  const r = await fetch(`${API}/timesheets/${weekStart}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ tasks }),
  });
  if (!r.ok) throw new Error(`save failed (${r.status})`);
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/timesheetApi.ts
git -c commit.gpgsign=false commit -m "feat: timesheet api client (getWeek, saveWeek)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `TimeCell` smart input

**Files:**
- Create: `web/src/timesheet/TimeCell.tsx`

- [ ] **Step 1: Create `web/src/timesheet/TimeCell.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { parseTimeInput, formatMinutes } from './time';

type Props = {
  minutes: number;
  onChange: (minutes: number) => void;
};

// Shows normalized "Hh MMm" when not focused; lets the user type freely while
// focused; parses + normalizes on blur. Empty (0) renders as a blank cell.
export function TimeCell({ minutes, onChange }: Props) {
  const display = minutes > 0 ? formatMinutes(minutes) : '';
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);

  // Keep local text in sync when not actively editing (e.g. week switch, copy).
  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);

  function commit() {
    const parsed = parseTimeInput(text);
    setEditing(false);
    setText(parsed > 0 ? formatMinutes(parsed) : '');
    if (parsed !== minutes) onChange(parsed);
  }

  return (
    <input
      className="ts-cell"
      inputMode="text"
      placeholder="—"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TimeCell.tsx
git -c commit.gpgsign=false commit -m "feat: TimeCell smart input parsing on blur

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `TaskRow`

**Files:**
- Create: `web/src/timesheet/TaskRow.tsx`

- [ ] **Step 1: Create `web/src/timesheet/TaskRow.tsx`**

```tsx
import { TimeCell } from './TimeCell';
import { DAYS, formatMinutes } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  task: Task;
  onRename: (name: string) => void;
  onCellChange: (day: keyof Entries, minutes: number) => void;
  onDelete: () => void;
};

export function TaskRow({ task, onRename, onCellChange, onDelete }: Props) {
  const rowTotal = DAYS.reduce((sum, d) => sum + (task.entries[d] || 0), 0);
  return (
    <tr>
      <td className="ts-task">
        <input
          className="ts-name"
          placeholder="Task name"
          value={task.name}
          onChange={(e) => onRename(e.target.value)}
        />
      </td>
      {DAYS.map((d) => (
        <td key={d}>
          <TimeCell minutes={task.entries[d] || 0} onChange={(m) => onCellChange(d, m)} />
        </td>
      ))}
      <td className="ts-rowtotal">{formatMinutes(rowTotal)}</td>
      <td>
        <button className="ts-del" type="button" aria-label="Delete task" onClick={onDelete}>×</button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TaskRow.tsx
git -c commit.gpgsign=false commit -m "feat: TaskRow with name, cells, live row total, delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `TimesheetGrid`

**Files:**
- Create: `web/src/timesheet/TimesheetGrid.tsx`

- [ ] **Step 1: Create `web/src/timesheet/TimesheetGrid.tsx`**

```tsx
import { TaskRow } from './TaskRow';
import { DAYS, formatMinutes, columnDates } from './time';
import type { Task, Entries } from './timesheetApi';

type Props = {
  weekStart: string;
  tasks: Task[];
  onRename: (taskId: string, name: string) => void;
  onCellChange: (taskId: string, day: keyof Entries, minutes: number) => void;
  onDelete: (taskId: string) => void;
  onAddTask: () => void;
};

export function TimesheetGrid({
  weekStart, tasks, onRename, onCellChange, onDelete, onAddTask,
}: Props) {
  const cols = columnDates(weekStart);
  const dayTotal = (day: keyof Entries) =>
    tasks.reduce((sum, t) => sum + (t.entries[day] || 0), 0);

  return (
    <table className="ts-table">
      <thead>
        <tr>
          <th className="ts-task">Task</th>
          {DAYS.map((d) => <th key={d}>{cols[d]}</th>)}
          <th className="ts-rowtotal">Total</th>
          <th aria-hidden="true"></th>
        </tr>
      </thead>
      <tbody>
        {tasks.length === 0 && (
          <tr><td colSpan={8} className="ts-empty">No tasks yet — add one to start tracking.</td></tr>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            onRename={(name) => onRename(t.id, name)}
            onCellChange={(day, m) => onCellChange(t.id, day, m)}
            onDelete={() => onDelete(t.id)}
          />
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="ts-task">Daily total</td>
          {DAYS.map((d) => <td key={d} className="ts-coltotal">{formatMinutes(dayTotal(d))}</td>)}
          <td></td><td></td>
        </tr>
      </tfoot>
      <caption className="ts-add-caption">
        <button className="btn btn-provider ts-add" type="button" onClick={onAddTask}>+ Add task</button>
      </caption>
    </table>
  );
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TimesheetGrid.tsx
git -c commit.gpgsign=false commit -m "feat: TimesheetGrid with headers, rows, daily totals, add task

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `WeekNav`

**Files:**
- Create: `web/src/timesheet/WeekNav.tsx`

- [ ] **Step 1: Create `web/src/timesheet/WeekNav.tsx`**

```tsx
import { formatMinutes, weekRangeLabel } from './time';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  weekStart: string;
  grandTotal: number;       // minutes
  status: SaveStatus;
  onPrev: () => void;
  onNext: () => void;
  onCopyLastWeek: () => void;
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed — retry',
};

export function WeekNav({ weekStart, grandTotal, status, onPrev, onNext, onCopyLastWeek }: Props) {
  return (
    <div className="ts-nav">
      <div className="ts-nav-left">
        <button className="ts-arrow" type="button" aria-label="Previous week" onClick={onPrev}>‹</button>
        <span className="ts-week-label">{weekRangeLabel(weekStart)}</span>
        <button className="ts-arrow" type="button" aria-label="Next week" onClick={onNext}>›</button>
        <button className="ts-copy" type="button" onClick={onCopyLastWeek}>Copy last week</button>
      </div>
      <div className="ts-nav-right">
        <span className={`ts-status ts-status-${status}`}>{STATUS_TEXT[status]}</span>
        <span className="ts-grand">This Week · {formatMinutes(grandTotal)}</span>
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
git -c commit.gpgsign=false commit -m "feat: WeekNav with prev/next, range label, grand total, save status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `TimesheetPage` (state, autosave, copy last week)

**Files:**
- Create: `web/src/timesheet/TimesheetPage.tsx`

- [ ] **Step 1: Create `web/src/timesheet/TimesheetPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { WeekNav, SaveStatus } from './WeekNav';
import { TimesheetGrid } from './TimesheetGrid';
import { getWeek, saveWeek, Task, Entries } from './timesheetApi';
import { DAYS, mondayOf, prevWeek, nextWeek } from './time';

function newTask(name = ''): Task {
  const entries = {} as Entries;
  DAYS.forEach((d) => { entries[d] = 0; });
  return { id: crypto.randomUUID(), name, entries };
}

export function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const load = useCallback(async (week: string) => {
    setLoadError('');
    try {
      const loaded = await getWeek(week);
      setTasks(loaded);
    } catch (e) {
      setLoadError((e as Error).message);
      setTasks([]);
    }
  }, []);

  // Load whenever the week changes; cancel any pending save first.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirty.current = false;
    setStatus('idle');
    load(weekStart);
  }, [weekStart, load]);

  // Debounced autosave after edits.
  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus('saving');
    const week = weekStart;
    const snapshot = tasks;
    saveTimer.current = setTimeout(async () => {
      try {
        await saveWeek(week, snapshot);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [tasks, weekStart]);

  // All mutations go through here so they mark dirty + trigger autosave.
  function update(next: Task[]) {
    dirty.current = true;
    setTasks(next);
  }

  const onRename = (id: string, name: string) =>
    update(tasks.map((t) => (t.id === id ? { ...t, name } : t)));

  const onCellChange = (id: string, day: keyof Entries, minutes: number) =>
    update(tasks.map((t) => (t.id === id ? { ...t, entries: { ...t.entries, [day]: minutes } } : t)));

  const onDelete = (id: string) => update(tasks.filter((t) => t.id !== id));

  const onAddTask = () => update([...tasks, newTask()]);

  async function onCopyLastWeek() {
    try {
      const prev = await getWeek(prevWeek(weekStart));
      if (prev.length === 0) { setLoadError('Nothing to copy from last week.'); return; }
      update(prev.map((t) => newTask(t.name)));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  const grandTotal = tasks.reduce(
    (sum, t) => sum + DAYS.reduce((s, d) => s + (t.entries[d] || 0), 0),
    0
  );

  return (
    <div className="ts-page">
      <WeekNav
        weekStart={weekStart}
        grandTotal={grandTotal}
        status={status}
        onPrev={() => setWeekStart((w) => prevWeek(w))}
        onNext={() => setWeekStart((w) => nextWeek(w))}
        onCopyLastWeek={onCopyLastWeek}
      />
      {loadError && <p className="ts-error">{loadError} <button className="link-btn" onClick={() => load(weekStart)}>Retry</button></p>}
      <TimesheetGrid
        weekStart={weekStart}
        tasks={tasks}
        onRename={onRename}
        onCellChange={onCellChange}
        onDelete={onDelete}
        onAddTask={onAddTask}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors. (Note: import is `useCallback` from 'react' — ensure the import line reads `import { useCallback, useEffect, useRef, useState } from 'react';`.)

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TimesheetPage.tsx
git -c commit.gpgsign=false commit -m "feat: TimesheetPage with week state, debounced autosave, copy last week

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `AppShell` + wire into `App.tsx`

**Files:**
- Create: `web/src/AppShell.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/AppShell.tsx`**

```tsx
import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';

export function AppShell() {
  const { user, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          <a className="shell-nav-item active" href="#">Timesheet</a>
        </nav>
        <div className="shell-user">
          <div className="shell-user-email">{user?.email}</div>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="shell-content">
        <TimesheetPage />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Modify `web/src/App.tsx`** — replace the `Home` function so a signed-in user gets the `AppShell` (full-screen) instead of the centered card. Replace the ENTIRE contents of `web/src/App.tsx` with:

```tsx
import { AuthProvider, useAuth } from './authContext';
import { AuthLayout } from './AuthLayout';
import { AppShell } from './AppShell';
import { LoginWidget } from './LoginWidget';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLayout><p className="center-loading">Loading…</p></AuthLayout>;
  if (user) return <AppShell />;
  return <AuthLayout><LoginWidget /></AuthLayout>;
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/forgot') return <AuthLayout><ForgotPassword /></AuthLayout>;
  if (path === '/reset') return <AuthLayout><ResetPassword /></AuthLayout>;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
```

> Note: this changes the signed-in view from the old centered "Welcome" card to the full `AppShell`. The Welcome card is intentionally replaced (the shell's sidebar now shows the user + sign-out). `AuthLayout` is still used for login/forgot/reset.

- [ ] **Step 3: Verify**

Run (from `web/`): `npx tsc -b`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/AppShell.tsx web/src/App.tsx
git -c commit.gpgsign=false commit -m "feat: post-login AppShell with sidebar hosting the timesheet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Styles

**Files:**
- Modify: `web/src/styles.css` (append)

- [ ] **Step 1: Append the following to the END of `web/src/styles.css`**

```css
/* ---- App shell ---- */
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px 1fr;
  background: var(--bg-to);
}
.shell-sidebar {
  background: #fff;
  border-right: 1px solid var(--border);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.shell-brand { display: flex; align-items: center; gap: 10px; }
.shell-nav { display: grid; gap: 4px; flex: 1; }
.shell-nav-item {
  padding: 9px 12px; border-radius: 9px; text-decoration: none;
  color: var(--text); font-size: 14px; font-weight: 500;
}
.shell-nav-item.active { background: var(--primary-soft); color: var(--primary); }
.shell-user { display: grid; gap: 8px; border-top: 1px solid var(--border); padding-top: 14px; }
.shell-user-email { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.shell-content { padding: 28px 32px; }

/* ---- Timesheet ---- */
.ts-page { max-width: 920px; }
.ts-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
.ts-nav-left { display: flex; align-items: center; gap: 10px; }
.ts-arrow {
  width: 30px; height: 30px; border: 1px solid var(--border); background: #fff;
  border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1;
}
.ts-arrow:hover { background: #f8fafc; }
.ts-week-label { font-weight: 600; font-size: 15px; min-width: 150px; text-align: center; }
.ts-copy {
  border: 1px solid var(--border); background: #fff; border-radius: 8px;
  padding: 6px 11px; font-size: 13px; cursor: pointer; color: var(--text);
}
.ts-copy:hover { background: #f8fafc; }
.ts-nav-right { display: flex; align-items: center; gap: 14px; }
.ts-status { font-size: 12px; color: var(--muted); min-width: 70px; text-align: right; }
.ts-status-error { color: var(--danger); }
.ts-status-saved { color: #16a34a; }
.ts-grand { font-weight: 700; font-size: 16px; }

.ts-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.ts-table caption.ts-add-caption { caption-side: bottom; text-align: left; padding: 12px; }
.ts-table th, .ts-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: center; font-size: 14px; }
.ts-table thead th { background: #f8fafc; color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.ts-table th.ts-task, .ts-table td.ts-task { text-align: left; min-width: 180px; }
.ts-name { width: 100%; border: 1px solid transparent; background: transparent; padding: 7px 8px; border-radius: 8px; font-size: 14px; }
.ts-name:hover { border-color: var(--border); }
.ts-name:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--ring); }
.ts-cell { width: 72px; text-align: center; border: 1px solid var(--border); border-radius: 8px; padding: 7px 4px; font-size: 13px; }
.ts-cell:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--ring); }
.ts-cell::placeholder { color: #cbd5e1; }
.ts-rowtotal, .ts-coltotal { font-weight: 600; }
.ts-table tfoot td { background: #f8fafc; font-weight: 600; }
.ts-del { border: none; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 0 6px; }
.ts-del:hover { color: var(--danger); }
.ts-empty { color: var(--muted); padding: 20px; }
.ts-error { color: var(--danger); font-size: 13px; }
```

- [ ] **Step 2: Verify (full app build + manual)**

Run (from `web/`): `npm run build`
Expected: build succeeds, no type errors. Then manual check (servers running per the run instructions): open `http://localhost:5173`, sign in, and confirm: sidebar with Timesheet; add a task; type `90m` in a cell → becomes `1h 30m` on blur; row/column/grand totals update; prev/next changes the week label and dates; "Copy last week" pulls prior task names; reload keeps entries (autosave). The header shows `This Week · …`.

- [ ] **Step 3: Commit**

```bash
git add web/src/styles.css
git -c commit.gpgsign=false commit -m "feat: styles for app shell and timesheet grid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** model (T1), API GET/PUT + validation (T2), mount (T3), parse/format/week helpers (T4), helper tests (T5), api client (T6), smart cell w/ normalize-on-blur (T7), row + row total + delete (T8), grid + column/daily totals + add task (T9), week nav + grand total + save status (T10), page state + debounced autosave + week switch + copy-last-week + load-on-reload (T11), app shell + sidebar (T12), styles + manual E2E (T13). Empty=0 handled in `formatMinutes`/reducers; minutes-as-int throughout.
- **Type consistency:** `Task`/`Entries`/`Day` defined once (`timesheetApi.ts` re-uses `Day` from `time.ts`); `getWeek`/`saveWeek` signatures match across T6/T11; `SaveStatus` defined in T10 and imported in T11; `DAYS` from `time.ts` used consistently; cell change uses `keyof Entries` everywhere.
- **Placeholder scan:** none — every step has full code.
- **Caveat:** `time.test.ts` imports from `./time.ts` with the explicit `.ts` extension because Node's `--experimental-strip-types` test runner resolves the on-disk file; the app code imports from `./time` (no extension) for Vite/tsc. Both are intentional and correct for their respective runners.
