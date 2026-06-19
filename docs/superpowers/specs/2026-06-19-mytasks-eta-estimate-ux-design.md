# My Tasks: one-click "I'll finish by" + clearer Estimate section

**Date:** 2026-06-19
**Status:** Design (awaiting review)

## Problem

Two parts of the My Tasks row are higher-friction than they should be:

1. **"I'll finish by"** uses a `datetime-local` input plus a Save button, so
   recording an expected completion date means manual date+time entry every time.
2. **Estimate** stacks several status lines (approved value, pending request,
   rollup) plus an always-visible request button, making it unclear whether a
   number is the employee's estimate, the PM-approved estimate, or the team total.

Both are frontend-only changes in `web/src/pm/MyTasks.tsx`; the `setMyEta` and
`setMyEstimate` endpoints already exist and do not change.

## Part 1 — One-click `EtaPicker`

Replace the `datetime-local` + Save/Clear with a small **popover**.

- **Trigger**: a button showing the current ETA (e.g. `Fri Jun 26`) or
  "Set completion date" when none is set.
- **Quick options** (one click each, saves immediately and closes):
  - **Today EOD**, **Tomorrow EOD**, **In 2 days**, **This Friday**
  - **On deadline** — only shown when the task has a deadline
    (`deadlineOf(task)` non-null)
  - **Custom date** — an `<input type="date">` calendar; picking a date saves it
  - **Clear** — removes the ETA (`onSave(null)`)
- **Time**: every option resolves to the chosen date at **6 PM local**
  (`WORKDAY_END_HOUR = 18`, a single module constant — not user-configurable yet).
  A small **"adjust time"** reveal (a `<input type="time">`) on the custom path
  lets the user override the default when needed.
- The on-track / late status line stays exactly as today
  (`etaStatus(task.myEtaAt, deadlineOf(task))`).
- Dismissal: click-outside and Esc close the popover (like `EstimateRequestModal`).

### Pure date logic — `web/src/pm/etaPicker.ts` (new, unit-tested)

```ts
export const WORKDAY_END_HOUR = 18;

// Local date (YYYY-MM-DD) at the given hour, returned as an ISO (UTC) string.
export function etaIsoAt(dateISO: string, hour = WORKDAY_END_HOUR): string;

// Ordered presets for the popover. `onDeadline` is included only when deadlineISO is set.
export function presetDates(todayISO: string, deadlineISO: string | null): {
  key: 'today' | 'tomorrow' | 'in2' | 'friday' | 'deadline';
  label: string;
  dateISO: string;
}[];
```

- `today` = `todayISO`; `tomorrow` = +1 day; `in2` = +2 days.
- `friday` = Friday of the current Mon–Fri week (Monday of `todayISO` + 4 days).
- `deadline` = `deadlineISO` (omitted when null).
- All date math is calendar-day based and timezone-stable in the helper's own
  construction (mirrors the existing `time.ts` date handling).

### `EtaPicker.tsx` (new component)

Stateful popover. Props: `task`, `onSave(etaAt: string | null)`. Renders the
trigger, the popover with presets + custom date (+ optional time), Clear, and the
status line. Reuses existing `.input` / `.link-btn` styles; new popover styles in
`styles.css`.

## Part 2 — Clearer Estimate section

Rework `estimateCellState` (in `web/src/pm/estimateRequest.ts`) into a tested
view-model with four states plus optional team info:

```ts
export type EstimateView = {
  state: 'empty' | 'pending-new' | 'approved' | 'pending-change';
  approvedHours: number | null;   // in-force PM-approved value
  pendingHours: number | null;    // requested value awaiting approval
  team: null | { total: number | null; submitted: number; count: number; allIn: boolean };
};
```

- `state` derivation:
  - `empty` — no approved value and no pending request.
  - `pending-new` — a pending request and no approved value yet.
  - `approved` — an approved value and no pending request.
  - `pending-change` — a pending request on top of an approved value.
- `team` is non-null only when `assigneeCount > 1`; `total` is
  `task.estimatedHours` when `allIn` (all assignees approved), else `null`
  (rendered as "X of N submitted"). Solo assignee → `team: null` (hidden).

### Rendering in `EstimateCell` (`MyTasks.tsx`)

- **empty** → `No estimate yet` + an "Add estimate" action (opens
  `EstimateRequestModal`).
- **pending-new** → `Your estimate: {pendingHours}h (pending approval)`.
- **approved** → clean **`Estimate: {approvedHours}h`**, with **Request change**
  behind a small **⋮ menu** (revealed on hover/expand) that opens the modal.
- **pending-change** → requested value primary:
  `Your estimate: {pendingHours}h (pending approval)`, with a de-emphasized
  `Approved: {approvedHours}h` beneath; ⋮ menu offers "Edit request".
- **team** line (when present): `Team estimate: {total}h`, or
  `Team estimate: {submitted} of {count} submitted` while pending.

The previous stacked status lines and always-visible request button are removed.
The `EstimateRequestModal` itself is unchanged (still opened to submit/edit a
request). The reason field continues to flow through `setMyEstimate`.

## Testing

- `web/src/pm/etaPicker.test.ts`: `etaIsoAt` (date + 6 PM local → ISO),
  `presetDates` ordering/labels, "this Friday" from a mid-week day, `in2`/
  tomorrow offsets, deadline preset included only when a deadline exists.
- `web/src/pm/estimateRequest.test.ts`: rewrite for the new `estimateCellState`
  view-model across empty / pending-new / approved / pending-change, and team
  present (multi-assignee, all-in vs partial) vs absent (solo).
- Components (`EtaPicker`, `EstimateCell`) are verified via `tsc` + the helper
  tests (the pm folder tests logic, not rendered components), consistent with the
  existing pattern.

## Out of scope

- Any backend or data-model change (none needed).
- Making the 6 PM workday end user-configurable.
- Changes to the estimate-approval workflow, the extension/"request more time"
  flow, or the PM-side surfaces.
