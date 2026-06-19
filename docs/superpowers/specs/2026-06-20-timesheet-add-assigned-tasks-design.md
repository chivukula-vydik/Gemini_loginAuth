# Timesheet: deliberately add assigned tasks (+ "No task assigned")

**Date:** 2026-06-20
**Status:** Design (awaiting review)

## Problem

An employee can be on many projects with tasks assigned across all of them. Today
the weekly timesheet **auto-injects every non-done assigned task** as a locked
row: in `services/timesheetRows.js → mergeWeekRows`, when the week is
`injectable` (`weekStart >= currentMonday()`, set in the GET route), all of the
caller's non-done assignments are pushed in as locked rows — whether they touched
that task this week or not. With many projects the grid floods.

So the change is a **shift in control**, not new plumbing:
**from "every assigned task auto-appears" → "the employee adds the assigned tasks
they actually worked on this week."**

## Decision (the fork)

**Chosen: (A) clean week + deliberate add.** Assigned tasks no longer appear
automatically; the week starts with only the rows the employee has saved, and
they pull in the tasks they worked on. Rejected (B) "smart auto-add tasks
due/active this week" because tasks lack reliable per-week dates, so the auto-rule
would be guesswork — exactly what we're trying to remove. (Flip to B later is
possible; it only changes which tasks pre-populate.)

## Feature: Add my assigned tasks to my timesheet

### What it is
On the weekly timesheet, an **"Add a task"** control opens a picker of the
employee's assignable tasks — pulled across **all** projects they're a member of —
and adds the chosen one as a linked row for that week. Each linked row stays bound
to the real PM task (carries project, estimate, % complete), so logged hours feed
the task's actuals exactly as today's linked rows do.

### The picker
- Lists tasks where the caller is an **assignee** and the task is **not done**,
  across every project — labeled by **task title + project name** so duplicates
  across projects are distinguishable.
- **Excludes** tasks already present as rows in the current week.
- Plus a always-present **"No task assigned"** choice (below).

### "No task assigned"
- Picking it adds an **unlinked** (free-text) row — the same ad-hoc row that
  exists today, but surfaced as a clear named choice instead of a blank row.
- The employee names it themselves ("Standup", "Onboarding"); it counts toward the
  week's total but rolls up to **no** task's actuals (there is none).
- Always available — someone with zero assigned tasks can still fill a timesheet.

So the add flow is: **pick one of my assigned tasks (across projects) · or "No task assigned."**

### Behavior
- Adding is **per-week and deliberate** — no auto-injection of untouched tasks.
- A linked row stays **locked** to its task (name from the task, not renameable) —
  the existing locking model is unchanged.
- Free-text rows keep working as today for ad-hoc time.
- Hours on a linked row feed the task's actuals, same as now.
- Past/locked weeks and the start-date / edit-request rules are unchanged — this
  only changes how rows get *added* to an editable week.

## Architecture

### Server
- **`services/timesheetRows.js → mergeWeekRows`**: stop auto-injecting assigned
  tasks. Render the **saved** rows (linked + ad-hoc) exactly as today; drop the
  `editable`-gated injection of `assignedTasks`. (Saved linked rows still merge
  their task metadata.) The `editable`/`injectable` flag stays for "is this week
  writable", it just no longer pre-populates rows.
- **New `GET /timesheets/:weekStart/assignable`** (auth: the caller): returns the
  caller's non-done assigned tasks across their projects —
  `{ taskId, title, projectName, status, estimatedHours }` — **excluding** tasks
  already saved as rows for that week. Pure helper
  `assignableTasks(assigned, savedRows)` (TDD'd) does the exclusion so it's unit-tested.
- **`PUT /timesheets/:weekStart`** is unchanged: an added linked row is just a row
  with a `taskId` the caller is assigned to (already validated by `sanitizeRows`);
  an ad-hoc row is a `taskId: null` row (as today).

### Web
- **`timesheetApi.ts`**: `listAssignable(weekStart)` → the picker list type.
- **`TimesheetPage` / `TimesheetGrid`**: replace the bare "+ Add task" button with
  an **"Add a task"** control that opens a small picker (assigned tasks grouped/
  labeled by project + a "No task assigned" item). Selecting an assigned task adds
  a locked row carrying its `taskId`/metadata; selecting "No task assigned" adds a
  blank unlinked row (today's `newTask()` behavior). After add, the existing
  autosave persists it.
- Picker refetches its list after each add (added task drops out).

## Testing
- `timesheetRows.test.js`: `mergeWeekRows` no longer injects assigned tasks
  (an assigned-but-unsaved task does not appear; saved linked + ad-hoc rows still
  render with metadata). New `assignableTasks(assigned, savedRows)`: excludes
  already-saved taskIds, drops done tasks, keeps cross-project tasks.
- `routes.test.js`: `GET /timesheets/:week/assignable` returns the caller's
  non-done assigned tasks minus those already in the week; auth is per-caller.
- Web: `listAssignable` typing via `tsc`; picker add-flow logic kept thin over the
  tested helper.

## Out of scope
- The approvals/submit flow (unchanged).
- The capacity / candidate-picker work (separate feature).
- Reporting rollups.
- Auto-suggesting which tasks to add (this is the rejected fork B heuristic).
