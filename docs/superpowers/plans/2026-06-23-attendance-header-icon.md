# Attendance Header Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate timesheet attendance row with a per-day status icon inside the existing column header, compute accurate live hours for in-progress sessions, flag missed checkouts, and fold approved leave into the same unified icon (removing the old separate leave-badge overlay).

**Architecture:** Backend correctness logic lives entirely in `/attendance/range`'s route handler (live elapsed minutes for today's open session; `needsRegularise` flag for past missed checkouts). The frontend's `resolveAttendanceRow` reads `Attendance` docs directly — including leave/holiday, which are already stamped onto real docs by existing approval flows — and `TimesheetGrid` renders one icon + tooltip per day header instead of a separate row.

**Tech Stack:** Express + Mongoose (backend), React + TypeScript (frontend), `node:test` + `supertest` + `mongodb-memory-server` (backend tests), `node:test` (frontend pure-function tests).

## Global Constraints

- No new persisted DB field, no background job, no auto-set checkout — `needsRegularise` is computed at read time only, in the `/attendance/range` route handler.
- `/attendance/month`, `/attendance/today`, `/attendance/stats`, `/attendance/team`, and `AttendancePage.tsx` (including its own live ticker) are untouched.
- Live elapsed-minutes formula matches `web/src/attendance/AttendancePage.tsx:298-315`: `liveBreakMinutes = breakMinutes + (openBreak ? now - openBreak.start : 0)`, `liveGrossMinutes = now - checkIn`, `effectiveMinutes = max(0, liveGrossMinutes - liveBreakMinutes)`.
- `needsRegularise: true` applies only to a *past* day (`date < today`) with `checkIn` set and `checkOut` null. Today's open session gets the live-minutes override instead, never `needsRegularise`.
- The grid stays Mon–Fri only (`DAYS` from `web/src/timesheet/time.ts`); no weekend handling.
- Tooltip text: `"{Label} — {hours}"` when hours are meaningful (> 0); bare `"{Label}"` when not (Absent, or Partial/WFH-partial at 0 minutes); Leave shows its `note` capitalized instead of the generic label (e.g. `"Casual leave"`); Holiday shows `"Holiday — {note}"`; any `needsRegularise` day shows `"{Label} — no checkout, please regularise"` regardless of hours.
- Blank days (future, pre-activation, no doc yet) render no icon and no tooltip at all.

---

### Task 1: Backend — live elapsed hours and missed-checkout flag in `/attendance/range`

**Files:**
- Modify: `auth-api/src/routes/attendance.js` (the `/range` route handler, currently at lines 216-225)
- Test: `auth-api/test/priority2.test.js`

