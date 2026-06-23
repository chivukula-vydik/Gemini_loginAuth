# Timesheet Attendance Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each weekday's attendance (status + effective hours) as a read-only row above the task rows in the weekly timesheet grid.

**Architecture:** A new backend `/attendance/range` endpoint (refactored out of the existing `/month` handler) returns attendance docs for an arbitrary date range. The frontend resolves that into a per-weekday display map via a pure, independently-tested function (`resolveAttendanceRow`), which `TimesheetPage` computes and passes into `TimesheetGrid` as a new prop. The row is rendered but never counted in totals and never editable.

**Tech Stack:** Express + Mongoose (backend), React + TypeScript (frontend), `node:test` + `supertest` + `mongodb-memory-server` (backend tests), `node:test` (frontend pure-function tests).

## Global Constraints

- Timesheet grid is Mon–Fri only (`web/src/timesheet/time.ts` — `DAYS = ['mon','tue','wed','thu','fri']`); no weekend handling.
- Attendance row never contributes to `dayTotal()` / `tfoot` Daily total / `SummaryTiles` — those stay task-hours-only.
- If `leaveDays[day]` is already set (existing approved-leave overlay), the attendance cell for that day renders blank (`—`) — leave label on the column header already covers it.
- Blank (`—`) also applies when: the date is in the future, `activatedDate` is `null`, or the date is before `activatedDate`.
- All other past dates on/after activation with no doc render as `absent` / `0` minutes.

---

### Task 1: Backend — `GET /attendance/range` endpoint

**Files:**
- Modify: `auth-api/src/routes/attendance.js:18-38` (add shared helper after `holidayPlaceholder`), `auth-api/src/routes/attendance.js:184-207` (simplify `/month` to use it), add new route after `/month`.
- Test: `auth-api/test/priority2.test.js` (add new tests near the existing `/attendance/month` test, around line 152).

**Interfaces:**
- Produces: `GET /attendance/range?start=YYYY-MM-DD&end=YYYY-MM-DD` → `200` with `AttendanceDoc[]` (same shape as `/attendance/month`), `400` if `start`/`end` missing.

- [ ] **Step 1: Write the failing tests**

Add to `auth-api/test/priority2.test.js`, directly after the existing `'GET /attendance/month merges holidays as synthetic entries without persisting them'` test (after line 152):

