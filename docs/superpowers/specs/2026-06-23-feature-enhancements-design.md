# Feature Enhancements Design Spec

**Date:** 2026-06-23
**Status:** Approved
**Implementation order:** Incremental (Approach A) — each feature builds on the previous where dependencies exist.

---

## Overview

Five feature enhancements to the existing project management / timesheet application. All enhancements extend the current system without breaking existing functionality.

**Tech stack:** Express.js backend, React 19 + TypeScript frontend, MongoDB via Mongoose.
**Existing roles:** admin, pm, employee.

---

## Feature 1: Client & Billable Information on Projects

### Schema — Project model (`auth-api/src/models/Project.js`)

Add four fields:

```js
clientName:  { type: String, required: true, trim: true }
billingType: { type: String, enum: ['billable', 'non-billable'], default: 'non-billable' }
billingRate: { type: Number, default: null }   // optional, for future reporting
currency:    { type: String, default: null }   // e.g. 'USD', 'INR'
```

### API Changes

- `POST /projects` — accept `clientName` (required), `billingType`, `billingRate`, `currency`.
- `PATCH /projects/:id` — allow updating these fields.
- `GET /projects/:id` and `GET /projects` — new fields are returned automatically.

### Migration

Existing projects receive `clientName: 'Unassigned'` and `billingType: 'non-billable'` via a migration script. Alternatively, make `clientName` required only for new projects by checking at the route level rather than in the schema.

### Frontend

- **Project creation form:** Add Client Name (required text input), Billing Type (radio toggle: Billable / Non-Billable), conditional Billing Rate + Currency fields when Billable is selected.
- **Project detail page:** Display client name and billing type as info badges.
- **Project list:** Show client name as a column.

---

## Feature 2: Reporting Manager Role

### Schema — User model (`auth-api/src/models/User.js`)

```js
role: { type: String, enum: ['admin', 'pm', 'employee', 'reporting_manager'], default: 'employee' }
reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
```

`reportingManagerId` lives on the employee's User doc, pointing to their assigned RM.

### Authorization

- `requireRole` middleware already accepts variadic role strings — add `'reporting_manager'` where appropriate.
- **RM permissions:** View assigned employees' attendance, timesheets, and leave; approve/reject leave for assigned employees.
- **RM restrictions:** No access to admin settings, user role management, or org-wide data.

### API Changes

- `PATCH /admin/users/:id/role` — allow setting `reporting_manager` (admin only).
- `PATCH /admin/users/:id/reporting-manager` — **new endpoint**, admin assigns an RM to an employee by setting `reportingManagerId`. Body: `{ reportingManagerId: "<userId>" | null }`.
- `GET /users/my-team` — **new endpoint** for RMs, returns employees where `reportingManagerId === req.user.sub`.
- `GET /attendance/team` — extend to allow `reporting_manager` role, scoped to their assigned employees only.
- `GET /timesheets/review` — extend to allow `reporting_manager`, filtered to their assigned employees' timesheets.

### Frontend

- **Admin user management table:** Add a "Reporting Manager" dropdown column so admins can assign an RM to each employee.
- **Role dropdown:** Add "Reporting Manager" option.
- **RM dashboard:** Team view similar to PM but scoped to assigned employees — attendance summary, leave requests, timesheet status.

---

## Feature 3: Leave Workflow Enhancement

**Depends on:** Feature 2 (Reporting Manager role).

### Current Flow

Employee → PM/Admin approval.

### New Flow

Employee → Reporting Manager (if assigned) → Approval.
If no RM assigned, falls back to Admin directly.

### Schema — Leave model (`auth-api/src/models/Leave.js`)

Add one field:

```js
assignedApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
```

Set at request creation time based on the employee's `reportingManagerId`. Null means admin fallback.

### API Changes

- `POST /leave` — on creation, look up requester's `reportingManagerId`. If present, set `assignedApprover` to that RM. If absent, leave null.

- `GET /leave/pending` — change query logic:
  - **Admin:** sees all pending requests (unchanged).
  - **Reporting Manager:** sees pending requests where `assignedApprover === req.user.sub`.
  - **PM:** retains current behavior for backward compatibility — sees requests where `assignedApprover` is null (employees with no RM assigned).

- `PATCH /leave/:id/decide` — allow `reporting_manager` role. Validate that the RM is the `assignedApprover` for this specific request. Admin can always override and approve any request.

### Notifications

Trigger on status changes:
- Leave submitted → notify assigned approver (RM or Admin).
- Leave approved/rejected → notify employee.

Notification mechanism: in-app (stored in DB) and/or email via existing Nodemailer setup.

---

## Feature 4: Billable Hours in Timesheets

**Depends on:** Feature 1 (Project billing type must exist).

### Schema — Timesheet model (`auth-api/src/models/Timesheet.js`)

Add a `billable` sub-schema to each task row, alongside `entries` and `notes`:

```js
const billableSchema = new mongoose.Schema(
  {
    mon: { type: Boolean, default: null },
    tue: { type: Boolean, default: null },
    wed: { type: Boolean, default: null },
    thu: { type: Boolean, default: null },
    fri: { type: Boolean, default: null },
  },
  { _id: false }
);

// In taskSchema:
billable: { type: billableSchema, default: () => ({}) }
```

