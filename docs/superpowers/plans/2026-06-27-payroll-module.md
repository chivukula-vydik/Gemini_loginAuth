# Payroll Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Indian-statutory payroll module (PF/ESIC/PT/TDS) that consumes PSA data (attendance, leave, timesheets) via an aggregation bridge, runs proration + statutory calculations, and emits payslips — with admin run console and employee self-service UI.

**Architecture:** PSA data flows through an aggregation bridge into a payroll run engine. The run engine resolves salary structures, prorates for LOP, layers adjustments (reimbursements, loans, arrears), runs statutory calculations (PF/ESIC/PT/TDS with dual tax regime support), and emits payslips. Frontend provides an admin run console (create/compute/lock/disburse), salary structure editor, and employee self-service (payslips, declarations, reimbursements, tax summary).

**Tech Stack:** Node.js + Express + Mongoose (backend), React + TypeScript + Vite (frontend), Node `test` module (tests), MongoDB.

## Global Constraints

- Models use YYYY-MM-DD strings for dates (not Date objects) where they align with attendance/leave patterns; Date objects only for timestamps.
- Routes use `createXxxRouter()` pattern, mounted in `src/app.js` via `app.use('/path', createXxxRouter())`.
- Routes use `requireAuth`, `requireRole(...roles)`, and `asyncHandler()` middleware.
- Frontend API calls use `authed(path, method?, body?)` from `fetchHelper.ts`.
- Frontend routes registered in `AppShell.tsx` via React Router v6 `<Route>`.
- Nav items added via `nav.ts` `navForRole()` function.
- Tests use `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`.
- CSS uses design tokens: `var(--card)`, `var(--border)`, `var(--primary)`, `var(--text)`, `var(--muted)`, `var(--faint)`, `var(--surface)`, `var(--shadow)`, `var(--radius)`.
- Dark theme via `[data-theme="dark"]` selectors.
- No file-format exporters in v1 — compute numbers only, export stubbed.
- Proof workflow for investment declarations deferred — schema fields exist but workflow not implemented.

---

## File Structure

### Backend — Models (`auth-api/src/models/`)

| File | Responsibility |
|---|---|
| `PayrollInput.js` | Aggregation bridge output — frozen PSA snapshot per employee per run |
| `PayGrade.js` | Compensation band with default salary components |
| `PayGroup.js` | Run-scoping bucket (entity, cycle, PT state, members) |
| `SalaryStructure.js` | Per-employee comp definition with revision history |
| `PayrollRun.js` | Batch run state machine (DRAFT→REVIEW→LOCKED→PAID) |
| `Payslip.js` | Computed payslip per employee per run |
| `StatutoryConfig.js` | Versioned statutory rule tables (PF/ESIC/PT/TDS slabs) |
| `Loan.js` | Employee loan/advance with EMI schedule |
| `Reimbursement.js` | Employee expense claim with approval flow |
| `InvestmentDeclaration.js` | Tax declaration per FY (old/new regime) |
| `StatutoryReport.js` | Computed statutory report data per period |

### Backend — Services (`auth-api/src/services/`)

| File | Responsibility |
|---|---|
| `payrollBridge.js` | `computePayrollInput(userId, month, year)` — aggregation bridge logic |
| `payrollEngine.js` | Run pipeline: resolve members → salary → prorate → adjustments → statutory → payslips |
| `statutoryEngine.js` | PF, ESIC, PT, TDS calculation functions |

### Backend — Routes (`auth-api/src/routes/`)

| File | Responsibility |
|---|---|
| `payroll.js` | Pay groups, grades, runs, run actions (compute/lock/reopen/disburse) |
| `salary.js` | Salary structure CRUD + revision logic |
| `payslips.js` | Payslip retrieval (admin + self-service) |
| `declarations.js` | Investment declaration CRUD (self-service) |
| `reimbursements.js` | Reimbursement submit/approve/reject |
| `loans.js` | Loan CRUD |

### Frontend (`web/src/payroll/`)

| File | Responsibility |
|---|---|
| `PayrollRunList.tsx` | List runs by period + status, create new run |
| `PayrollRunList.css` | Styles for run list |
| `PayrollRunDetail.tsx` | Run review: employee grid + action buttons |
| `PayrollRunDetail.css` | Styles for run detail |
| `SalaryEditor.tsx` | Component rows editor with CTC reconciliation |
| `SalaryEditor.css` | Styles for salary editor |
| `MyPayslips.tsx` | Employee self-service: payslip list + detail |
| `MyPayslips.css` | Styles for payslip views |
| `Declarations.tsx` | Investment declaration form (regime picker, section items) |
| `Declarations.css` | Styles for declarations |
| `TaxSummary.tsx` | YTD tax projection view |
| `TaxSummary.css` | Styles for tax summary |
| `Reimbursements.tsx` | Submit + track reimbursements |
| `Reimbursements.css` | Styles for reimbursements |
| `ReimbursementApprovals.tsx` | Manager approval queue |
| `ReimbursementApprovals.css` | Styles for approval queue |

### Tests (`auth-api/test/`)

| File | Responsibility |
|---|---|
| `payrollBridge.test.js` | Aggregation bridge unit tests |
| `statutoryEngine.test.js` | PF/ESIC/PT/TDS calculation tests |
| `payrollEngine.test.js` | Run pipeline integration tests |
| `salaryStructure.test.js` | Revision logic tests |

---

### Task 1: Aggregation Bridge — Model + Service

**Files:**
- Create: `auth-api/src/models/PayrollInput.js`
- Create: `auth-api/src/services/payrollBridge.js`
- Test: `auth-api/test/payrollBridge.test.js`

**Interfaces:**
- Consumes: `Holiday` model (date, year), `Attendance` model (userId, date, status), `Leave` model (userId, startDate, endDate, status, type, requestedDays), `Timesheet` model (userId, weekStart, entries with billable flags)
- Produces: `computePayrollInput(userId, month, year)` → `{ payableDays, presentDays, paidLeaveDays, lopDays, otHours, billableHours }`; `PayrollInput` Mongoose model

- [ ] **Step 1: Write the PayrollInput model**

```js
// auth-api/src/models/PayrollInput.js
import mongoose from 'mongoose';

const PayrollInputSchema = new mongoose.Schema({
  payrollRun:   { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true, index: true },
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  period:       { month: Number, year: Number },

  payableDays:    { type: Number, required: true },
  presentDays:    { type: Number, required: true },
  paidLeaveDays:  { type: Number, default: 0 },
  lopDays:        { type: Number, default: 0 },
  otHours:        { type: Number, default: 0 },
  billableHours:  { type: Number, default: 0 },

  frozen:      { type: Boolean, default: false },
  computedAt:  { type: Date, default: Date.now },
}, { timestamps: true });

PayrollInputSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

export const PayrollInput = mongoose.model('PayrollInput', PayrollInputSchema);
```

- [ ] **Step 2: Write the failing bridge test**

```js
// auth-api/test/payrollBridge.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePayrollInput } from '../src/services/payrollBridge.js';

// June 2026: 22 weekdays (Mon-Fri), no holidays
test('computePayrollInput: full month, no absences, no holidays', () => {
  const holidays = [];
  const attendances = [];
  // Generate 22 present days (all weekdays of June 2026)
  const weekdays = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = `2026-06-${String(d).padStart(2, '0')}`;
      weekdays.push(ymd);
      attendances.push({ date: ymd, status: 'present' });
    }
  }
  const leaves = [];
  const timesheets = [];

  const result = computePayrollInput({ holidays, attendances, leaves, timesheets, month: 6, year: 2026 });

  assert.equal(result.payableDays, 22);
  assert.equal(result.presentDays, 22);
  assert.equal(result.paidLeaveDays, 0);
  assert.equal(result.lopDays, 0);
  assert.equal(result.billableHours, 0);
});

test('computePayrollInput: 2 holidays reduce payable days', () => {
  const holidays = [
    { date: '2026-06-01', name: 'H1', year: 2026 },
    { date: '2026-06-02', name: 'H2', year: 2026 },
  ];
  const attendances = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6 && d !== 1 && d !== 2) {
      attendances.push({ date: `2026-06-${String(d).padStart(2, '0')}`, status: 'present' });
    }
  }

  const result = computePayrollInput({ holidays, attendances, leaves: [], timesheets: [], month: 6, year: 2026 });

  assert.equal(result.payableDays, 20);
  assert.equal(result.presentDays, 20);
  assert.equal(result.lopDays, 0);
});

test('computePayrollInput: 3 absent days with 1 paid leave = 2 LOP', () => {
  const attendances = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      if (d <= 3) continue; // skip first 3 weekdays
      attendances.push({ date: `2026-06-${String(d).padStart(2, '0')}`, status: 'present' });
    }
  }
  const leaves = [
    { startDate: '2026-06-01', endDate: '2026-06-01', status: 'approved', type: 'casual', requestedDays: 1 },
  ];

  const result = computePayrollInput({ holidays: [], attendances, leaves, timesheets: [], month: 6, year: 2026 });

  assert.equal(result.payableDays, 22);
  assert.equal(result.presentDays, 19);
  assert.equal(result.paidLeaveDays, 1);
  assert.equal(result.lopDays, 2);
});

test('computePayrollInput: unpaid leave does NOT count as paid leave days', () => {
  const attendances = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 5, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      if (d === 1) continue;
      attendances.push({ date: `2026-06-${String(d).padStart(2, '0')}`, status: 'present' });
    }
  }
  const leaves = [
    { startDate: '2026-06-01', endDate: '2026-06-01', status: 'approved', type: 'unpaid', requestedDays: 1 },
  ];

  const result = computePayrollInput({ holidays: [], attendances, leaves, timesheets: [], month: 6, year: 2026 });

  assert.equal(result.paidLeaveDays, 0);
  assert.equal(result.lopDays, 1);
});

test('computePayrollInput: WFH counts as present', () => {
  const attendances = [
    { date: '2026-06-01', status: 'wfh' },
    { date: '2026-06-02', status: 'wfh-partial' },
    { date: '2026-06-03', status: 'present' },
  ];

  const result = computePayrollInput({ holidays: [], attendances, leaves: [], timesheets: [], month: 6, year: 2026 });

  assert.equal(result.presentDays, 3);
});

test('computePayrollInput: billable hours summed from timesheets', () => {
  const timesheets = [
    {
      weekStart: '2026-06-01',
      entries: [
        { billable: { mon: true, tue: true, wed: false, thu: false, fri: false }, minutes: { mon: 480, tue: 480, wed: 480, thu: 0, fri: 0 } },
      ],
    },
  ];

  const result = computePayrollInput({ holidays: [], attendances: [], leaves: [], timesheets, month: 6, year: 2026 });

  assert.equal(result.billableHours, 16); // 960 minutes / 60
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test auth-api/test/payrollBridge.test.js`
Expected: FAIL — `computePayrollInput` not defined

- [ ] **Step 4: Write the bridge service**

```js
// auth-api/src/services/payrollBridge.js

const PRESENT_STATUSES = new Set(['present', 'wfh', 'partial', 'wfh-partial']);

export function computePayrollInput({ holidays, attendances, leaves, timesheets, month, year }) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const holidayDates = new Set(holidays.map(h => h.date));

  const weekdays = [];
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      weekdays.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  const payableDays = weekdays.filter(d => !holidayDates.has(d)).length;

  const presentDays = attendances.filter(a => PRESENT_STATUSES.has(a.status)).length;

  const approvedPaidLeaves = leaves.filter(l => l.status === 'approved' && l.type !== 'unpaid');
  const paidLeaveDays = approvedPaidLeaves.reduce((sum, l) => sum + (l.requestedDays || 0), 0);

  const absentDays = payableDays - presentDays - paidLeaveDays;
  const lopDays = Math.max(0, absentDays);

  let billableMinutes = 0;
  for (const ts of timesheets) {
    for (const entry of (ts.entries || [])) {
      const bill = entry.billable || {};
      const mins = entry.minutes || {};
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
        if (bill[day] && mins[day]) {
          billableMinutes += mins[day];
        }
      }
    }
  }

  return {
    payableDays,
    presentDays,
    paidLeaveDays,
    lopDays,
    otHours: 0,
    billableHours: Math.round((billableMinutes / 60) * 100) / 100,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test auth-api/test/payrollBridge.test.js`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/PayrollInput.js auth-api/src/services/payrollBridge.js auth-api/test/payrollBridge.test.js
git commit -m "feat(payroll): add aggregation bridge model + service with tests"
```

---

### Task 2: Pay Grade + Pay Group Models and Routes

**Files:**
- Create: `auth-api/src/models/PayGrade.js`
- Create: `auth-api/src/models/PayGroup.js`
- Modify: `auth-api/src/models/User.js` — add `payGrade` and `payGroup` fields
- Create: `auth-api/src/routes/payroll.js` — initial file with grade + group CRUD
- Modify: `auth-api/src/app.js` — mount payroll router
- Modify: `auth-api/src/routes/profile.js` — add payGrade/payGroup to select + allowed

**Interfaces:**
- Consumes: `User` model, `LegalEntity` model (ref from PayGroup)
- Produces: `PayGrade` model, `PayGroup` model, `createPayrollRouter()` function; `GET/POST /payroll/grades`, `GET/POST /payroll/groups`

- [ ] **Step 1: Create PayGrade model**

```js
// auth-api/src/models/PayGrade.js
import mongoose from 'mongoose';

const SalaryComponentTemplateSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  label:      { type: String, required: true },
  type:       { type: String, enum: ['earning', 'deduction'], required: true },
  calc:       { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc'], required: true },
  value:      { type: Number, required: true },
  taxable:    { type: Boolean, default: true },
  proratable: { type: Boolean, default: true },
}, { _id: false });

const PayGradeSchema = new mongoose.Schema({
  code:  { type: String, required: true, unique: true },
  label: { type: String, default: '' },
  minCtc: { type: Number, default: 0 },
  maxCtc: { type: Number, default: 0 },
  defaultComponents: [SalaryComponentTemplateSchema],
}, { timestamps: true });

export const PayGrade = mongoose.model('PayGrade', PayGradeSchema);
```

- [ ] **Step 2: Create PayGroup model**

```js
// auth-api/src/models/PayGroup.js
import mongoose from 'mongoose';

const PayGroupSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  entity:    { type: mongoose.Schema.Types.ObjectId, ref: 'LegalEntity', default: null },
  cycle:     { type: String, enum: ['calendar'], default: 'calendar' },
  ptState:   { type: String, default: '' },
  members:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

export const PayGroup = mongoose.model('PayGroup', PayGroupSchema);
```

- [ ] **Step 3: Add payGrade and payGroup to User model**

In `auth-api/src/models/User.js`, add after the `ifsc` field:

```js
payGrade:  { type: mongoose.Schema.Types.ObjectId, ref: 'PayGrade', default: null },
payGroup:  { type: mongoose.Schema.Types.ObjectId, ref: 'PayGroup', default: null },
```

- [ ] **Step 4: Create the payroll router with grade + group CRUD**

```js
// auth-api/src/routes/payroll.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { PayGrade } from '../models/PayGrade.js';
import { PayGroup } from '../models/PayGroup.js';

export function createPayrollRouter() {
  const router = express.Router();

  // --- Pay Grades ---
  router.get('/grades', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const grades = await PayGrade.find().sort('code');
    res.json(grades);
  }));

  router.post('/grades', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { code, label, minCtc, maxCtc, defaultComponents } = req.body;
    const grade = await PayGrade.create({ code, label, minCtc, maxCtc, defaultComponents: defaultComponents || [] });
    res.status(201).json(grade);
  }));

  // --- Pay Groups ---
  router.get('/groups', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const groups = await PayGroup.find().populate('entity', 'name').populate('members', 'displayName email');
    res.json(groups);
  }));

  router.post('/groups', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { name, entity, cycle, ptState, members } = req.body;
    const group = await PayGroup.create({ name, entity: entity || null, cycle, ptState, members: members || [] });
    res.status(201).json(group);
  }));

  return router;
}
```

- [ ] **Step 5: Mount payroll router in app.js**

In `auth-api/src/app.js`, add import:

```js
import { createPayrollRouter } from './routes/payroll.js';
```

Add mount line after the `'/people'` line:

```js
app.use('/payroll', createPayrollRouter());
```

- [ ] **Step 6: Update profile route to include payGrade/payGroup in select and allowed**

In `auth-api/src/routes/profile.js`, add `payGrade payGroup` to the `.select()` string in both GET and PATCH handlers. Add `.populate('payGrade', 'code label')` and `.populate('payGroup', 'name')` to both handlers. Add `'payGrade', 'payGroup'` to the `allowed` array in PATCH.

- [ ] **Step 7: Commit**

```bash
git add auth-api/src/models/PayGrade.js auth-api/src/models/PayGroup.js auth-api/src/models/User.js auth-api/src/routes/payroll.js auth-api/src/app.js auth-api/src/routes/profile.js
git commit -m "feat(payroll): add pay grade + pay group models, CRUD routes, user fields"
```

---

### Task 3: Salary Structure — Model, Routes, Revision Logic

**Files:**
- Create: `auth-api/src/models/SalaryStructure.js`
- Create: `auth-api/src/routes/salary.js`
- Modify: `auth-api/src/app.js` — mount salary router
- Test: `auth-api/test/salaryStructure.test.js`

**Interfaces:**
- Consumes: `User` model, `PayGrade` model (for template seeding)
- Produces: `SalaryStructure` model, `createSalaryRouter()` function; `GET /salary/:userId`, `POST /salary/:userId`

- [ ] **Step 1: Create SalaryStructure model**

```js
// auth-api/src/models/SalaryStructure.js
import mongoose from 'mongoose';

const SalaryComponentSchema = new mongoose.Schema({
  key:        { type: String, required: true },
  label:      { type: String, required: true },
  type:       { type: String, enum: ['earning', 'deduction'], required: true },
  calc:       { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc'], required: true },
  value:      { type: Number, required: true },
  taxable:    { type: Boolean, default: true },
  proratable: { type: Boolean, default: true },
}, { _id: false });

const SalaryStructureSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ctcAnnual:      { type: Number, required: true },
  components:     [SalaryComponentSchema],
  effectiveFrom:  { type: String, required: true },
  effectiveTo:    { type: String, default: null },
}, { timestamps: true });

SalaryStructureSchema.index({ user: 1, effectiveFrom: -1 });

export const SalaryStructure = mongoose.model('SalaryStructure', SalaryStructureSchema);
```

- [ ] **Step 2: Write the failing revision logic test**

```js
// auth-api/test/salaryStructure.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMonthlyAmounts } from '../src/services/payrollEngine.js';

test('resolveMonthlyAmounts: fixed components return value / 12', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
  ];
  const result = resolveMonthlyAmounts(components, 1200000);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'basic');
  assert.equal(result[0].monthlyAmount, 50000);
});

test('resolveMonthlyAmounts: percent_of_basic uses basic value', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
    { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
  ];
  const result = resolveMonthlyAmounts(components, 1200000);
  const hra = result.find(c => c.key === 'hra');
  assert.equal(hra.monthlyAmount, 25000); // 50% of 50000
});

test('resolveMonthlyAmounts: percent_of_ctc uses annual CTC', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
    { key: 'pf_employer', label: 'PF Employer', type: 'deduction', calc: 'percent_of_ctc', value: 12, taxable: false, proratable: true },
  ];
  const result = resolveMonthlyAmounts(components, 1200000);
  const pf = result.find(c => c.key === 'pf_employer');
  assert.equal(pf.monthlyAmount, 12000); // 12% of 1200000 / 12
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test auth-api/test/salaryStructure.test.js`
Expected: FAIL — `resolveMonthlyAmounts` not defined

- [ ] **Step 4: Write resolveMonthlyAmounts in payrollEngine.js**

```js
// auth-api/src/services/payrollEngine.js

export function resolveMonthlyAmounts(components, ctcAnnual) {
  const basicComp = components.find(c => c.key === 'basic');
  const annualBasic = basicComp ? basicComp.value : 0;
  const monthlyBasic = annualBasic / 12;

  return components.map(comp => {
    let monthlyAmount;
    if (comp.calc === 'fixed') {
      monthlyAmount = comp.value / 12;
    } else if (comp.calc === 'percent_of_basic') {
      monthlyAmount = (comp.value / 100) * monthlyBasic;
    } else if (comp.calc === 'percent_of_ctc') {
      monthlyAmount = (comp.value / 100) * ctcAnnual / 12;
    } else {
      monthlyAmount = 0;
    }
    return {
      key: comp.key,
      label: comp.label,
      type: comp.type,
      monthlyAmount: Math.round(monthlyAmount * 100) / 100,
      taxable: comp.taxable,
      proratable: comp.proratable,
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test auth-api/test/salaryStructure.test.js`
Expected: All 3 tests PASS

- [ ] **Step 6: Create the salary router**

```js
// auth-api/src/routes/salary.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { User } from '../models/User.js';
import { PayGrade } from '../models/PayGrade.js';

export function createSalaryRouter() {
  const router = express.Router();

  router.get('/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const active = await SalaryStructure.findOne({ user: req.params.userId, effectiveTo: null }).sort('-effectiveFrom');
    if (!active) return res.json(null);
    res.json(active);
  }));

  router.post('/:userId', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const { ctcAnnual, components, effectiveFrom } = req.body;
    if (!ctcAnnual || !components || !effectiveFrom) {
      return res.status(400).json({ error: 'ctcAnnual, components, and effectiveFrom required' });
    }

    const prev = await SalaryStructure.findOne({ user: req.params.userId, effectiveTo: null }).sort('-effectiveFrom');
    if (prev) {
      prev.effectiveTo = effectiveFrom;
      await prev.save();
    }

    const structure = await SalaryStructure.create({
      user: req.params.userId,
      ctcAnnual,
      components,
      effectiveFrom,
    });
    res.status(201).json(structure);
  }));

  router.get('/:userId/template', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select('payGrade');
    if (!user?.payGrade) return res.json({ components: [] });
    const grade = await PayGrade.findById(user.payGrade);
    if (!grade) return res.json({ components: [] });
    res.json({ components: grade.defaultComponents, minCtc: grade.minCtc, maxCtc: grade.maxCtc });
  }));

  return router;
}
```

- [ ] **Step 7: Mount salary router in app.js**

In `auth-api/src/app.js`, add import:

```js
import { createSalaryRouter } from './routes/salary.js';
```

Add mount line:

```js
app.use('/salary', createSalaryRouter());
```

- [ ] **Step 8: Commit**

```bash
git add auth-api/src/models/SalaryStructure.js auth-api/src/routes/salary.js auth-api/src/services/payrollEngine.js auth-api/src/app.js auth-api/test/salaryStructure.test.js
git commit -m "feat(payroll): add salary structure model, revision logic, CRUD routes"
```

---

### Task 4: Statutory Engine — PF, ESIC, PT, TDS

**Files:**
- Create: `auth-api/src/models/StatutoryConfig.js`
- Create: `auth-api/src/services/statutoryEngine.js`
- Test: `auth-api/test/statutoryEngine.test.js`

**Interfaces:**
- Consumes: `StatutoryConfig` model (slab tables)
- Produces: `computePF(basicMonthly, config)`, `computeESIC(grossMonthly, config)`, `computePT(grossMonthly, slabs)`, `computeTDS({ annualTaxableIncome, regime, config, declarations })` — all return `{ employee, employer }` or amount

- [ ] **Step 1: Create StatutoryConfig model**

```js
// auth-api/src/models/StatutoryConfig.js
import mongoose from 'mongoose';

const StatutoryConfigSchema = new mongoose.Schema({
  effectiveFrom: { type: String, required: true },
  pf: {
    employeePct: { type: Number, default: 12 },
    employerPct: { type: Number, default: 12 },
    wageCeiling: { type: Number, default: 15000 },
  },
  esic: {
    employeePct: { type: Number, default: 0.75 },
    employerPct: { type: Number, default: 3.25 },
    grossCeiling: { type: Number, default: 21000 },
  },
  pt: [{
    state: String,
    slabs: [{
      upTo: { type: Number, required: true },
      amount: { type: Number, required: true },
    }],
  }],
  tds: {
    old: {
      slabs: [{
        upTo: { type: Number, required: true },
        rate: { type: Number, required: true },
      }],
      standardDeduction: { type: Number, default: 50000 },
    },
    new: {
      slabs: [{
        upTo: { type: Number, required: true },
        rate: { type: Number, required: true },
      }],
      standardDeduction: { type: Number, default: 75000 },
    },
  },
}, { timestamps: true });

export const StatutoryConfig = mongoose.model('StatutoryConfig', StatutoryConfigSchema);
```

- [ ] **Step 2: Write the failing statutory engine tests**

```js
// auth-api/test/statutoryEngine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePF, computeESIC, computePT, computeMonthlyTDS } from '../src/services/statutoryEngine.js';

const pfConfig = { employeePct: 12, employerPct: 12, wageCeiling: 15000 };
const esicConfig = { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 };
const ptSlabs = [
  { upTo: 15000, amount: 0 },
  { upTo: 20000, amount: 150 },
  { upTo: Infinity, amount: 200 },
];

test('computePF: basic below wage ceiling', () => {
  const result = computePF(12000, pfConfig);
  assert.equal(result.employee, 1440);
  assert.equal(result.employer, 1440);
});

test('computePF: basic above wage ceiling caps at ceiling', () => {
  const result = computePF(50000, pfConfig);
  assert.equal(result.employee, 1800);
  assert.equal(result.employer, 1800);
});

test('computeESIC: gross below ceiling applies', () => {
  const result = computeESIC(18000, esicConfig);
  assert.equal(result.employee, 135);
  assert.equal(result.employer, 585);
});

test('computeESIC: gross above ceiling returns zero', () => {
  const result = computeESIC(25000, esicConfig);
  assert.equal(result.employee, 0);
  assert.equal(result.employer, 0);
});

test('computePT: gross 18000 falls in 150 slab', () => {
  assert.equal(computePT(18000, ptSlabs), 150);
});

test('computePT: gross 25000 falls in 200 slab', () => {
  assert.equal(computePT(25000, ptSlabs), 200);
});

test('computePT: gross 10000 falls in 0 slab', () => {
  assert.equal(computePT(10000, ptSlabs), 0);
});

