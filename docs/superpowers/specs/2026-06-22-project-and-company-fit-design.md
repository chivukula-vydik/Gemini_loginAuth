# Two-axis fit: Project fit (PM) + Company fit (Admin)

Date: 2026-06-22

## Problem

Today, staffing a project happens through an inline `CandidatePicker` on the
project detail page. It does two jobs badly at once:

1. It mixes a **contextual** staffing question ("is this person right for *this*
   project?") with a **persistent reputation** signal (the re-estimation
   "past record" line), cluttering the PM's view with data they shouldn't be
   judging people on while staffing.
2. It adds members with a single click, giving the PM no real surface to weigh a
   person's stats before committing them to the project.

We split this into two independent, role-scoped verdicts.

## The model

| | **Project fit** (PM) | **Company fit** (Admin) |
|---|---|---|
| Question | "Right person for *this* project?" | "Is this person reliable, generally?" |
| Scope | Per-project, contextual | Per-person, persistent |
| Signals | skills match · availability/load · role alignment · active task count | re-estimation frequency · direction (under/over-scope) · completion rate · on-time / delay |
| Seen by | PM (and admin) | Admin only |

The re-estimation signal is **not deleted** — it is **relocated** off the PM's
staffing surface and into the admin's reputation view.

## Part 1 — PM Project-fit page (built first)

### Navigation
The inline picker in the project detail "Members" card is removed. In its place,
a **"Staff members"** button opens a **full-screen view**, using the same
state-based navigation the app already uses to open a project (no router added).
The view has a back affordance returning to the project detail.

### Layout
One **rich card per non-member candidate**:
- Avatar, name, role label.
- A **verdict badge**: `Good fit ✓` / `OK` / `Poor`.
- The stats that justify the verdict:
  - Load bar + label, e.g. `Available · 12h / 40h` (existing `status`,
    `hours`, `capacity`, `loadPct`).
  - Skill chips: `✓ React` for matched, `⚠ AWS` for missing.
  - **Active task count** (new field) — open tasks already assigned.
  - Role-alignment note when relevant, e.g. "PM added as member".
- An **Add** button. Adding the member returns to the project detail (reusing the
  existing `updateProjectMembers` flow).

No re-estimation data appears anywhere on this page.

### Verdict logic
Pure module `web/src/pm/projectFit.ts` (+ `projectFit.test.ts`), no React:

```
fit(candidate) ->
  Good : all required skills present AND status != busy AND activeTaskCount < TASK_LIMIT
  Poor : missing skills AND (status == busy OR activeTaskCount >= TASK_LIMIT)
  OK   : otherwise (a single gap: some missing skills, OR busy, OR heavy load)
```

`TASK_LIMIT` is a named constant (start at 5; tune later). Role alignment is a
displayed note, not part of the Good/OK/Poor score (adding a PM as a member is
unusual but not "wrong").

## Part 2 — Admin Company-fit reputation view (built second)

### Navigation
A **new admin nav tab** ("Company fit") alongside Users / Skills / Projects /
Requests. Admin role only — added to `navForRole`, `NavKey`, `viewFor`, and the
icon map in `AppShell`.

### Layout
One row/card per active person with a **reliability badge**
(`Reliable` / `Mixed` / `Unreliable`) plus underlying stats:
- Re-estimation frequency: total count + rate.
- Direction: under-scoping vs over-scoping, derived from each entry's
  `fromHours` → `toHours` (`toHours > fromHours` = under-scoped the original
  estimate; `toHours < fromHours` = over-scoped).
- Completion rate: done / assigned tasks.
- On-time rate + average delay (see constraint below).

### Verdict logic
Pure module `web/src/pm/companyFit.ts` (+ `companyFit.test.ts`), no React.
Combines re-estimation rate, completion rate, and on-time rate into
`Reliable` / `Mixed` / `Unreliable`. Exact thresholds defined in the module with
tests; people with no history default to a neutral `Reliable` / "no signal yet"
rather than a false negative.

## Backend changes

1. `GET /projects/:id/candidates` (`auth-api/src/routes/projects.js`):
   - **Add** `activeTaskCount` per user (count of non-done tasks where the user
     is an assignee — already iterating these tasks for `committedHours`).
   - **Remove** `pastRecord` from the response. Re-estimation leaves the PM
     surface. (`summarize`/`reestimations` service stays; it moves to the admin
     endpoint.)

2. **New** `GET /users/reputation` (`auth-api/src/routes/users.js`), admin only
   (`requireRole('admin')`): returns per-active-user reputation rollup —
   re-estimation summary, direction counts (under/over), completion rate, and
   on-time rate + avg delay. Pure rollup helpers live in
   `auth-api/src/services/reputation.js` (+ tests).

3. **Add `completedAt`** to the `Task` model (`Date`, default `null`), stamped
   when a task transitions to `status: 'done'` (and cleared if it moves back out
   of done). This is what makes on-time / delay computable.

## Constraint: on-time data is forward-looking

Tasks currently store `dueDate` and `status: 'done'` but **no completion
timestamp**. Therefore:
- **Completion rate** works immediately for everyone.
- **On-time rate / average delay** populate only **going forward**, once
  `completedAt` is stamped. Tasks completed before this change show `—` for the
  on-time stat, and the company-fit verdict treats "no on-time signal" as
  neutral rather than penalizing it.

## Type changes (`web/src/pm/pmApi.ts`)

- `Candidate`: add `activeTaskCount: number`; remove `pastRecord` (and the now
  unused `PastRecord` usage from the candidate path — keep `PastRecord` if still
  referenced by the reputation types).
- New types for the reputation response consumed by the admin view.
- `web/src/pm/pastRecord.ts` (`pastRecordLabel`, `isScopingRisk`) is removed from
  the candidate path; its logic, if still needed, moves under the company-fit
  module.

## Testing

- `projectFit.test.ts`: Good/OK/Poor across skill/availability/task-count combos,
  boundary at `TASK_LIMIT`.
- `companyFit.test.ts`: Reliable/Mixed/Unreliable, "no signal" neutral case,
  under vs over-scoping direction.
- `reputation.test.js` (backend): rollup math — direction counts, completion
  rate, on-time rate with and without `completedAt`.
- Existing candidate/staffing tests updated for the `activeTaskCount` field and
  removed `pastRecord`.

## Build order

1. Backend: `activeTaskCount` on candidates, remove `pastRecord`, `completedAt`
   on Task + stamping, `projectFit` UI page. (PM axis end-to-end.)
2. Backend `reputation.js` + `/users/reputation`, admin "Company fit" tab and
   `companyFit` UI. (Admin axis end-to-end.)

## Out of scope

- No routing library; reuse state-based view switching.
- No tuning dashboard for thresholds — constants in the pure modules.
- No historical backfill of `completedAt`.
