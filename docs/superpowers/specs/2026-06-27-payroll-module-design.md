# Payroll Module — Consolidated Design Spec

> PM app (`Gemini_loginAuth`) · Node/Express/MongoDB + React/TS/Vite
> Reference: Keka HRMS & Payroll. Indian statutory model (PF / ESIC / PT / TDS).
> Date: 2026-06-27

---

## 0. Context & positioning

Keka splits into three foundations: **HRMS & Payroll**, **Hiring**, **Projects & Timesheets (PSA)**. Everything built so far (attendance, leave, timesheets, billable/non-billable) is PSA. Payroll is a **separate foundation that consumes PSA output**.

```
PSA layer (built)                 Payroll layer (this spec)
─────────────────                 ─────────────────────────
Attendance  ─┐
Leave        ├──►  AGGREGATION ──►  Payroll Run ──► Payslips ──► Disbursal
Timesheet   ─┘     BRIDGE           (+ statutory, deductions)
```

The engineering centerpiece is the **aggregation bridge** — the seam between PSA and payroll.

---

## Resolved decisions

| Decision | Answer | Rationale |
|---|---|---|
| Pay period | Calendar month (1st–last) | Matches existing attendance/leave date storage; cutoff can be added later via `PayGroup.cycle` |
| Proration basis | Payable (working) days | Consistent with Mon–Fri attendance model; each LOP day has equal weight |
| OT/billable → pay | Display-only | Keeps engine simple; data is captured in `PayrollInput` for future use |
| Tax regime | Both slab tables + declaration model now; proof/recalc workflow deferred | Slab lookup is ~20 lines; declaration model is inert without it; proof workflow is additive later because schema seams are in place |
| Grade ↔ structure | Suggest only (template seed, no enforcement) | Avoids validation coupling on every comp edit; grade still useful for banding reports |
| Reimbursement payout | Always via payroll | No payment rail needed; clean audit trail; tax-safe |

---

## 1. Aggregation Bridge

Turns a month of PSA data into a frozen, payroll-ready input row per employee. Runs **on demand** when admin opens/initiates a payroll run (no background job).

### 1.1 What it computes (per employee, per pay period)

| Field | Source | Notes |
|---|---|---|
| `payableDays` | Calendar Mon–Fri minus holidays (from `Holiday` model) | Denominator for per-day rate |
| `presentDays` | Attendance records with status `present`/`wfh`/`partial`/`wfh-partial` | Derived, never auto-mutated |
| `lopDays` | Absent working days minus approved paid leave days | The only number that touches gross |
| `paidLeaveDays` | Leave records with status `approved` and type != `unpaid` | Does not cause LOP |
| `otHours` | Attendance / regularise | Display-only on payslip |
| `billableHours` | Timesheet (sum of minutes where `billable[day] = true`) | Display-only on payslip |

### 1.2 Design rules

- **No background job.** Bridge runs on demand — same philosophy as derived attendance states.
- **Freeze on lock.** Until the run is locked, `PayrollInput` is recomputed live from PSA on every view. On lock, it's **snapshotted** — later edits to attendance do NOT retroactively change a locked run.
- **LOP is the only PSA→pay coupling.** Present/OT/billable are display-only.

### 1.3 `PayrollInput` schema

```js
const PayrollInputSchema = new mongoose.Schema({
  payrollRun:   { type: ObjectId, ref: 'PayrollRun', required: true, index: true },
  user:         { type: ObjectId, ref: 'User', required: true, index: true },
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
```

### 1.4 Bridge computation logic