const newSlabs = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 5 },
  { upTo: 1200000, rate: 10 },
  { upTo: 1600000, rate: 15 },
  { upTo: 2000000, rate: 20 },
  { upTo: 2400000, rate: 25 },
  { upTo: Infinity, rate: 30 },
];

test('computeMonthlyTDS: new regime, 12L annual taxable, standard deduction 75k', () => {
  const monthlyTds = computeMonthlyTDS({
    annualGross: 1200000,
    regime: 'new',
    slabs: newSlabs,
    standardDeduction: 75000,
    declarations: [],
  });
  // taxable = 1200000 - 75000 = 1125000
  // 0-4L: 0, 4-8L: 20000, 8-11.25L: 32500 = 52500 annual
  // monthly = 52500 / 12 = 4375
  assert.equal(monthlyTds, 4375);
});

const oldSlabs = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 5 },
  { upTo: 1000000, rate: 20 },
  { upTo: Infinity, rate: 30 },
];

test('computeMonthlyTDS: old regime with 80C deduction', () => {
  const monthlyTds = computeMonthlyTDS({
    annualGross: 1200000,
    regime: 'old',
    slabs: oldSlabs,
    standardDeduction: 50000,
    declarations: [{ section: '80C', declaredAmount: 150000 }],
  });
  // taxable = 1200000 - 50000 - 150000 = 1000000
  // 0-2.5L: 0, 2.5-5L: 12500, 5-10L: 100000 = 112500 annual
  // monthly = 112500 / 12 = 9375
  assert.equal(monthlyTds, 9375);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test auth-api/test/statutoryEngine.test.js`
Expected: FAIL — functions not defined

- [ ] **Step 4: Write the statutory engine**

```js
// auth-api/src/services/statutoryEngine.js

export function computePF(basicMonthly, config) {
  const base = Math.min(basicMonthly, config.wageCeiling);
  return {
    employee: Math.round(base * config.employeePct / 100),
    employer: Math.round(base * config.employerPct / 100),
  };
}

export function computeESIC(grossMonthly, config) {
  if (grossMonthly > config.grossCeiling) {
    return { employee: 0, employer: 0 };
  }
  return {
    employee: Math.round(grossMonthly * config.employeePct / 100),
    employer: Math.round(grossMonthly * config.employerPct / 100),
  };
}

export function computePT(grossMonthly, slabs) {
  for (const slab of slabs) {
    if (grossMonthly <= slab.upTo) return slab.amount;
  }
  return slabs[slabs.length - 1]?.amount || 0;
}

function slabTax(taxableIncome, slabs) {
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxableIncome <= prev) break;
    const taxableInSlab = Math.min(taxableIncome, slab.upTo) - prev;
    tax += taxableInSlab * slab.rate / 100;
    prev = slab.upTo;
  }
  return Math.round(tax);
}

export function computeMonthlyTDS({ annualGross, regime, slabs, standardDeduction, declarations }) {
  let taxableIncome = annualGross - standardDeduction;

  if (regime === 'old' && declarations?.length) {
    const totalDeductions = declarations.reduce((sum, d) => sum + (d.declaredAmount || 0), 0);
    taxableIncome -= totalDeductions;
  }

  taxableIncome = Math.max(0, taxableIncome);
  const annualTax = slabTax(taxableIncome, slabs);
  return Math.round(annualTax / 12);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test auth-api/test/statutoryEngine.test.js`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/StatutoryConfig.js auth-api/src/services/statutoryEngine.js auth-api/test/statutoryEngine.test.js
git commit -m "feat(payroll): add statutory engine (PF/ESIC/PT/TDS) with dual regime support"
```

---

### Task 5: Payroll Run Model + Pipeline Engine

**Files:**
- Create: `auth-api/src/models/PayrollRun.js`
- Create: `auth-api/src/models/Payslip.js`
- Modify: `auth-api/src/services/payrollEngine.js` — add `runPayrollPipeline()` function
- Test: `auth-api/test/payrollEngine.test.js`

**Interfaces:**
- Consumes: `PayrollRun` model, `PayGroup` model, `SalaryStructure` model, `PayrollInput` model, `computePayrollInput()` from bridge, `resolveMonthlyAmounts()` from engine, `computePF/ESIC/PT/computeMonthlyTDS` from statutory engine, `StatutoryConfig` model, `Loan` model, `Reimbursement` model
- Produces: `PayrollRun` model, `Payslip` model, `runPayrollPipeline(runId)` function

- [ ] **Step 1: Create PayrollRun model**

```js
// auth-api/src/models/PayrollRun.js
import mongoose from 'mongoose';

const PayrollRunSchema = new mongoose.Schema({
  period:   { month: { type: Number, required: true }, year: { type: Number, required: true } },
  payGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'PayGroup', required: true },
  status:   { type: String, enum: ['DRAFT', 'REVIEW', 'LOCKED', 'PAID'], default: 'DRAFT' },
  runType:  { type: String, enum: ['regular', 'off_cycle', 'bonus', 'arrear', 'final_settlement'], default: 'regular' },
  scope:    { type: String, enum: ['group', 'adhoc'], default: 'group' },
  adhocMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lockedAt: { type: Date, default: null },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  totals:   {
    gross:      { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay:     { type: Number, default: 0 },
    headcount:  { type: Number, default: 0 },
  },
}, { timestamps: true });

PayrollRunSchema.index({ 'period.year': 1, 'period.month': 1, payGroup: 1 });

export const PayrollRun = mongoose.model('PayrollRun', PayrollRunSchema);
```

- [ ] **Step 2: Create Payslip model**

```js
// auth-api/src/models/Payslip.js
import mongoose from 'mongoose';

const LineItemSchema = new mongoose.Schema({
  key:    { type: String, required: true },
  label:  { type: String, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const PayslipSchema = new mongoose.Schema({
  payrollRun:  { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', index: true },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  period:      { month: Number, year: Number },
  earnings:    [LineItemSchema],
  deductions:  [LineItemSchema],
  reimbursements: [LineItemSchema],
  statutory:   {
    pf:   { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    pt:   { type: Number, default: 0 },
    tds:  { type: Number, default: 0 },
  },
  gross:           { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  netPay:          { type: Number, default: 0 },
  lopDays:         { type: Number, default: 0 },
  paidDays:        { type: Number, default: 0 },
  otHours:         { type: Number, default: 0 },
  billableHours:   { type: Number, default: 0 },
}, { timestamps: true });

PayslipSchema.index({ payrollRun: 1, user: 1 }, { unique: true });

export const Payslip = mongoose.model('Payslip', PayslipSchema);
```

- [ ] **Step 3: Write the failing pipeline test**

```js
// auth-api/test/payrollEngine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayslip } from '../src/services/payrollEngine.js';

test('buildPayslip: prorates proratable earnings by LOP', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
    { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
    { key: 'special', label: 'Special', type: 'earning', calc: 'fixed', value: 120000, taxable: true, proratable: false },
  ];
  const input = { payableDays: 22, lopDays: 2, presentDays: 19, paidLeaveDays: 1, otHours: 0, billableHours: 10 };
  const statutory = { pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 }, esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 }, pt: [], tds: { new: { slabs: [{ upTo: 400000, rate: 0 }, { upTo: Infinity, rate: 5 }], standardDeduction: 75000 } } };
  const slip = buildPayslip({
    components,
    ctcAnnual: 1200000,
    input,
    statutoryConfig: statutory,
    regime: 'new',
    declarations: [],
    reimbursements: [],
    loanEmis: [],
  });

  // basic monthly = 50000, prorated = 50000 * (22-2)/22 = 45454.55
  assert.ok(slip.earnings.length >= 2);
  const basic = slip.earnings.find(e => e.key === 'basic');
  assert.equal(basic.amount, 45454.55);

  // special is not proratable: 120000/12 = 10000 stays 10000
  const special = slip.earnings.find(e => e.key === 'special');
  assert.equal(special.amount, 10000);

  assert.equal(slip.lopDays, 2);
  assert.equal(slip.paidDays, 20);
  assert.ok(slip.gross > 0);
  assert.ok(slip.netPay > 0);
  assert.ok(slip.netPay <= slip.gross);
});

test('buildPayslip: reimbursements added as earning lines', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
  ];
  const input = { payableDays: 22, lopDays: 0, presentDays: 22, paidLeaveDays: 0, otHours: 0, billableHours: 0 };
  const statutory = { pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 }, esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 }, pt: [], tds: { new: { slabs: [{ upTo: Infinity, rate: 0 }], standardDeduction: 75000 } } };
  const reimbursements = [
    { _id: 'r1', category: 'travel', amount: 5000 },
  ];
  const slip = buildPayslip({
    components,
    ctcAnnual: 600000,
    input,
    statutoryConfig: statutory,
    regime: 'new',
    declarations: [],
    reimbursements,
    loanEmis: [],
  });

  assert.equal(slip.reimbursements.length, 1);
  assert.equal(slip.reimbursements[0].amount, 5000);
});

test('buildPayslip: loan EMIs appear as deductions', () => {
  const components = [
    { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 600000, taxable: true, proratable: true },
  ];
  const input = { payableDays: 22, lopDays: 0, presentDays: 22, paidLeaveDays: 0, otHours: 0, billableHours: 0 };
  const statutory = { pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 }, esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 }, pt: [], tds: { new: { slabs: [{ upTo: Infinity, rate: 0 }], standardDeduction: 75000 } } };
  const loanEmis = [{ amount: 3000, label: 'Personal Loan EMI' }];
  const slip = buildPayslip({
    components,
    ctcAnnual: 600000,
    input,
    statutoryConfig: statutory,
    regime: 'new',
    declarations: [],
    reimbursements: [],
    loanEmis,
  });

  const loanDed = slip.deductions.find(d => d.key === 'loan_emi');
  assert.ok(loanDed);
  assert.equal(loanDed.amount, 3000);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test auth-api/test/payrollEngine.test.js`
Expected: FAIL — `buildPayslip` not defined

- [ ] **Step 5: Add buildPayslip to payrollEngine.js**

Append to `auth-api/src/services/payrollEngine.js`:

```js
import { computePF, computeESIC, computePT, computeMonthlyTDS } from './statutoryEngine.js';

export function buildPayslip({ components, ctcAnnual, input, statutoryConfig, regime, declarations, reimbursements, loanEmis }) {
  const resolved = resolveMonthlyAmounts(components, ctcAnnual);
  const { payableDays, lopDays, presentDays, paidLeaveDays, otHours, billableHours } = input;
  const paidDays = payableDays - lopDays;

  const earnings = [];
  let grossEarnings = 0;

  for (const comp of resolved) {
    if (comp.type !== 'earning') continue;
    let amount = comp.monthlyAmount;
    if (comp.proratable && payableDays > 0 && lopDays > 0) {
      amount = Math.round((amount * paidDays / payableDays) * 100) / 100;
    }
    earnings.push({ key: comp.key, label: comp.label, amount });
    grossEarnings += amount;
  }

  const reimbursementLines = reimbursements.map(r => ({
    key: `reimb_${r.category || r._id}`,
    label: `Reimbursement - ${r.category || 'Other'}`,
    amount: r.amount,
  }));
  const reimbTotal = reimbursementLines.reduce((s, r) => s + r.amount, 0);

  const basicEarning = earnings.find(e => e.key === 'basic');
  const basicMonthly = basicEarning ? basicEarning.amount : 0;

  const pf = computePF(basicMonthly, statutoryConfig.pf);
  const esic = computeESIC(grossEarnings, statutoryConfig.esic);
  const ptSlabs = statutoryConfig.pt || [];
  const pt = computePT(grossEarnings, ptSlabs);

  const tdsConfig = regime === 'old' ? statutoryConfig.tds.old : statutoryConfig.tds.new;
  const tds = computeMonthlyTDS({
    annualGross: grossEarnings * 12,
    regime,
    slabs: tdsConfig?.slabs || [],
    standardDeduction: tdsConfig?.standardDeduction || 0,
    declarations: declarations || [],
  });

  const deductions = [];

  const compDeductions = resolved.filter(c => c.type === 'deduction');
  for (const comp of compDeductions) {
    let amount = comp.monthlyAmount;
    if (comp.proratable && payableDays > 0 && lopDays > 0) {
      amount = Math.round((amount * paidDays / payableDays) * 100) / 100;
    }
    deductions.push({ key: comp.key, label: comp.label, amount });
  }

  for (const emi of loanEmis) {
    deductions.push({ key: 'loan_emi', label: emi.label || 'Loan EMI', amount: emi.amount });
  }

  const statutoryDeductions = pf.employee + esic.employee + pt + tds;
  const compDeductionTotal = deductions.reduce((s, d) => s + d.amount, 0);
  const totalDeductions = statutoryDeductions + compDeductionTotal;
  const gross = grossEarnings + reimbTotal;
  const netPay = Math.round((gross - totalDeductions) * 100) / 100;

  return {
    earnings,
    deductions,
    reimbursements: reimbursementLines,
    statutory: { pf: pf.employee, esic: esic.employee, pt, tds },
    gross: Math.round(gross * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay,
    lopDays,
    paidDays,
    otHours,
    billableHours,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test auth-api/test/payrollEngine.test.js`
Expected: All 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add auth-api/src/models/PayrollRun.js auth-api/src/models/Payslip.js auth-api/src/services/payrollEngine.js auth-api/test/payrollEngine.test.js
git commit -m "feat(payroll): add run model, payslip model, pipeline engine with proration + adjustments"
```

---

### Task 6: Payroll Run Routes — CRUD + Actions

**Files:**
- Modify: `auth-api/src/routes/payroll.js` — add run CRUD and action endpoints
- Create: `auth-api/src/routes/payslips.js` — payslip retrieval routes
- Modify: `auth-api/src/app.js` — mount payslips router

**Interfaces:**
- Consumes: `PayrollRun` model, `PayGroup` model, `Payslip` model, `PayrollInput` model, `SalaryStructure` model, `StatutoryConfig` model, `Loan` model, `Reimbursement` model, `InvestmentDeclaration` model, `buildPayslip()`, `computePayrollInput()`
- Produces: Run CRUD: `POST/GET /payroll/runs`, `GET /payroll/runs/:id`, `POST /payroll/runs/:id/compute`, `POST /payroll/runs/:id/lock`, `POST /payroll/runs/:id/reopen`, `POST /payroll/runs/:id/disburse`; Payslip routes: `GET /payslips/:runId`, `GET /payslips/:runId/:userId`, `GET /payslips/me`, `GET /payslips/me/:period`

- [ ] **Step 1: Add run routes to payroll.js**

Append these routes to `auth-api/src/routes/payroll.js` inside `createPayrollRouter()`, after the pay group routes. Add necessary imports at top:

```js
import { PayrollRun } from '../models/PayrollRun.js';
import { PayrollInput } from '../models/PayrollInput.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { StatutoryConfig } from '../models/StatutoryConfig.js';
import { Payslip } from '../models/Payslip.js';
import { Loan } from '../models/Loan.js';
import { Reimbursement } from '../models/Reimbursement.js';
import { InvestmentDeclaration } from '../models/InvestmentDeclaration.js';
import { Holiday } from '../models/Holiday.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Timesheet } from '../models/Timesheet.js';
import { User } from '../models/User.js';
import { computePayrollInput } from '../services/payrollBridge.js';
import { buildPayslip } from '../services/payrollEngine.js';
```

```js
  // --- Runs ---
  router.post('/runs', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { month, year, payGroup, runType, scope, adhocMembers } = req.body;
    const run = await PayrollRun.create({
      period: { month, year },
      payGroup,
      runType: runType || 'regular',
      scope: scope || 'group',
      adhocMembers: adhocMembers || [],
    });
    res.status(201).json(run);
  }));

  router.get('/runs', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.year) filter['period.year'] = Number(req.query.year);
    if (req.query.month) filter['period.month'] = Number(req.query.month);
    const runs = await PayrollRun.find(filter).populate('payGroup', 'name').sort('-createdAt');
    res.json(runs);
  }));

  router.get('/runs/:id', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id).populate('payGroup', 'name');
    if (!run) return res.status(404).json({ error: 'run not found' });
    const inputs = await PayrollInput.find({ payrollRun: run._id }).populate('user', 'displayName email employeeCode');
    const payslips = await Payslip.find({ payrollRun: run._id }).populate('user', 'displayName email employeeCode');
    res.json({ run, inputs, payslips });
  }));

  router.post('/runs/:id/compute', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id).populate('payGroup');
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status === 'LOCKED' || run.status === 'PAID') {
      return res.status(400).json({ error: 'cannot compute a locked/paid run' });
    }

    const { month, year } = run.period;
    const members = run.scope === 'adhoc' ? run.adhocMembers : run.payGroup.members;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const holidays = await Holiday.find({ year, date: { $gte: startDate, $lte: endDate } });
    const config = await StatutoryConfig.findOne({ effectiveFrom: { $lte: startDate } }).sort('-effectiveFrom');
    if (!config) return res.status(400).json({ error: 'no statutory config found' });

    await PayrollInput.deleteMany({ payrollRun: run._id });
    await Payslip.deleteMany({ payrollRun: run._id });

    let totalGross = 0, totalDeductions = 0, totalNet = 0;

    for (const userId of members) {
      const attendances = await Attendance.find({ userId, date: { $gte: startDate, $lte: endDate } });
      const leaves = await Leave.find({ userId, status: 'approved', startDate: { $lte: endDate }, endDate: { $gte: startDate } });
      const timesheets = await Timesheet.find({ userId, weekStart: { $gte: startDate, $lte: endDate } });

      const bridgeData = computePayrollInput({ holidays, attendances, leaves, timesheets, month, year });

      const inputDoc = await PayrollInput.findOneAndUpdate(
        { payrollRun: run._id, user: userId },
        { ...bridgeData, period: { month, year }, computedAt: new Date() },
        { upsert: true, new: true },
      );

      const salary = await SalaryStructure.findOne({ user: userId, effectiveTo: null }).sort('-effectiveFrom');
      if (!salary) continue;

      const declaration = await InvestmentDeclaration.findOne({ user: userId, financialYear: getFY(month, year) });
      const regime = declaration?.regime || 'new';
      const declarations = declaration?.items || [];

      const loans = await Loan.find({ user: userId, status: 'active' });
      const loanEmis = [];
      for (const loan of loans) {
        const emi = loan.schedule?.find(s => s.period.month === month && s.period.year === year && s.status === 'due');
        if (emi) loanEmis.push({ amount: emi.amount, label: 'Loan EMI' });
      }

      const reimbursements = await Reimbursement.find({ user: userId, status: 'approved', payrollRun: null });

      const ptSlabs = config.pt?.find(p => p.state === (run.payGroup.ptState || ''))?.slabs || [];
      const slip = buildPayslip({
        components: salary.components,
        ctcAnnual: salary.ctcAnnual,
        input: bridgeData,
        statutoryConfig: { ...config.toObject(), pt: ptSlabs },
        regime,
        declarations,
        reimbursements,
        loanEmis,
      });

      await Payslip.findOneAndUpdate(
        { payrollRun: run._id, user: userId },
        { ...slip, period: { month, year } },
        { upsert: true, new: true },
      );

      totalGross += slip.gross;
      totalDeductions += slip.totalDeductions;
      totalNet += slip.netPay;
    }

    run.status = 'REVIEW';
    run.totals = { gross: totalGross, deductions: totalDeductions, netPay: totalNet, headcount: members.length };
    await run.save();

    res.json(run);
  }));

  router.post('/runs/:id/lock', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status !== 'REVIEW') return res.status(400).json({ error: 'can only lock a REVIEW run' });

    await PayrollInput.updateMany({ payrollRun: run._id }, { frozen: true });

    const reimbursements = await Payslip.find({ payrollRun: run._id });
    for (const slip of reimbursements) {
      if (slip.reimbursements?.length) {
        await Reimbursement.updateMany(
          { user: slip.user, status: 'approved', payrollRun: null },
          { payrollRun: run._id, status: 'paid' },
        );
      }
    }

    const payslips = await Payslip.find({ payrollRun: run._id });
    for (const slip of payslips) {
      const loans = await Loan.find({ user: slip.user, status: 'active' });
      for (const loan of loans) {
        const emi = loan.schedule?.find(s =>
          s.period.month === run.period.month && s.period.year === run.period.year && s.status === 'due'
        );
        if (emi) {
          emi.status = 'paid';
          await loan.save();
        }
      }
    }

    run.status = 'LOCKED';
    run.lockedAt = new Date();
    run.lockedBy = req.user.sub;
    await run.save();
    res.json(run);
  }));

  router.post('/runs/:id/reopen', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status !== 'LOCKED') return res.status(400).json({ error: 'can only reopen a LOCKED run' });

    await PayrollInput.updateMany({ payrollRun: run._id }, { frozen: false });
    run.status = 'DRAFT';
    run.lockedAt = null;
    run.lockedBy = null;
    await run.save();
    res.json(run);
  }));

  router.post('/runs/:id/disburse', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) return res.status(404).json({ error: 'run not found' });
    if (run.status !== 'LOCKED') return res.status(400).json({ error: 'can only disburse a LOCKED run' });
    run.status = 'PAID';
    await run.save();
    res.json(run);
  }));