```js
test('GET /attendance/range returns docs for an arbitrary date span, merging holiday placeholders', async () => {
  const admin = await User.create({ email: 'range-admin@x.com', displayName: 'A', role: 'admin' });
  const emp = await User.create({ email: 'range-emp@x.com', displayName: 'E', role: 'employee' });
  await request(app).post('/holidays')
    .set('Authorization', bearer(admin)).send({ date: '2026-09-03', name: 'Mid-week Holiday' });
  await Attendance.create({ userId: emp._id, date: '2026-09-01', status: 'present', effectiveMinutes: 480 });

  const res = await request(app)
    .get('/attendance/range?start=2026-09-01&end=2026-09-05')
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  const present = res.body.find((d) => d.date === '2026-09-01');
  assert.equal(present.status, 'present');
  const holiday = res.body.find((d) => d.date === '2026-09-03');
  assert.equal(holiday.status, 'holiday');
  assert.equal(holiday.note, 'Mid-week Holiday');
});

test('GET /attendance/range spanning two calendar months returns both months\' docs', async () => {
  const emp = await User.create({ email: 'range-span@x.com', displayName: 'E', role: 'employee' });
  await Attendance.create({ userId: emp._id, date: '2026-01-30', status: 'present', effectiveMinutes: 480 });
  await Attendance.create({ userId: emp._id, date: '2026-02-02', status: 'present', effectiveMinutes: 480 });

  const res = await request(app)
    .get('/attendance/range?start=2026-01-29&end=2026-02-02')
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((d) => d.date), ['2026-01-30', '2026-02-02']);
});

test('GET /attendance/range requires both start and end', async () => {
  const emp = await User.create({ email: 'range-missing@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/attendance/range?start=2026-09-01').set('Authorization', bearer(emp));
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/priority2.test.js`
Expected: FAIL — `cannot GET /attendance/range` style 404s (route doesn't exist yet).

- [ ] **Step 3: Extract the shared range-fetch helper and add the route**

In `auth-api/src/routes/attendance.js`, insert this function directly after `holidayPlaceholder` (after line 38, before `export function createAttendanceRouter`):

```js
// Shared by /month and /range: real docs for [startDate, endDate] (inclusive,
// "YYYY-MM-DD" string compare) merged with synthetic holiday placeholders for
// any date in range that has no real doc.
async function fetchRange(userId, startDate, endDate) {
  const docs = await Attendance.find({
    userId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 });

  const covered = new Set(docs.map((d) => d.date));
  const holidays = await Holiday.find({ date: { $gte: startDate, $lte: endDate } });
  const synthetic = holidays
    .filter((h) => !covered.has(h.date))
    .map((h) => holidayPlaceholder(userId, h));

  return [...docs.map((d) => d.toObject()), ...synthetic].sort((a, b) => a.date.localeCompare(b.date));
}
```

Replace the `/month` handler body (lines 185-207) with:

```js
  // GET /attendance/month?year=2026&month=6
  router.get('/month', asyncHandler(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = Number(year);
    const m = String(month).padStart(2, '0');
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;       // inclusive range, Mongo string compare handles it

    const merged = await fetchRange(req.user.sub, startDate, endDate);
    res.json(merged);
  }));

  // GET /attendance/range?start=2026-06-22&end=2026-06-26 — arbitrary date
  // span, e.g. a Mon-Fri timesheet week (which can cross a month boundary,
  // unlike /month).
  router.get('/range', asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });

    const merged = await fetchRange(req.user.sub, start, end);
    res.json(merged);
  }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd auth-api && node --test test/priority2.test.js`
Expected: PASS (including the pre-existing `/attendance/month` and `/attendance/stats` tests, unaffected by the refactor).

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/attendance.js auth-api/test/priority2.test.js
git commit -m "feat: add GET /attendance/range for arbitrary date-span attendance queries"
```

---

### Task 2: Frontend — pure attendance-row resolution logic

**Files:**
- Create: `web/src/timesheet/attendanceRow.ts`
- Test: `web/src/timesheet/attendanceRow.test.ts`

**Interfaces:**
- Consumes: `Day` from `./time` (`'mon'|'tue'|'wed'|'thu'|'fri'`); `AttendanceDoc`, `AttendanceStatus` from `../attendance/attendanceApi`.
- Produces:
  - `type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number } | null`
  - `resolveAttendanceRow(dayDates: Record<Day, string>, docs: AttendanceDoc[], leaveDays: Partial<Record<Day, string>>, activatedDate: string | null, today: string): Partial<Record<Day, AttendanceCell>>`
  - `attendanceLabel(status: AttendanceStatus): string`
  - `attendanceBadgeClass(status: AttendanceStatus): string`

- [ ] **Step 1: Write the failing tests**

Create `web/src/timesheet/attendanceRow.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAttendanceRow, attendanceLabel, attendanceBadgeClass } from './attendanceRow.ts';
import type { AttendanceDoc } from '../attendance/attendanceApi.ts';

const dayDates = { mon: '2026-06-22', tue: '2026-06-23', wed: '2026-06-24', thu: '2026-06-25', fri: '2026-06-26' };

function doc(date: string, status: AttendanceDoc['status'], effectiveMinutes = 0): AttendanceDoc {
  return {
    _id: date, userId: 'u1', date, checkIn: null, checkOut: null,
    totalMinutes: 0, breakMinutes: 0, effectiveMinutes, status, punchType: 'office',
    breaks: [], note: '',
    regularise: { status: 'none', reason: '', correctedCheckIn: null, correctedCheckOut: null, requestedAt: null, decidedBy: null, decidedAt: null },
  };
}

