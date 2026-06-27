# HR Onboarding Module — Design Spec

> PM app (`Gemini_loginAuth`) · Node/Express/MongoDB + React/TS/Vite
> Reference: Keka Core HR — Onboarding. Indian hiring context.
> Date: 2026-06-27

---

## 1. Purpose

Onboarding is the module that **manufactures the employee record**. It takes a candidate from offer acceptance through document collection, task workflows, and day-1 joining to produce the `User` + `SalaryStructure` + grade/group assignment that payroll, attendance, and leave all consume. Nothing downstream exists until onboarding produces it.

```
ONBOARDING                             Existing System
──────────                             ───────────────
Candidate → Offer → Pre-board ─┐
                                ├─► CONVERSION ─► User (active)
Doc collection + verification ──┤                 ├─► SalaryStructure (payroll)
Task workflow (IT/HR/mgr/fin) ──┘                 ├─► PayGrade / PayGroup
                                                  ├─► Attendance eligibility
                                                  └─► Leave balances
```

The **conversion step** is the seam: a single transactional handoff from "candidate" to "employee." Everything before lives in onboarding-only collections; everything after is the existing system.

---

## 2. Lifecycle State Machine

One onboarding case walks this state machine:

```
DRAFT ──► OFFER_SENT ──► OFFER_ACCEPTED ──► PRE_BOARDING ──► JOINED
  │            │                                  │             │
  │            └──► OFFER_DECLINED (terminal)     │             ▼
  │                                               │         INDUCTION
  └──► CANCELLED (terminal)                       │             │
                                                  │             ▼
                          (docs + tasks here)                PROBATION
                                                                │
                                                   ┌────────────┼────────────┐
                                                   ▼                         ▼
                                              CONFIRMED                 TERMINATED
                                              (active employee)        (probation fail)
```

| State | Owner | What happens |
|---|---|---|
| `DRAFT` | HR | Case created, offer being prepared |
| `OFFER_SENT` | candidate | Offer letter delivered, awaiting response |
| `OFFER_ACCEPTED` | candidate | Accepted; pre-boarding portal unlocks |
| `PRE_BOARDING` | candidate + HR | Doc upload, data collection, task kickoff |
| `JOINED` | HR | Day-1 reached — **conversion fires** (creates `User`) |
| `INDUCTION` | HR/manager | Orientation, asset handover, system access |
| `PROBATION` | manager | Probation clock running |
| `CONFIRMED` | manager/HR | Probation passed, fully active |
| `TERMINATED` | HR | Probation failed / early exit |

State transitions are **explicit, user-triggered actions** — no cron auto-advances. Probation end date is a derived "needs confirmation" flag surfaced to the manager (same pattern as missed-checkout needs-regularise), not an auto-confirm job.

---

## 3. Data Models

### 3.1 OnboardingCase

The parent document. Everything else references it.

```js
{
  candidate: {
    firstName: String,
    lastName: String,
    personalEmail: { type: String, required: true },
    phone: String,
  },
  designation: String,
  department: ObjectId (ref Department),
  reportingManager: ObjectId (ref User),
  payGrade: ObjectId (ref PayGrade),
  payGroup: ObjectId (ref PayGroup),
  workLocation: String,
  employmentType: { type: String, enum: ['full_time', 'contract', 'intern'] },
  joiningDate: { type: Date, required: true },
  probationMonths: { type: Number, default: 3 },
  status: {
    type: String,
    enum: ['DRAFT','OFFER_SENT','OFFER_ACCEPTED','PRE_BOARDING','JOINED',
           'INDUCTION','PROBATION','CONFIRMED','OFFER_DECLINED','CANCELLED','TERMINATED'],
    default: 'DRAFT',
    index: true,
  },
  workflowTemplate: ObjectId (ref OnboardingTemplate),
  createdBy: ObjectId (ref User),
  convertedUser: { type: ObjectId, ref: 'User', default: null },
  confirmedAt: Date,
  timestamps: true
}
```

### 3.2 Offer

Kept separate from the case for versioning (revised offers).

```js
{
  onboardingCase: ObjectId (ref OnboardingCase, required, indexed),
  version: { type: Number, default: 1 },
  ctcAnnual: Number,
  componentsPreview: [SalaryComponentSchema],  // reuses payroll's exact shape
  joiningDate: Date,
  expiryDate: Date,
  letterUrl: String,
  status: { type: String, enum: ['draft','sent','accepted','declined','expired','revised'], default: 'draft' },
  sentAt: Date,
  respondedAt: Date,
  candidateSignature: { signedAt: Date, ip: String },
  declineReason: String,
  timestamps: true
}
```

