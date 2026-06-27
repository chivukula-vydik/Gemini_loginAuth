
# Role-Permission Matrix Redesign

## Problem

The current role-permission mapping has three structural problems:

1. **Nav implies power the role doesn't have.** Four roles show pages with zero actionable controls — dead-end screens that read like bugs.
2. **Approval powers copy-pasted across roles.** `requireRole('admin', 'pm', 'reporting_manager')` is stamped on every approval endpoint regardless of whether PM or admin should actually approve that type of request.
3. **No personal base layer.** Self-service items (My Tasks, My Skills, Marketplace) are employee-only, so getting promoted deletes your personal layer — an admin can't see their own skills.

## Design Principles

1. **Two-layer model.** A personal base every role inherits, plus role-specific additions on top. Promotion only ever adds; it never removes.
2. **Bidirectional consistency.** Every page a role sees must grant at least one action OR be explicitly tagged read-only. Every power a role has must have a surface to exercise it on.
3. **Three-layer enforcement.** Backend always enforces (non-negotiable). Frontend uses hide/disable/read-only depending on context.
4. **Scope over role.** PM and RM have similar powers but different scopes (project-membership vs reporting-line). Scope is the real access boundary.

## Personal Base (All Roles)

Every user in the system, regardless of role, sees these nav items:

| Nav Item | Purpose |
|----------|---------|
| Home | Role-aware dashboard with relevant widgets |
| My Tasks | View and manage own assigned tasks |
| My Skills | View and update own skill profile |
| Marketplace | Browse and apply for internal gigs |
| Timesheet | Fill and submit own timesheet |
| Attendance | View own attendance, apply for leave, request regularisation |
| My Requests | Track status of own submitted requests (leave, regularisation, reimbursements, overtime) |
| Organisation | View org tree |

**My Requests** is a new page. Currently employees can submit leave/regularisation from the Attendance page but have no way to track the status of their submissions. My Requests shows own submitted items with their current status (pending/approved/rejected). This is distinct from the Requests page (approval inbox) that elevated roles see.

## Role-Specific Additions

### admin

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| Users, Skills, Departments, Shifts, Company Fit, Projects, Requests, Utilization, Onboarding, Onboarding Tasks, Onboarding Templates | Everything — all approval types, org management, onboarding, platform configuration | Global |

Admin is the platform break-glass. It is the only role with override/force-approve capability. This power is decoupled from org seniority — being a VP does not grant bypass power.

### pm (Project Manager)

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| Projects, Requests, Utilization, Team Attendance (project-scoped) | Timesheet review, leave approval, regularisation, overtime approval, edit requests, first-level claim approval, project management | Project members only |

PM sees and can act on requests only from users assigned to their projects. Team Attendance is the same component RM uses, filtered by project membership instead of reporting line.

### reporting_manager

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| My Team, Requests, Team Attendance | Timesheet review, leave approval, regularisation, overtime approval, edit requests, first-level claim approval | Reporting line only |

RM is the primary approval authority for their direct/indirect reports. This is the default approval chain for all people-process actions.

### team_lead

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| My Team, Requests, Team Attendance | First-level leave approval, regularisation approval, timesheet review — escalates to RM. No overtime or claim approval. | Direct team only |

Team lead is a limited first-level approver. They can approve routine items (leave, regularisation, timesheets) for their direct team, but these escalate to RM for final sign-off. They cannot approve overtime or claims.

### hr

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| Users, Requests `[conditional]`, Team Attendance `[view]`, Onboarding, Onboarding Tasks, Onboarding Templates | Onboarding management (full CRUD). Leave and regularisation approval only when RM gate trips. | Global (when gate active) |

HR is not a parallel approval authority — that would break reporting-line accountability. HR's approval power is gated: it activates only when the RM is unassigned, inactive, or on extended leave. In the normal case, HR sees Requests as read-only for compliance/records purposes. When the gate trips for a specific request, approve/reject buttons appear for that request only.

**RM gate trigger conditions:**
- RM field is null/unassigned on the employee
- RM user is marked inactive
- RM is on approved leave exceeding a configurable threshold (default: 5 consecutive working days)

Team Attendance is read-only for HR — no actions, just visibility for compliance.