```

Add `getFY` helper at the top of the file (outside the router):

```js
function getFY(month, year) {
  const fy = month <= 3 ? year - 1 : year;
  return `FY${fy}-${String(fy + 1).slice(2)}`;
}
```

- [ ] **Step 2: Create payslips router**

```js
// auth-api/src/routes/payslips.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Payslip } from '../models/Payslip.js';

export function createPayslipsRouter() {
  const router = express.Router();

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const slips = await Payslip.find({ user: req.user.sub })
      .sort({ 'period.year': -1, 'period.month': -1 })
      .select('period gross totalDeductions netPay lopDays paidDays');
    res.json(slips);
  }));

  router.get('/me/:year/:month', requireAuth, asyncHandler(async (req, res) => {
    const slip = await Payslip.findOne({
      user: req.user.sub,
      'period.year': Number(req.params.year),
      'period.month': Number(req.params.month),
    });
    if (!slip) return res.status(404).json({ error: 'payslip not found' });
    res.json(slip);
  }));

  router.get('/:runId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const slips = await Payslip.find({ payrollRun: req.params.runId })
      .populate('user', 'displayName email employeeCode');
    res.json(slips);
  }));

  router.get('/:runId/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const slip = await Payslip.findOne({ payrollRun: req.params.runId, user: req.params.userId });
    if (!slip) return res.status(404).json({ error: 'payslip not found' });
    res.json(slip);
  }));

  return router;
}
```

- [ ] **Step 3: Mount payslips router in app.js**

Add import:

```js
import { createPayslipsRouter } from './routes/payslips.js';
```

Add mount:

```js
app.use('/payslips', createPayslipsRouter());
```

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/payroll.js auth-api/src/routes/payslips.js auth-api/src/app.js
git commit -m "feat(payroll): add run CRUD, compute/lock/reopen/disburse actions, payslip routes"
```

---

### Task 7: Reimbursements + Loans — Models and Routes

**Files:**
- Create: `auth-api/src/models/Reimbursement.js`
- Create: `auth-api/src/models/Loan.js`
- Create: `auth-api/src/routes/reimbursements.js`
- Create: `auth-api/src/routes/loans.js`
- Modify: `auth-api/src/app.js` — mount reimbursements + loans routers

**Interfaces:**
- Consumes: `User` model
- Produces: `Reimbursement` model, `Loan` model, `createReimbursementsRouter()`, `createLoansRouter()`

- [ ] **Step 1: Create Reimbursement model**

```js
// auth-api/src/models/Reimbursement.js
import mongoose from 'mongoose';

const ReimbursementSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category:    { type: String, enum: ['travel', 'food', 'internet', 'medical', 'other'], required: true },
  amount:      { type: Number, required: true },
  claimDate:   { type: String, required: true },
  description: { type: String, default: '' },
  attachments: [{ url: String, filename: String }],

  status:    { type: String, enum: ['submitted', 'approved', 'rejected', 'paid'], default: 'submitted', index: true },
  approver:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', default: null },
  taxable:    { type: Boolean, default: false },
}, { timestamps: true });

export const Reimbursement = mongoose.model('Reimbursement', ReimbursementSchema);
```

- [ ] **Step 2: Create Loan model**

```js
// auth-api/src/models/Loan.js
import mongoose from 'mongoose';

const EMIScheduleSchema = new mongoose.Schema({
  period: {
    month: { type: Number, required: true },
    year:  { type: Number, required: true },
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['due', 'paid', 'skipped'], default: 'due' },
}, { _id: false });

const LoanSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  principal:    { type: Number, required: true },
  emiAmount:    { type: Number, required: true },
  tenureMonths: { type: Number, required: true },
  schedule:     [EMIScheduleSchema],
  status:       { type: String, enum: ['active', 'closed', 'paused'], default: 'active' },
}, { timestamps: true });

export const Loan = mongoose.model('Loan', LoanSchema);
```

- [ ] **Step 3: Create reimbursements router**

```js
// auth-api/src/routes/reimbursements.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Reimbursement } from '../models/Reimbursement.js';

export function createReimbursementsRouter() {
  const router = express.Router();

  router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const { category, amount, claimDate, description } = req.body;
    if (!category || !amount || !claimDate) {
      return res.status(400).json({ error: 'category, amount, and claimDate required' });
    }
    const claim = await Reimbursement.create({ user: req.user.sub, category, amount, claimDate, description });
    res.status(201).json(claim);
  }));

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ user: req.user.sub }).sort('-createdAt');
    res.json(claims);
  }));

  router.get('/pending', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claims = await Reimbursement.find({ status: 'submitted' })
      .populate('user', 'displayName email employeeCode')
      .sort('-createdAt');
    res.json(claims);
  }));

  router.post('/:id/approve', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    claim.status = 'approved';
    claim.approver = req.user.sub;
    claim.approvedAt = new Date();
    await claim.save();
    res.json(claim);
  }));

  router.post('/:id/reject', requireAuth, requireRole('reporting_manager', 'admin'), asyncHandler(async (req, res) => {
    const claim = await Reimbursement.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'submitted') return res.status(400).json({ error: 'not in submitted state' });
    if (!req.body.reason) return res.status(400).json({ error: 'rejection reason required' });
    claim.status = 'rejected';
    claim.approver = req.user.sub;
    claim.rejectionReason = req.body.reason;
    await claim.save();
    res.json(claim);
  }));

  return router;
}
```

