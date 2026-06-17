# Project Management — Slice A (Foundation) Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Branch:** `project-management`

## Context

The application today is a single-user **weekly timesheet**: each user logs free-text
task names with minutes per weekday (`Timesheet` collection, keyed by user + week).
Authentication supports local email/password plus Google/SAML via Passport, issuing a
short-lived JWT access token and a rotating refresh token. There are no roles, no
projects, and no notion of assigned work.

The larger vision is a **closed-loop project execution and resource management
platform** spanning eight subsystems: roles & skills, projects & structured tasks, PM
assignment, a skill-matched task marketplace, daily check-in, end-of-day progress
logging (hours + % complete), burn-rate intelligence, and dashboards with dependency
risk alerts.

That vision is too large for one spec or one build. It is decomposed into
dependency-ordered slices, each shipping working software:

- **Slice A — Foundation (this spec):** roles, user skills, a real Projects/Tasks data
  model, and PM assignment.
- **Slice B — Daily loop:** check-in, an employee "today" workspace, end-of-day progress
  logging (hours + % complete) and task status changes, evolving the timesheet.
- **Slice C — Marketplace:** unassigned-task backlog and skill-matched claiming.
- **Slice D — Intelligence:** burn-rate (Planned vs Actual) flags, dashboards, and
  dependency risk alerts.

This document specifies **Slice A only**. Later slices get their own spec → plan →
implementation cycle.

## Goals

- Introduce three roles — **Admin**, **PM**, **Employee** — with enforced authorization.
- Let an Admin manage users' roles and an Admin-curated **skill catalog**.
- Let employees record their own skills from the catalog.
- Let a PM create projects (one owning PM + a member list), create tasks within them,
  and assign tasks to project members.
- Let employees see the tasks assigned to them (read-only in this slice).
- Keep the existing weekly timesheet working, untouched.

## Non-Goals (deferred to later slices)

- `percentComplete` and hours-logged on tasks; task **status changes** by employees → **Slice B**.
- Daily check-in / today workspace → **Slice B**.
- Marketplace claiming of unassigned tasks → **Slice C**.
- Burn-rate flags, Planned-vs-Actual dashboards, dependency **risk alerts** → **Slice D**.
  (The `dependsOn` field is stored now to avoid a later migration, but nothing acts on it.)

## Architecture

Extend the existing `auth-api` monolith and the existing React SPA. No new services,
no new infrastructure. New domain data lives in **separate top-level collections**
(`Skill`, `Project`, `Task`) referencing `User`, because tasks must be queried
independently of projects (an employee's tasks across projects, the future
unassigned-marketplace, dependency lookups).

### Data model

Existing `User` (extended):

```
User
  email, displayName, passwordHash, providers, createdAt   (existing)
  role:   'admin' | 'pm' | 'employee'   default 'employee'
  skills: [ObjectId -> Skill]           default []
```

New `Skill` (Admin-managed catalog):

```
Skill
  name:   string, required, unique (case-insensitive)
  active: boolean, default true
```

New `Project`:

```
Project
  name:        string, required
  description: string, default ''
  ownerPm:     ObjectId -> User, required   (must have role 'pm' or 'admin')
  members:     [ObjectId -> User], default []
  status:      'active' | 'archived', default 'active'
  startDate:   Date | null
  targetDate:  Date | null
  createdAt:   Date, default now
```

New `Task`:

```
Task
  project:        ObjectId -> Project, required
  title:          string, required
  description:    string, default ''
  estimatedHours: number, default 0
  requiredSkills: [ObjectId -> Skill], default []
  assignee:       ObjectId -> User | null, default null  (null = unassigned)
  status:         'todo' | 'in_progress' | 'blocked' | 'done', default 'todo'
  dependsOn:      [ObjectId -> Task], default []          (stored only this slice)
  dueDate:        Date | null
  createdBy:      ObjectId -> User, required
  createdAt:      Date, default now
```

### Authorization

`role` is added as a claim in the JWT access token (`signAccessToken`) so middleware
and the frontend can gate without an extra DB read. **Tradeoff:** a role change takes
effect on the user's next access-token refresh (≤15 min, the current `ACCESS_TTL`).
Accepted for this slice.

A new middleware composes with the existing `requireAuth`:

```
requireRole(...allowed)  → 403 unless req.user.role ∈ allowed
```

