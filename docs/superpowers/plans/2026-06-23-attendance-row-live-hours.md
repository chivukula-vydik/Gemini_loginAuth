# Attendance Row Live Hours & Missed-Checkout Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four follow-up issues on the timesheet's attendance row: in-progress days showing 0 hours, missed checkouts looking like silent zero-hour days, a noisy "0h 00m" line, and low-contrast status icons.

**Architecture:** All correctness logic lives in the backend `/attendance/range` route handler (not the shared `fetchRange` helper, so `/month` stays byte-identical) — it post-processes the already-fetched docs to compute live elapsed minutes for today's open session and flag past missed checkouts. The frontend threads one new optional field (`needsRegularise`) through the existing `AttendanceDoc` → `AttendanceCell` → render pipeline, plus two small presentational tweaks (hide zero hours, bigger icon).

**Tech Stack:** Express + Mongoose (backend), React + TypeScript (frontend), `node:test` + `supertest` + `mongodb-memory-server` (backend tests), `node:test` (frontend pure-function tests).

## Global Constraints

- No new persisted DB field, no background job, no auto-set checkout — `needsRegularise` is computed at read time only, in the `/attendance/range` route handler.
- `/attendance/month`, `/attendance/today`, `/attendance/stats`, `/attendance/team` are untouched; only `/attendance/range`'s handler gains the post-processing step.
- Live elapsed-minutes formula matches `web/src/attendance/AttendancePage.tsx:298-315` exactly: `liveBreakMinutes = breakMinutes + (openBreak ? now - openBreak.start : 0)`, `liveGrossMinutes = now - checkIn`, `effectiveMinutes = max(0, liveGrossMinutes - liveBreakMinutes)`.
- `needsRegularise: true` applies only to a *past* day (`date < today`) with `checkIn` set and `checkOut` null. Today's open session (`date === today`) gets the live-minutes override instead, never `needsRegularise`.
- `AttendancePage.tsx` and its own live ticker are not touched by this plan.

---

### Task 1: Backend — live elapsed hours and missed-checkout flag in `/attendance/range`

**Files:**
- Modify: `auth-api/src/routes/attendance.js:219-225` (the `/range` route handler)
- Test: `auth-api/test/priority2.test.js`