`null` means "inherit from project's billingType." Explicit `true`/`false` is a PM/Admin override.

### API Changes

- `GET /timesheets/:weekStart` — for each task row with a linked `taskId`, resolve the effective billable status per day by looking up the task's project. Return both `billable` (raw overrides) and `effectiveBillable` (resolved values) so the frontend knows the source.

- `PUT /timesheets/:weekStart` — accept `billable` per task row. Any user can submit, but only PM/Admin/RM can set a value that differs from the project default.

- `GET /timesheets/review` — include billable summary per timesheet: `{ billableMinutes, nonBillableMinutes }`.

### New Reporting Endpoint

- `GET /reports/utilization?startDate=...&endDate=...` — PM/Admin only.
  - Aggregates across timesheets in the date range.
  - Returns per-employee: `{ userId, displayName, totalMinutes, billableMinutes, utilizationPct }`.
  - `utilizationPct = billableMinutes / totalMinutes * 100` (0 if totalMinutes is 0).
  - Also returns org-level summary totals.

### Frontend

- **TimesheetGrid / TaskRow:** Add a billable toggle ($ icon or small checkbox) per cell. Auto-filled from project billing type, visually distinct when overridden (e.g., different color). Only PM/Admin/RM can toggle overrides.
- **SummaryTiles:** Show "Billable: Xh | Non-Billable: Yh" alongside total hours.
- **Utilization Report page** (PM/Admin): Table of employees with billable hours, non-billable hours, utilization %. Filterable by date range.

---

## Feature 5: URL Tracking (API-only, capture mechanism deferred)

### New Model — UrlActivity (`auth-api/src/models/UrlActivity.js`)

```js
const urlActivitySchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url:        { type: String, required: true, trim: true },
  title:      { type: String, default: '' },
  category:   { type: String, enum: ['productive', 'neutral', 'non-productive'], default: 'neutral' },
  startedAt:  { type: Date, required: true },
  endedAt:    { type: Date, default: null },
  durationMs: { type: Number, default: 0 },
  source:     { type: String, default: 'api' },  // 'api', 'extension', 'agent'
});

urlActivitySchema.index({ userId: 1, startedAt: -1 });
urlActivitySchema.index({ category: 1 });
```

### New Model — UrlCategory (`auth-api/src/models/UrlCategory.js`)

```js
const urlCategorySchema = new mongoose.Schema({
  pattern:  { type: String, required: true, unique: true },  // domain or regex
  category: { type: String, enum: ['productive', 'neutral', 'non-productive'], required: true },
  label:    { type: String, default: '' },  // e.g. "GitHub", "YouTube"
});
```

Admin-managed categorization rules. URLs are auto-categorized on ingest by matching against these patterns. Unmatched URLs default to `neutral`.

### New Routes — `/url-tracking`

- `POST /url-tracking/activities` — bulk ingest (authenticated). Body: `{ activities: [{ url, title, startedAt, endedAt }] }`. Auto-categorizes using UrlCategory rules. Records against `req.user.sub`.
- `GET /url-tracking/activities?startDate=...&endDate=...` — get activities. Employee sees own; PM/Admin sees all; RM sees assigned team.
- `GET /url-tracking/summary?startDate=...&endDate=...` — aggregated report. Returns: `{ byCategory: { productive: totalMs, neutral: totalMs, ... }, topUrls: [{ url, totalMs, category }], byUser: [...] }`. Scoped by role same as activities.
- `POST /url-tracking/categories` — admin creates categorization rule.
- `GET /url-tracking/categories` — list all rules.
- `PATCH /url-tracking/categories/:id` — update a rule.
- `DELETE /url-tracking/categories/:id` — delete a rule.

### Frontend

- **URL Activity Report page** (PM/Admin/RM): Table showing time per URL, category badges, filters by date range and employee. Summary cards for productive/neutral/non-productive breakdown.
- **Admin: URL Categories page:** CRUD for categorization rules (pattern → category).
- **Employee view:** Personal URL activity summary (read-only, for transparency).

---

## Implementation Order

| Phase | Feature | Dependencies | Key Changes |
|-------|---------|-------------|-------------|
| 1 | Client & Billing on Projects | None | Project model + creation form + detail page |
| 2 | Reporting Manager Role | None | User model + admin UI + RM dashboard |
| 3 | Leave Workflow Enhancement | Phase 2 | Leave model + routing logic + notifications |
| 4 | Billable Hours in Timesheets | Phase 1 | Timesheet model + grid UI + utilization report |
| 5 | URL Tracking API | None | New models + routes + report pages |

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL capture mechanism | API-only for now | Capture mechanism (extension/agent) deferred; build backend + reporting UI first |
| Reporting Manager modeling | New role enum value | Clean separation, simple auth checks via existing `requireRole` middleware |
| Leave approval fallback | Admin fallback | If no RM assigned, leaves go to Admin — backward compatible |
| Billable inheritance | Auto-inherit, editable | Timesheet entries default to project billing type; PM/Admin can override per-entry |
| Utilization formula | Billable / Total logged | `utilizationPct = billableMinutes / totalMinutes * 100` — industry standard |