Pure, unit-tested authorization helpers hold the security-critical rules:

- `resolveRole(user, env)` — bootstrap: if `user.email === env.ADMIN_EMAIL` and the user
  is not already admin, returns `'admin'`; otherwise returns the stored role. Applied on
  login/registration. Idempotent; no manual DB editing to seed the first Admin.
- `canEditProject(user, project)` — true if `user.role === 'admin'` or
  `project.ownerPm === user.sub`.
- `canCreateTask(user, project)` — same rule as `canEditProject`.
- `canViewProject(user, project)` — admin, owner PM, or a listed member.

Ownership rules:
- **Admin:** unrestricted.
- **PM:** may create projects (becomes `ownerPm`), and edit/create tasks only within
  projects they own.
- **Employee:** read-only on projects they are a member of and tasks assigned to them;
  may edit only their own `/me/skills`.

### API routes

```
Admin (requireRole('admin'))
  GET   /admin/users                 list users (id, email, displayName, role)
  PATCH /admin/users/:id/role        body { role }; set role
  POST  /admin/skills                body { name }; add catalog skill
  PATCH /admin/skills/:id            body { name?, active? }; rename / deactivate

Catalog (requireAuth)
  GET   /skills                      list active skills

Profile (requireAuth)
  PATCH /me/skills                   body { skillIds:[] }; employee sets own skills (catalog-validated)

Projects
  POST  /projects                    requireRole('pm','admin'); ownerPm = caller
  GET   /projects                    requireAuth; admin: all, pm: owned, employee: member-of
  GET   /projects/:id                requireAuth + canViewProject; returns project + its tasks
  PATCH /projects/:id                canEditProject; edit fields / archive

Tasks
  POST  /projects/:id/tasks          canCreateTask; create task in project
  PATCH /tasks/:id                   canEditProject(task.project); PM/Admin only this slice
  GET   /tasks/mine                  requireAuth; tasks where assignee = caller
```

Input validation rejects: assigning a task to a non-member, requiring/granting a skill
not in the catalog, and setting `ownerPm`/assignee to a user whose role is incompatible
(assignee may be any member; ownerPm must be pm/admin).

### Frontend

`authContext` exposes `role` (from the token). `AppShell`'s sidebar — currently a single
hard-coded "Timesheet" link — becomes role-aware via a pure helper `navForRole(role)`.
Views switch with lightweight in-app state / hash (no `react-router` dependency), matching
the current minimal approach. New screens reuse the existing card/table styling.

```
navForRole('admin')    → Users, Skills, Timesheet
navForRole('pm')       → Projects, Timesheet
navForRole('employee') → My Tasks, My Skills, Timesheet
```

Screens:
- **Admin → Users:** user table with a role dropdown (`PATCH /admin/users/:id/role`).
- **Admin → Skills:** catalog list with add + deactivate.
- **PM → Projects:** owned-project list + "New Project" form; **Project detail:** task
  table with a create-task form, an assignee picker (project members), and a
  required-skills multiselect from the catalog.
- **Employee → My Tasks:** read-only list grouped by project (title, estimate, status,
  due date); **My Skills:** catalog multiselect.

The existing Timesheet remains for all roles, unchanged.

## Testing

Proportional to the current codebase (pure logic tested via `node:test`):

- **Backend unit tests:** `resolveRole`, `canEditProject`, `canCreateTask`,
  `canViewProject` — the security-critical rules.
- **Backend route tests (minimal):** with `mongodb-memory-server`, verify an `employee`
  receives `403` on a PM route and `200` on `/tasks/mine`; a PM cannot edit a project
  they don't own.
- **Frontend unit test:** `navForRole(role)` returns the correct links per role.
- Component tests are skipped (heavier than this codebase currently invests); view logic
  stays thin around the tested helpers.

## Bootstrapping & migration

- No data migration required: new `User` fields default (`role: 'employee'`, `skills: []`)
  for existing documents.
- First Admin: set `ADMIN_EMAIL` in the environment; that user becomes admin on next
  login via `resolveRole`.
- New env var documented in `.env.example`: `ADMIN_EMAIL`.

## Open questions

None outstanding for Slice A. Cross-slice items (how progress logging connects to tasks,
marketplace claim flow, dashboard metrics) are intentionally deferred to their slices.
