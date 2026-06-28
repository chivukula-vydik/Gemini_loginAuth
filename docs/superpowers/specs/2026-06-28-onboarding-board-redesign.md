# Onboarding Board Redesign

## Overview

Redesign the HR onboarding Kanban board (`OnboardingBoard.tsx`) to feel richer and more informative. Three changes: a stats header row, enriched cards with avatars and task progress, and a proper empty state with a step-by-step guide.

## Backend Changes

### Modify `GET /onboarding` — add task progress

After fetching cases, run a single aggregation on `OnboardingTask` grouped by `onboardingCase` to get `{ done, total }` counts. Attach `taskProgress: { done: number, total: number }` to each case in the JSON response. Cases with no tasks get `{ done: 0, total: 0 }`.

Aggregation pipeline:
```
OnboardingTask.aggregate([
  { $match: { onboardingCase: { $in: caseIds } } },
  { $group: {
    _id: '$onboardingCase',
    total: { $sum: 1 },
    done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } }
  }}
])
```

### New `GET /onboarding/stats`

Lightweight stats endpoint. Requires `requireAuth` + `requireRole('admin', 'hr')`.

Response:
```json
{
  "activeCases": 12,
  "joiningSoon": 3,
  "overdueTasks": 2,
  "completedThisQuarter": 5
}
```

Definitions:
- `activeCases` — count of OnboardingCase where status is NOT in `TERMINAL_STATES` (`OFFER_DECLINED`, `CANCELLED`, `TERMINATED`, `CONFIRMED`)
- `joiningSoon` — count of non-terminal cases with `joiningDate` within the next 7 days (today ≤ joiningDate ≤ today+7d)
- `overdueTasks` — count of OnboardingTask where `status` is `pending` or `in_progress` AND `dueDate < now`
- `completedThisQuarter` — count of OnboardingCase where `status === 'CONFIRMED'` AND `confirmedAt` is within the current calendar quarter

All computed via aggregation — no new models or collections.

## Frontend Changes

All changes are in `web/src/onboarding/OnboardingBoard.tsx` and `OnboardingBoard.css`. No new components — keep everything in the existing file.

### Stats Header

A row of 4 stat cards displayed between the page title and the Kanban board. Fetched from `GET /onboarding/stats` on mount.

| Card | Value | Label | Accent |
|------|-------|-------|--------|
| Active Cases | `activeCases` | "in pipeline" | Blue |
| Joining Soon | `joiningSoon` | "next 7 days" | Green |
| Overdue Tasks | `overdueTasks` | "need attention" | Red if > 0, grey if 0 |
| Completed | `completedThisQuarter` | "this quarter" | Purple |

Each card: large number, small label below. Horizontal row with equal widths. Uses CSS grid `grid-template-columns: repeat(4, 1fr)`.

### Enriched Cards

Each Kanban card is upgraded:

- **Avatar circle** — top-left, candidate initials with deterministic color hash (same `colorFor`/`initials` pattern from `FeedCard.tsx`). Size: 36px.
- **Name** — bold, 14px, next to avatar
- **Designation + department** — muted, 12px, below name (existing, just reformatted)
- **Progress bar** — thin bar (4px height, rounded) showing `taskProgress.done / taskProgress.total` as a percentage. Green fill. Below the designation. Hidden if `total === 0`.
- **Progress text** — "3/5 tasks" in 11px muted text, right-aligned on the progress bar line
- **Joining date** — styled as a small tag/pill (11px, border, rounded)
- **Reporting manager** — "RM: Name" in 11px muted, only if populated

Card layout (top to bottom):
```
[Avatar] Name
         Designation — Department
[===progress-bar======] 3/5 tasks
[date-pill]  [RM: Name]
```

### Empty State

When `cases.length === 0` after loading, hide the Kanban board and stats entirely. Show a centered empty state:

- **Icon** — SVG clipboard with person-plus (inline SVG, ~48px, muted color)
- **Heading** — "No onboarding cases yet" (18px, semi-bold)
- **3-step guide** — vertical list with step numbers (1, 2, 3) as small accent-colored circles:
  1. **Create a case** — "Add candidate details and designation"
  2. **Send an offer** — "Move to Offer Sent stage"
  3. **Track progress** — "Monitor tasks and documents"
- **CTA button** — "Create First Case" using existing `pr-btn` class. Clicking opens the same create modal (`setShowCreate(true)`).

Centered vertically and horizontally in the board area. Max-width 400px.

### Status Badge on Cards

Small colored pill on each card showing a human-readable status:

| Status | Label | Color |
|--------|-------|-------|
| DRAFT | Draft | Grey |
| OFFER_SENT | Offer Sent | Blue |
| OFFER_ACCEPTED | Accepted | Teal |
| PRE_BOARDING | Pre-boarding | Amber |
| JOINED | Joined | Green |
| INDUCTION | Induction | Indigo |
| PROBATION | Probation | Purple |

Positioned top-right of the card, font-size 10px, border-radius pill.

## Data Flow

1. On mount, fetch `GET /onboarding` (cases with taskProgress) and `GET /onboarding/stats` in parallel
2. Stats populate the header cards
3. Cases populate the Kanban columns (existing logic, unchanged)
4. If cases array is empty → show empty state instead of board + stats
5. Create modal is shared between the "New Case" button and empty state CTA

## Testing

### Backend (`node --test`)

- `GET /onboarding` returns `taskProgress` on each case (create a case + 2 tasks, complete 1, verify `{ done: 1, total: 2 }`)
- `GET /onboarding/stats` with no data returns all zeros
- `GET /onboarding/stats` with mixed data returns correct counts
- `GET /onboarding/stats` overdue count only includes tasks past dueDate

### Frontend

- `npx tsc --noEmit` — zero errors
- `npx vite build` — succeeds