**Interfaces:**
- Produces: `GET /attendance/range` response items gain, when applicable: a live-computed `effectiveMinutes` (today's open session) or a `needsRegularise: true` field (past missed checkout). All other items are unchanged from today's response shape.

- [ ] **Step 1: Write the failing tests**

In `auth-api/test/priority2.test.js`, find this import line:
```js
const { Attendance } = await import('../src/models/Attendance.js');
```
Change it to also import `todayStr`:
```js
const { Attendance, todayStr } = await import('../src/models/Attendance.js');
```

Add this helper directly after the `bearer` function:
```js
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

Add these tests directly after the existing `'GET /attendance/range requires both start and end'` test:

```js
test('GET /attendance/range computes live effective minutes for an in-progress (no checkout) session today', async () => {
  const emp = await User.create({ email: 'live-1@x.com', displayName: 'E', role: 'employee' });
  const today = todayStr();
  const checkIn = new Date(Date.now() - 90 * 60000); // checked in 90 minutes ago
  await Attendance.create({
    userId: emp._id, date: today, checkIn, checkOut: null,
    breakMinutes: 10, effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${today}&end=${today}`)
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  const day = res.body.find((d) => d.date === today);
  assert.ok(day.effectiveMinutes >= 75 && day.effectiveMinutes <= 85, `expected ~80, got ${day.effectiveMinutes}`);
});

test('GET /attendance/range subtracts an open break from the live effective minutes', async () => {
  const emp = await User.create({ email: 'live-2@x.com', displayName: 'E', role: 'employee' });
  const today = todayStr();
  const checkIn = new Date(Date.now() - 90 * 60000);
  const breakStart = new Date(Date.now() - 10 * 60000);
  await Attendance.create({
    userId: emp._id, date: today, checkIn, checkOut: null,
    breakMinutes: 0, breaks: [{ start: breakStart, end: null }],
    effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${today}&end=${today}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === today);
  assert.ok(day.effectiveMinutes >= 75 && day.effectiveMinutes <= 85, `expected ~80, got ${day.effectiveMinutes}`);
});

test('GET /attendance/range flags a past day with checkIn but no checkOut as needsRegularise', async () => {
  const emp = await User.create({ email: 'live-3@x.com', displayName: 'E', role: 'employee' });
  const yest = yesterdayStr();
  await Attendance.create({
    userId: emp._id, date: yest, checkIn: new Date(Date.now() - 24 * 60 * 60000),
    checkOut: null, effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${yest}&end=${yest}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === yest);
  assert.equal(day.needsRegularise, true);
});

test('GET /attendance/range leaves a completed day untouched (no live override, no needsRegularise)', async () => {
  const emp = await User.create({ email: 'live-4@x.com', displayName: 'E', role: 'employee' });
  const yest = yesterdayStr();
  await Attendance.create({
    userId: emp._id, date: yest, checkIn: new Date(Date.now() - 25 * 60 * 60000),
    checkOut: new Date(Date.now() - 16 * 60 * 60000), effectiveMinutes: 480, status: 'present', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${yest}&end=${yest}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === yest);
  assert.equal(day.effectiveMinutes, 480);
  assert.ok(!day.needsRegularise);
});

test('GET /attendance/month does not apply the live-elapsed override (isolated from /range)', async () => {
  const emp = await User.create({ email: 'live-5@x.com', displayName: 'E', role: 'employee' });
  const today = todayStr();
  const [y, m] = today.split('-');
  await Attendance.create({
    userId: emp._id, date: today, checkIn: new Date(Date.now() - 90 * 60000),
    checkOut: null, breakMinutes: 0, effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/month?year=${y}&month=${Number(m)}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === today);
  assert.equal(day.effectiveMinutes, 0); // unmodified stored value, not live-computed
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/priority2.test.js`
Expected: FAIL — the live-minutes assertions fail because `/range` currently returns the stored `effectiveMinutes: 0` and never sets `needsRegularise`.

- [ ] **Step 3: Implement the post-processing in the `/range` handler**

In `auth-api/src/routes/attendance.js`, replace the `/range` route handler:

```js
  // GET /attendance/range?start=2026-06-22&end=2026-06-26 — arbitrary date
  // span, e.g. a Mon-Fri timesheet week (which can cross a month boundary,
  // unlike /month).
  router.get('/range', asyncHandler(async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });

    const merged = await fetchRange(req.user.sub, start, end);
    const today = todayStr();
    const now = new Date();

    const withLiveData = merged.map((doc) => {
      if (!doc.checkIn || doc.checkOut) return doc;

      if (doc.date === today) {
        // Still clocked in today: compute elapsed time live, mirroring the
        // same formula AttendancePage already uses client-side for its own
        // ticking display (gross time minus any closed or still-open break).
        const openBreak = (doc.breaks || []).find((b) => !b.end);
        const openBreakElapsed = openBreak ? (now - new Date(openBreak.start)) / 60000 : 0;
        const liveBreakMinutes = (doc.breakMinutes || 0) + openBreakElapsed;
        const liveGrossMinutes = (now - new Date(doc.checkIn)) / 60000;
        return { ...doc, effectiveMinutes: Math.max(0, liveGrossMinutes - liveBreakMinutes) };
      }

      if (doc.date < today) {
        // A past day stuck mid-session: the employee forgot to check out.
        // Never invent an hours value — flag it so the timesheet can point
        // back at the existing regularise flow instead.
        return { ...doc, needsRegularise: true };
      }

      return doc;
    });

    res.json(withLiveData);
  }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd auth-api && node --test test/priority2.test.js`
Expected: PASS, all tests including the 5 new ones and the pre-existing `/attendance/month`, `/attendance/stats`, and `/attendance/range` tests.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/attendance.js auth-api/test/priority2.test.js
git commit -m "feat: compute live hours and flag missed checkouts in GET /attendance/range"
```

---

### Task 2: Frontend — rewrite `attendanceRow.ts` for the header-icon design

**Files:**
- Modify: `web/src/attendance/attendanceApi.ts` (`AttendanceDoc` type, currently lines 18-40)
- Modify: `web/src/timesheet/attendanceRow.ts` (full rewrite)
- Modify: `web/src/timesheet/attendanceRow.test.ts` (full rewrite)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `AttendanceDoc.needsRegularise?: boolean`
  - `AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean; note?: string } | null`
  - `resolveAttendanceRow(dayDates: Record<Day, string>, docs: AttendanceDoc[], activatedDate: string | null, today: string): Partial<Record<Day, AttendanceCell>>` — note: **no `leaveDays` parameter** (removed; leave is now read directly from docs, like any other status).
  - `attendanceLabel(status: AttendanceStatus): string` (kept, unchanged)
  - `attendanceIcon(status: AttendanceStatus): string` (kept, unchanged)
  - `attendanceIconColorClass(status: AttendanceStatus): string` (new)
  - `attendanceTooltip(status: AttendanceStatus, effectiveMinutes: number, needsRegularise?: boolean, note?: string): string` (new)
  - `attendanceBadgeClass` is **removed** (no longer used — there's no badge anymore).

- [ ] **Step 1: Add the field to `AttendanceDoc`**

In `web/src/attendance/attendanceApi.ts`, in the `AttendanceDoc` type, add the new optional field directly after `effectiveMinutes: number;`:

```ts
export type AttendanceDoc = {
  _id: string;
  userId: string;
  date: string;                    // "2026-06-22"
  checkIn: string | null;          // ISO date string
  checkOut: string | null;
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  needsRegularise?: boolean;       // set only by /attendance/range, for a past day with a missed checkout
  status: AttendanceStatus;
  punchType: PunchType;
  breaks: Break[];
  note: string;
  regularise: {
    status: RegulariseStatus;
    reason: string;
    correctedCheckIn: string | null;
    correctedCheckOut: string | null;
    requestedAt: string | null;
    decidedBy: string | null;
    decidedAt: string | null;
  };
};
```

- [ ] **Step 2: Write the failing test file**

Replace the entire contents of `web/src/timesheet/attendanceRow.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAttendanceRow, attendanceLabel, attendanceIcon, attendanceIconColorClass, attendanceTooltip } from './attendanceRow.ts';
import type { AttendanceDoc } from '../attendance/attendanceApi.ts';

const dayDates = { mon: '2026-06-22', tue: '2026-06-23', wed: '2026-06-24', thu: '2026-06-25', fri: '2026-06-26' };

function doc(date: string, status: AttendanceDoc['status'], effectiveMinutes = 0, opts: { needsRegularise?: boolean; note?: string } = {}): AttendanceDoc {
  return {
    _id: date, userId: 'u1', date, checkIn: null, checkOut: null,
    totalMinutes: 0, breakMinutes: 0, effectiveMinutes, needsRegularise: opts.needsRegularise, status, punchType: 'office',
    breaks: [], note: opts.note ?? '',
    regularise: { status: 'none', reason: '', correctedCheckIn: null, correctedCheckOut: null, requestedAt: null, decidedBy: null, decidedAt: null },
  };
}

test('resolveAttendanceRow: a day with a doc shows its status, effective minutes, needsRegularise, and note', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'present', effectiveMinutes: 480, needsRegularise: undefined, note: '' });
});