- [ ] **Step 4: Create loans router**

```js
// auth-api/src/routes/loans.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Loan } from '../models/Loan.js';

export function createLoansRouter() {
  const router = express.Router();

  router.post('/', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { user, principal, emiAmount, tenureMonths, startMonth, startYear } = req.body;
    if (!user || !principal || !emiAmount || !tenureMonths || !startMonth || !startYear) {
      return res.status(400).json({ error: 'user, principal, emiAmount, tenureMonths, startMonth, startYear required' });
    }
    const schedule = [];
    let m = startMonth, y = startYear;
    for (let i = 0; i < tenureMonths; i++) {
      schedule.push({ period: { month: m, year: y }, amount: emiAmount, status: 'due' });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    const loan = await Loan.create({ user, principal, emiAmount, tenureMonths, schedule });
    res.status(201).json(loan);
  }));

  router.get('/:userId', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const loans = await Loan.find({ user: req.params.userId }).sort('-createdAt');
    res.json(loans);
  }));

  return router;
}
```

- [ ] **Step 5: Mount routers in app.js**

Add imports:

```js
import { createReimbursementsRouter } from './routes/reimbursements.js';
import { createLoansRouter } from './routes/loans.js';
```

Add mounts:

```js
app.use('/reimbursements', createReimbursementsRouter());
app.use('/loans', createLoansRouter());
```

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/Reimbursement.js auth-api/src/models/Loan.js auth-api/src/routes/reimbursements.js auth-api/src/routes/loans.js auth-api/src/app.js
git commit -m "feat(payroll): add reimbursement + loan models with approval flow and CRUD routes"
```

---

### Task 8: Investment Declarations — Model and Routes

**Files:**
- Create: `auth-api/src/models/InvestmentDeclaration.js`
- Create: `auth-api/src/routes/declarations.js`
- Modify: `auth-api/src/app.js` — mount declarations router

**Interfaces:**
- Consumes: `User` model
- Produces: `InvestmentDeclaration` model, `createDeclarationsRouter()` function; `GET /declarations/:fy/me`, `POST /declarations/:fy`

- [ ] **Step 1: Create InvestmentDeclaration model**

```js
// auth-api/src/models/InvestmentDeclaration.js
import mongoose from 'mongoose';

const DeclarationItemSchema = new mongoose.Schema({
  section:        { type: String, required: true },
  declaredAmount: { type: Number, required: true },
  proofAmount:    { type: Number, default: null },
  proofs:         [{ url: String, filename: String }],
  verifyStatus:   { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
}, { _id: false });

const InvestmentDeclarationSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  financialYear:  { type: String, required: true },
  regime:         { type: String, enum: ['old', 'new'], required: true },
  items:          [DeclarationItemSchema],
  phase:          { type: String, enum: ['declaration', 'proof', 'closed'], default: 'declaration' },
  lockedForTds:   { type: Boolean, default: false },
}, { timestamps: true });

InvestmentDeclarationSchema.index({ user: 1, financialYear: 1 }, { unique: true });

export const InvestmentDeclaration = mongoose.model('InvestmentDeclaration', InvestmentDeclarationSchema);
```

- [ ] **Step 2: Create declarations router**

```js
// auth-api/src/routes/declarations.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { InvestmentDeclaration } from '../models/InvestmentDeclaration.js';

export function createDeclarationsRouter() {
  const router = express.Router();

  router.get('/:fy/me', requireAuth, asyncHandler(async (req, res) => {
    const dec = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    res.json(dec || null);
  }));

  router.post('/:fy', requireAuth, asyncHandler(async (req, res) => {
    const { regime, items } = req.body;
    if (!regime || !items) return res.status(400).json({ error: 'regime and items required' });

    const existing = await InvestmentDeclaration.findOne({ user: req.user.sub, financialYear: req.params.fy });
    if (existing) {
      if (existing.lockedForTds) return res.status(400).json({ error: 'declaration locked for TDS' });
      existing.regime = regime;
      existing.items = items;
      await existing.save();
      return res.json(existing);
    }

    const dec = await InvestmentDeclaration.create({
      user: req.user.sub,
      financialYear: req.params.fy,
      regime,
      items,
    });
    res.status(201).json(dec);
  }));

  return router;
}
```

- [ ] **Step 3: Mount declarations router in app.js**

Add import:

```js
import { createDeclarationsRouter } from './routes/declarations.js';
```

Add mount:

```js
app.use('/declarations', createDeclarationsRouter());
```

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/models/InvestmentDeclaration.js auth-api/src/routes/declarations.js auth-api/src/app.js
git commit -m "feat(payroll): add investment declaration model + self-service routes"
```

---

### Task 9: Statutory Reports — Model and Route

**Files:**
- Create: `auth-api/src/models/StatutoryReport.js`
- Modify: `auth-api/src/routes/payroll.js` — add statutory report endpoint

**Interfaces:**
- Consumes: `Payslip` model, `PayrollRun` model
- Produces: `StatutoryReport` model; `GET /payroll/reports/:type`

- [ ] **Step 1: Create StatutoryReport model**

```js
// auth-api/src/models/StatutoryReport.js
import mongoose from 'mongoose';

const StatutoryReportSchema = new mongoose.Schema({
  type:    { type: String, enum: ['ecr', 'esic', 'pt', '24q', 'form16', 'tax_summary'], required: true },
  period:  {
    month:   { type: Number, default: null },
    year:    { type: Number, default: null },
    quarter: { type: Number, default: null },
    fy:      { type: String, default: '' },
  },
  payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', default: null },
  computedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  fileUrl: { type: String, default: '' },
  status:  { type: String, enum: ['computed', 'filed'], default: 'computed' },
}, { timestamps: true });

export const StatutoryReport = mongoose.model('StatutoryReport', StatutoryReportSchema);
```

- [ ] **Step 2: Add report route to payroll.js**

Add import at top:

```js
import { StatutoryReport } from '../models/StatutoryReport.js';
```

Add route inside `createPayrollRouter()`:

```js
  router.get('/reports/:type', requireAuth, requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const { type } = req.params;
    const filter = { type };
    if (req.query.month) filter['period.month'] = Number(req.query.month);
    if (req.query.year) filter['period.year'] = Number(req.query.year);
    if (req.query.fy) filter['period.fy'] = req.query.fy;
    const reports = await StatutoryReport.find(filter).sort('-createdAt');
    res.json(reports);
  }));
```

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/StatutoryReport.js auth-api/src/routes/payroll.js
git commit -m "feat(payroll): add statutory report model + retrieval endpoint (compute stubs)"
```

---

### Task 10: Seed Data — Statutory Config, Pay Grades, Pay Groups, Salary Structures

**Files:**
- Modify: `auth-api/scripts/seed-all.js` — add payroll seed data

**Interfaces:**
- Consumes: All payroll models, existing user data from seed
- Produces: Seeded statutory config, 4 pay grades, 1 pay group, salary structures for all employees

- [ ] **Step 1: Add payroll imports to seed-all.js**

Add these imports at the top of `auth-api/scripts/seed-all.js`:

```js
import { StatutoryConfig } from '../src/models/StatutoryConfig.js';
import { PayGrade } from '../src/models/PayGrade.js';
import { PayGroup } from '../src/models/PayGroup.js';
import { SalaryStructure } from '../src/models/SalaryStructure.js';
import { InvestmentDeclaration } from '../src/models/InvestmentDeclaration.js';
```

- [ ] **Step 2: Add statutory config seed**

After the existing seed logic (after timesheets are created), add:

```js
  // ─── Payroll seed data ───────────────────────────────────────────────
  await StatutoryConfig.deleteMany({});
  await StatutoryConfig.create({
    effectiveFrom: '2026-04-01',
    pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 },
    esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 },
    pt: [
      { state: 'Telangana', slabs: [
        { upTo: 15000, amount: 0 },
        { upTo: 20000, amount: 150 },
        { upTo: Infinity, amount: 200 },
      ]},
      { state: 'Karnataka', slabs: [
        { upTo: 15000, amount: 0 },
        { upTo: 25000, amount: 200 },
        { upTo: Infinity, amount: 200 },
      ]},
    ],
    tds: {
      old: {
        slabs: [
          { upTo: 250000, rate: 0 },
          { upTo: 500000, rate: 5 },
          { upTo: 1000000, rate: 20 },
          { upTo: Infinity, rate: 30 },
        ],
        standardDeduction: 50000,
      },
      new: {
        slabs: [
          { upTo: 400000, rate: 0 },
          { upTo: 800000, rate: 5 },
          { upTo: 1200000, rate: 10 },
          { upTo: 1600000, rate: 15 },
          { upTo: 2000000, rate: 20 },
          { upTo: 2400000, rate: 25 },
          { upTo: Infinity, rate: 30 },
        ],
        standardDeduction: 75000,
      },
    },
  });
  console.log('  ✓ statutory config seeded');
```

- [ ] **Step 3: Add pay grades seed**

```js
  await PayGrade.deleteMany({});
  const grades = await PayGrade.insertMany([
    { code: 'G1', label: 'Junior', minCtc: 300000, maxCtc: 600000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 180000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 60000, taxable: true, proratable: true },
    ]},
    { code: 'G2', label: 'Mid-Level', minCtc: 600000, maxCtc: 1200000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 420000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 120000, taxable: true, proratable: true },
    ]},
    { code: 'G3', label: 'Senior', minCtc: 1200000, maxCtc: 2400000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 720000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 240000, taxable: true, proratable: true },
      { key: 'lta', label: 'LTA', type: 'earning', calc: 'fixed', value: 60000, taxable: true, proratable: false },
    ]},
    { code: 'G4', label: 'Lead / Manager', minCtc: 2400000, maxCtc: 5000000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 1200000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 480000, taxable: true, proratable: true },
      { key: 'lta', label: 'LTA', type: 'earning', calc: 'fixed', value: 120000, taxable: true, proratable: false },
    ]},
  ]);
  console.log('  ✓ pay grades seeded');
```

- [ ] **Step 4: Add pay group seed + user assignments**

```js
  await PayGroup.deleteMany({});
  const legalEntity = await LegalEntity.findOne();
  const payGroup = await PayGroup.create({
    name: 'India - Monthly - HYD',
    entity: legalEntity?._id || null,
    cycle: 'calendar',
    ptState: 'Telangana',
    members: allUsers.map(u => u._id),
  });
  console.log('  ✓ pay group seeded');

  // Assign pay grades to users by role
  const gradeMap = { employee: grades[0], pm: grades[1], reporting_manager: grades[2], admin: grades[3] };
  for (const u of allUsers) {
    const role = u.roles?.[0] || 'employee';
    const grade = gradeMap[role] || grades[0];
    await User.updateOne({ _id: u._id }, { payGrade: grade._id, payGroup: payGroup._id });
  }
  console.log('  ✓ user pay assignments updated');
```

- [ ] **Step 5: Add salary structures for all users**

```js
  await SalaryStructure.deleteMany({});
  const ctcByGrade = { G1: 500000, G2: 900000, G3: 1800000, G4: 3600000 };
  for (const u of allUsers) {
    const role = u.roles?.[0] || 'employee';
    const grade = gradeMap[role] || grades[0];
    const ctc = ctcByGrade[grade.code] || 500000;
    const components = grade.defaultComponents.map(c => {
      const scaled = { ...c.toObject ? c.toObject() : c };
      if (scaled.calc === 'fixed') {
        scaled.value = Math.round(ctc * (scaled.value / (grade.minCtc + grade.maxCtc) * 2));
      }
      return scaled;
    });
    await SalaryStructure.create({
      user: u._id,
      ctcAnnual: ctc,
      components: grade.defaultComponents,
      effectiveFrom: '2026-01-01',
    });
  }
  console.log('  ✓ salary structures seeded');
