# PM Tool UI Polish — Design

Date: 2026-06-18
Direction: **Linear-style** (dense, precise, calm, professional)
Scope: **App-wide** via shared `web/src/styles.css` + small JSX touches

## Goal

Lift the app from "generic SaaS" to a world-class, MNC-grade PM tool feel,
without backend changes, behavior changes, or new dependencies.

## Workstreams

### 1. Refined design tokens (foundation)
- Cooler slate-based neutral palette; refined indigo accent; true semantic
  status colors (todo/in-progress/blocked/done).
- Deliberate type scale; tabular-nums for all numeric cells (hours, %, dates).
- 4px spacing rhythm; crisper radii (~10px); layered, softer shadows.
- Subtle page background tint / faint gradient so it isn't flat white.
- Dark mode parity for every new token.

### 2. Status as colored pills
- `StatusBadge` component (dot + label, color-coded) replacing raw lowercase
  status text in Projects list, ProjectTasks, and timesheet.

### 3. Polished primitives
- Buttons: refined hover/active, focus rings, secondary style, consistent size.
- Inputs/selects: cleaner borders, smoother focus, height matched to buttons.
- Cards: `.card` + `.card-title` pattern replacing inline `style={{padding:14}}`.
- Tables: tighter rows, better header treatment, smooth hover, clipped corners.

### 4. Better states
- Real empty states (icon + message + CTA).
- Skeleton/shimmer loading instead of plain "Loading…".
- Micro-interactions: subtle transitions, button press feedback.

### 5. Shell & auth refinement
- Sidebar: cleaner active state, refined brand mark, better spacing.
- Header hierarchy: tighter h1, consistent sub-text.
- Auth card polish to match.

## Constraints
- No backend / API changes. No new npm deps. No behavior changes.
- App must still build (`tsc` + vite) after the pass.
- Maintain light + dark theme parity.

## Out of scope
- New features, layout restructures (kanban/boards), routing changes.
