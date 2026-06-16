# Timesheet ↔ PM Integration (Slice B core) + Slice A Polish — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Branch:** `project-management`
**Builds on:** `2026-06-16-project-management-slice-a-design.md`

## Context

Slice A added roles, a skill catalog, Projects/Tasks, and PM assignment. Two gaps remain:

1. **No connection between the timesheet and PM tasks.** The weekly timesheet stores
   free-text rows (`{ id, name, entries: {mon..fri: minutes} }`) per user per week and
   nothing flows back to PM tasks. An employee's assigned tasks do not appear where they
   log time, so the "closed loop" (plan → execute → actuals) is broken.
2. **Slice A UI limitations.** Projects have no member-management UI, and the PM screens
   show user/assignee **ObjectIds** instead of names. The Slice A plan consciously
   deferred these; they are completed here because member management is a prerequisite
   for assigning tasks that then appear in an employee's timesheet.

This slice delivers the **core daily loop**: assigned tasks appear as timesheet rows, the
employee logs time and sets % complete, actual hours roll up, and PMs see Planned vs
Actual per task.

## Goals

- An employee's assigned PM tasks (status ≠ done) appear automatically as rows in their
  **editable** timesheet weeks, alongside their own ad-hoc rows.
- Logging minutes against a PM-task row contributes to that task's **actual hours**
  (computed by aggregation, never stored).
- The employee sets **% complete** and **status** on their assigned tasks (from the
  timesheet row).
- PMs see **Planned (estimate) vs Actual (hours) + % complete** per task on project detail;
  employees see the same on My Tasks.
- PMs can **manage project members** and the UI shows **names**, not IDs.

## Non-Goals (later slices)

- Marketplace claiming of unassigned tasks → Slice C.
- Burn-rate flags, project/employee roll-up dashboards, dependency risk alerts → Slice D.
- Daily check-in / attendance → later.

## Approach

**Actual hours are computed on demand (Approach A), not denormalized.** The timesheet
remains the single source of truth for minutes. Each timesheet row gains an optional
`taskId` link. Actual minutes per task are aggregated from the `Timesheet` collection when
needed. `percentComplete` is stored on the `Task` (a human judgment, not derivable).

Rejected alternatives: denormalized `actualMinutes` on `Task` (drift-prone per-week delta
updates); a separate time-log collection (duplicates the timesheet the user explicitly
wants to reuse).

## Data Model

```
Task (extend)
  + percentComplete: number, default 0   (0–100; set by the assignee)
    status: existing enum; the assignee may now change it

Timesheet.tasks[] embedded row (extend)
  + taskId: ObjectId -> Task | null, default null
    id, name, entries: unchanged
  • taskId set   → "PM-task row": name mirrors the PM task, locked, not deletable
  • taskId null  → "ad-hoc row": today's fully editable/deletable behavior
```

`actualMinutes` is never stored. It is computed by aggregating `Timesheet` entries whose
`tasks.taskId` matches the task.

## API

```
GET /timesheets/:weekStart            (employee; existing route, extended)
  • Editable week (weekStart >= current Monday): merge the user's assigned tasks
    (assignee = user, status != 'done') into the response. Every such task gets a row
    (taskId set, name from task, zero entries if not already saved). Existing saved rows
    keep their minutes. PM-task rows include percentComplete + estimatedHours for display.
  • Read-only past week: return saved rows unchanged, no injection.
  • Response row shape adds: taskId, locked (bool), percentComplete?, estimatedHours?.

PUT /timesheets/:weekStart            (employee; existing route, extended)
  • Persists rows, now preserving taskId on each row.
  • Validation: any row with a non-null taskId must reference a task currently assigned to
    this user; otherwise that row's taskId is dropped (logged as ad-hoc). Ad-hoc rows keep
    taskId null. Minute sanitization unchanged.

PATCH /tasks/:id/progress             (assignee only; NEW)
  • body { percentComplete?, status? }
  • Authorization: req.user.sub === task.assignee (else 403).
  • percentComplete coerced and clamped to 0–100; status must be in the enum.

GET /tasks/mine                       (employee; existing, extended)
  • Each task enriched with actualMinutes (computed) for actual-vs-estimate display.

GET /projects/:id                     (existing, extended)
  • Each task enriched with actualMinutes (computed).
  • assignee and members populated with { _id, displayName, email } (Slice A fix).

GET /users                            (auth, role pm/admin; NEW)
  • Returns a minimal directory [{ _id, displayName, email }] for member/assignee pickers.

PATCH /projects/:id                   (existing) — already supports members; used by the
                                        new member-management UI.
```