**Interfaces:**
- Produces: `GET /attendance/range` response items gain, when applicable: a live-computed `effectiveMinutes` (today's open session) or a `needsRegularise: true` field (past missed checkout). All other items are unchanged from today's response shape.

- [ ] **Step 1: Write the failing tests**

Find the existing import line in `auth-api/test/priority2.test.js`:
```js
const { Attendance } = await import('../src/models/Attendance.js');
```
Change it to also import `todayStr`:
```js
const { Attendance, todayStr } = await import('../src/models/Attendance.js');
```

Add this helper near the top of the file, after the `bearer` function:
```js
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

Add these tests directly after the existing `/attendance/range` tests (after the `'GET /attendance/range requires both start and end'` test):

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

In `auth-api/src/routes/attendance.js`, replace the `/range` route handler (lines 216-225):

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

### Task 2: Frontend — thread `needsRegularise` through types and the resolver

**Files:**
- Modify: `web/src/attendance/attendanceApi.ts:18-40` (`AttendanceDoc` type)
- Modify: `web/src/timesheet/attendanceRow.ts`
- Test: `web/src/timesheet/attendanceRow.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces:
  - `AttendanceDoc.needsRegularise?: boolean` (consumed by Task 3 via the resolved `AttendanceCell`)
  - `AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean } | null`
  - `attendanceDisplayLabel(status: AttendanceStatus, needsRegularise?: boolean): string` (consumed by Task 3)

- [ ] **Step 1: Add the field to `AttendanceDoc`**

In `web/src/attendance/attendanceApi.ts`, in the `AttendanceDoc` type (currently lines 18-40), add the new optional field directly after `effectiveMinutes: number;`:

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

- [ ] **Step 2: Write the failing tests**

In `web/src/timesheet/attendanceRow.test.ts`, update the `doc()` test helper to accept the new field, and add new tests. Replace the existing `doc()` helper:

```ts
function doc(date: string, status: AttendanceDoc['status'], effectiveMinutes = 0, needsRegularise?: boolean): AttendanceDoc {
  return {
    _id: date, userId: 'u1', date, checkIn: null, checkOut: null,
    totalMinutes: 0, breakMinutes: 0, effectiveMinutes, needsRegularise, status, punchType: 'office',
    breaks: [], note: '',
    regularise: { status: 'none', reason: '', correctedCheckIn: null, correctedCheckOut: null, requestedAt: null, decidedBy: null, decidedAt: null },
  };
}
```

Add these tests after the existing `'resolveAttendanceRow: a day with a doc shows its status and effective minutes'` test:

```ts
test('resolveAttendanceRow: a doc with needsRegularise passes the flag through to the cell', () => {
  const docs = [doc('2026-06-22', 'partial', 0, true)];
  const row = resolveAttendanceRow(dayDates, docs, {}, '2026-01-01', '2026-06-26');
  assert.deepEqual(row.mon, { status: 'partial', effectiveMinutes: 0, needsRegularise: true });
});

test('resolveAttendanceRow: a doc without needsRegularise leaves the field undefined on the cell', () => {
  const docs = [doc('2026-06-22', 'present', 480)];
  const row = resolveAttendanceRow(dayDates, docs, {}, '2026-01-01', '2026-06-26');
  assert.equal(row.mon?.needsRegularise, undefined);
});
```

Add this test after the existing `'attendanceLabel: maps every status to a display label'` test:

```ts
test('attendanceDisplayLabel: appends a no-checkout suffix only when needsRegularise is true', () => {
  assert.equal(attendanceDisplayLabel('partial'), 'Partial');
  assert.equal(attendanceDisplayLabel('partial', false), 'Partial');
  assert.equal(attendanceDisplayLabel('partial', true), 'Partial · No checkout');
  assert.equal(attendanceDisplayLabel('wfh-partial', true), 'WFH · No checkout');
});
```

Update the import line at the top of the test file to include the new function:

```ts
import { resolveAttendanceRow, attendanceLabel, attendanceBadgeClass, attendanceIcon, attendanceDisplayLabel } from './attendanceRow.ts';
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && node --test src/timesheet/attendanceRow.test.ts`
Expected: FAIL — `attendanceDisplayLabel` is not exported yet, and `resolveAttendanceRow` doesn't pass `needsRegularise` through.

- [ ] **Step 4: Implement the changes in `attendanceRow.ts`**

Update the `AttendanceCell` type (currently line 4):

```ts
export type AttendanceCell = { status: AttendanceStatus; effectiveMinutes: number; needsRegularise?: boolean } | null;
```

Update the doc-found branch inside `resolveAttendanceRow` (currently line 28):

```ts
    const doc = byDate.get(date);
    if (doc) { out[day] = { status: doc.status, effectiveMinutes: doc.effectiveMinutes, needsRegularise: doc.needsRegularise }; continue; }
```

Add this function directly after `attendanceLabel` (currently after line 45):

```ts
export function attendanceDisplayLabel(status: AttendanceStatus, needsRegularise = false): string {
  return needsRegularise ? `${attendanceLabel(status)} · No checkout` : attendanceLabel(status);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && node --test src/timesheet/attendanceRow.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add web/src/attendance/attendanceApi.ts web/src/timesheet/attendanceRow.ts web/src/timesheet/attendanceRow.test.ts
git commit -m "feat: thread needsRegularise through AttendanceDoc, AttendanceCell, and a display-label helper"
```

---

### Task 3: Frontend — hide zero hours, bigger icon, show the no-checkout suffix

**Files:**
- Modify: `web/src/timesheet/TimesheetGrid.tsx:1-11` (imports), `:96-116` (attendance row render)
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `attendanceDisplayLabel` from `./attendanceRow` (Task 2); `AttendanceCell.needsRegularise` (Task 2).

- [ ] **Step 1: Update the import**

In `web/src/timesheet/TimesheetGrid.tsx`, change:

```ts
import { attendanceLabel, attendanceBadgeClass, attendanceIcon } from './attendanceRow';
```

to:

```ts
import { attendanceBadgeClass, attendanceIcon, attendanceDisplayLabel } from './attendanceRow';
```

(`attendanceLabel` is no longer called directly in this file — `attendanceDisplayLabel` wraps it.)

- [ ] **Step 2: Update the attendance row render**

Replace the attendance `<tr>` block (currently lines 96-116):

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
                        <span className="ts-attendance-icon">{attendanceIcon(cell.status)}</span>
                        {' '}{attendanceDisplayLabel(cell.status, cell.needsRegularise)}
                      </span>
                      {cell.effectiveMinutes > 0 && (
                        <div className="ts-attendance-hours">{formatMinutes(cell.effectiveMinutes)}</div>
                      )}
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

- [ ] **Step 3: Add the icon CSS**

In `web/src/styles.css`, directly after the `.ts-attendance-hours { ... }` rule:

```css
.ts-attendance-icon { font-size: 1.15em; }
```

- [ ] **Step 4: Type-check and run the full frontend test suite**

Run: `cd web && npx tsc -b --noEmit && npm test`
Expected: PASS — no TS errors (in particular, no unused-import error for `attendanceLabel`), all existing + Task 2 tests green. This task adds no new automated tests of its own — it's presentational wiring of already-tested values (`attendanceDisplayLabel` is tested in Task 2; the zero-hours guard and icon wrapper are simple JSX with no new logic).

- [ ] **Step 5: Manual smoke check**

Run: `cd web && npm run dev` (and `cd auth-api && npm run dev` if not already running). Open the Timesheet page and confirm:
- A day with a live in-progress session (check in via the Attendance page in another tab, don't check out) shows a non-zero, growing hours value on reload, not `0h 00m`.
- A past day with a missed checkout (manually create one via the backend, or simulate by checking in and not checking out, then waiting for the date to roll over — or just verify via the Task 1 backend tests if a live walkthrough isn't practical) shows `· No checkout` appended to its badge.
- The icon is visually easier to read than before.
- A day with genuinely 0 effective minutes (e.g. Absent) shows no hours line at all.

- [ ] **Step 6: Commit**

```bash
git add web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat: hide zero attendance hours, enlarge status icon, show no-checkout suffix"
```

---

## Self-Review Notes

- **Spec coverage:** Decision 1 (live elapsed hours) → Task 1; Decision 2 (missed-checkout flag) → Task 1 (backend) + Task 2/3 (display); Decision 3 (hide zero hours) → Task 3; Decision 4 (icon contrast) → Task 3. Data shape changes (`AttendanceDoc.needsRegularise`, `AttendanceCell.needsRegularise`) → Task 2. Out-of-scope items (`AttendancePage`, `/month`, `/today`, `/stats`, `/team`, no DB writes) are untouched by any task and Task 1 includes an explicit isolation test for `/month`.
- **Placeholder scan:** no TBDs; all steps contain full code.
- **Type consistency:** `AttendanceCell.needsRegularise?: boolean` (Task 2) matches `AttendanceDoc.needsRegularise?: boolean` (Task 2) and is consumed identically in Task 3's `cell.needsRegularise`. `attendanceDisplayLabel(status, needsRegularise)` signature is identical between its Task 2 definition/tests and its Task 3 call site.
