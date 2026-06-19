# Capacity-Aware Staffing — Design

Date: 2026-06-19
Direction: **Surface commitment at the moment of staffing** (no guessing, no after-the-fact surprises)
Scope: `auth-api` (1 model field, 1 pure service, 1 endpoint) + `web` (1 new picker component, Projects wiring)

## Goal

When a PM adds someone to a project, show **how loaded that person already is** — right inside
the picker, before the add happens. Everyone has a fixed weekly ceiling of **40h (8h × 5 days)**;
the picker shows each candidate's committed hours against that cap, flags whether they're
**Available / Standby / Busy**, and shows whether they have the **skills the project requires** —
so the PM never piles work onto someone already maxed out, and never adds someone who can't do it.

## The problem today

- The "Add member…" control in `ProjectDetail` is a bare `<select>` over the directory.
  It shows name only. The PM has **zero visibility** into who's free, who's drowning, or who fits.
- `services/workload.js` only does *share* math (`equalShares`, `assigneeHours`). There is **no**
  notion of a person's *total* committed hours.
- `services/assignment.js → hasActiveTask()` gives a boolean "busy" — too crude. "Has a task" ≠
  "is full." We need hours-against-capacity.
- Skill matching (`services/match.js → skillsMatch`) and `User.skills[]` exist but are **not wired**
  into any people-picker. And projects have **no** `requiredSkills` field at all (only tasks do).

## The concept

A **capacity-aware candidate picker**. Each row in the add-member panel is a person card showing:

| Element        | What it shows                                                        |
|----------------|----------------------------------------------------------------------|
| Name + avatar  | who they are                                                         |
| Load bar       | `committed / 40h` as a fill bar, color-coded by status               |
| Status badge   | **Available** · **Standby** · **Busy** (`Ravi · 32h / 40h`)          |
| Skill chips    | ✓ matched / ⚠ missing, against the project's required skills         |

Rows are **sorted** so the best picks float up: skill-matched + most available first, maxed-out last.
The PM sees commitment *before* clicking **Add** — staffing decisions become informed by default.

### Capacity model

- Fixed cap: **`CAPACITY_HOURS = 40`** (8h × 5 days). One constant, one source of truth.
- **Committed hours** = flat sum over a person's **active (non-done)** task assignments of
  `assignee.estimatedHours` when submitted, else `assigneeHours(task.estimatedHours, sharePct)`
  as a fallback. Done tasks never count.
- **Status thresholds** (derived, never stored — no stale state machine):
  - **Available** — `< 20h` committed (lots of room) → green (`--success`)
  - **Standby** — `20–34h` (filling up, can still take a bit) → amber (`--warning`)
  - **Busy** — `≥ 34h` up to/over 40h (effectively full, don't add) → red (`--danger`)
- `loadPct = min(100, round(hours / 40 × 100))` drives the fill bar width.

### Skill model

- New **`Project.requiredSkills[]`** (refs `Skill`, defaults `[]`, fully back-compat).
  Edited from the project detail using the existing `toggle-chip` pattern.
- Per candidate, `skillsMatch(project.requiredSkills, user.skills)` plus the matched/missing
  skill **names** so the UI can render ✓/⚠ chips. A "no required skills set" project matches everyone.

## How it surfaces (UI)

- `ProjectDetail` → Members card: replace the bare `<select>` + Add button with a
  **`CandidatePicker`** panel.
- Each candidate row: name, load bar + `Xh / 40h` badge (color by status), skill chips, **Add** button.
- Already-added members are excluded from candidates (they show in the existing member chips).
- A small **Required skills** editor on the project (toggle-chips), so the match column is meaningful.
- Copy stays plain per brand rules: "Available", "Busy · 32h / 40h" — no jargon, no "virtual" framing.

## Architecture

- **`auth-api/src/services/staffing.js`** (new, pure, TDD'd):
  - `CAPACITY_HOURS = 40`
  - `committedHours(entries)` — flat sum over non-done entries, with the `estimatedHours ?? share`
    fallback. Reuses `assigneeHours` from `workload.js`.
  - `classifyAvailability(hours, capacity?)` → `{ status, loadPct, hours, capacity }`.
- **`auth-api/src/models/Project.js`**: add `requiredSkills: [{ ref: 'Skill' }]` (default `[]`).
- **`auth-api/src/routes/projects.js`**:
  - Accept + validate `requiredSkills` (active skills only) in `POST /` and `PATCH /:id`;
    populate it in `GET /:id`.
  - New `GET /:id/candidates` (auth: `canEditProject`) → for each active user: committed hours,
    availability, skill match (matched/missing names), `isMember`. Sorted skilled-and-available first.
    Returns `{ capacity, requiredSkills, candidates }`.
- **`web/src/pm/pmApi.ts`**: `Candidate` + `CandidatesResponse` types, `listCandidates(projectId)`,
  `requiredSkills` on project types, `updateProjectRequiredSkills(id, ids)`.
- **`web/src/pm/CandidatePicker.tsx`** (new): the panel above, wired into `Projects.tsx`.
- **`web/src/styles.css`**: candidate row, load bar, status badge classes (reusing existing tokens).

## Tech / conventions

- Node + Express + Mongoose (auth-api); React + TS + Vite (web).
- TDD via `node --test`. `staffing.js` gets `auth-api/test/staffing.test.js` written first.
- Web test modules stay import-light (type-only sibling imports).
- Conventional commits, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Edge cases / decisions

- Per-assignee `estimatedHours: null` → falls back to share math (documented), never counted as 0.
- Over-capacity (>40h) → `loadPct` clamps at 100, status stays **Busy**; we don't block the add,
  we just make the overload visible. (Hard-block can be a later toggle.)
- Authorization: candidate workload is **PM/admin-only** — employees never see org-wide load.
- Project with no required skills → all candidates match (no false ⚠ warnings).
- Capacity is a constant now; later it can become a per-user field without changing the contract
  (the endpoint already returns `capacity` per candidate).

## Phased build (once approved)

1. **`staffing.js` + test** — pure helper, no DB. (TDD)
2. **`Project.requiredSkills`** — model field + accept/validate/return in routes. (back-compat)
3. **`GET /:id/candidates`** — the enriched endpoint (workload + skills + sort).
4. **UI** — `CandidatePicker.tsx`, required-skills editor, `pmApi` additions, CSS.

Net: ~2 new files, ~4 edits, fully additive — no behavior change to existing flows.

## Out of scope (for now)

- Date-spread / true per-week capacity (needs every task to have start+due dates).
- Per-user custom capacity, PTO/leave awareness, partial-week proration.
- Hard-blocking over-capacity adds, auto-suggesting the best assignee.
- A standalone team-capacity dashboard (the `candidates` endpoint can feed one later).