test('resolveAttendanceRow: a day with a doc shows its status and effective minutes', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, {}, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'present', effectiveMinutes: 480 });
});

test('resolveAttendanceRow: a past day with no doc, on/after activation, is absent', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.tue, { status: 'absent', effectiveMinutes: 0 });
});

test('resolveAttendanceRow: a future day with no doc is blank', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, '2026-01-01', '2026-06-23');
  assert.equal(row.thu, null); // thu = 06-25, today = 06-23
});

test('resolveAttendanceRow: before activation (or no activation yet) is blank, even in the past', () => {
  const row = resolveAttendanceRow(dayDates, [], {}, null, '2026-06-26');
  assert.equal(row.mon, null);

  const rowLateActivation = resolveAttendanceRow(dayDates, [], {}, '2026-06-24', '2026-06-26');
  assert.equal(rowLateActivation.mon, null);   // mon = 06-22, before activation 06-24
  assert.deepEqual(rowLateActivation.wed, { status: 'absent', effectiveMinutes: 0 }); // wed = 06-24, on activation day
});

test('resolveAttendanceRow: a day already marked as leave is blank regardless of any doc', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, { mon: 'Casual' }, '2026-01-01', '2026-06-26');
  assert.equal(row.mon, null);
});

test('attendanceLabel: maps every status to a display label', () => {
  assert.equal(attendanceLabel('present'), 'Present');
  assert.equal(attendanceLabel('wfh-partial'), 'WFH');
  assert.equal(attendanceLabel('holiday'), 'Holiday');
});