Aggregation service `auth-api/src/services/actuals.js`:
`actualMinutesByTask(taskIds)` → runs a `Timesheet` aggregation (`$unwind` tasks, `$match`
`tasks.taskId ∈ taskIds`, `$group` by `tasks.taskId` summing `mon+tue+wed+thu+fri`) and
returns a `Map<taskIdString, minutes>`. Callers default missing tasks to 0.

## Authorization

- `PATCH /tasks/:id/progress`: assignee-only (new rule; pure helper `canLogProgress(user,
  task)` → `String(task.assignee) === userId(user)`), unit-tested alongside the Slice A
  authz helpers.
- `PUT /timesheets`: taskId on a row is honored only if that task is assigned to the caller.
- `GET /users`: `requireRole('pm','admin')`.
- Existing project/task ownership rules unchanged.

## Frontend

**Timesheet** (`timesheet/*`):
- `getWeek` response rows now carry `taskId`, `locked`, `percentComplete`, `estimatedHours`.
- `TaskRow`: when `locked` (PM-task row) the name is read-only with a small project label
  and no delete button; the row shows a **% complete** input, a **status** dropdown, and a
  compact **Planned Xh / Actual Yh** readout. Ad-hoc rows are unchanged.
- %/status changes call `PATCH /tasks/:id/progress` (independent of the debounced minutes
  autosave). Future-day cell locking from the prior fix still applies.
- `+ Add task` continues to add ad-hoc (taskId null) rows.

**PM → Project detail** (`pm/Projects.tsx`):
- Member management: "Add member" picker sourced from `GET /users` (excluding existing
  members) → `PATCH /projects/:id`; members listed by name with a remove control.
- Assignee picker and task table render names.
- Task table adds Planned / Actual / % complete / status columns.

**Employee → My Tasks** (`pm/MyTasks.tsx`): adds actual hours, % complete, and status.

**API client** (`pm/pmApi.ts`, `timesheet/timesheetApi.ts`): add `listDirectory()` (GET
/users), `setTaskProgress(id, {percentComplete?, status?})`; extend timesheet `Task` type
with `taskId`, `locked`, `percentComplete`, `estimatedHours`; populated assignee/member
shapes on `Project`/`Task`.

## Testing

- **Backend unit:** `canLogProgress` (assignee-only). `actualMinutesByTask` shape via a
  small aggregation test with seeded timesheets (mongodb-memory-server).
- **Backend route:** assigned task appears in `GET /timesheets/:week` for the current week
  but not a past week; `PATCH /tasks/:id/progress` returns 403 for a non-assignee and 200 +
  clamps for the assignee; `PUT /timesheets` strips a taskId not assigned to the caller;
  `GET /tasks/mine` includes `actualMinutes`; `GET /users` is 403 for an employee.
- **Frontend unit:** any new pure helper (e.g. row classification `isPmRow(row)`).
- Existing timesheet behavior (ad-hoc rows, autosave, past-week read-only, future-day lock)
  must remain green.

## Migration

- No migration required: `Task.percentComplete` defaults to 0; existing timesheet rows have
  no `taskId` (treated as ad-hoc/null). Existing saved timesheets keep working.

## Open Questions

None. Marketplace, dashboards, and dependency alerts remain in later slices.