```

- [ ] **Step 6: Commit**

```bash
git add auth-api/scripts/seed-all.js
git commit -m "feat(payroll): seed statutory config, pay grades, pay group, salary structures"
```

---

### Task 11: Frontend — Nav + Routing Setup

**Files:**
- Modify: `web/src/pm/nav.ts` — add payroll NavKey entries
- Modify: `web/src/AppShell.tsx` — add payroll routes

**Interfaces:**
- Consumes: Existing nav and routing system
- Produces: Nav items for `payroll` (admin/finance), `my-payslips` (all employees), `reimbursements` (all employees); Routes for all payroll pages

- [ ] **Step 1: Update nav.ts**

Add to `NavKey` type:

```ts
export type NavKey = 'home' | 'users' | 'skills' | 'departments' | 'shifts' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'my-team' | 'team-attendance' | 'organisation' | 'profile' | 'payroll' | 'my-payslips' | 'reimbursements';
```

Add to `ALL_NAV_KEYS`:

```ts
const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'utilization', 'my-team', 'team-attendance', 'organisation', 'profile', 'payroll', 'my-payslips', 'reimbursements'];
```

Add `payroll` nav item to `admin` role's return array (before `timesheet`):

```ts
{ key: 'payroll', label: 'Payroll', path: '/payroll' },
```

Add `payroll` to `finance` role's return array.

Add `my-payslips` and `reimbursements` to the default employee return array:

```ts
{ key: 'my-payslips', label: 'My Payslips', path: '/my-payslips' },
{ key: 'reimbursements', label: 'Reimbursements', path: '/reimbursements' },
```

Add to `NAV_ICONS` in `AppShell.tsx`:

```tsx
payroll: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
'my-payslips': <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
reimbursements: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
```

- [ ] **Step 2: Add routes to AppShell.tsx**

Add imports:

```tsx
import { PayrollRunList } from './payroll/PayrollRunList';
import { PayrollRunDetail } from './payroll/PayrollRunDetail';
import { SalaryEditor } from './payroll/SalaryEditor';
import { MyPayslips } from './payroll/MyPayslips';
import { Declarations } from './payroll/Declarations';
import { TaxSummary } from './payroll/TaxSummary';
import { Reimbursements } from './payroll/Reimbursements';
import { ReimbursementApprovals } from './payroll/ReimbursementApprovals';
```

Add `<Route>` elements:

```tsx
<Route path="/payroll" element={<PayrollRunList />} />
<Route path="/payroll/run/:id" element={<PayrollRunDetail />} />
<Route path="/payroll/salary/:userId" element={<SalaryEditor />} />
<Route path="/my-payslips" element={<MyPayslips />} />
<Route path="/my-payslips/:year/:month" element={<MyPayslips />} />
<Route path="/declarations" element={<Declarations />} />
<Route path="/tax-summary" element={<TaxSummary />} />
<Route path="/reimbursements" element={<Reimbursements />} />
<Route path="/reimbursement-approvals" element={<ReimbursementApprovals />} />
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/nav.ts web/src/AppShell.tsx
git commit -m "feat(payroll): add nav items and route declarations for payroll pages"
```

---

### Task 12: Frontend — Payroll Run List Page

**Files:**
- Create: `web/src/payroll/PayrollRunList.tsx`
- Create: `web/src/payroll/PayrollRunList.css`

**Interfaces:**
- Consumes: `authed('/payroll/runs')`, `authed('/payroll/groups')`, `authed('/payroll/runs', 'POST', body)`
- Produces: Page listing runs with status pills, "New Run" dialog

- [ ] **Step 1: Create PayrollRunList.css**

```css
/* web/src/payroll/PayrollRunList.css */
.pr-page { padding: 28px 32px; }
.pr-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.pr-title { font-size: 20px; font-weight: 700; color: var(--text); }
.pr-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 20px; font-size: 13px; font-weight: 600; color: var(--on-primary); background: var(--primary); border: none; border-radius: 6px; cursor: pointer; }
.pr-btn:hover { background: var(--primary-hover); }

.pr-table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.pr-table th { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); background: var(--surface); }
.pr-table td { font-size: 13px; color: var(--text); padding: 12px 16px; border-bottom: 1px solid var(--border); }
.pr-table tr:last-child td { border-bottom: none; }
.pr-table tr:hover td { background: var(--surface); }