```
function computePayrollInput(userId, month, year):
  startDate = YYYY-MM-01
  endDate   = last day of month

  allDays       = each date in [startDate, endDate]
  weekdays      = allDays.filter(day => Mon–Fri)
  holidays      = Holiday.find({ date: { $in: weekdays }, year })
  payableDays   = weekdays.length - holidays.length

  attendance    = Attendance.find({ userId, date: { $gte: startDate, $lte: endDate } })
  presentDays   = attendance.filter(a => a.status in ['present','wfh','partial','wfh-partial']).length

  approvedLeaves = Leave.find({ userId, status: 'approved', overlaps [startDate, endDate] })
  paidLeaveDays  = sum of requestedDays for leaves where type != 'unpaid'
                   (uses Leave.requestedDays which already handles half-days as 0.5)

  absentDays = payableDays - presentDays - paidLeaveDays
  lopDays    = max(0, absentDays)   // fractional values possible (half-day LOP)

  timesheets = Timesheet.find({ userId, weekStart overlaps month })
  billableHours = sum billable minutes / 60

  return { payableDays, presentDays, paidLeaveDays, lopDays, otHours: 0, billableHours }
```

---

## 2. Pay Groups & Pay Grades

### 2.1 Pay Grade

A compensation band attached to an employee. Seeds the default salary structure template. **Does not enforce** min/max CTC — suggest only.

```js
const PayGradeSchema = new mongoose.Schema({
  code:  { type: String, required: true, unique: true },   // 'G3'
  label: String,
  minCtc: Number,
  maxCtc: Number,
  defaultComponents: [SalaryComponentSchema],
}, { timestamps: true });
```

### 2.2 Pay Group

A run-scoping bucket. Employees sharing a pay cycle, entity, or location get run together. One `PayrollRun` targets one pay group.

```js
const PayGroupSchema = new mongoose.Schema({
  name:      { type: String, required: true },     // 'India - Monthly - HYD'
  entity:    { type: ObjectId, ref: 'LegalEntity', default: null },
  cycle:     { type: String, enum: ['calendar'], default: 'calendar' },
  ptState:   String,                               // drives PT slab selection
  members:   [{ type: ObjectId, ref: 'User' }],
}, { timestamps: true });
```

### 2.3 User model additions

```js
payGrade:  { type: ObjectId, ref: 'PayGrade', default: null },
payGroup:  { type: ObjectId, ref: 'PayGroup', default: null },
```

---

## 3. Salary Structure

Static comp definition per employee. Independent of any run.

```js
const SalaryComponentSchema = new mongoose.Schema({
  key:        String,            // 'basic' | 'hra' | 'special' | 'lta' ...
  label:      String,
  type:       { type: String, enum: ['earning', 'deduction'] },
  calc:       { type: String, enum: ['fixed', 'percent_of_basic', 'percent_of_ctc'] },
  value:      Number,            // ₹ if fixed, % if percent
  taxable:    { type: Boolean, default: true },
  proratable: { type: Boolean, default: true },  // does LOP reduce it?
}, { _id: false });

const SalaryStructureSchema = new mongoose.Schema({
  user:           { type: ObjectId, ref: 'User', required: true, index: true },
  ctcAnnual:      { type: Number, required: true },
  components:     [SalaryComponentSchema],
  effectiveFrom:  { type: Date, required: true },
  effectiveTo:    { type: Date, default: null },  // null = current
}, { timestamps: true });
```

- **Revisions** = new document with a new `effectiveFrom`; close the prior one's `effectiveTo`. Never edit in place (gives arrears + audit for free).
- **Arrears**: when a revision's `effectiveFrom` is back-dated past already-locked runs, the diff is queued as an arrear line on the next open run.
- **Grade seeding**: when creating a structure, if the user has a `payGrade`, pre-fill `components` from `PayGrade.defaultComponents`. Admin can adjust freely.

---

## 4. Payroll Run

A run is a **deliberate, user-triggered batch** over one pay period — not automatic.

### 4.1 State machine

```
DRAFT ──compute──► REVIEW ──lock──► LOCKED ──disburse──► PAID
  ▲                   │                                    │
  └──── reopen ───────┘            (no reopen after PAID; off-cycle only)
```

| State | Meaning | PSA coupling |
|---|---|---|
| `DRAFT` | Run created, inputs recompute live | Live |
| `REVIEW` | Numbers generated, admin verifying | Live |
| `LOCKED` | Inputs + payslips frozen | **Snapshotted** |
| `PAID` | Disbursal marked done | Frozen |