### finance

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| Projects `[view]`, Requests `[claims only]`, Utilization | Final claim/reimbursement sign-off (payment approval after manager's first-level approval) | All claims |

Finance is the final gate on spend. The approval chain for claims/reimbursements is: manager (PM or RM) does first-level validation → finance does final payment sign-off. Finance's Requests page is filtered server-side to show only claims and reimbursements — they never see leave, timesheet, regularisation, or overtime requests.

Projects is `[view]` (read-only) — finance needs project-level billing type, rates, milestones, and currency for cost context when reviewing claims. The Projects page surfaces this data; Utilization alone does not.

### executive (director + vp)

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| Users `[view]`, Projects `[view]`, Requests `[view]`, Utilization, Team Attendance `[view]` | None — pure oversight | Global read |

Directors and VPs are read-only oversight. They see rich data across the org but approve nothing. No action buttons are rendered — these are view-only surfaces by design, not disabled controls.

Both `director` and `vp` role strings map to the identical `executive` permission profile in route guards. They are one permission set maintained in one place; two role strings exist only because the org chart distinguishes the titles.

### employee

| Extra Nav | Powers | Scope |
|-----------|--------|-------|
| *(personal base only)* | None — can only submit and cancel own requests | Self |

Employees see only the personal base. All approval controls are hidden (not disabled — they don't exist for this role).

## Enforcement Model

### Backend (mandatory, non-negotiable)

Every privileged endpoint validates both role and scope server-side. The frontend is a convenience layer; the server is the authority.

**Status codes:**
- **Role violations → 403.** An employee hitting an approval endpoint. The role is wrong; the resource isn't sensitive.
- **Scope violations → 404.** A PM accessing a request for someone outside their projects. 404 avoids leaking that the resource exists. Same for RM accessing non-reportees.

### Frontend (three behaviors)

The frontend behavior for denied actions depends on whether the boundary is permanent, conditional, or by-design:

| Behavior | When to use | Examples |
|----------|-------------|---------|
| **Hide** | Action is structurally impossible for the role — permanently | Employee seeing no approve buttons; PM seeing no actions on non-project requests |
| **Disabled + tooltip** | Action is possible in principle but blocked by current state — the explanation is actionable | HR: "RM assigned — approval not available"; Finance: "Awaiting manager approval"; TL: "Escalates to RM" |
| **Read-only by design** | The surface was never meant to have actions — it's a data view | Executive oversight pages; HR's Team Attendance; Finance's Projects |

**Rule:** hide on permanent role boundaries, disable-with-reason on conditional/state gates, render no controls on oversight surfaces.

## Team Attendance: Scope-Aware Component

Team Attendance is a single component, not separate pages per role. It filters data based on the viewer's role:

| Viewer | Filter | Actions |
|--------|--------|---------|
| RM / TL | Reporting line (direct/indirect reports) | Regularisation approval, overtime approval (RM only) |
| PM | Project membership (users assigned to viewer's projects) | Regularisation approval, overtime approval |
| HR | All employees | Read-only — no approval actions |
| Executive | All employees | Read-only — no approval actions |

## Claim Approval Chain

Claims and reimbursements follow a two-step approval:

1. **First-level: Manager** (PM scoped to project, or RM scoped to reporting line) validates the claim is legitimate.
2. **Final: Finance** signs off on payment/budget.

Finance cannot act on a claim until the manager has approved it. Claims awaiting manager approval show a disabled button with tooltip "Awaiting manager approval" in Finance's view.

## Changes from Current System

### Nav changes

| Change | Reason |
|--------|--------|
| Add **My Requests** to personal base | Employees need a surface to track submitted requests |
| Add **My Tasks, My Skills, Marketplace** to all roles (currently employee-only) | Everyone is also an employee; promotion should not delete personal layer |
| Remove Requests from director/vp approval queue | Executives are oversight, not approvers; Requests becomes `[view]` |
| Filter finance Requests to claims only | Finance shouldn't see leave/timesheet/regularisation requests they can't act on |
| Tag HR Requests as conditional | HR approves only when RM gate trips, not as standing power |
| Add Team Attendance to PM nav | PM approves regularisation/overtime but had no attendance surface to see what they're approving |

### Backend changes

| Change | Reason |
|--------|--------|
| Remove `pm` from leave/timesheet/regularisation/overtime `requireRole` guards where PM scope isn't enforced | PM should only approve for project members, not globally |
| Add scope checks to PM and RM approval endpoints | Currently role-only; need to verify the request belongs to a project member (PM) or reportee (RM) |
| Add RM-gate logic for HR fallback | HR approval triggers only when RM is unassigned/inactive/on-leave |
| Add finance as final approver on claims | Currently claims go to PM/RM only; finance needs the final sign-off endpoint |
| Map `director` and `vp` to same permission profile | Currently identical but maintained as separate blocks; consolidate |
| Add `GET /requests/mine` endpoint | Returns own submitted requests for the My Requests page |
| Filter `GET /requests` for finance role to claims only | Server-side filtering, not just frontend |

### Frontend changes

| Change | Reason |
|--------|--------|
| Create **My Requests** page | New personal base page for tracking own submissions |
| Make Team Attendance scope-aware | Single component filtered by viewer's role instead of separate per-role views |
| Apply hide/disable/read-only per the enforcement table | Currently controls are shown/hidden inconsistently |
| Add disabled+tooltip rendering for conditional gates | HR conditional approve, finance awaiting-manager, TL escalation |