test('resolveAttendanceRow: a leave day resolves directly from the doc (no separate leaveDays input)', () => {
  const docs = [doc('2026-06-22', 'leave', 0, { note: 'casual leave' })];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'leave', effectiveMinutes: 0, needsRegularise: undefined, note: 'casual leave' });
});

test('resolveAttendanceRow: a doc with needsRegularise passes the flag through', () => {
  const docs = [doc('2026-06-22', 'partial', 0, { needsRegularise: true })];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-26');
  assert.equal(row.mon?.needsRegularise, true);
});

test('resolveAttendanceRow: a past day with no doc, on/after activation, is absent', () => {
  const row = resolveAttendanceRow(dayDates, [], '2026-01-01', '2026-06-26');
  assert.deepEqual(row.tue, { status: 'absent', effectiveMinutes: 0 });
});

test('resolveAttendanceRow: a future day with no doc is blank', () => {
  const row = resolveAttendanceRow(dayDates, [], '2026-01-01', '2026-06-23');
  assert.equal(row.thu, null); // thu = 06-25, today = 06-23
});

test('resolveAttendanceRow: today with no doc is blank (the day is not over yet)', () => {
  const row = resolveAttendanceRow(dayDates, [], '2026-01-01', '2026-06-23');
  assert.equal(row.tue, null); // tue = 06-23 = today
});