Reuses `SalaryComponentSchema` from `auth-api/src/models/SalaryStructure.js` — the offer's comp preview is the seed for the eventual `SalaryStructure`. Same shape: `{ key, label, type, calc, value, taxable, proratable }`.

### 3.3 OnboardingTemplate

Reusable task template. Define once, instantiate per case.

```js
{
  name: String,                              // 'Engineering FTE Onboarding'
  appliesTo: { employmentType: String, department: ObjectId },
  tasks: [{
    key: String,                             // 'provision_laptop'
    title: String,
    ownerRole: { type: String, enum: ['hr','it','manager','finance','candidate','admin'] },
    offsetDays: Number,                      // relative to joiningDate (-7, 0, +2)
    dependsOn: [String],                     // task keys that must complete first
    category: { type: String, enum: ['document','asset','access','training','admin'] },
    mandatory: { type: Boolean, default: true },
  }],
  timestamps: true
}
```

### 3.4 OnboardingTask (instantiated per case)

```js
{
  onboardingCase: ObjectId (ref OnboardingCase, required, indexed),
  templateKey: String,
  title: String,
  ownerRole: String,
  assignedTo: ObjectId (ref User),
  dueDate: Date,                             // joiningDate + offsetDays
  dependsOn: [String],
  status: { type: String, enum: ['pending','in_progress','done','skipped'], default: 'pending', index: true },
  completedAt: Date,
  completedBy: ObjectId (ref User),
  timestamps: true
}
```

`blocked` is **derived** at read time from `dependsOn` — a task shows blocked until its dependencies hit `done`. Not stored as a flag.

Task ownership resolves at instantiation: `ownerRole: 'manager'` resolves to `assignedTo = case.reportingManager`. `'candidate'` tasks surface in the pre-boarding portal.

Progress = `done / mandatory total`.

### 3.5 DocumentRequest