test('attendanceBadgeClass: maps every status to an att-tag class', () => {
  assert.equal(attendanceBadgeClass('present'), 'att-tag att-tag-present');
  assert.equal(attendanceBadgeClass('absent'), 'att-tag att-tag-absent');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && node --test src/timesheet/attendanceRow.test.ts`
Expected: FAIL with "Cannot find module './attendanceRow.ts'".

- [ ] **Step 3: Implement `web/src/timesheet/attendanceRow.ts`**

```ts
import type { Day } from './time';
import type { AttendanceDoc, AttendanceStatus } from '../attendance/attendanceApi';

export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number } | null;

const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Resolves what the timesheet's read-only attendance row should show for
// each weekday. Precedence: an already-known leave day wins (the column
// header already shows it) > a real attendance doc > blank for
// future/pre-activation days > absent for any other past day with no doc.
export function resolveAttendanceRow(
  dayDates: Record<Day, string>,
  docs: AttendanceDoc[],
  leaveDays: Partial<Record<Day, string>>,
  activatedDate: string | null,
  today: string,
): Partial<Record<Day, AttendanceCell>> {
  const byDate = new Map(docs.map((d) => [d.date, d]));
  const out: Partial<Record<Day, AttendanceCell>> = {};

  for (const day of DAYS) {
    const date = dayDates[day];
    if (leaveDays[day]) { out[day] = null; continue; }

    const doc = byDate.get(date);
    if (doc) { out[day] = { status: doc.status, effectiveMinutes: doc.effectiveMinutes }; continue; }

    if (date > today || !activatedDate || date < activatedDate) { out[day] = null; continue; }

    out[day] = { status: 'absent', effectiveMinutes: 0 };
  }

  return out;
}

const LABELS: Record<AttendanceStatus, string> = {
  present: 'Present', partial: 'Partial', absent: 'Absent',
  wfh: 'WFH', 'wfh-partial': 'WFH', leave: 'Leave', holiday: 'Holiday', weekend: 'Weekend',
};

export function attendanceLabel(status: AttendanceStatus): string {
  return LABELS[status];
}

const BADGE_CLASS: Record<AttendanceStatus, string> = {
  present: 'att-tag att-tag-present', partial: 'att-tag att-tag-partial', absent: 'att-tag att-tag-absent',
  wfh: 'att-tag att-tag-wfh', 'wfh-partial': 'att-tag att-tag-wfh',
  leave: 'att-tag att-tag-leave', holiday: 'att-tag att-tag-holiday', weekend: 'att-tag',
};

export function attendanceBadgeClass(status: AttendanceStatus): string {
  return BADGE_CLASS[status];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && node --test src/timesheet/attendanceRow.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/timesheet/attendanceRow.ts web/src/timesheet/attendanceRow.test.ts
git commit -m "feat: add pure attendance-row resolution logic for the timesheet grid"
```

---

### Task 3: Frontend — wire attendance data into `TimesheetPage`

**Files:**
- Modify: `web/src/attendance/attendanceApi.ts` (add `getRange`)
- Modify: `web/src/timesheet/TimesheetPage.tsx`

**Interfaces:**
- Consumes: `resolveAttendanceRow`, `AttendanceCell` from `./attendanceRow` (Task 2); `getRange`, `getState`, `AttendanceDoc` from `../attendance/attendanceApi`.
- Produces: `TimesheetPage` passes a new `attendance: Partial<Record<Day, AttendanceCell>>` prop into `<TimesheetGrid>` (consumed by Task 4).

- [ ] **Step 1: Add `getRange` to `attendanceApi.ts`**

In `web/src/attendance/attendanceApi.ts`, directly after the existing `getMonth` export (after line 93):

```ts
export const getRange = (start: string, end: string) =>
  authed(`/attendance/range?start=${start}&end=${end}`) as Promise<AttendanceDoc[]>;
```

- [ ] **Step 2: Run the frontend type check to confirm no breakage**

Run: `cd web && npx tsc -b --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Wire data loading into `TimesheetPage.tsx`**

In `web/src/timesheet/TimesheetPage.tsx`:

Add imports (alongside the existing `leaveApi`/`LeaveModal` imports at lines 11-12):

```ts
import { getRange, getState, AttendanceDoc } from '../attendance/attendanceApi';
import { resolveAttendanceRow, AttendanceCell } from './attendanceRow';
```

Add state (alongside `myLeave`/`leaveOpen` at lines 33-34):

```ts
  const [attendanceDocs, setAttendanceDocs] = useState<AttendanceDoc[]>([]);
  const [activatedDate, setActivatedDate] = useState<string | null>(null);
```

Add a one-time activation-date load (alongside the `loadLeave` effect at lines 71-74):

```ts
  useEffect(() => {
    getState().then((s) => setActivatedDate(s.activatedDate)).catch(() => {});
  }, []);
```

Add a per-week attendance load. Place it right after the `dd`/`leaveDays` computation (after line 82, so `dd` is in scope):

```ts
  useEffect(() => {
    getRange(dd.mon, dd.fri).then(setAttendanceDocs).catch(() => setAttendanceDocs([]));
  }, [dd.mon, dd.fri]);

  const attendance = resolveAttendanceRow(dd, attendanceDocs, leaveDays, activatedDate, todayISO());
```

- [ ] **Step 4: Pass the new prop into `TimesheetGrid`**

In the `<TimesheetGrid ... />` call (lines 241-257), add the prop:

```tsx
      <TimesheetGrid
        weekStart={weekStart}
        tasks={tasks}
        assignable={assignable}
        readOnly={readOnly}
        todayDay={todayDay}
        grants={grants}
        pendingKeys={new Set(pendingKeys)}
        leaveDays={leaveDays}
        attendance={attendance}
        onRequestEdit={onRequestEdit}
        onRename={onRename}
        onCellChange={onCellChange}
        onDelete={onDelete}
        onAddAssigned={onAddAssigned}
        onAddBlank={onAddBlank}
        onProgress={onProgress}
      />
```

(`TimesheetGrid` doesn't accept this prop yet — that's Task 4. This will be a TS error until Task 4 lands; that's expected and resolved in the next task, not a step to "fix" here.)

- [ ] **Step 5: Commit**

```bash
git add web/src/attendance/attendanceApi.ts web/src/timesheet/TimesheetPage.tsx
git commit -m "feat: load and resolve weekly attendance data in TimesheetPage"
```

---

### Task 4: Frontend — render the attendance row in `TimesheetGrid`

**Files:**
- Modify: `web/src/timesheet/TimesheetGrid.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `AttendanceCell`, `attendanceLabel`, `attendanceBadgeClass` from `./attendanceRow` (Task 2); `attendance` prop produced by `TimesheetPage` (Task 3).

- [ ] **Step 1: Add the prop and import**

In `web/src/timesheet/TimesheetGrid.tsx`, add to the imports (after line 8):

```ts
import { attendanceLabel, attendanceBadgeClass } from './attendanceRow';
import type { AttendanceCell } from './attendanceRow';
```

Add to `Props` (after `leaveDays?: ...` at line 24):

```ts
  attendance?: Partial<Record<Day, AttendanceCell>>;
```

Add to the function signature (after `leaveDays = {}` at line 35):

```ts
  weekStart, tasks, assignable, readOnly = false, todayDay, grants, pendingKeys, leaveDays = {}, attendance = {}, onRequestEdit,
```

- [ ] **Step 2: Render the row**

In the `<tbody>` (right before `{tasks.map((t) => (` at line 100), add:

```tsx
          <tr className="ts-attendance-row">
            <td className="ts-task">Attendance</td>
            {DAYS.map((d) => {
              const cell = attendance[d];
              return (
                <td key={d} className="ts-attendance-cell">
                  {cell ? (
                    <>
                      <span className={attendanceBadgeClass(cell.status)}>{attendanceLabel(cell.status)}</span>
                      <div className="ts-attendance-hours">{formatMinutes(cell.effectiveMinutes)}</div>
                    </>
                  ) : (
                    <span className="ts-muted">—</span>
                  )}
                </td>
              );
            })}
            <td></td><td></td>
          </tr>
```

- [ ] **Step 3: Add CSS**

In `web/src/styles.css`, directly after the `.ts-leave-badge { ... }` block (after line 1279):

```css
/* Timesheet: read-only attendance row above the task rows */
.ts-attendance-row { background: var(--surface-2); }
.ts-attendance-row .ts-task { font-weight: 600; color: var(--text-muted); }
.ts-attendance-cell { text-align: center; }
.ts-attendance-hours { margin-top: 2px; font-size: var(--fs-2xs); color: var(--text-muted); }
.att-tag-present { background: var(--st-done-bg); color: var(--success); }
.att-tag-partial { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
.att-tag-absent { background: var(--danger-soft); color: var(--danger); }
```

- [ ] **Step 4: Type-check and run the full frontend test suite**

Run: `cd web && npx tsc -b --noEmit && npm test`
Expected: PASS — no TS errors, all existing + new tests green.

- [ ] **Step 5: Manual smoke check**

Run: `cd web && npm run dev` (and `cd auth-api && npm start` if not already running), open the Timesheet page, confirm:
- An "Attendance" row appears above the task rows with a badge + hours (or `—`) per weekday.
- The row never changes when typing hours into task cells, and the Daily total row at the bottom is unaffected by it.

- [ ] **Step 6: Commit**

```bash
git add web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat: render read-only attendance row in the timesheet grid"
```

---

## Self-Review Notes

- **Spec coverage:** backend range endpoint (spec §Backend) → Task 1; data resolution rules incl. leave/future/pre-activation precedence (spec §Frontend data fetching) → Task 2/3; row rendering, badge+hours, exclusion from totals (spec §Frontend grid rendering) → Task 4. Out-of-scope items (editing, weekends, SummaryTiles, team view) are untouched by any task, consistent with spec.
- **Placeholder scan:** no TBDs; all steps contain full code.
- **Type consistency:** `AttendanceCell`, `resolveAttendanceRow`, `attendanceLabel`, `attendanceBadgeClass` (Task 2) are imported with matching names/signatures in Tasks 3 and 4. `attendance` prop name and type match between `TimesheetPage` (Task 3) and `TimesheetGrid` (Task 4).