test('resolveAttendanceRow: today WITH a doc still shows its real status', () => {
  const docs = [doc('2026-06-23', 'partial', 240)];
  const row = resolveAttendanceRow(dayDates, docs, '2026-01-01', '2026-06-23');
  assert.deepEqual(row.tue, { status: 'partial', effectiveMinutes: 240, needsRegularise: undefined, note: '' });
});

test('resolveAttendanceRow: before activation (or no activation yet) is blank, even in the past', () => {
  const row = resolveAttendanceRow(dayDates, [], null, '2026-06-26');
  assert.equal(row.mon, null);

  const rowLateActivation = resolveAttendanceRow(dayDates, [], '2026-06-24', '2026-06-26');
  assert.equal(rowLateActivation.mon, null);   // mon = 06-22, before activation 06-24
  assert.deepEqual(rowLateActivation.wed, { status: 'absent', effectiveMinutes: 0 }); // wed = 06-24, on activation day
});

test('attendanceLabel: maps every status to a display label', () => {
  assert.equal(attendanceLabel('present'), 'Present');
  assert.equal(attendanceLabel('wfh-partial'), 'WFH');
  assert.equal(attendanceLabel('holiday'), 'Holiday');
});

test('attendanceIcon: maps every status to a distinct icon', () => {
  assert.equal(attendanceIcon('present'), '✓');
  assert.equal(attendanceIcon('partial'), '◑');
  assert.equal(attendanceIcon('absent'), '✕');
  assert.equal(attendanceIcon('wfh'), '⌂');
  assert.equal(attendanceIcon('wfh-partial'), '⌂');
  assert.equal(attendanceIcon('leave'), '✦');
  assert.equal(attendanceIcon('holiday'), '★');
});

test('attendanceIconColorClass: present and wfh share the success color; leave shares the partial/warning color', () => {
  assert.equal(attendanceIconColorClass('present'), 'ts-th-icon-present');
  assert.equal(attendanceIconColorClass('wfh'), 'ts-th-icon-present');
  assert.equal(attendanceIconColorClass('partial'), 'ts-th-icon-partial');
  assert.equal(attendanceIconColorClass('leave'), 'ts-th-icon-partial');
  assert.equal(attendanceIconColorClass('absent'), 'ts-th-icon-absent');
  assert.equal(attendanceIconColorClass('holiday'), 'ts-th-icon-holiday');
});