### 4.2 Run schema

```js
const PayrollRunSchema = new mongoose.Schema({
  period:   { month: Number, year: Number },
  payGroup: { type: ObjectId, ref: 'PayGroup', required: true },
  status:   { type: String, enum: ['DRAFT','REVIEW','LOCKED','PAID'], default: 'DRAFT' },
  runType:  { type: String, enum: ['regular','off_cycle','bonus','arrear','final_settlement'], default: 'regular' },
  scope:    { type: String, enum: ['group','adhoc'], default: 'group' },
  adhocMembers: [{ type: ObjectId, ref: 'User' }],
  lockedAt: Date,
  lockedBy: { type: ObjectId, ref: 'User' },
  totals:   { gross: Number, deductions: Number, netPay: Number, headcount: Number },
}, { timestamps: true });

PayrollRunSchema.index({ 'period.year': 1, 'period.month': 1, payGroup: 1 }, { unique: true });
```

### 4.3 Run types

| runType | Targets | Pipeline difference |
|---|---|---|
| `regular` | Full pay group | Full pipeline |
| `off_cycle` | Adhoc members | Skip proration; explicit line items only |
| `bonus` | Adhoc/group | Earnings-only, TDS still applies |
| `arrear` | Affected members | Arrear diff lines only |
| `final_settlement` | One leaver | Full + leave encashment + recovery |

Off-cycle/bonus runs **do not** snapshot PSA inputs (no LOP proration).

### 4.4 Run pipeline (`compute`)

1. Resolve members: `PayGroup.members` (group scope) or `adhocMembers` (adhoc).
2. Resolve active `SalaryStructure` per employee for the period.
3. Pull/refresh `PayrollInput` from the bridge (§1).
4. Prorate `proratable` earnings: `amount × (payableDays − lopDays) / payableDays`.
5. Layer adjustments: arrears, approved reimbursements, loan EMIs, bonuses.
6. Run statutory engine (§5) → PF, ESIC, PT, TDS.
7. Emit one `Payslip` per employee.
8. Roll up `totals`.

---

## 5. Statutory / Compliance (India)

Versioned rule table — not hardcoded constants. Both old and new tax regimes supported.

```js
const StatutoryConfigSchema = new mongoose.Schema({
  effectiveFrom: Date,
  pf:   { employeePct: Number, employerPct: Number, wageCeiling: Number },
  esic: { employeePct: Number, employerPct: Number, grossCeiling: Number },
  pt:   { state: String, slabs: [{ upTo: Number, amount: Number }] },
  tds: {
    old: { slabs: [{ upTo: Number, rate: Number }], standardDeduction: Number },
    new: { slabs: [{ upTo: Number, rate: Number }], standardDeduction: Number },
  },
});
```

### 5.1 TDS computation

- Monthly TDS = projected annual tax / 12.
- Projection uses `declared` investment amounts (from §7) under old regime; no deductions under new regime.
- **Proof window + shortfall recalculation deferred** — fields exist on `InvestmentDeclaration` for future addition without schema changes.

### 5.2 Statutory outputs

Computed numbers stored per run. File-format exporters (ECR txt, FVU, challan PDFs) **stubbed in v1**.

| Report | Cadence | v1 |
|---|---|---|
| ECR (PF) | Monthly | Compute ✅ / export stub |
| ESIC return | Monthly | Compute ✅ / export stub |
| PT challan | Monthly/state | Compute ✅ / export stub |
| 24Q (salary TDS) | Quarterly | Compute ✅ / export stub |
| Form 16 | Annual | Year-end / export stub |
| Tax summary | On-demand | **Build fully** (self-service) |

---

## 6. Deductions & Adjustments

### 6.1 Loans / advances

```js
const LoanSchema = new mongoose.Schema({
  user:      { type: ObjectId, ref: 'User', index: true },
  principal: Number,
  emiAmount: Number,
  tenureMonths: Number,
  schedule: [{
    period: { month: Number, year: Number },
    amount: Number,
    status: { type: String, enum: ['due','paid','skipped'] },
  }],
  status: { type: String, enum: ['active','closed','paused'], default: 'active' },
}, { timestamps: true });
```