.pr-status { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.pr-status.DRAFT { background: rgba(234,179,8,0.12); color: #b45309; }
.pr-status.REVIEW { background: rgba(59,130,246,0.12); color: #1d4ed8; }
.pr-status.LOCKED { background: rgba(168,85,247,0.12); color: #7c3aed; }
.pr-status.PAID { background: rgba(34,197,94,0.12); color: #15803d; }

.pr-link { color: var(--primary); text-decoration: none; font-weight: 500; cursor: pointer; }
.pr-link:hover { text-decoration: underline; }

.pr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.pr-modal { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px 28px; width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); }
.pr-modal h3 { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 16px; }
.pr-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.pr-form-label { font-size: 12px; font-weight: 600; color: var(--muted); }
.pr-select, .pr-input { padding: 9px 12px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); }
.pr-modal-actions { display: flex; gap: 10px; margin-top: 8px; }
.pr-btn-cancel { padding: 9px 20px; font-size: 13px; color: var(--muted); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }

.pr-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }
```

- [ ] **Step 2: Create PayrollRunList.tsx**

```tsx
// web/src/payroll/PayrollRunList.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './PayrollRunList.css';

interface PayrollRun {
  _id: string;
  period: { month: number; year: number };
  payGroup: { _id: string; name: string } | null;
  status: string;
  runType: string;
  totals: { gross: number; deductions: number; netPay: number; headcount: number };
}

interface PayGroup {
  _id: string;
  name: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function PayrollRunList() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [groups, setGroups] = useState<PayGroup[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([authed('/payroll/runs'), authed('/payroll/groups')]).then(([r, g]) => {
      setRuns(r);
      setGroups(g);
      if (g.length && !groupId) setGroupId(g[0]._id);
      setLoading(false);
    });
  }, []);

  async function createRun() {
    const run = await authed('/payroll/runs', 'POST', { month, year, payGroup: groupId });
    setRuns(prev => [run, ...prev]);
    setShowModal(false);
    navigate(`/payroll/run/${run._id}`);
  }

  if (loading) return <div className="pr-page"><div className="pr-empty">Loading...</div></div>;

  return (
    <div className="pr-page">
      <div className="pr-header">
        <h1 className="pr-title">Payroll Runs</h1>
        <button className="pr-btn" onClick={() => setShowModal(true)}>+ New Run</button>
      </div>

      {runs.length === 0 ? (
        <div className="pr-empty">No payroll runs yet. Create one to get started.</div>
      ) : (
        <table className="pr-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Pay Group</th>
              <th>Type</th>
              <th>Status</th>
              <th>Headcount</th>
              <th>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run._id}>
                <td><span className="pr-link" onClick={() => navigate(`/payroll/run/${run._id}`)}>{MONTHS[run.period.month - 1]} {run.period.year}</span></td>
                <td>{run.payGroup?.name || '—'}</td>
                <td>{run.runType}</td>
                <td><span className={`pr-status ${run.status}`}>{run.status}</span></td>
                <td>{run.totals?.headcount || 0}</td>
                <td>{formatCurrency(run.totals?.netPay || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="pr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pr-modal" onClick={e => e.stopPropagation()}>
            <h3>New Payroll Run</h3>
            <div className="pr-form-group">
              <label className="pr-form-label">Month</label>
              <select className="pr-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="pr-form-group">
              <label className="pr-form-label">Year</label>
              <input className="pr-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
            <div className="pr-form-group">
              <label className="pr-form-label">Pay Group</label>
              <select className="pr-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
                {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
              </select>
            </div>
            <div className="pr-modal-actions">
              <button className="pr-btn" onClick={createRun}>Create</button>
              <button className="pr-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/payroll/PayrollRunList.tsx web/src/payroll/PayrollRunList.css
git commit -m "feat(payroll): add payroll run list page with create dialog"
```

---

### Task 13: Frontend — Payroll Run Detail Page

**Files:**
- Create: `web/src/payroll/PayrollRunDetail.tsx`
- Create: `web/src/payroll/PayrollRunDetail.css`

**Interfaces:**
- Consumes: `authed('/payroll/runs/:id')`, `authed('/payroll/runs/:id/compute', 'POST')`, `authed('/payroll/runs/:id/lock', 'POST')`, `authed('/payroll/runs/:id/reopen', 'POST')`, `authed('/payroll/runs/:id/disburse', 'POST')`
- Produces: Run review screen with employee grid, totals header, action buttons

- [ ] **Step 1: Create PayrollRunDetail.css**

```css
/* web/src/payroll/PayrollRunDetail.css */
.prd-page { padding: 28px 32px; }
.prd-back { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted); cursor: pointer; margin-bottom: 16px; background: none; border: none; }
.prd-back:hover { color: var(--primary); }
.prd-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.prd-title { font-size: 20px; font-weight: 700; color: var(--text); }
.prd-actions { display: flex; gap: 10px; }

.prd-totals { display: flex; gap: 16px; margin-bottom: 20px; }
.prd-tile { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; box-shadow: var(--shadow); }
.prd-tile-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.prd-tile-value { font-size: 22px; font-weight: 700; color: var(--text); margin-top: 4px; }

.prd-table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.prd-table th { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); background: var(--surface); }
.prd-table td { font-size: 13px; color: var(--text); padding: 10px 14px; border-bottom: 1px solid var(--border); }
.prd-table tr:last-child td { border-bottom: none; }
.prd-table td.num { text-align: right; font-variant-numeric: tabular-nums; }

.prd-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }
.prd-computing { text-align: center; color: var(--muted); padding: 20px; font-size: 13px; }
```

- [ ] **Step 2: Create PayrollRunDetail.tsx**

```tsx
// web/src/payroll/PayrollRunDetail.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './PayrollRunDetail.css';

interface Payslip {
  _id: string;
  user: { _id: string; displayName: string; email: string; employeeCode: string };
  gross: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
}

interface RunData {
  run: {
    _id: string;
    period: { month: number; year: number };
    status: string;
    runType: string;
    payGroup: { name: string };
    totals: { gross: number; deductions: number; netPay: number; headcount: number };
  };
  payslips: Payslip[];
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

  async function load() {
    setLoading(true);
    const d = await authed(`/payroll/runs/${id}`);
    setData(d);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function compute() {
    setComputing(true);
    await authed(`/payroll/runs/${id}/compute`, 'POST');
    await load();
    setComputing(false);
  }

  async function lock() {
    await authed(`/payroll/runs/${id}/lock`, 'POST');
    await load();
  }

  async function reopen() {
    await authed(`/payroll/runs/${id}/reopen`, 'POST');
    await load();
  }

  async function disburse() {
    await authed(`/payroll/runs/${id}/disburse`, 'POST');
    await load();
  }

  if (loading || !data) return <div className="prd-page"><div className="prd-empty">Loading...</div></div>;

  const { run, payslips } = data;

  return (
    <div className="prd-page">
      <button className="prd-back" onClick={() => navigate('/payroll')}>← Back to Runs</button>

      <div className="prd-header">
        <div>
          <h1 className="prd-title">{MONTHS[run.period.month - 1]} {run.period.year} — {run.payGroup?.name}</h1>
          <span className={`pr-status ${run.status}`}>{run.status}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{run.runType}</span>
        </div>
        <div className="prd-actions">
          {(run.status === 'DRAFT' || run.status === 'REVIEW') && (
            <button className="pr-btn" onClick={compute} disabled={computing}>
              {computing ? 'Computing...' : 'Compute'}
            </button>
          )}
          {run.status === 'REVIEW' && <button className="pr-btn" onClick={lock}>Lock</button>}
          {run.status === 'LOCKED' && (
            <>
              <button className="pr-btn" onClick={disburse}>Mark Paid</button>
              <button className="pr-btn-cancel" onClick={reopen}>Reopen</button>
            </>
          )}
        </div>
      </div>

      <div className="prd-totals">
        <div className="prd-tile"><div className="prd-tile-label">Gross</div><div className="prd-tile-value">{fmt(run.totals.gross)}</div></div>
        <div className="prd-tile"><div className="prd-tile-label">Deductions</div><div className="prd-tile-value">{fmt(run.totals.deductions)}</div></div>
        <div className="prd-tile"><div className="prd-tile-label">Net Pay</div><div className="prd-tile-value">{fmt(run.totals.netPay)}</div></div>
        <div className="prd-tile"><div className="prd-tile-label">Headcount</div><div className="prd-tile-value">{run.totals.headcount}</div></div>
      </div>

      {computing && <div className="prd-computing">Computing payroll...</div>}

      {payslips.length === 0 ? (
        <div className="prd-empty">No payslips generated yet. Click "Compute" to run the pipeline.</div>
      ) : (
        <table className="prd-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Code</th>
              <th>Paid Days</th>
              <th>LOP</th>
              <th style={{ textAlign: 'right' }}>Gross</th>
              <th style={{ textAlign: 'right' }}>Deductions</th>
              <th style={{ textAlign: 'right' }}>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {payslips.map(slip => (
              <tr key={slip._id}>
                <td>{slip.user?.displayName || '—'}</td>
                <td>{slip.user?.employeeCode || '—'}</td>
                <td>{slip.paidDays}</td>
                <td>{slip.lopDays}</td>
                <td className="num">{fmt(slip.gross)}</td>
                <td className="num">{fmt(slip.totalDeductions)}</td>
                <td className="num">{fmt(slip.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/payroll/PayrollRunDetail.tsx web/src/payroll/PayrollRunDetail.css
git commit -m "feat(payroll): add run detail page with employee grid and action buttons"
```

---

### Task 14: Frontend — Salary Structure Editor

**Files:**
- Create: `web/src/payroll/SalaryEditor.tsx`
- Create: `web/src/payroll/SalaryEditor.css`

**Interfaces:**
- Consumes: `authed('/salary/:userId')`, `authed('/salary/:userId/template')`, `authed('/salary/:userId', 'POST', body)`
- Produces: Component rows editor with live CTC reconciliation

- [ ] **Step 1: Create SalaryEditor.css**

```css
/* web/src/payroll/SalaryEditor.css */
.se-page { padding: 28px 32px; max-width: 800px; }
.se-title { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
.se-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 28px; box-shadow: var(--shadow); margin-bottom: 16px; }
.se-card-title { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }

.se-row { display: grid; grid-template-columns: 2fr 1.5fr 1.5fr 1fr 40px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--surface); }
.se-row:last-child { border-bottom: none; }
.se-row-header { font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; }

.se-input { padding: 8px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); width: 100%; }
.se-select { padding: 8px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); width: 100%; }
.se-remove { background: none; border: none; color: var(--danger, #ef4444); cursor: pointer; font-size: 16px; }

.se-add-btn { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; font-size: 12px; font-weight: 500; color: var(--primary); background: var(--primary-soft); border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; }

.se-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; }
.se-total { font-size: 15px; font-weight: 700; color: var(--text); }
.se-total-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
```

- [ ] **Step 2: Create SalaryEditor.tsx**

```tsx
// web/src/payroll/SalaryEditor.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './SalaryEditor.css';

interface Component {
  key: string;
  label: string;
  type: 'earning' | 'deduction';
  calc: 'fixed' | 'percent_of_basic' | 'percent_of_ctc';
  value: number;
  taxable: boolean;
  proratable: boolean;
}

export function SalaryEditor() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [ctcAnnual, setCtcAnnual] = useState(0);
  const [components, setComponents] = useState<Component[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed(`/salary/${userId}`).then(data => {
      if (data) {
        setCtcAnnual(data.ctcAnnual);
        setComponents(data.components);
        setEffectiveFrom(data.effectiveFrom);
      } else {
        authed(`/salary/${userId}/template`).then(tmpl => {
          if (tmpl?.components?.length) setComponents(tmpl.components);
        });
      }
      setLoaded(true);
    });
  }, [userId]);

  function updateComp(idx: number, field: string, val: unknown) {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));
  }

  function removeComp(idx: number) {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  }

  function addComp() {
    setComponents(prev => [...prev, { key: '', label: '', type: 'earning', calc: 'fixed', value: 0, taxable: true, proratable: true }]);
  }

  async function save() {
    setSaving(true);
    await authed(`/salary/${userId}`, 'POST', { ctcAnnual, components, effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10) });
    setSaving(false);
    navigate(-1);
  }

  const basicComp = components.find(c => c.key === 'basic');
  const annualBasic = basicComp?.calc === 'fixed' ? basicComp.value : 0;

  function monthlyVal(c: Component) {
    if (c.calc === 'fixed') return c.value / 12;
    if (c.calc === 'percent_of_basic') return (c.value / 100) * (annualBasic / 12);
    if (c.calc === 'percent_of_ctc') return (c.value / 100) * (ctcAnnual / 12);
    return 0;
  }

  const totalMonthly = components.filter(c => c.type === 'earning').reduce((s, c) => s + monthlyVal(c), 0);
  const totalAnnual = totalMonthly * 12;

  if (!loaded) return <div className="se-page">Loading...</div>;

  return (
    <div className="se-page">
      <button className="prd-back" onClick={() => navigate(-1)}>← Back</button>
      <h1 className="se-title">Salary Structure</h1>

      <div className="se-card">
        <div className="se-card-title">Annual CTC</div>
        <input className="se-input" type="number" value={ctcAnnual} onChange={e => setCtcAnnual(Number(e.target.value))} style={{ maxWidth: 200 }} />
        <div style={{ marginTop: 10 }}>
          <label className="se-card-title" style={{ marginBottom: 4, display: 'block' }}>Effective From</label>
          <input className="se-input" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
      </div>

      <div className="se-card">
        <div className="se-card-title">Components</div>
        <div className="se-row se-row-header">
          <span>Label</span><span>Calc</span><span>Value</span><span>Monthly</span><span></span>
        </div>
        {components.map((c, i) => (
          <div key={i} className="se-row">
            <input className="se-input" value={c.label} onChange={e => updateComp(i, 'label', e.target.value)} placeholder="Component name" />
            <select className="se-select" value={c.calc} onChange={e => updateComp(i, 'calc', e.target.value)}>
              <option value="fixed">Fixed (Annual)</option>
              <option value="percent_of_basic">% of Basic</option>
              <option value="percent_of_ctc">% of CTC</option>
            </select>
            <input className="se-input" type="number" value={c.value} onChange={e => updateComp(i, 'value', Number(e.target.value))} />
            <span style={{ fontSize: 13, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(monthlyVal(c))}
            </span>
            <button className="se-remove" onClick={() => removeComp(i)}>×</button>
          </div>
        ))}
        <button className="se-add-btn" onClick={addComp}>+ Add Component</button>
      </div>

      <div className="se-footer">
        <div>
          <div className="se-total">Monthly: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalMonthly)}</div>
          <div className="se-total-sub">Annual: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalAnnual)} (CTC: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(ctcAnnual)})</div>
        </div>
        <button className="pr-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Revision'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/payroll/SalaryEditor.tsx web/src/payroll/SalaryEditor.css
git commit -m "feat(payroll): add salary structure editor with live CTC reconciliation"
```

---

### Task 15: Frontend — Employee Self-Service (Payslips + Declarations + Tax Summary)

**Files:**
- Create: `web/src/payroll/MyPayslips.tsx`
- Create: `web/src/payroll/MyPayslips.css`
- Create: `web/src/payroll/Declarations.tsx`
- Create: `web/src/payroll/Declarations.css`
- Create: `web/src/payroll/TaxSummary.tsx`
- Create: `web/src/payroll/TaxSummary.css`

**Interfaces:**
- Consumes: `authed('/payslips/me')`, `authed('/payslips/me/:year/:month')`, `authed('/declarations/:fy/me')`, `authed('/declarations/:fy', 'POST', body)`
- Produces: Employee-facing payslip list/detail, declaration form, tax summary

- [ ] **Step 1: Create MyPayslips.css**

```css
/* web/src/payroll/MyPayslips.css */
.mp-page { padding: 28px 32px; }
.mp-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; }

.mp-list { display: flex; flex-direction: column; gap: 8px; }
.mp-item { display: flex; align-items: center; justify-content: space-between; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; cursor: pointer; transition: box-shadow 0.12s; box-shadow: var(--shadow); }
.mp-item:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
.mp-period { font-size: 14px; font-weight: 600; color: var(--text); }
.mp-net { font-size: 16px; font-weight: 700; color: var(--primary); }
.mp-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }

.mp-detail { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px 28px; box-shadow: var(--shadow); }
.mp-section { margin-bottom: 20px; }
.mp-section-title { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.mp-line { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.mp-line-label { color: var(--text); }
.mp-line-amount { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.mp-total-line { display: flex; justify-content: space-between; padding: 10px 0; font-size: 15px; font-weight: 700; border-top: 2px solid var(--border); margin-top: 8px; }

.mp-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }
```

- [ ] **Step 2: Create MyPayslips.tsx**

```tsx
// web/src/payroll/MyPayslips.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './MyPayslips.css';

interface PayslipSummary {
  _id: string;
  period: { month: number; year: number };
  gross: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  paidDays: number;
}

interface PayslipDetail extends PayslipSummary {
  earnings: { key: string; label: string; amount: number }[];
  deductions: { key: string; label: string; amount: number }[];
  reimbursements: { key: string; label: string; amount: number }[];
  statutory: { pf: number; esic: number; pt: number; tds: number };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function MyPayslips() {
  const { year, month } = useParams<{ year?: string; month?: string }>();
  const [slips, setSlips] = useState<PayslipSummary[]>([]);
  const [detail, setDetail] = useState<PayslipDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (year && month) {
      authed(`/payslips/me/${year}/${month}`).then(d => { setDetail(d); setLoading(false); });
    } else {
      authed('/payslips/me').then(d => { setSlips(d); setLoading(false); });
    }
  }, [year, month]);

  if (loading) return <div className="mp-page"><div className="mp-empty">Loading...</div></div>;

  if (detail) {
    return (
      <div className="mp-page">
        <h1 className="mp-title">Payslip — {MONTHS[detail.period.month - 1]} {detail.period.year}</h1>
        <div className="mp-detail">
          <div className="mp-section">
            <div className="mp-section-title">Earnings</div>
            {detail.earnings.map(e => (
              <div key={e.key} className="mp-line"><span className="mp-line-label">{e.label}</span><span className="mp-line-amount">{fmt(e.amount)}</span></div>
            ))}
          </div>
          {detail.reimbursements.length > 0 && (
            <div className="mp-section">
              <div className="mp-section-title">Reimbursements</div>
              {detail.reimbursements.map(r => (
                <div key={r.key} className="mp-line"><span className="mp-line-label">{r.label}</span><span className="mp-line-amount">{fmt(r.amount)}</span></div>
              ))}
            </div>
          )}
          <div className="mp-section">
            <div className="mp-section-title">Deductions</div>
            {detail.statutory.pf > 0 && <div className="mp-line"><span className="mp-line-label">PF (Employee)</span><span className="mp-line-amount">{fmt(detail.statutory.pf)}</span></div>}
            {detail.statutory.esic > 0 && <div className="mp-line"><span className="mp-line-label">ESIC</span><span className="mp-line-amount">{fmt(detail.statutory.esic)}</span></div>}
            {detail.statutory.pt > 0 && <div className="mp-line"><span className="mp-line-label">Professional Tax</span><span className="mp-line-amount">{fmt(detail.statutory.pt)}</span></div>}
            {detail.statutory.tds > 0 && <div className="mp-line"><span className="mp-line-label">TDS</span><span className="mp-line-amount">{fmt(detail.statutory.tds)}</span></div>}
            {detail.deductions.map(d => (
              <div key={d.key} className="mp-line"><span className="mp-line-label">{d.label}</span><span className="mp-line-amount">{fmt(d.amount)}</span></div>
            ))}
          </div>
          <div className="mp-total-line"><span>Gross</span><span>{fmt(detail.gross)}</span></div>
          <div className="mp-total-line"><span>Total Deductions</span><span>{fmt(detail.totalDeductions)}</span></div>
          <div className="mp-total-line" style={{ color: 'var(--primary)' }}><span>Net Pay</span><span>{fmt(detail.netPay)}</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Paid Days: {detail.paidDays} · LOP: {detail.lopDays}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page">
      <h1 className="mp-title">My Payslips</h1>
      {slips.length === 0 ? (
        <div className="mp-empty">No payslips found.</div>
      ) : (
        <div className="mp-list">
          {slips.map(s => (
            <a key={s._id} className="mp-item" href={`/my-payslips/${s.period.year}/${s.period.month}`}>
              <div>
                <div className="mp-period">{MONTHS[s.period.month - 1]} {s.period.year}</div>
                <div className="mp-meta">Paid Days: {s.paidDays} · LOP: {s.lopDays}</div>
              </div>
              <div className="mp-net">{fmt(s.netPay)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create Declarations.css**

```css
/* web/src/payroll/Declarations.css */
.dec-page { padding: 28px 32px; max-width: 700px; }
.dec-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
.dec-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 28px; box-shadow: var(--shadow); margin-bottom: 16px; }
.dec-regime { display: flex; gap: 10px; margin-bottom: 16px; }
.dec-regime-btn { padding: 8px 20px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--surface); color: var(--muted); }
.dec-regime-btn.active { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
.dec-item { display: grid; grid-template-columns: 1.5fr 1fr 40px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--surface); }
.dec-item:last-child { border-bottom: none; }
.dec-add { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; font-size: 12px; color: var(--primary); background: var(--primary-soft); border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; }
.dec-actions { display: flex; gap: 10px; margin-top: 16px; }
.dec-info { font-size: 12px; color: var(--muted); margin-top: 8px; }
```

- [ ] **Step 4: Create Declarations.tsx**

```tsx
// web/src/payroll/Declarations.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './Declarations.css';

interface Item { section: string; declaredAmount: number; }

const SECTIONS = ['80C', '80D', '80E', '80G', 'HRA', '24B', '80CCD(1B)', '80TTA'];

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

export function Declarations() {
  const fy = currentFY();
  const [regime, setRegime] = useState<'old' | 'new'>('new');
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed(`/declarations/${fy}/me`).then(d => {
      if (d) {
        setRegime(d.regime);
        setItems(d.items.map((i: Item) => ({ section: i.section, declaredAmount: i.declaredAmount })));
      }
      setLoaded(true);
    });
  }, []);

  function updateItem(idx: number, field: string, val: unknown) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  function addItem() { setItems(prev => [...prev, { section: '80C', declaredAmount: 0 }]); }

  async function save() {
    setSaving(true);
    await authed(`/declarations/${fy}`, 'POST', { regime, items });
    setSaving(false);
  }

  if (!loaded) return <div className="dec-page">Loading...</div>;

  return (
    <div className="dec-page">
      <h1 className="dec-title">Investment Declaration — {fy}</h1>
      <div className="dec-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Tax Regime</div>
        <div className="dec-regime">
          <button className={`dec-regime-btn ${regime === 'new' ? 'active' : ''}`} onClick={() => setRegime('new')}>New Regime</button>
          <button className={`dec-regime-btn ${regime === 'old' ? 'active' : ''}`} onClick={() => setRegime('old')}>Old Regime</button>
        </div>
        {regime === 'new' && <div className="dec-info">Under new regime, no deductions apply. Your declarations are recorded but won't reduce TDS.</div>}
      </div>

      <div className="dec-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Declarations</div>
        {items.map((item, i) => (
          <div key={i} className="dec-item">
            <select className="se-select" value={item.section} onChange={e => updateItem(i, 'section', e.target.value)}>
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="se-input" type="number" value={item.declaredAmount} onChange={e => updateItem(i, 'declaredAmount', Number(e.target.value))} placeholder="Amount" />
            <button className="se-remove" onClick={() => removeItem(i)}>×</button>
          </div>
        ))}
        <button className="dec-add" onClick={addItem}>+ Add Declaration</button>
      </div>

      <div className="dec-actions">
        <button className="pr-btn" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Declaration'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create TaxSummary.css**

```css
/* web/src/payroll/TaxSummary.css */
.ts-page { padding: 28px 32px; max-width: 600px; }
.ts-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
.ts-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 28px; box-shadow: var(--shadow); margin-bottom: 16px; }
.ts-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid var(--surface); }
.ts-row:last-child { border-bottom: none; }
.ts-row-label { color: var(--text); }
.ts-row-value { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.ts-highlight { font-size: 15px; font-weight: 700; color: var(--primary); padding: 12px 0; border-top: 2px solid var(--border); margin-top: 8px; }
```

- [ ] **Step 6: Create TaxSummary.tsx**

```tsx
// web/src/payroll/TaxSummary.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './TaxSummary.css';

function currentFY() {
  const now = new Date();
  const y = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `FY${y}-${String(y + 1).slice(2)}`;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function TaxSummary() {
  const fy = currentFY();
  const [slips, setSlips] = useState<{ gross: number; statutory: { pf: number; esic: number; pt: number; tds: number } }[]>([]);
  const [declaration, setDeclaration] = useState<{ regime: string; items: { section: string; declaredAmount: number }[] } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      authed('/payslips/me'),
      authed(`/declarations/${fy}/me`),
    ]).then(([s, d]) => {
      setSlips(s || []);
      setDeclaration(d);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <div className="ts-page">Loading...</div>;

  const totalGross = slips.reduce((s, p) => s + (p.gross || 0), 0);
  const totalPF = slips.reduce((s, p) => s + (p.statutory?.pf || 0), 0);
  const totalESIC = slips.reduce((s, p) => s + (p.statutory?.esic || 0), 0);
  const totalPT = slips.reduce((s, p) => s + (p.statutory?.pt || 0), 0);
  const totalTDS = slips.reduce((s, p) => s + (p.statutory?.tds || 0), 0);
  const totalDeclarations = declaration?.items?.reduce((s, i) => s + (i.declaredAmount || 0), 0) || 0;

  return (
    <div className="ts-page">
      <h1 className="ts-title">Tax Summary — {fy}</h1>
      <div className="ts-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>YTD Summary ({slips.length} months)</div>
        <div className="ts-row"><span className="ts-row-label">Regime</span><span className="ts-row-value">{declaration?.regime?.toUpperCase() || 'NEW'}</span></div>
        <div className="ts-row"><span className="ts-row-label">Gross Earnings</span><span className="ts-row-value">{fmt(totalGross)}</span></div>
        <div className="ts-row"><span className="ts-row-label">PF (Employee)</span><span className="ts-row-value">{fmt(totalPF)}</span></div>
        <div className="ts-row"><span className="ts-row-label">ESIC</span><span className="ts-row-value">{fmt(totalESIC)}</span></div>
        <div className="ts-row"><span className="ts-row-label">Professional Tax</span><span className="ts-row-value">{fmt(totalPT)}</span></div>
        <div className="ts-row"><span className="ts-row-label">TDS Deducted</span><span className="ts-row-value">{fmt(totalTDS)}</span></div>
        {declaration?.regime === 'old' && (
          <div className="ts-row"><span className="ts-row-label">Declared Investments</span><span className="ts-row-value">{fmt(totalDeclarations)}</span></div>
        )}
        <div className="ts-highlight" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Total Tax Paid (YTD)</span><span>{fmt(totalTDS)}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add web/src/payroll/MyPayslips.tsx web/src/payroll/MyPayslips.css web/src/payroll/Declarations.tsx web/src/payroll/Declarations.css web/src/payroll/TaxSummary.tsx web/src/payroll/TaxSummary.css
git commit -m "feat(payroll): add employee self-service — payslips, declarations, tax summary"
```

---

### Task 16: Frontend — Reimbursements (Employee + Manager)

**Files:**
- Create: `web/src/payroll/Reimbursements.tsx`
- Create: `web/src/payroll/Reimbursements.css`
- Create: `web/src/payroll/ReimbursementApprovals.tsx`
- Create: `web/src/payroll/ReimbursementApprovals.css`

**Interfaces:**
- Consumes: `authed('/reimbursements/me')`, `authed('/reimbursements', 'POST', body)`, `authed('/reimbursements/pending')`, `authed('/reimbursements/:id/approve', 'POST')`, `authed('/reimbursements/:id/reject', 'POST', { reason })`
- Produces: Employee reimbursement submission + tracking, manager approval queue

- [ ] **Step 1: Create Reimbursements.css**

```css
/* web/src/payroll/Reimbursements.css */
.rb-page { padding: 28px 32px; max-width: 800px; }
.rb-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
.rb-submit-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px 28px; box-shadow: var(--shadow); margin-bottom: 20px; }
.rb-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.rb-form-group { display: flex; flex-direction: column; gap: 5px; }
.rb-form-label { font-size: 12px; font-weight: 600; color: var(--muted); }
.rb-list { display: flex; flex-direction: column; gap: 8px; }
.rb-item { display: flex; align-items: center; justify-content: space-between; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 20px; box-shadow: var(--shadow); }
.rb-item-info { display: flex; flex-direction: column; gap: 2px; }
.rb-item-cat { font-size: 13px; font-weight: 600; color: var(--text); text-transform: capitalize; }
.rb-item-desc { font-size: 12px; color: var(--muted); }
.rb-item-amount { font-size: 15px; font-weight: 700; color: var(--text); }
.rb-item-status { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 12px; text-transform: uppercase; }
.rb-item-status.submitted { background: rgba(234,179,8,0.12); color: #b45309; }
.rb-item-status.approved { background: rgba(59,130,246,0.12); color: #1d4ed8; }
.rb-item-status.rejected { background: rgba(239,68,68,0.12); color: #dc2626; }
.rb-item-status.paid { background: rgba(34,197,94,0.12); color: #15803d; }
.rb-empty { text-align: center; color: var(--faint); padding: 40px; font-size: 13px; }
```

- [ ] **Step 2: Create Reimbursements.tsx**

```tsx
// web/src/payroll/Reimbursements.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './Reimbursements.css';

interface Claim {
  _id: string;
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  status: string;
}

const CATEGORIES = ['travel', 'food', 'internet', 'medical', 'other'];

export function Reimbursements() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [category, setCategory] = useState('travel');
  const [amount, setAmount] = useState(0);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed('/reimbursements/me').then(d => { setClaims(d); setLoaded(true); });
  }, []);

  async function submit() {
    setSubmitting(true);
    const claim = await authed('/reimbursements', 'POST', { category, amount, claimDate, description });
    setClaims(prev => [claim, ...prev]);
    setAmount(0);
    setDescription('');
    setSubmitting(false);
  }

  if (!loaded) return <div className="rb-page"><div className="rb-empty">Loading...</div></div>;

  return (
    <div className="rb-page">
      <h1 className="rb-title">Reimbursements</h1>

      <div className="rb-submit-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>New Claim</div>
        <div className="rb-form-row">
          <div className="rb-form-group">
            <label className="rb-form-label">Category</label>
            <select className="se-select" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div className="rb-form-group">
            <label className="rb-form-label">Amount</label>
            <input className="se-input" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <div className="rb-form-row">
          <div className="rb-form-group">
            <label className="rb-form-label">Date</label>
            <input className="se-input" type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)} />
          </div>
          <div className="rb-form-group">
            <label className="rb-form-label">Description</label>
            <input className="se-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description" />
          </div>
        </div>
        <button className="pr-btn" onClick={submit} disabled={submitting || !amount}>{submitting ? 'Submitting...' : 'Submit Claim'}</button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>My Claims</div>
      {claims.length === 0 ? (
        <div className="rb-empty">No claims yet.</div>
      ) : (
        <div className="rb-list">
          {claims.map(c => (
            <div key={c._id} className="rb-item">
              <div className="rb-item-info">
                <span className="rb-item-cat">{c.category}</span>
                <span className="rb-item-desc">{c.description || c.claimDate}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="rb-item-amount">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.amount)}</span>
                <span className={`rb-item-status ${c.status}`}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ReimbursementApprovals.css**

```css
/* web/src/payroll/ReimbursementApprovals.css */
.ra-page { padding: 28px 32px; }
.ra-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; }
.ra-item { display: flex; align-items: center; justify-content: space-between; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; box-shadow: var(--shadow); margin-bottom: 8px; }
.ra-info { flex: 1; }
.ra-name { font-size: 14px; font-weight: 600; color: var(--text); }
.ra-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
.ra-amount { font-size: 16px; font-weight: 700; color: var(--text); margin-right: 16px; }
.ra-actions { display: flex; gap: 8px; }
.ra-approve { padding: 7px 16px; font-size: 12px; font-weight: 600; color: #fff; background: #22c55e; border: none; border-radius: 4px; cursor: pointer; }
.ra-reject { padding: 7px 16px; font-size: 12px; font-weight: 600; color: #fff; background: #ef4444; border: none; border-radius: 4px; cursor: pointer; }
```

- [ ] **Step 4: Create ReimbursementApprovals.tsx**

```tsx
// web/src/payroll/ReimbursementApprovals.tsx
import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './ReimbursementApprovals.css';

interface PendingClaim {
  _id: string;
  user: { displayName: string; email: string; employeeCode: string };
  category: string;
  amount: number;
  claimDate: string;
  description: string;
}

export function ReimbursementApprovals() {
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authed('/reimbursements/pending').then(d => { setClaims(d); setLoaded(true); });
  }, []);

  async function approve(id: string) {
    await authed(`/reimbursements/${id}/approve`, 'POST');
    setClaims(prev => prev.filter(c => c._id !== id));
  }

  async function reject(id: string) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    await authed(`/reimbursements/${id}/reject`, 'POST', { reason });
    setClaims(prev => prev.filter(c => c._id !== id));
  }

  if (!loaded) return <div className="ra-page">Loading...</div>;

  return (
    <div className="ra-page">
      <h1 className="ra-title">Reimbursement Approvals</h1>
      {claims.length === 0 ? (
        <div className="rb-empty">No pending claims.</div>
      ) : (
        claims.map(c => (
          <div key={c._id} className="ra-item">
            <div className="ra-info">
              <div className="ra-name">{c.user?.displayName || '—'}</div>
              <div className="ra-meta">{c.category} · {c.description || c.claimDate}</div>
            </div>
            <span className="ra-amount">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.amount)}</span>
            <div className="ra-actions">
              <button className="ra-approve" onClick={() => approve(c._id)}>Approve</button>
              <button className="ra-reject" onClick={() => reject(c._id)}>Reject</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/payroll/Reimbursements.tsx web/src/payroll/Reimbursements.css web/src/payroll/ReimbursementApprovals.tsx web/src/payroll/ReimbursementApprovals.css
git commit -m "feat(payroll): add reimbursement submission + manager approval queue UI"
```

---

### Task 17: Integration — Wire Everything, Test End-to-End

**Files:**
- Verify all route mounts in `auth-api/src/app.js`
- Verify all frontend routes in `web/src/AppShell.tsx`
- Run the full test suite

- [ ] **Step 1: Verify app.js has all payroll route mounts**

Confirm these lines exist in `auth-api/src/app.js`:

```js
app.use('/payroll', createPayrollRouter());
app.use('/salary', createSalaryRouter());
app.use('/payslips', createPayslipsRouter());
app.use('/declarations', createDeclarationsRouter());
app.use('/reimbursements', createReimbursementsRouter());
app.use('/loans', createLoansRouter());
```

- [ ] **Step 2: Run all backend tests**

Run: `node --test auth-api/test/payrollBridge.test.js auth-api/test/statutoryEngine.test.js auth-api/test/payrollEngine.test.js auth-api/test/salaryStructure.test.js`
Expected: All tests PASS

- [ ] **Step 3: Run the seed script**

Run: `node auth-api/scripts/seed-all.js`
Expected: Seeds complete including payroll data (statutory config, grades, groups, salary structures)

- [ ] **Step 4: Start backend and verify API health**

Run: `node auth-api/src/server.js`
Verify: `GET /health` returns `{ ok: true }`

- [ ] **Step 5: Start frontend dev server and verify pages load**

Run: `cd web && npm run dev`
Verify:
- `/payroll` shows the run list page
- `/my-payslips` shows empty payslip list
- `/reimbursements` shows reimbursement form
- `/declarations` shows declaration form

- [ ] **Step 6: Create a test payroll run via the UI**

1. Navigate to `/payroll`
2. Click "New Run" — select June 2026, pay group "India - Monthly - HYD"
3. Click into the new run
4. Click "Compute" — verify employee grid populates with salaries, deductions, net pay
5. Click "Lock" — verify status changes to LOCKED
6. Navigate to `/my-payslips` as an employee — verify payslip appears

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(payroll): complete payroll module — end-to-end integration verified"
```