test('attendanceTooltip: shows label + hours when there are meaningful hours', () => {
  assert.equal(attendanceTooltip('present', 495), 'Present — 8h 15m');
});

test('attendanceTooltip: omits hours when they are zero and meaningless', () => {
  assert.equal(attendanceTooltip('absent', 0), 'Absent');
  assert.equal(attendanceTooltip('partial', 0), 'Partial');
});

test('attendanceTooltip: leave shows its capitalized note instead of the generic label', () => {
  assert.equal(attendanceTooltip('leave', 0, false, 'casual leave'), 'Casual leave');
  assert.equal(attendanceTooltip('leave', 0, false, undefined), 'Leave');
});

test('attendanceTooltip: holiday shows label plus its note', () => {
  assert.equal(attendanceTooltip('holiday', 0, false, 'Founders Day'), 'Holiday — Founders Day');
  assert.equal(attendanceTooltip('holiday', 0, false, undefined), 'Holiday');
});

test('attendanceTooltip: needsRegularise overrides hours with the no-checkout message', () => {
  assert.equal(attendanceTooltip('partial', 480, true), 'Partial — no checkout, please regularise');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && node --test src/timesheet/attendanceRow.test.ts`
Expected: FAIL — `attendanceIconColorClass`/`attendanceTooltip` are not exported yet, `resolveAttendanceRow` still takes the old `leaveDays` parameter.

- [ ] **Step 4: Replace the entire contents of `web/src/timesheet/attendanceRow.ts`**

```ts
import type { Day } from './time';
import { formatMinutes } from './time';
import type { AttendanceDoc, AttendanceStatus } from '../attendance/attendanceApi';

export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean; note?: string } | null;

const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Resolves what the timesheet's column-header icon should show for each
// weekday. Precedence: a real attendance doc — present/partial/absent/wfh/
// leave/holiday, however it was set (leave and holiday are stamped onto
// real docs by existing approval flows, same as a check-in) — wins. With no
// doc: blank for today (not yet over)/future/pre-activation days, else
// absent for any other past day with no doc.
export function resolveAttendanceRow(
  dayDates: Record<Day, string>,
  docs: AttendanceDoc[],
  activatedDate: string | null,
  today: string,
): Partial<Record<Day, AttendanceCell>> {
  const byDate = new Map(docs.map((d) => [d.date, d]));
  const out: Partial<Record<Day, AttendanceCell>> = {};

  for (const day of DAYS) {
    const date = dayDates[day];

    const doc = byDate.get(date);
    if (doc) {
      out[day] = { status: doc.status, effectiveMinutes: doc.effectiveMinutes, needsRegularise: doc.needsRegularise, note: doc.note };
      continue;
    }

    if (date >= today || !activatedDate || date < activatedDate) { out[day] = null; continue; }

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

const ICONS: Record<AttendanceStatus, string> = {
  present: '✓', partial: '◑', absent: '✕',
  wfh: '⌂', 'wfh-partial': '⌂', leave: '✦', holiday: '★', weekend: '',
};

export function attendanceIcon(status: AttendanceStatus): string {
  return ICONS[status];
}

const ICON_COLOR_CLASS: Record<AttendanceStatus, string> = {
  present: 'ts-th-icon-present', partial: 'ts-th-icon-partial', absent: 'ts-th-icon-absent',
  wfh: 'ts-th-icon-present', 'wfh-partial': 'ts-th-icon-present',
  leave: 'ts-th-icon-partial', holiday: 'ts-th-icon-holiday', weekend: '',
};

export function attendanceIconColorClass(status: AttendanceStatus): string {
  return ICON_COLOR_CLASS[status];
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function attendanceTooltip(
  status: AttendanceStatus,
  effectiveMinutes: number,
  needsRegularise?: boolean,
  note?: string,
): string {
  if (needsRegularise) return `${attendanceLabel(status)} — no checkout, please regularise`;
  if (status === 'leave') return note ? capitalize(note) : attendanceLabel(status);
  if (status === 'holiday') return note ? `${attendanceLabel(status)} — ${note}` : attendanceLabel(status);
  if (effectiveMinutes > 0) return `${attendanceLabel(status)} — ${formatMinutes(effectiveMinutes)}`;
  return attendanceLabel(status);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && node --test src/timesheet/attendanceRow.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/attendance/attendanceApi.ts web/src/timesheet/attendanceRow.ts web/src/timesheet/attendanceRow.test.ts
git commit -m "feat: rewrite attendanceRow for the header-icon design (drop leaveDays, add tooltip/color helpers)"
```

---

### Task 3: Frontend — `TimesheetPage.tsx`: drop the leave-tracking state, update the resolver call

**Files:**
- Modify: `web/src/timesheet/TimesheetPage.tsx`

**Interfaces:**
- Consumes: `resolveAttendanceRow(dayDates, docs, activatedDate, today)` (new 4-arg signature from Task 2).
- Produces: `TimesheetPage` no longer passes a `leaveDays` prop to `TimesheetGrid` (Task 4 removes that prop from `TimesheetGrid` itself).

- [ ] **Step 1: Remove the leave-tracking imports, state, and effect**

In `web/src/timesheet/TimesheetPage.tsx`, remove this import line:
```ts
import { getMyLeave, LeaveRequest, LEAVE_TYPE_LABELS } from '../attendance/leaveApi';
```
and replace it with nothing (delete the line entirely — `LeaveModal` is imported separately on the next line and stays).

Remove this state declaration:
```ts
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
```
(keep `const [leaveOpen, setLeaveOpen] = useState(false);` — that one stays, it drives the "Apply for leave" modal, unrelated to display tracking.)

Remove this effect and its callback:
```ts
  const loadLeave = useCallback(() => {
    getMyLeave().then(setMyLeave).catch(() => {});
  }, []);
  useEffect(() => { loadLeave(); }, [loadLeave]);
```

Remove the `leaveDays` computation block:
```ts
  // Approved leave that overlaps the visible week, mapped day -> type label.
  const dd = dayDates(weekStart);
  const leaveDays: Partial<Record<Day, string>> = {};
  for (const d of DAYS) {
    const lv = myLeave.find((l) => l.status === 'approved' && dd[d] >= l.startDate && dd[d] <= l.endDate);
    if (lv) leaveDays[d] = LEAVE_TYPE_LABELS[lv.type];
  }
```
and replace it with just the `dd` computation that the attendance-range effect still needs:
```ts
  const dd = dayDates(weekStart);
```

- [ ] **Step 2: Update the `resolveAttendanceRow` call**

Change:
```ts
  const attendance = resolveAttendanceRow(dd, attendanceDocs, leaveDays, activatedDate, todayISO());
```
to:
```ts
  const attendance = resolveAttendanceRow(dd, attendanceDocs, activatedDate, todayISO());
```

- [ ] **Step 3: Remove the `leaveDays` prop from the `TimesheetGrid` call, and the dead `loadLeave()` call**

In the `<TimesheetGrid ... />` call, remove this line:
```ts
        leaveDays={leaveDays}
```

In the `<LeaveModal ... />` call, change:
```tsx
          onSubmitted={() => { setLeaveOpen(false); loadLeave(); }}
```
to:
```tsx
          onSubmitted={() => setLeaveOpen(false)}
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc -b --noEmit`
Expected: errors only on `TimesheetGrid.tsx`'s `leaveDays` prop (it still declares the prop in its `Props` type until Task 4 removes it) — no errors in `TimesheetPage.tsx` itself. If `TimesheetPage.tsx` shows any error (e.g. an unused import, or a leftover reference to `myLeave`/`loadLeave`/`LeaveRequest`/`LEAVE_TYPE_LABELS`/`DAYS`), fix it: confirm `DAYS` is still used elsewhere in the file (it is, in `dayTotals`) so its import stays; confirm no other reference to the removed names remains.

- [ ] **Step 5: Commit**

```bash
git add web/src/timesheet/TimesheetPage.tsx
git commit -m "feat: drop redundant leave-tracking state from TimesheetPage now that resolveAttendanceRow reads leave from docs directly"
```

---

### Task 4: Frontend — `TimesheetGrid.tsx`: render the icon in the header, delete the row, clean up CSS

**Files:**
- Modify: `web/src/timesheet/TimesheetGrid.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `attendanceIcon`, `attendanceIconColorClass`, `attendanceTooltip` from `./attendanceRow` (Task 2); the `attendance` prop's resolved values (unchanged shape from the caller's perspective, just one new optional `note` field, already typed in `AttendanceCell`).

- [ ] **Step 1: Update imports and the `Props` type**

Change:
```ts
import { attendanceLabel, attendanceBadgeClass, attendanceIcon } from './attendanceRow';
import type { AttendanceCell } from './attendanceRow';
```
to:
```ts
import { attendanceIcon, attendanceIconColorClass, attendanceTooltip } from './attendanceRow';
import type { AttendanceCell } from './attendanceRow';
```

Remove this line from the `Props` type:
```ts
  leaveDays?: Partial<Record<Day, string>>;   // day -> leave type label, for approved leave
```

Remove `leaveDays = {}` from the function's destructured parameters (it currently reads `... pendingKeys, leaveDays = {}, attendance = {}, onRequestEdit, ...` — drop just `leaveDays = {},`).

- [ ] **Step 2: Render the icon in the day header, remove the leave badge**

Replace the header day-map block:
```tsx
            {DAYS.map((d) => {
              const isFuture = dates[d] > today;
              const isToday = todayDay === d;
              const leave = leaveDays[d];
              const cls = `${isFuture ? 'ts-day-future' : ''}${isToday ? ' ts-day-today' : ''}${leave ? ' ts-day-leave' : ''}`.trim() || undefined;
              return (
                <th key={d} className={cls}>
                  {cols[d]}
                  {leave && <span className="ts-leave-badge" title={`${leave} leave`}>Leave</span>}
                </th>
              );
            })}
```
with:
```tsx
            {DAYS.map((d) => {
              const isFuture = dates[d] > today;
              const isToday = todayDay === d;
              const cls = `${isFuture ? 'ts-day-future' : ''}${isToday ? ' ts-day-today' : ''}`.trim() || undefined;
              const cell = attendance[d];
              return (
                <th key={d} className={cls}>
                  {cols[d]}
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

- [ ] **Step 3: Delete the attendance `<tr>`**

Remove this entire block from inside `<tbody>` (it currently sits directly before the `{tasks.length === 0 && (...)}` block):
```tsx
          <tr className="ts-attendance-row">
            <td className="ts-task">Attendance</td>
            {DAYS.map((d) => {
              const cell = attendance[d];
              return (
                <td key={d} className="ts-attendance-cell">
                  {cell ? (
                    <>
                      <span className={attendanceBadgeClass(cell.status)}>
                        {attendanceIcon(cell.status)} {attendanceLabel(cell.status)}
                      </span>
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
so `<tbody>` now starts directly with the `{tasks.length === 0 && (...)}` block.

- [ ] **Step 4: Update CSS**

In `web/src/styles.css`, remove these now-dead rules (added for the row version, no longer used):
```css
.ts-day-leave { background: color-mix(in srgb, var(--warning) 9%, transparent); }
.ts-leave-badge {
  display: block; margin-top: 2px;
  font-size: var(--fs-2xs); font-weight: 700; letter-spacing: 0.3px;
  text-transform: uppercase; color: var(--warning);
}
```
and:
```css
.ts-attendance-row { background: var(--surface-2); border-bottom: 2px solid var(--border); }
.ts-attendance-row .ts-task { font-weight: 600; color: var(--muted); }
.ts-attendance-cell { text-align: center; }
.ts-attendance-hours { margin-top: 2px; font-size: var(--fs-2xs); color: var(--muted); }
.ts-muted { color: var(--muted); }
.att-tag-present { background: var(--st-done-bg); color: var(--success); }
.att-tag-partial { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
.att-tag-absent { background: var(--danger-soft); color: var(--danger); }
```
Leave the `/* Timesheet: apply-for-leave header action ... */` comment's first line (`.ts-header-row { ... }` and `.ts-leave-btn { ... }`) in place — only the two leave-badge/day rules above are dead, the header-row flex layout and the "Apply for leave" button style are still used.

Add these new rules in their place:
```css
/* Timesheet: attendance status icon inside the day column header */
.ts-th-icon { margin-left: 6px; font-size: 0.95em; cursor: default; }
.ts-th-icon-present { color: var(--success); }
.ts-th-icon-partial { color: var(--warning); }
.ts-th-icon-absent { color: var(--danger); }
.ts-th-icon-holiday { color: var(--st-planning); }
```

- [ ] **Step 5: Type-check and run the full frontend test suite**

Run: `cd web && npx tsc -b --noEmit && npm test`
Expected: PASS — no TS errors, all existing + Task 2 tests green. This task adds no new automated tests of its own — it's presentational wiring of already-tested values from Task 2.

- [ ] **Step 6: Manual smoke check**

Run: `cd web && npm run dev` (and `cd auth-api && npm run dev` if not already running). Open the Timesheet page and confirm:
- No separate "Attendance" row exists anymore.
- Each weekday header shows a small colored icon (or nothing, for blank days) next to the date.
- Hovering an icon shows the tooltip text described in the Global Constraints.
- An approved leave day shows the ✦ icon with its leave-type tooltip, and the old "LEAVE" text pill is gone.
- A day with a missed checkout (if testable in this environment) shows the icon with a trailing ⚠ and the "no checkout, please regularise" tooltip.

- [ ] **Step 7: Commit**

```bash
git add web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat: move attendance status into the day column header, remove the separate row and leave badge"
```

---

## Self-Review Notes

- **Spec coverage:** Layout (delete row, icon in `<th>`) → Task 4; tooltip content rules → Task 2 (`attendanceTooltip`) + Task 4 (wiring); backend live-hours/needsRegularise → Task 1 (unchanged from the prior, now-superseded plan's Task 1 — still valid, never executed); leave-folds-into-icon (drop `leaveDays`, remove `ts-leave-badge`/`ts-day-leave`, remove `TimesheetPage`'s `myLeave` tracking) → Task 2 (resolver signature) + Task 3 (`TimesheetPage` cleanup) + Task 4 (`TimesheetGrid` cleanup + CSS); icon legend colors → Task 2 (`attendanceIconColorClass`) + Task 4 (CSS). All out-of-scope items (`AttendancePage`, `/month`/`/today`/`/stats`/`/team`, weekend columns, DB writes) are untouched by any task.
- **Placeholder scan:** no TBDs; all steps contain full code.
- **Type consistency:** `AttendanceCell` (Task 2: `{ status, effectiveMinutes, needsRegularise?, note? }`) is consumed identically in Task 4's `cell.status`/`cell.effectiveMinutes`/`cell.needsRegularise`/`cell.note`. `resolveAttendanceRow`'s 4-arg signature (Task 2) matches its call site in Task 3 exactly (`dd, attendanceDocs, activatedDate, todayISO()`). `attendanceTooltip`'s 4-arg signature (Task 2) matches its call site in Task 4 exactly.