Pause = skip that period's EMI, extend tenure.

### 6.2 Reimbursements

**Always paid via payroll** — no direct out-of-cycle payout.

```js
const ReimbursementSchema = new mongoose.Schema({
  user:        { type: ObjectId, ref: 'User', required: true, index: true },
  category:    { type: String, enum: ['travel','food','internet','medical','other'] },
  amount:      { type: Number, required: true },
  claimDate:   Date,
  description: String,
  attachments: [{ url: String, filename: String }],

  status:    { type: String, enum: ['submitted','approved','rejected','paid'], default: 'submitted', index: true },
  approver:  { type: ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectionReason: String,

  payrollRun: { type: ObjectId, ref: 'PayrollRun', default: null },
  taxable:    { type: Boolean, default: false },
}, { timestamps: true });
```

**Flow:** `submitted` → manager `approved` → next run pulls approved claims (where `payrollRun` is null) as **non-taxable earning lines** → stamps `payrollRun` + flips to `paid` on lock.

### 6.3 Bonuses / one-offs

Ad-hoc earning lines on a specific run (via `off_cycle` or `bonus` run type). No separate model — they're explicit line items added to the run.

---

## 7. Investment Declarations

Drives TDS calculation under old regime. Two-phase lifecycle: declare → prove (prove deferred in v1).

```js
const InvestmentDeclarationSchema = new mongoose.Schema({
  user:           { type: ObjectId, ref: 'User', required: true, index: true },
  financialYear:  { type: String, required: true },   // 'FY2026-27'
  regime:         { type: String, enum: ['old','new'], required: true },

  items: [{
    section:        String,        // '80C' | '80D' | 'HRA' | '24B' ...
    declaredAmount: Number,
    proofAmount:    { type: Number, default: null },   // populated in proof phase (deferred)
    proofs:         [{ url: String, filename: String }],
    verifyStatus:   { type: String, enum: ['pending','verified','rejected'], default: 'pending' },
  }],

  phase:        { type: String, enum: ['declaration','proof','closed'], default: 'declaration' },
  lockedForTds: { type: Boolean, default: false },
}, { timestamps: true });

InvestmentDeclarationSchema.index({ user: 1, financialYear: 1 }, { unique: true });
```

- TDS engine uses `declaredAmount` for monthly projection under old regime.
- `new` regime → items ignored (no deductions) but still recorded.
- **Proof window + shortfall recalc deferred.** Schema fields (`proofAmount`, `verifyStatus`, `phase`) exist for future implementation without migration.

---

## 8. Payslip

```js
const PayslipSchema = new mongoose.Schema({
  payrollRun:  { type: ObjectId, ref: 'PayrollRun', index: true },
  user:        { type: ObjectId, ref: 'User', index: true },
  period:      { month: Number, year: Number },
  earnings:    [{ key: String, label: String, amount: Number }],
  deductions:  [{ key: String, label: String, amount: Number }],
  reimbursements: [{ key: String, label: String, amount: Number }],
  statutory:   { pf: Number, esic: Number, pt: Number, tds: Number },
  gross: Number,
  totalDeductions: Number,
  netPay: Number,
  lopDays: Number,
  paidDays: Number,
  otHours: Number,
  billableHours: Number,
}, { timestamps: true });

PayslipSchema.index({ payrollRun: 1, user: 1 }, { unique: true });
```

---

## 9. Statutory Reports

```js
const StatutoryReportSchema = new mongoose.Schema({
  type:    { type: String, enum: ['ecr','esic','pt','24q','form16','tax_summary'] },
  period:  { month: Number, year: Number, quarter: Number, fy: String },
  payrollRun: { type: ObjectId, ref: 'PayrollRun', default: null },
  computedData: Object,
  fileUrl: String,
  status:  { type: String, enum: ['computed','filed'], default: 'computed' },
}, { timestamps: true });
```

---

## 10. API surface