KYC + statutory docs. Two-sided: request (what's needed) and submission (what they uploaded).

```js
{
  onboardingCase: ObjectId (ref OnboardingCase, indexed),
  docType: { type: String, enum: ['pan','aadhaar','bank_proof','photo','education',
             'prev_payslip','relieving_letter','experience_letter','address_proof'] },
  mandatory: { type: Boolean, default: true },
  submission: {
    fileId: ObjectId,          // GridFS (reuses existing pattern from reimbursements/timesheets)
    filename: String,
    contentType: String,
    size: Number,
    uploadedAt: Date,
    extractedFields: Object,   // e.g. { panNumber: 'ABCDE1234F' }
  },
  verifyStatus: { type: String, enum: ['awaiting','submitted','verified','rejected'], default: 'awaiting', index: true },
  verifiedBy: ObjectId (ref User),
  verifiedAt: Date,
  rejectionReason: String,
  timestamps: true
}
```

Mirrors the existing leave/reimbursement approval pattern: submit then HR verify/reject-with-reason.

PAN + bank proof feed payroll at conversion (TDS identity, salary disbursal). Aadhaar/UAN feed PF.

---

## 4. Candidate Self-Service Portal

The candidate has **no `User` yet** — this is a separate, token-scoped portal.

### 4.1 Token Mechanism

- On case creation or offer send, generate a secure random token (crypto.randomBytes, 48 chars hex)
- Store hashed token on the OnboardingCase: `portalTokenHash`, `portalTokenExpiry`
- Send magic link to candidate's personal email: `/onboarding/portal/:token`
- Token is single-case scoped, expires after joining date + 7 days
- Can only read/write that case's pre-boarding fields — never the employee directory

### 4.2 Portal Capabilities

- Accept/decline offer
- Fill personal data form (address, emergency contact, bank details, education, previous employment)
- Upload requested documents
- Complete `candidate`-owned tasks
- See progress checklist of what's left before day 1

### 4.3 Portal API

```
POST  /api/onboarding/portal/:token/accept-offer
POST  /api/onboarding/portal/:token/decline-offer   { reason }
GET   /api/onboarding/portal/:token/checklist
POST  /api/onboarding/portal/:token/profile          candidate data
POST  /api/onboarding/portal/:token/documents         upload (multipart)
POST  /api/onboarding/portal/:token/tasks/:key/complete
```

No auth middleware — token validation is the auth. Middleware extracts case from token hash lookup.

---

## 5. Conversion — The Seam

When the case hits **JOINED**, `POST /api/onboarding/:id/convert` does:

1. **Gate check:** All mandatory docs verified + offer accepted. Surface a "ready to convert" derived flag so HR sees blockers before clicking.
2. **Create `User`** from candidate data + assign payGrade, payGroup, department, designation, reportingManager, joiningDate (`dateOfJoining`), `probationEndDate` (joiningDate + probationMonths), employmentType. Copy `pan`, `aadhaar`, bank details from verified documents.
3. **Create `SalaryStructure`** from accepted `Offer.componentsPreview` — no re-keying, same component shape. `effectiveFrom = joiningDate`.
4. **Add user to PayGroup** members array.
5. **Initialize `LeaveBalance`** for joining year with default quotas (casual: 12, sick: 6, earned: 15), pro-rated if mid-year.
6. **Set password invite:** Create a `PasswordResetToken` and email the new employee a "set your password" link — reuses existing forgot-password flow.
7. **Stamp** `case.convertedUser = user._id`, move case to `INDUCTION`.

### Transaction Note

The existing codebase does not use MongoDB transactions. Conversion will be the first transactional operation. Requires MongoDB replica set. The conversion function will use `mongoose.startSession()` + `session.withTransaction()` to ensure atomicity. If any step fails, the entire operation rolls back.

Fallback if replica set is unavailable: execute steps sequentially with manual rollback (delete created User + SalaryStructure on failure). Log the partial state for manual recovery.

---

## 6. Probation and Confirmation

- `probationEndDate = joiningDate + probationMonths` (set on User at conversion)
- **Probation = active employee.** Paid, clocks in, takes leave normally. Probation is an HR milestone, not an access restriction.
- As `probationEndDate` approaches (within 15 days), surface a "confirmation due" flag on the manager's dashboard
- Manager action: `POST /api/onboarding/:id/confirm` with `{ action: 'confirm' | 'extend' | 'terminate', extensionMonths?, notes? }`
  - **Confirm:** case status → `CONFIRMED`, `confirmedAt` stamped, `User.probationEndDate` cleared
  - **Extend:** push `probationEndDate` by extensionMonths, log the extension
  - **Terminate:** case status → `TERMINATED`, trigger offboarding (out of scope, just sets `User.active = false` for now)

---

## 7. API Surface

```
# Cases
POST   /api/onboarding                        create case (DRAFT)
GET    /api/onboarding                        list (filter: status, manager, dept)
GET    /api/onboarding/:id                    case + tasks + docs + offer
POST   /api/onboarding/:id/transition         explicit state change (validated)
POST   /api/onboarding/:id/convert            JOINED → create employee
POST   /api/onboarding/:id/confirm            probation → CONFIRMED

# Offers
POST   /api/onboarding/:id/offer              create/revise
POST   /api/onboarding/:id/offer/send         → OFFER_SENT

# Tasks
GET    /api/onboarding/:id/tasks
POST   /api/onboarding/tasks/:taskId/complete
GET    /api/onboarding/tasks/mine              stakeholder's queue (IT/mgr/etc)

# Documents
GET    /api/onboarding/:id/documents
POST   /api/onboarding/:id/documents           upload (multipart, for HR uploading on behalf)
POST   /api/onboarding/documents/:docId/verify
POST   /api/onboarding/documents/:docId/reject  { reason }

# Templates
GET    /api/onboarding/templates
POST   /api/onboarding/templates
PUT    /api/onboarding/templates/:id

# Candidate Portal (token-scoped)
POST   /api/onboarding/portal/:token/accept-offer
POST   /api/onboarding/portal/:token/decline-offer
GET    /api/onboarding/portal/:token/checklist
POST   /api/onboarding/portal/:token/profile
POST   /api/onboarding/portal/:token/documents
POST   /api/onboarding/portal/:token/tasks/:key/complete
```

**Role gating:** HR (full access), reporting manager (own team's cases + assigned tasks + confirmation), IT/Finance (assigned tasks only), candidate (own portal only).

---

## 8. Frontend

### 8.1 Onboarding Board (main view)

Kanban-style columns by lifecycle state. Card = candidate name, role, joining date, progress %, blocker badge. Drag not needed — state transitions via explicit action buttons.

Route: `/onboarding`

### 8.2 Case Detail Page

Tabs: Overview | Offer | Tasks | Documents | Timeline

- **Overview:** Candidate info, role/dept, joining date, status badge, reporting manager, readiness gate indicator
- **Offer:** CTC breakdown using salary component table (reuse from payroll), send/resend button, acceptance status
- **Tasks:** Checklist with owners, due dates, dependency indicators, completion toggle
- **Documents:** Upload/view for each doc type, verify/reject buttons for HR, status badges
- **Timeline:** Audit log of state transitions and actions

Route: `/onboarding/:id`

### 8.3 My Onboarding Tasks

Cross-cutting queue for IT/manager/finance stakeholders. Shows all tasks assigned to the current user across all onboarding cases. Filterable by status, case.

Route: `/onboarding/tasks`

### 8.4 Template Builder

Define reusable task lists: name, task rows (key, title, owner role, offset days, dependencies, category, mandatory flag). Add/remove/reorder tasks.

Route: `/onboarding/templates`

### 8.5 Candidate Portal

Standalone page, no AppShell sidebar. Token entered via URL. Clean branded layout:
- Progress checklist (docs needed, tasks pending, profile completion)
- Offer card with accept/decline
- Profile form (address, emergency contact, bank, education, previous employment)
- Document upload per doc type

Route: `/portal/:token` (separate from main app routes)

### 8.6 Convert Modal

Shows readiness gate before the irreversible create-employee action:
- All mandatory docs verified (checkmark/X per doc)
- Offer accepted
- Mandatory tasks complete
- "Convert to Employee" button, disabled until all gates pass

### 8.7 Sidebar Navigation

Add to existing nav sections:
- Under "People" group: "Onboarding" (visible to admin, hr roles)
- "My Onboarding Tasks" can sit under "Work" group (visible to all roles that can be task assignees)

---

## 9. Integration Map

| Onboarding produces | Feeds | Existing module |
|---|---|---|
| `SalaryStructure` (from offer components) | salary, payroll runs | Payroll |
| `payGrade` / `payGroup` assignment | cost rates, payroll scoping | Payroll |
| Verified PAN / bank / Aadhaar | TDS, disbursal, PF | Payroll |
| `User` + `dateOfJoining` | attendance eligibility | Attendance |
| `LeaveBalance` init | leave accrual | Leave |
| Document store (GridFS) | employee records | Core HR |

Onboarding **writes once at conversion** and never touches these again — clean one-directional handoff.

---

## 10. Resolved Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| Probation = active or restricted? | **Active** | Employee is paid, on attendance, takes leave. Probation is an HR milestone only. Existing `probationEndDate` field on User supports this. |
| Offer acceptance method | **E-acceptance** (click + timestamp + IP) | Sufficient for offer acceptance. Full DSC e-sign deferred. |
| Candidate portal auth | **Magic-link token** | No half-User floating around. Token is case-scoped, expires post-joining. |
| Template auto-selection | **HR picks manually** in v1 | Auto-pick by `appliesTo` rules is a roadmap item. Manual selection avoids ambiguity. |
| Conversion reversibility | **Gate to actual day-1 arrival** | Don't convert until candidate physically shows up. Avoids the no-show rollback question entirely. |

---

## 11. Build Order

1. `OnboardingCase` model + lifecycle state machine + transition validation
2. Offer create/send/accept — reuse `SalaryComponentSchema`
3. Task template + instantiation engine — derived `blocked` status
4. Document request/verify — clone leave-approval pattern, reuse GridFS
5. Candidate portal — token-scoped, the one new auth surface
6. Conversion transaction — the seam; gate it hard, test in isolation
7. Probation → confirmation
8. Frontend: board, case detail, portal, template builder
9. BGV / vendor integrations — stub, roadmap

---

## 12. Out of Scope (v1)

- Full digital signature (DSC) for offer acceptance
- Background verification (BGV) vendor API integration (model it, don't integrate)
- Offboarding module (triggered by TERMINATED, but offboarding flow itself is separate)
- Bulk onboarding / CSV import
- Offer letter PDF generation (store URL, generation is manual or a future feature)
- Template auto-selection rules
