# Task Marketplace (Slice C) — Design

**Date:** 2026-06-16
**Status:** Approved (design)
**Branch:** `project-management`
**Builds on:** Slice A (skills, projects/tasks), Slice B (timesheet integration)

## Context

Skills are collected (admin catalog, employee `My Skills`, task `requiredSkills`) but
nothing consumes them — there is no matching logic anywhere. This slice makes skills useful
by building the **Task Marketplace**: employees discover unassigned tasks in their projects
that fit their skills and **claim** them; the owning **PM approves** the claim, which
assigns the task.

## Goals

- An employee sees a marketplace of **claimable** tasks: unassigned, not done, in a project
  they are a **member** of, and **skill-matched**.
- The employee **claims** a task → creates a pending claim request (no immediate assignment).
- The owning **PM/Admin approves or denies** the claim from the existing Requests view.
  Approving assigns the task to the claimant and **auto-denies competing** pending claims.

## Non-Goals

- Cross-project / org-wide discovery (marketplace is limited to the employee's projects).
- Auto-join: since the employee is already a member, no membership change on approval.
- Burn-rate dashboards and dependency alerts (Slice D).

## Matching rule

Pure, unit-tested helper `skillsMatch(requiredSkillIds, userSkillIds)`:
- returns **true** if `requiredSkillIds` is empty (task open to everyone), **or**
- at least one id in `requiredSkillIds` is also in `userSkillIds` (overlap).

A task is **claimable by employee U** when: `assignee == null` AND `status != 'done'` AND
`U ∈ project.members` AND `skillsMatch(task.requiredSkills, U.skills)`.

## Data model

```
ClaimRequest (new)
  taskId:    ObjectId -> Task, required
  userId:    ObjectId -> User, required        (the employee claiming)
  status:    'pending' | 'approved' | 'denied', default 'pending'
  decidedBy: ObjectId -> User | null
  decidedAt: Date | null
  createdAt: Date, default now
index: { taskId: 1, status: 1 }, { userId: 1 }
```

`Task`, `User`, `Skill` unchanged (reuse `requiredSkills`, `user.skills`).

## API

```
GET /marketplace                         (employee; requireAuth)
  - find candidate tasks: assignee=null, status != 'done', project in {projects where
    members contains me}.
  - filter by skillsMatch(task.requiredSkills, myUser.skills).
  - enrich each with project name, requiredSkills names, estimatedHours, and
    myClaimStatus: 'pending' if I have a pending ClaimRequest on it, else 'none'.

POST /tasks/:id/claim                    (employee; requireAuth)
  - load task; re-validate claimable-by-caller (assignee null, not done, caller is a
    member of task.project, skillsMatch). 400 if not claimable.
  - dedupe: 409 if caller already has a pending ClaimRequest for this task.
  - create pending ClaimRequest { taskId, userId: caller }. 201.

GET /claim-requests?status=pending       (requireRole pm/admin)
  - pending claims whose task's project is owned by the caller (admin: all).
  - enrich with employee { displayName, email }, task { _id, title }, project { name }.

PATCH /claim-requests/:id                (requireRole pm/admin)
  body { decision: 'approved' | 'denied' }
  - load claim + task + project; require canEditProject(caller, project) (owning PM/admin).
  - if approved:
      - 409 if task.assignee already set (taken/assigned elsewhere).
      - set task.assignee = claim.userId; save task.
      - mark this claim approved (decidedBy/decidedAt).
      - auto-deny the OTHER pending claims for the same task (decidedBy/decidedAt).
  - if denied: mark this claim denied.
```

Authorization summary: employees create/claim for themselves only (`userId = req.user.sub`).
Only the task's owning PM (or Admin) lists/decides claims (`canEditProject(task.project)`).

## Frontend

- `navForRole('employee')` adds a `marketplace` item → My Tasks · My Skills · Marketplace ·
  Timesheet. `NavKey` gains `'marketplace'`; `AppShell` routes it to `<Marketplace />`.
- **`Marketplace.tsx`** (employee): table of claimable tasks — title, project, required-skill
  chips, estimate — with a **Claim** button; if `myClaimStatus === 'pending'` show a disabled
  **"Claim pending"** label instead. Claiming calls `POST /tasks/:id/claim` then reloads.
- **`Requests.tsx`** (PM/Admin): add a second card/section **"Task claims"** below the
  existing edit-requests table — columns employee · task · project, with **Approve / Deny**.
- **API client (`pmApi.ts` / a small `marketplaceApi`):** `listMarketplace()`,
  `claimTask(id)`, `listClaimRequests()`, `decideClaimRequest(id, 'approved'|'denied')`.

## Testing

- **Backend unit:** `skillsMatch` — empty required → true; overlap → true; disjoint → false.
- **Backend route:**
  - `GET /marketplace` returns only unassigned, member-project, skill-matched tasks; excludes
    assigned/non-member/non-matching ones; marks `myClaimStatus`.
  - `POST /tasks/:id/claim` rejects a non-member or non-matching task (400); dedupes (409);
    creates pending otherwise.
  - `GET /claim-requests` is 403 for an employee.
  - `PATCH /claim-requests/:id` approve assigns the task and auto-denies a competing claim;
    a non-owning PM is 403.
- **Frontend unit:** `navForRole('employee')` includes `marketplace`.
- Existing behavior (assignment, timesheet, approvals) stays green.

## Migration

None — `ClaimRequest` is new; no changes to existing collections.