```
# Pay groups & grades
GET    /api/payroll/grades
POST   /api/payroll/grades
GET    /api/payroll/groups
POST   /api/payroll/groups

# Salary structure
GET    /api/salary/:userId                 active structure
POST   /api/salary/:userId                 new revision (closes prior)

# Runs
POST   /api/payroll/runs                   create DRAFT for {month,year,payGroup}
GET    /api/payroll/runs                   list runs (filterable)
GET    /api/payroll/runs/:id               run + totals + inputs
POST   /api/payroll/runs/:id/compute       (re)run pipeline → REVIEW
POST   /api/payroll/runs/:id/lock          freeze inputs + payslips → LOCKED
POST   /api/payroll/runs/:id/reopen        LOCKED → DRAFT (pre-disbursal only)
POST   /api/payroll/runs/:id/disburse      → PAID

# Payslips
GET    /api/payslips/:runId                all payslips for a run
GET    /api/payslips/:runId/:userId        single payslip
GET    /api/payslips/me                    self-service (employee)
GET    /api/payslips/me/:period            single payslip by period

# Investment declarations
GET    /api/declarations/:fy/me
POST   /api/declarations/:fy              submit/update (phase-gated)

# Reimbursements
POST   /api/reimbursements                employee submit
GET    /api/reimbursements/me
POST   /api/reimbursements/:id/approve    manager
POST   /api/reimbursements/:id/reject     manager (reason required)
GET    /api/reimbursements/pending        approver queue

# Loans
POST   /api/loans                         create with schedule
GET    /api/loans/:userId

# Statutory reports
GET    /api/payroll/reports/:type          computed report data
```

**Role gating:** payroll admin (full), reporting manager (read team totals, no comp edit), employee (own payslips/declarations only).

---

## 11. Frontend (React/TS)

### 11.1 Run console

List of runs by period + status pill (reuse existing status pill pattern). Drill into a run = employee grid: name · paid days · LOP · gross · deductions · net · status.

### 11.2 Run review screen

The employee grid + lock/disburse action buttons, totals header with gross/deductions/net/headcount.

### 11.3 Salary structure editor

Component rows (earning/deduction, calc type, value). Live CTC reconciliation footer showing monthly and annual totals. Grade template seeding on create.

### 11.4 Employee self-service

- Payslip list by month, drill into detail view.
- Investment declaration form (regime picker, section items with amounts).
- Tax summary (YTD projection).
- Reimbursement submission + status tracking.

### 11.5 Reuse patterns

- Segmented bar / column-header icons from timesheet grid.
- Status pills from attendance.
- Approval queue pattern from leave/regularise.

---

## 12. Build order

1. **Aggregation bridge** (§1) — pure function over PSA + freeze step. Test in isolation.
2. **Pay grades + pay groups** (§2) — needed before structures and runs.
3. **Salary structure** (§3) — CRUD + revision logic + grade template seeding.
4. **Run engine DRAFT→REVIEW + run types** (§4) without statutory — just proration + net.
5. **Statutory engine** (§5) — versioned slab tables (both regimes); wire into pipeline.
6. **Reimbursements** (§6.2) + loans (§6.1) — approval flow + run integration.
7. **Investment declarations** (§7) — declaration model + regime field; feeds TDS. Proof workflow deferred.
8. **Lock/freeze + payslip emit** (§4.1, §8).
9. **Frontend: run console + salary editor + self-service + tax summary** (§11).
10. **Statutory reports** (§9) — compute numbers; file-format exporters stubbed.

---

## 13. Scope exclusions (v1)

- **Cutoff pay cycle** — calendar month only; `PayGroup.cycle` field exists for future extension.
- **OT/billable → pay** — display-only; data captured for future hourly-rate support.
- **Proof window + TDS recalculation** — declaration model and schema fields exist; workflow deferred.
- **Grade CTC enforcement** — suggest-only; no min/max validation.
- **Direct reimbursement payout** — always via payroll; no separate payment rail.
- **File-format exporters** (ECR txt, FVU, challan PDFs) — numbers computed, files stubbed.
